/**
 * Background jobs.
 *
 * A job is a row in `public.jobs` with a `kind` and a JSON payload. The `kind` decides
 * which handler runs; the payload is that handler's input. Nothing here is generic
 * plumbing for its own sake — the queue exists because one thing in this product cannot be
 * done in a request: publishing an article at the time it was scheduled for.
 */

export const JOB_KINDS = ["publish_scheduled", "purge_rate_limits", "purge_jobs"] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export interface JobRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: "pending" | "running" | "succeeded" | "failed" | "dead";
  priority: number;
  run_at: string;
  attempts: number;
  max_attempts: number;
  locked_by: string | null;
  locked_until: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
}

/** What a handler returns: success, or a retryable failure with a reason. */
export type JobOutcome =
  | { ok: true; detail?: string }
  | { ok: false; retry: true; error: string }
  /** A permanent failure. Retrying would not help, so the job is dead-lettered at once. */
  | { ok: false; retry: false; error: string };

export interface JobContext {
  job: JobRow;
  /** Correlation id for logging, so one job's lines can be followed across a run. */
  runId: string;
}

export type JobHandler = (payload: Record<string, unknown>, ctx: JobContext) => Promise<JobOutcome>;

/** Is this string a kind we know how to run? Guards against a typo in a manual insert. */
export function isJobKind(value: string): value is JobKind {
  return (JOB_KINDS as readonly string[]).includes(value);
}

/**
 * How often each kind should run, in the scheduler's own words.
 *
 * This is the schedule the worker advertises, not a cron expression: the worker sleeps
 * between ticks, so "every 60s" means "at most a minute stale", which is honest for work
 * whose own granularity is a minute.
 */
export const JOB_SCHEDULE: Readonly<Record<JobKind, { everySeconds: number; description: string }>> = {
  publish_scheduled: {
    everySeconds: 60,
    description: "Publish articles whose scheduled time has passed.",
  },
  purge_rate_limits: {
    everySeconds: 3600,
    description: "Delete expired rate-limit counters.",
  },
  purge_jobs: {
    everySeconds: 86_400,
    description: "Delete finished jobs older than a week.",
  },
};
