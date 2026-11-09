/**
 * The Queue Monitor has to read the queue, not guess about it.
 *
 * This page's predecessor claimed "no worker process exists" and "nothing promotes scheduled
 * articles when publish_at arrives". Both statements were true before 0006 and false
 * afterwards, and nothing caught the drift because the copy was a constant. So the assertions
 * below are deliberately not about wording: they pin the things that made the wording wrong —
 * a permissions check on the page, a live read of `jobs`, a "not configured" branch instead of
 * a zero, and a moving/not-moving verdict derived from observed timestamps rather than from
 * `REDIS_URL` being set.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// `getQueueSnapshot` is IO. The database is replaced with a stub so its branches —
// "not configured", "the query failed", and "here are the rows" — can be tested honestly.
const mocks = vi.hoisted(() => ({ service: vi.fn() }));
vi.mock("@/server/db/client", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, serviceClient: mocks.service };
});

import {
  getQueueSnapshot,
  isQueueDriven,
  summarizeQueue,
  type QueueSnapshot,
} from "@/server/admin/jobs";
import { KNOWN_ENV, mailPosture, schedulerPosture } from "@/server/admin/config";

const ROOT = process.cwd();
const PAGE = readFileSync(join(ROOT, "src/app/admin/jobs/page.tsx"), "utf8");
const QUERY = readFileSync(join(ROOT, "src/server/admin/jobs.ts"), "utf8");
const CONFIG = readFileSync(join(ROOT, "src/server/admin/config.ts"), "utf8");

function snapshot(overrides: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    counts: {
      pending: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      dead: 0,
      dueScheduledArticles: 0,
      needsAttention: 0,
    },
    outbox: { queued: 0, sending: 0, sent: 0, failed: 0, dead: 0 },
    recent: [],
    readAt: "2026-11-08T12:00:00.000Z",
    ...overrides,
  };
}

function recentJob(updatedAt: string, status = "succeeded") {
  return {
    id: "job-1",
    kind: "publish_scheduled",
    status,
    attempts: 1,
    maxAttempts: 5,
    lastError: null,
    runAt: updatedAt,
    updatedAt,
    finishedAt: updatedAt,
  };
}

const READ_AT = Date.parse("2026-11-08T12:00:00.000Z");

describe("queue monitor: the page reads the queue", () => {
  it("is not a planned-feature placeholder any more", () => {
    expect(PAGE).not.toMatch(/PlannedFeature/);
    expect(PAGE).not.toMatch(/not_implemented/);
  });

  it("no longer repeats the claims the queue work disproved", () => {
    // Each of these was literally on the page and each was false after 0006.
    for (const stale of [
      "No worker process",
      "No job table or retry ledger",
      "Scheduled publishing is not a worker",
      "nothing promotes them when it arrives",
    ]) {
      expect(PAGE).not.toContain(stale);
    }
  });

  it("checks the permission before reading anything", () => {
    expect(PAGE).toContain('requireAdminPage("job.read")');
    const guardAt = PAGE.indexOf("requireAdminPage");
    const readAt = PAGE.indexOf("getQueueSnapshot");
    expect(guardAt).toBeGreaterThan(-1);
    expect(readAt).toBeGreaterThan(guardAt);
  });

  it("never renders a zero where the truth is 'we did not look'", () => {
    // StatCard treats null as "unmeasurable"; the page must not substitute 0 in that branch.
    expect(PAGE).toContain("Unreadable");
    expect(PAGE).toMatch(/state === "not_configured"/);
  });
});

describe("queue monitor: the read is honest about what it can know", () => {
  it("returns not_configured rather than empty counts when there is no database", () => {
    expect(QUERY).toContain('state: "not_configured"');
    // The guard must come before any query is attempted.
    expect(QUERY.indexOf("if (!db)")).toBeLessThan(QUERY.indexOf('.from("jobs")'));
  });

  it("counts straight from the tables, not from a cached or derived figure", () => {
    expect(QUERY).toContain('.from("jobs")');
    expect(QUERY).toContain('.from("email_outbox")');
    expect(QUERY).toContain('eq("status", "scheduled")');
  });

  it("reports the time it was read", () => {
    // The stamp is taken in the IO layer and carried into `readAt`; the behavioural test
    // "every count is a row it actually read" checks the value is a parseable time.
    expect(QUERY).toContain("new Date().toISOString()");
    expect(QUERY).toContain("readAt: input.now");
    expect(PAGE).toContain("formatNewsroom(snapshot.readAt");
  });

  it("does not decide health from configuration", () => {
    // The old page inferred the whole feature's state from REDIS_URL. Nothing on this page
    // may reach for an env var to answer "is the queue working".
    expect(PAGE).not.toMatch(/REDIS_URL/);
    expect(PAGE).not.toMatch(/posture\(\)/);
  });
});

describe("isQueueDriven: evidence, not configuration", () => {
  it("says nothing is moving when no job was ever recorded", () => {
    expect(isQueueDriven(snapshot(), READ_AT)).toBe(false);
  });

  it("counts a job touched inside the window as proof something is driving it", () => {
    const justNow = new Date(READ_AT - 60_000).toISOString();
    expect(isQueueDriven(snapshot({ recent: [recentJob(justNow)] }), READ_AT)).toBe(true);
  });

  it("does not count a job that is only waiting to run", () => {
    // A pending row can sit there for days. Treating it as activity would report a healthy
    // queue on a deployment where nothing has ever drained it.
    const justNow = new Date(READ_AT - 60_000).toISOString();
    expect(isQueueDriven(snapshot({ recent: [recentJob(justNow, "pending")] }), READ_AT)).toBe(
      false,
    );
  });

  it("expires: activity older than the window is not evidence of a live queue", () => {
    const longAgo = new Date(READ_AT - 6 * 60 * 1000).toISOString();
    expect(isQueueDriven(snapshot({ recent: [recentJob(longAgo)] }), READ_AT)).toBe(false);
  });

  it("treats an unparseable timestamp as no evidence rather than as fresh", () => {
    expect(isQueueDriven(snapshot({ recent: [recentJob("not-a-date")] }), READ_AT)).toBe(false);
  });

  it("finds one live job among stale ones", () => {
    const live = new Date(READ_AT - 30_000).toISOString();
    const stale = new Date(READ_AT - 3 * 60 * 60 * 1000).toISOString();
    const result = isQueueDriven(
      snapshot({ recent: [recentJob(stale, "succeeded"), recentJob(live, "running")] }),
      READ_AT,
    );
    expect(result).toBe(true);
  });
});

describe("admin config: the settings page can explain the mail path", () => {
  it("lists the variables the outbox worker actually reads", () => {
    const names = KNOWN_ENV.map((fact) => fact.name);
    expect(names).toContain("RESEND_API_KEY");
    expect(names).toContain("EMAIL_FROM");
    expect(names).toContain("CRON_SECRET");
  });

  it("stops describing REDIS_URL as the thing the queue needs", () => {
    // The queue is a Postgres table. The old purpose string ("Queue and cache") sent
    // operators to provision a service that would change nothing.
    const redis = KNOWN_ENV.find((fact) => fact.name === "REDIS_URL");
    expect(redis).toBeDefined();
    // It may be mentioned only to be ruled out.
    expect(redis!.purpose.toLowerCase()).toMatch(/does not use/);
    expect(redis!.ifMissing.toLowerCase()).toMatch(/nothing/);
  });

  it("says what breaks when mail is unconfigured, in those words", () => {
    const key = KNOWN_ENV.find((fact) => fact.name === "RESEND_API_KEY");
    const from = KNOWN_ENV.find((fact) => fact.name === "EMAIL_FROM");
    expect(key?.ifMissing).toMatch(/queued/i);
    expect(from?.ifMissing).toMatch(/no mail is sent/i);
  });

  it("names the missing variable rather than reporting a vague failure", () => {
    const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };
    try {
      delete process.env.RESEND_API_KEY;
      process.env.EMAIL_FROM = "desk@example.com";
      expect(mailPosture().provider).toContain("RESEND_API_KEY");
      expect(mailPosture().provider).not.toContain("EMAIL_FROM");

      process.env.RESEND_API_KEY = "re_test";
      delete process.env.EMAIL_FROM;
      expect(mailPosture().provider).toContain("EMAIL_FROM");
      expect(mailPosture().provider).not.toContain("RESEND_API_KEY");

      process.env.EMAIL_FROM = "desk@example.com";
      expect(mailPosture()).toEqual({ provider: "resend", fromAddress: true });
    } finally {
      if (saved.key === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = saved.key;
      if (saved.from === undefined) delete process.env.EMAIL_FROM;
      else process.env.EMAIL_FROM = saved.from;
    }
  });

  it("does not treat a short CRON_SECRET as authentication", () => {
    const saved = process.env.CRON_SECRET;
    try {
      delete process.env.CRON_SECRET;
      expect(schedulerPosture().cronSecret).toBe(false);
      process.env.CRON_SECRET = "short";
      expect(schedulerPosture().cronSecret).toBe(false);
      process.env.CRON_SECRET = "a".repeat(32);
      expect(schedulerPosture().cronSecret).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = saved;
    }
  });

  it("keeps the scheduler description next to the code that reads the variable", () => {
    // A posture helper that names a variable nobody reads is the exact rot readme.test.ts
    // forbids for the README; the same rule applies to the settings page.
    expect(CONFIG).toContain("CRON_SECRET");
    expect(CONFIG).toContain("RESEND_API_KEY");
  });
});

describe("queue monitor: the numbers are the rows", () => {
  const job = (status: string) => ({ status });

  it("counts each job status from the rows it was given", () => {
    const s = summarizeQueue({
      jobStatuses: ["pending", "pending", "running", "succeeded", "failed", "dead", "dead"],
      outboxStatuses: ["queued", "sent", "sent", "failed"],
      scheduledDue: 3,
      recent: [],
      now: "2026-11-08T12:00:00.000Z",
    });
    expect(s.counts).toMatchObject({
      pending: 2,
      running: 1,
      succeeded: 1,
      failed: 1,
      dead: 2,
      dueScheduledArticles: 3,
    });
    expect(s.outbox).toMatchObject({ queued: 1, sent: 2, failed: 1, sending: 0, dead: 0 });
    expect(s.unrecognised).toBe(0);
  });

  it("needsAttention is the rows a human has to look at", () => {
    const s = summarizeQueue({
      jobStatuses: ["dead", "dead"],
      outboxStatuses: [],
      scheduledDue: 3,
      recent: [],
      now: "2026-11-08T12:00:00.000Z",
    });
    expect(s.counts.needsAttention).toBe(5);
  });

  it("a status nobody has heard of is reported, not silently dropped", () => {
    // A counter that skips unknown rows under-reports the queue. The page may not care
    // about 'paused', but the arithmetic must admit the row exists.
    const s = summarizeQueue({
      jobStatuses: ["paused", "pending"],
      outboxStatuses: ["bounced"],
      scheduledDue: 0,
      recent: [],
      now: "2026-11-08T12:00:00.000Z",
    });
    expect(s.unrecognised).toBe(2);
    expect(s.counts.pending).toBe(1);
  });
});

describe("queue monitor: reading the queue behaves", () => {
  it("without a database it says so; it does not report a healthy empty queue", async () => {
    mocks.service.mockReturnValueOnce(null);
    const result = await getQueueSnapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.state).toBe("not_configured");
  });

  it("when a query fails it reports the failure, not zeros", async () => {
    mocks.service.mockReturnValueOnce(failingClient());
    const result = await getQueueSnapshot();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.state).toBe("error");
      expect(result.message).toContain("boom");
    }
  });

  it("when the tables are readable, every count is a row it actually read", async () => {
    mocks.service.mockReturnValueOnce(
      fakeClient({
        jobs: ["pending", "running", "dead"].map((status) => ({ status })),
        outbox: ["queued", "sent"].map((status) => ({ status })),
        recent: [
          {
            id: "job-1",
            kind: "publish_scheduled",
            status: "running",
            attempts: 1,
            max_attempts: 5,
            last_error: null,
            run_at: "2026-11-08T11:59:00.000Z",
            updated_at: "2026-11-08T11:59:30.000Z",
            finished_at: null,
          },
        ],
        due: 2,
      }),
    );
    const result = await getQueueSnapshot();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.counts).toMatchObject({
        pending: 1,
        running: 1,
        dead: 1,
        dueScheduledArticles: 2,
        needsAttention: 3,
      });
      expect(result.data.outbox).toMatchObject({ queued: 1, sent: 1 });
      expect(result.data.recent).toHaveLength(1);
      expect(result.data.recent[0]?.kind).toBe("publish_scheduled");
      expect(Date.parse(result.data.readAt)).not.toBeNaN();
    }
  });
});

/** A Supabase-shaped stub: four chainable queries, all awaiting the same canned result. */
function chain(result: {
  data?: unknown;
  error?: { message: string } | null;
  count?: number;
}) {
  const q = {
    select: () => q,
    eq: () => q,
    lte: () => q,
    order: () => q,
    limit: () => q,
    then: (
      onFulfilled: (value: typeof result) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return q;
}

function clientRouting(
  route: (table: string, columns: string) => { data?: unknown; error?: { message: string } | null; count?: number },
) {
  return {
    from: (table: string) => ({
      select: (...args: unknown[]) => chain(route(table, String(args[0]))),
    }),
  };
}

function failingClient() {
  return clientRouting(() => ({ error: { message: "boom" } }));
}

function fakeClient(input: {
  jobs: { status: string }[];
  outbox: { status: string }[];
  recent: Record<string, unknown>[];
  due: number;
}) {
  return clientRouting((table, columns) => {
    if (table === "articles") return { count: input.due, error: null };
    if (table === "email_outbox") return { data: input.outbox, error: null };
    // `jobs` is read twice: once for counts (columns = "status"), once for the ledger.
    return columns === "status"
      ? { data: input.jobs, error: null }
      : { data: input.recent, error: null };
  });
}
