/**
 * Job handlers.
 *
 * Each handler is a pure-ish function of (payload, context) that returns an outcome. They
 * are deliberately small and testable without a queue: the SQL functions they call are
 * where the real work happens, so a handler that only translates an error into an outcome
 * is doing its job correctly.
 *
 * The rule every handler follows: a failure that will still be a failure in five minutes
 * is permanent (`retry: false`), and everything else is retryable. Retrying a malformed
 * payload forever fills the queue with noise; failing permanently on a timeout loses work.
 */
import type { JobHandler, JobOutcome } from "./types";

type RpcResult = { data: unknown; error: { message: string } | null };

/**
 * The approved path for the trusted-publish operation.
 *
 * Publishing is the one thing that cannot happen in a request: an editor schedules an
 * article for 06:00 and is asleep when it is due. Until this existed, nothing could move a
 * row out of `scheduled`, so the CMS would have silently missed every deadline it accepted.
 */
export const publishScheduled: JobHandler = async (_payload, ctx): Promise<JobOutcome> => {
  const { serviceClient } = await import("@/server/db/client");
  const db = serviceClient();
  if (!db) {
    // Not configured is a configuration problem, not a transient one: retrying will never
    // fix it, and a queue full of doomed retries hides the real issue.
    return { ok: false, retry: false, error: "no database configured" };
  }

  const { data, error } = (await db.rpc("publish_due_scheduled_articles", {
    p_limit: 200,
  })) as RpcResult;

  if (error) {
    // A database that is briefly unreachable *is* worth retrying.
    return { ok: false, retry: true, error: `publish failed: ${error.message}` };
  }

  const published = Array.isArray(data) ? data.length : 0;
  if (published > 0) {
    console.error(
      `[job:${ctx.runId}] published ${published} scheduled article${published === 1 ? "" : "s"}`,
    );
  }
  return { ok: true, detail: `${published} published` };
};

/** Deletes expired rate-limit counters. Bounded per call, so one tick cannot lock the table. */
export const purgeRateLimits: JobHandler = async (_payload, ctx): Promise<JobOutcome> => {
  const { serviceClient } = await import("@/server/db/client");
  const db = serviceClient();
  if (!db) return { ok: false, retry: false, error: "no database configured" };

  const { data, error } = (await db.rpc("purge_rate_limits")) as RpcResult;
  if (error) return { ok: false, retry: true, error: `purge failed: ${error.message}` };

  const removed = typeof data === "number" ? data : 0;
  if (removed > 0) console.error(`[job:${ctx.runId}] purged ${removed} expired counters`);
  return { ok: true, detail: `${removed} purged` };
};

/**
 * Deletes job rows that finished long ago.
 *
 * Dead and succeeded rows are kept for a week so an operator can answer "did that run?"
 * after the fact. Beyond that they are noise, and an unbounded queue table is a slow leak.
 */
export const purgeJobs: JobHandler = async (_payload, ctx): Promise<JobOutcome> => {
  const { serviceClient } = await import("@/server/db/client");
  const db = serviceClient();
  if (!db) return { ok: false, retry: false, error: "no database configured" };

  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await db
    .from("jobs")
    .delete({ count: "exact" })
    .in("status", ["succeeded", "dead"])
    .lt("finished_at", cutoff);

  if (error) return { ok: false, retry: true, error: `cleanup failed: ${error.message}` };
  if (count && count > 0) console.error(`[job:${ctx.runId}] removed ${count} finished jobs`);
  return { ok: true, detail: `${count ?? 0} removed` };
};

/** Registered handlers. A kind with no handler here fails permanently rather than silently. */
export const HANDLERS: Readonly<Record<string, JobHandler>> = {
  publish_scheduled: publishScheduled,
  purge_rate_limits: purgeRateLimits,
  purge_jobs: purgeJobs,
};
