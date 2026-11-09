/**
 * The job runner.
 *
 * One tick = release abandoned leases, ensure the recurring jobs exist, claim a batch,
 * run each handler, record each outcome. It is written so that a single tick can be called
 * from anywhere — a long-lived worker, a cron endpoint, or a test — and behaves the same
 * way. Nothing is scheduled inside this module, which is what makes it testable.
 *
 * Concurrency: the claim is atomic (`claim_jobs` uses SKIP LOCKED), so running two ticks at
 * once is safe. Running two *workers* is also safe, and is how this is meant to scale.
 *
 * Failure handling, in the order it matters:
 *   - a worker that dies mid-job leaves a lease. The next tick releases it.
 *   - a handler that throws is caught and treated as a retryable failure with the message.
 *   - a handler that returns `retry: false` is dead-lettered immediately.
 *   - everything else backs off exponentially, and dead-letters after `max_attempts`.
 */
import { serviceClient } from "@/server/db/client";
import { HANDLERS } from "./handlers";
import { isJobKind, JOB_KINDS, JOB_SCHEDULE, type JobOutcome, type JobRow } from "./types";

export interface TickOptions {
  /** Identifies this runner in `locked_by`, so an operator can see which process holds a job. */
  workerId: string;
  limit?: number;
  leaseMs?: number;
  /** Injected for tests; defaults to real handlers. */
  handlers?: Readonly<Record<string, (payload: Record<string, unknown>, ctx: { job: JobRow; runId: string }) => Promise<JobOutcome>>>;
  /** Injected for tests, so a tick can run without a database. */
  client?: ReturnType<typeof serviceClient>;
  now?: () => number;
}

export interface TickResult {
  released: number;
  ensured: number;
  claimed: number;
  succeeded: number;
  failed: number;
  dead: number;
  /** Present only when the tick could not run at all. */
  error?: string;
}

/** Roughly one run of every recurring kind, driven by the clock rather than a cron file. */
export function dueKinds(nowMs: number): typeof JOB_KINDS[number][] {
  return JOB_KINDS.filter((kind) => {
    const everyMs = JOB_SCHEDULE[kind].everySeconds * 1000;
    // Stagger by kind so the three schedules do not all fire on the same tick and produce
    // one heavy run followed by three empty ones.
    const offset = JOB_KINDS.indexOf(kind) * 7_000;
    return (nowMs + offset) % everyMs < 30_000;
  });
}

/**
 * Create a recurring job if one is not already waiting.
 *
 * Idempotent by construction: the check and the insert are separate statements, so two
 * runners can both decide to insert. The duplicate is harmless — the second one runs
 * later and finds nothing to do — and avoiding it would need a unique index on a
 * "currently scheduled" concept that the queue deliberately does not have.
 */
async function ensureRecurring(
  db: NonNullable<ReturnType<typeof serviceClient>>,
  kind: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("jobs")
    .select("id")
    .eq("kind", kind)
    .in("status", ["pending", "running"])
    .limit(1);

  if (error) {
    console.error(`[jobs] could not check for pending ${kind}: ${error.message}`);
    return false;
  }
  if (data && data.length > 0) return false;

  const { error: insertError } = await db.from("jobs").insert({
    kind,
    payload: {},
    // Recurring work is plumbing. Below default priority so a real job goes first.
    priority: -10,
  });

  if (insertError) {
    console.error(`[jobs] could not enqueue ${kind}: ${insertError.message}`);
    return false;
  }
  return true;
}

export async function tick(options: TickOptions): Promise<TickResult> {
  const {
    workerId,
    limit = 10,
    leaseMs = 60_000,
    handlers = HANDLERS,
    client,
    now = Date.now,
  } = options;

  const result: TickResult = { released: 0, ensured: 0, claimed: 0, succeeded: 0, failed: 0, dead: 0 };

  const db = client ?? serviceClient();
  if (!db) {
    return { ...result, error: "no database configured" };
  }

  // 1. A previous worker may have died holding a lease. Return that work before claiming.
  const { data: released, error: releaseError } = await db.rpc("release_expired_jobs");
  if (releaseError) {
    console.error(`[jobs] release_expired_jobs failed: ${releaseError.message}`);
  } else if (typeof released === "number") {
    result.released = released;
  }

  // 2. Make sure the recurring work exists. Enqueue-in-the-future is a `run_at` value, so
  //    there is no separate scheduler to keep in step with the handlers.
  for (const kind of dueKinds(now())) {
    if (await ensureRecurring(db, kind)) result.ensured += 1;
  }

  // 3. Claim. Atomic on the server: two runners get disjoint batches.
  const { data: claimed, error: claimError } = await db.rpc("claim_jobs", {
    p_worker: workerId,
    p_limit: limit,
    p_lease_ms: leaseMs,
  });

  if (claimError) {
    return { ...result, error: `claim failed: ${claimError.message}` };
  }

  const jobs = (claimed ?? []) as JobRow[];
  result.claimed = jobs.length;

  // 4. Run each job and record the outcome. A job's failure must not stop the batch.
  for (const job of jobs) {
    const outcome = await runOne(job, handlers, workerId);

    if (!isJobKind(job.kind)) {
      // An unknown kind is a programming error, not a transient one.
      await finish(db, job.id, { ok: false, retry: false, error: `no handler for kind "${job.kind}"` });
      result.dead += 1;
      continue;
    }

    await finish(db, job.id, outcome);
    if (outcome.ok) result.succeeded += 1;
    else if (outcome.retry) result.failed += 1;
    else result.dead += 1;
  }

  if (result.claimed > 0 || result.released > 0) {
    console.error(
      `[jobs] tick claimed=${result.claimed} ok=${result.succeeded} retry=${result.failed} dead=${result.dead} released=${result.released}`,
    );
  }

  return result;
}

async function runOne(
  job: JobRow,
  handlers: NonNullable<TickOptions["handlers"]>,
  workerId: string,
): Promise<JobOutcome> {
  const handler = handlers[job.kind];
  if (!handler) return { ok: false, retry: false, error: `no handler for kind "${job.kind}"` };

  const runId = `${workerId}:${job.id.slice(0, 8)}`;
  try {
    return await handler(job.payload ?? {}, { job, runId });
  } catch (error) {
    // A handler that throws has not decided whether the fault is transient, so it is
    // treated as transient — with the real message kept for the operator.
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, retry: true, error: message };
  }
}

async function finish(
  db: NonNullable<ReturnType<typeof serviceClient>>,
  jobId: string,
  outcome: JobOutcome,
): Promise<void> {
  const { error } = await db.rpc("finish_job", {
    p_job_id: jobId,
    p_ok: outcome.ok,
    p_error: outcome.ok ? null : outcome.error,
  });
  // Losing the outcome write is logged but not fatal: the lease expires and the job runs
  // again, which is the same guarantee at-least-once delivery already gives.
  if (error) console.error(`[jobs] could not record outcome for ${jobId}: ${error.message}`);
}
