/**
 * Queue Monitor — the read model behind /admin/jobs.
 *
 * This module exists because the page must not invent anything. Every number it shows comes
 * from a table that already exists (`jobs` and `email_outbox` from migrations 0006/0007), and
 * when those tables cannot be read the answer is "not configured", never a zero.
 *
 * The counting is a pure function (`summarizeQueue`) so it can be tested without a database;
 * the IO wrapper (`getQueueSnapshot`) does the querying and nothing else.
 */

import { serviceClient } from "@/server/db/client";

export interface JobCounts {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  dead: number;
  /** Articles whose `publish_at` has passed while `status = 'scheduled'`. */
  dueScheduledArticles: number;
  /** dead + due-scheduled: the rows a human has to look at. */
  needsAttention: number;
}

export interface OutboxCounts {
  queued: number;
  sending: number;
  sent: number;
  failed: number;
  dead: number;
}

export interface RecentJob {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  runAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface QueueSnapshot {
  counts: JobCounts;
  recent: RecentJob[];
  outbox: OutboxCounts;
  /** When this was read. Shown next to the numbers, because a stale count is a lie. */
  readAt: string;
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; state: "not_configured" | "error"; message: string };

const NOT_CONFIGURED: Result<never> = {
  ok: false,
  state: "not_configured",
  message: "No database is configured, so the queue was never read.",
};

/**
 * The pure half: rows in, counts out.
 *
 * Separated from the IO so the arithmetic can be tested without a database, and so a status
 * the page has never heard of cannot silently vanish from a total — it is simply not counted
 * in the named buckets, and `unrecognised` records that it happened.
 */
export function summarizeQueue(input: {
  jobStatuses: string[];
  outboxStatuses: string[];
  scheduledDue: number;
  recent: RecentJob[];
  now: string;
}): QueueSnapshot & { unrecognised: number } {
  const counts: JobCounts = {
    pending: 0,
    running: 0,
    succeeded: 0,
    failed: 0,
    dead: 0,
    dueScheduledArticles: input.scheduledDue,
    needsAttention: 0,
  };
  let unrecognised = 0;
  for (const status of input.jobStatuses) {
    if (status === "pending" || status === "running" || status === "succeeded" || status === "failed" || status === "dead") {
      counts[status] += 1;
    } else {
      unrecognised += 1;
    }
  }
  counts.needsAttention = counts.dead + counts.dueScheduledArticles;

  const outbox: OutboxCounts = { queued: 0, sending: 0, sent: 0, failed: 0, dead: 0 };
  for (const status of input.outboxStatuses) {
    if (status === "queued" || status === "sending" || status === "sent" || status === "failed" || status === "dead") {
      outbox[status] += 1;
    } else {
      unrecognised += 1;
    }
  }

  return { counts, outbox, recent: input.recent, readAt: input.now, unrecognised };
}

export async function getQueueSnapshot(): Promise<Result<QueueSnapshot>> {
  const supabase = serviceClient();
  if (!supabase) return NOT_CONFIGURED;

  const [jobsResult, scheduledResult, outboxResult, recentResult] = await Promise.all([
    supabase.from("jobs").select("status"),
    supabase
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "scheduled")
      .lte("publish_at", new Date().toISOString()),
    supabase.from("email_outbox").select("status"),
    supabase
      .from("jobs")
      .select("id, kind, status, attempts, max_attempts, last_error, run_at, updated_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);

  const firstError =
    jobsResult.error?.message ??
    scheduledResult.error?.message ??
    outboxResult.error?.message ??
    recentResult.error?.message ??
    null;
  if (firstError) {
    return { ok: false, state: "error", message: `The queue read failed: ${firstError}` };
  }

  const rows = (jobsResult.data ?? []) as { status: string }[];
  const outboxRows = (outboxResult.data ?? []) as { status: string }[];

  const snapshot = summarizeQueue({
    jobStatuses: rows.map((row) => String(row.status)),
    outboxStatuses: outboxRows.map((row) => String(row.status)),
    scheduledDue: scheduledResult.count ?? 0,
    recent: ((recentResult.data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      kind: String(row.kind),
      status: String(row.status),
      attempts: Number(row.attempts ?? 0),
      maxAttempts: Number(row.max_attempts ?? 0),
      lastError: (row.last_error as string | null) ?? null,
      runAt: String(row.run_at),
      updatedAt: String(row.updated_at),
      finishedAt: (row.finished_at as string | null) ?? null,
    })),
    now: new Date().toISOString(),
  });

  const { unrecognised, ...data } = snapshot;
  if (unrecognised > 0) {
    // A count that silently drops rows would understate the queue. Say so in the log.
    console.warn(`[admin:jobs] ${unrecognised} row(s) with an unrecognised status`);
  }

  return { ok: true, data };
}

/**
 * Is anything actually driving the queue?
 *
 * This is the question the page has to answer, and it cannot be answered from configuration
 * alone: `CRON_SECRET` being set means a scheduler *could* call the endpoint, not that one is
 * calling it. So the answer is derived from evidence — a job that was claimed recently.
 */
export function isQueueDriven(snapshot: QueueSnapshot, nowMs: number = Date.now()): boolean {
  const fiveMinutesAgo = nowMs - 5 * 60 * 1000;
  return snapshot.recent.some((job) => {
    const seen = Date.parse(job.updatedAt);
    // A `pending` row is work that has *not* moved; only claimed work is evidence of a worker.
    return !Number.isNaN(seen) && seen >= fiveMinutesAgo && job.status !== "pending";
  });
}
