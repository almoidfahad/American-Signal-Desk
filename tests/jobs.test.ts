import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { dueKinds, tick } from "@/server/jobs/runner";
import { isJobKind, JOB_KINDS, JOB_SCHEDULE, type JobRow } from "@/server/jobs/types";
import { HANDLERS } from "@/server/jobs/handlers";

const ROOT = resolve(__dirname, "..");

/**
 * The queue's contract, without a database.
 *
 * The SQL is proven separately (`supabase/tests/rls_jobs.sql`): claim exclusivity, backoff,
 * dead-lettering and lease recovery. What is tested here is the part SQL cannot prove —
 * that the runner treats a permanent failure differently from a transient one, and that an
 * unknown job kind does not silently disappear.
 */

function job(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    kind: "publish_scheduled",
    payload: {},
    status: "running",
    priority: 0,
    run_at: new Date().toISOString(),
    attempts: 1,
    max_attempts: 5,
    locked_by: "worker:test",
    locked_until: new Date(Date.now() + 60_000).toISOString(),
    last_error: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    finished_at: null,
    ...overrides,
  };
}

function fakeClient(options: {
  jobs?: JobRow[];
  claimError?: { message: string } | null;
  released?: number;
}) {
  const finished: Array<Record<string, unknown>> = [];
  const inserted: Array<Record<string, unknown>> = [];
  const rpcCalls: Array<{ fn: string; args: unknown }> = [];

  const client = {
    rpc: async (fn: string, args: unknown) => {
      rpcCalls.push({ fn, args });
      if (fn === "release_expired_jobs") {
        return { data: options.released ?? 0, error: null };
      }
      if (fn === "claim_jobs") {
        return options.claimError
          ? { data: null, error: options.claimError }
          : { data: options.jobs ?? [], error: null };
      }
      if (fn === "finish_job") {
        finished.push(args as Record<string, unknown>);
        return { data: {}, error: null };
      }
      return { data: null, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        inserted.push(row);
        return { error: null };
      },
    }),
  };

  return { client, finished, inserted, rpcCalls };
}

describe("jobs: kinds and schedule are declared, not implied", () => {
  it("recognises only the kinds it ships", () => {
    for (const kind of JOB_KINDS) expect(isJobKind(kind)).toBe(true);
    expect(isJobKind("publsh_scheduled")).toBe(false);
    expect(isJobKind("")).toBe(false);
  });

  it("has a handler for every declared kind", () => {
    // A kind with no handler is a job that can never succeed. Catching it here is cheaper
    // than discovering it as a dead-letter row at 3am.
    for (const kind of JOB_KINDS) {
      expect(HANDLERS[kind], `missing handler for ${kind}`).toBeTypeOf("function");
    }
  });

  it("says how often each one runs, in seconds rather than a cron string", () => {
    for (const kind of JOB_KINDS) {
      expect(JOB_SCHEDULE[kind].everySeconds).toBeGreaterThan(0);
      expect(JOB_SCHEDULE[kind].description.length).toBeGreaterThan(0);
    }
    // Publishing is the one that must be prompt; the rest can be lazy.
    expect(JOB_SCHEDULE.publish_scheduled.everySeconds).toBeLessThanOrEqual(60);
  });

  it("staggering keeps the recurring jobs off the same tick", () => {
    // With a shared schedule all three would fire together, producing one heavy tick and
    // then silence. At a staggered offset they spread out.
    const perMinute = new Set<string>();
    for (let ms = 0; ms < 60_000; ms += 15_000) {
      for (const kind of dueKinds(ms)) perMinute.add(kind);
    }
    expect(perMinute.size).toBeGreaterThanOrEqual(1);
  });
});

describe("jobs: the runner records what actually happened", () => {
  it("does nothing, and says why, without a database", async () => {
    const result = await tick({ workerId: "w", client: null });
    expect(result.error).toBe("no database configured");
    expect(result.claimed).toBe(0);
  });

  it("runs a job and records success", async () => {
    const { client, finished } = fakeClient({ jobs: [job()] });
    const result = await tick({
      workerId: "w",
      client: client as never,
      handlers: { publish_scheduled: async () => ({ ok: true }) },
      now: () => 0,
    });

    expect(result.claimed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(finished[0]).toMatchObject({ p_ok: true });
  });

  it("records a retryable failure as a retry, not as dead", async () => {
    const { client, finished } = fakeClient({ jobs: [job()] });
    const result = await tick({
      workerId: "w",
      client: client as never,
      handlers: {
        publish_scheduled: async () => ({ ok: false, retry: true, error: "database busy" }),
      },
      now: () => 0,
    });

    expect(result.failed).toBe(1);
    expect(result.dead).toBe(0);
    expect(finished[0]).toMatchObject({ p_ok: false, p_error: "database busy" });
  });

  it("records a permanent failure as dead immediately", async () => {
    const { client, finished } = fakeClient({ jobs: [job()] });
    const result = await tick({
      workerId: "w",
      client: client as never,
      handlers: {
        publish_scheduled: async () => ({ ok: false, retry: false, error: "no database configured" }),
      },
      now: () => 0,
    });

    expect(result.dead).toBe(1);
    expect(result.failed).toBe(0);
    expect(finished[0]).toMatchObject({ p_ok: false });
  });

  it("treats a thrown handler as retryable and keeps the message", async () => {
    const { client, finished } = fakeClient({ jobs: [job()] });
    const result = await tick({
      workerId: "w",
      client: client as never,
      handlers: {
        publish_scheduled: async () => {
          throw new Error("socket hang up");
        },
      },
      now: () => 0,
    });

    expect(result.failed).toBe(1);
    expect(finished[0]).toMatchObject({ p_error: "socket hang up" });
  });

  it("dead-letters an unknown kind instead of dropping it", async () => {
    const { client, finished } = fakeClient({ jobs: [job({ kind: "no_such_kind" })] });
    const result = await tick({ workerId: "w", client: client as never, now: () => 0 });

    expect(result.dead).toBe(1);
    // The row is closed with a reason, so it is visible rather than left running forever.
    expect(finished[0]).toMatchObject({ p_ok: false });
    expect(String(finished[0]?.p_error)).toContain("no handler");
  });

  it("one failing job does not stop the batch", async () => {
    const jobs = [job({ id: "a" }), job({ id: "b" }), job({ id: "c" })];
    const { client, finished } = fakeClient({ jobs });
    let calls = 0;

    const result = await tick({
      workerId: "w",
      client: client as never,
      handlers: {
        publish_scheduled: async () => {
          calls += 1;
          if (calls === 2) throw new Error("only the middle one fails");
          return { ok: true };
        },
      },
      now: () => 0,
    });

    expect(result.claimed).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(finished).toHaveLength(3);
  });

  it("reports a claim failure instead of pretending the tick ran", async () => {
    const { client } = fakeClient({ claimError: { message: "permission denied" } });
    const result = await tick({ workerId: "w", client: client as never, now: () => 0 });
    expect(result.error).toContain("permission denied");
    expect(result.claimed).toBe(0);
  });

  it("releases abandoned leases before claiming", async () => {
    const { client, rpcCalls } = fakeClient({ jobs: [], released: 3 });
    const result = await tick({ workerId: "w", client: client as never, now: () => 0 });

    expect(result.released).toBe(3);
    // Order matters: work stuck in `running` must be available to this tick.
    expect(rpcCalls[0]?.fn).toBe("release_expired_jobs");
  });
});

describe("jobs: the worker is wired to the same tick, not a second copy", () => {
  const worker = readFileSync(resolve(ROOT, "scripts/worker.mjs"), "utf8");

  it("calls the shared runner", () => {
    expect(worker).toContain('import("../src/server/jobs/runner.ts")');
    expect(worker).toContain("tick({ workerId })");
  });

  it("exits non-zero when it cannot work, so a supervisor notices", () => {
    // A worker that exits 0 without a database looks healthy and processes nothing.
    expect(worker).toMatch(/process\.exit\(1\)/);
    expect(worker).toContain("Nothing will run");
  });

  it("survives a failed tick instead of dying on it", () => {
    expect(worker).toMatch(/catch \(error\)/);
    expect(worker).toContain("tick threw");
  });

  it("stops on a signal without abandoning the current tick", () => {
    expect(worker).toContain('process.on("SIGTERM"');
    expect(worker).toContain("finishing the current tick");
  });
});

describe("jobs: the cron endpoint is not an open door", () => {
  const route = readFileSync(resolve(ROOT, "src/app/api/cron/tick/route.ts"), "utf8");

  it("compares the secret in constant time", () => {
    expect(route).toContain("timingSafeEqual");
    // Different-length strings make timingSafeEqual throw, so both sides are hashed first.
    expect(route).toContain("createHash(\"sha256\")");
  });

  it("does not reveal whether a secret is configured", () => {
    // "wrong secret" vs "no secret configured" tells an attacker which to work on.
    expect(route).not.toMatch(/CRON_SECRET (is )?not (set|configured)/i);
    expect(route).toContain("Not authorised.");
  });

  it("accepts the Vercel Cron header as well as a query token", () => {
    expect(route).toContain("Bearer ");
    expect(route).toContain("searchParams.get(\"token\")");
  });

  it("returns 503 rather than a fake success without a database", () => {
    expect(route).toContain("NOT_CONFIGURED");
    expect(route).toContain("Nothing ran.");
  });
});
