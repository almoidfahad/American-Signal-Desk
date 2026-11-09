import type { Metadata } from "next";
import Link from "next/link";
import { Badge, DataTable, PageHeader, Panel, StatCard, TableEmpty } from "@/components/admin/ui";
import { mailPosture, schedulerPosture } from "@/server/admin/config";
import { requireAdminPage } from "@/server/admin/guard";
import { getQueueSnapshot, isQueueDriven, type QueueSnapshot } from "@/server/admin/jobs";
import { formatNewsroom, formatRelative } from "@/lib/dates";

export const metadata: Metadata = { title: "Queue Monitor" };
export const dynamic = "force-dynamic";

/**
 * Queue monitor.
 *
 * Everything here is read from the queue itself. There is no fallback number and no
 * "healthy" badge derived from configuration: `CRON_SECRET` being present means a call could
 * be authenticated, not that one is arriving, so the "is it moving" verdict is derived from
 * whether a job was actually touched in the last five minutes.
 *
 * This page previously stated that no worker existed and that scheduled articles never
 * publish. Both were true once and were left behind by the queue work; the honest version
 * costs a query and can be wrong out loud, which is the point.
 */

const JOB_LABELS: Record<string, string> = {
  publish_scheduled: "Publish scheduled articles",
  send_email: "Send email",
  purge_rate_limits: "Purge rate limits",
  purge_jobs: "Purge finished jobs",
};

function labelFor(kind: string): string {
  return JOB_LABELS[kind] ?? kind;
}

function tone(status: string): "green" | "slate" | "red" | "amber" {
  if (status === "succeeded" || status === "sent") return "green";
  if (status === "dead") return "red";
  if (status === "failed" || status === "running" || status === "sending") return "amber";
  return "slate";
}

export default async function JobsPage() {
  const access = await requireAdminPage("job.read");
  if (!access.ok) return access.node;

  const result = await getQueueSnapshot();
  const schedule = schedulerPosture();
  const mail = mailPosture();

  return (
    <div>
      <PageHeader
        title="Queue Monitor"
        description="Background work, read from the queue that runs it. Counts are read per request and stamped with the time they were read — a cached figure here would be a claim about the past presented as the present."
      />

      {result.ok ? (
        <QueueBody snapshot={result.data} mail={mail} />
      ) : (
        <Unreadable state={result.state} message={result.message} worker={schedule.workerCommand} />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="How work gets done">
          <div className="space-y-3 px-4 py-3 text-small leading-relaxed text-navy-700">
            <p>
              A row in <code className="font-mono text-caption">jobs</code> is claimed by a
              worker with a lease, run once, then finished. A worker that dies mid-job releases
              its claim by lease expiry rather than by a flag, so a crash delays work instead of
              losing it.
            </p>
            <p>
              The same work can be driven by a scheduler hitting{" "}
              <code className="font-mono text-caption">POST /api/cron/tick</code> or by{" "}
              <code className="font-mono text-caption">npm run worker</code>. Both call one
              shared runner, so a job cannot behave differently depending on who woke it up.
            </p>
            <p className="text-navy-600">
              Scheduler endpoint: {schedule.cronSecret ? "authenticated by CRON_SECRET" : "refuses every call — CRON_SECRET is not set"}.
            </p>
          </div>
        </Panel>

        <Panel title="What runs, and how often">
          <ul className="divide-y divide-navy-50 text-small">
            {[
              ["publish_scheduled", "Every 60s", "Promotes scheduled articles whose publish_at has passed."],
              ["send_email", "Every 30s", "Drains the outbox. Retries with backoff; 4xx errors are permanent."],
              ["purge_rate_limits", "Every hour", "Deletes expired rate-limit windows."],
              ["purge_jobs", "Daily", "Deletes old finished jobs. Failed and dead rows are kept for inspection."],
            ].map(([kind, cadence, detail]) => (
              <li key={kind} className="px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-mono text-caption font-semibold text-navy-900">{kind}</span>
                  <span className="text-caption font-semibold tracking-[0.04em] text-navy-500 uppercase">
                    {cadence}
                  </span>
                </div>
                <p className="mt-0.5 text-caption leading-relaxed text-navy-600">{detail}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-navy-50 px-4 py-2.5 text-caption text-navy-600">
            Mail provider: {mail.provider}.
          </p>
        </Panel>
      </div>
    </div>
  );
}

function QueueBody({
  snapshot,
  mail,
}: {
  snapshot: QueueSnapshot;
  mail: { provider: string };
}) {
  const now = new Date(snapshot.readAt);
  const moving = isQueueDriven(snapshot, now.getTime());
  const { counts, outbox, recent } = snapshot;

  return (
    <>
      <Panel title="Is it moving?" bodyClassName="">
        <div className="px-4 py-3">
          {moving ? (
            <p className="text-small leading-relaxed text-navy-800">
              <Badge tone="green">Running</Badge>{" "}
              <span className="ml-2">
                A job was claimed or finished within the last five minutes, so something is
                driving this queue.
              </span>
            </p>
          ) : (
            <p className="text-small leading-relaxed text-navy-800">
              <Badge tone="amber">No recent activity</Badge>{" "}
              <span className="ml-2">
                No job has changed state in the last five minutes. Either nothing was due, or
                nothing is driving the queue — the counts below cannot tell those two apart, so
                this page does not pretend to. Check that the scheduler is calling{" "}
                <code className="font-mono text-caption">/api/cron/tick</code> or that a worker
                process is running.
              </span>
            </p>
          )}
          <p className="mt-2 text-caption text-navy-500">
            Read at {formatNewsroom(snapshot.readAt, "datetime")} ({formatRelative(snapshot.readAt, now)}).
          </p>
        </div>
      </Panel>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Pending"
          value={counts.pending}
          changeLabel={counts.pending > 0 ? "Waiting for a worker" : "Queue is empty"}
        />
        <StatCard
          label="Running"
          value={counts.running}
          changeLabel={counts.running > 0 ? "Held under a lease" : "Nothing in flight"}
        />
        <StatCard
          label="Dead"
          value={counts.dead}
          changeLabel={counts.dead > 0 ? "Out of attempts - needs a human" : "No exhausted jobs"}
        />
        <StatCard
          label="Scheduled articles due"
          value={counts.dueScheduledArticles}
          changeLabel={
            counts.dueScheduledArticles > 0
              ? "Past publish_at and still scheduled"
              : "Nothing overdue"
          }
          emptyReason="Could not be counted"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Email outbox">
          <div className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-5">
            {(
              [
                ["Queued", outbox.queued],
                ["Sending", outbox.sending],
                ["Sent", outbox.sent],
                ["Failed", outbox.failed],
                ["Dead", outbox.dead],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <p className="text-micro font-bold tracking-[0.06em] text-navy-500 uppercase">
                  {label}
                </p>
                <p className="mt-1 text-dek leading-none font-extrabold text-navy-900 tabular">
                  {new Intl.NumberFormat("en-US").format(value)}
                </p>
              </div>
            ))}
          </div>
          <p className="border-t border-navy-50 px-4 py-2.5 text-caption leading-relaxed text-navy-600">
            {outbox.queued + outbox.sending > 0 && mail.provider !== "resend"
              ? `Mail is queued but cannot be sent: provider is ${mail.provider}. Queued mail waits; nothing is marked sent and no attempt is spent.`
              : "Subscription confirmations are written here in the same transaction as the subscription change, then sent by the worker."}
          </p>
        </Panel>

        <Panel title="Recently updated jobs">
          <DataTable
            caption="The fifteen most recently touched jobs."
            head={
              <>
                <th scope="col">Kind</th>
                <th scope="col">Status</th>
                <th scope="col">Attempts</th>
                <th scope="col">Updated</th>
              </>
            }
          >
            {recent.length === 0 ? (
              <TableEmpty colSpan={4}>
                No job has ever been recorded. That is expected on a new deployment and after a
                purge — it is not evidence that the queue works.
              </TableEmpty>
            ) : (
              recent.map((job) => (
                <tr key={job.id}>
                  <td>
                    <span className="font-mono text-caption text-navy-900">
                      {labelFor(job.kind)}
                    </span>
                    {job.lastError && (
                      <p className="mt-0.5 max-w-[38ch] truncate text-caption text-signal-800">
                        {job.lastError}
                      </p>
                    )}
                  </td>
                  <td>
                    <Badge tone={tone(job.status)}>{job.status}</Badge>
                  </td>
                  <td className="tabular">
                    {job.attempts}/{job.maxAttempts}
                  </td>
                  <td className="whitespace-nowrap text-caption text-navy-600">
                    {formatRelative(job.updatedAt, now)}
                  </td>
                </tr>
              ))
            )}
          </DataTable>
        </Panel>
      </div>

      <p className="mt-4 text-caption leading-relaxed text-navy-600">
        Retrying or cancelling a job is not offered here.{" "}
        <code className="font-mono text-caption">job.retry</code> and{" "}
        <code className="font-mono text-caption">job.cancel</code> exist as permissions with
        nothing behind them, and a button that did nothing would be worse than the absence of
        one. To clear a dead job, fix the cause and insert a fresh job — the failed row stays as
        the record of what happened.{" "}
        <Link href="/admin/articles?status=scheduled" className="font-semibold text-navy-900 underline">
          Scheduled articles
        </Link>
      </p>
    </>
  );
}

function Unreadable({
  state,
  message,
  worker,
}: {
  state: "not_configured" | "error";
  message: string;
  worker: string;
}) {
  return (
    <Panel title="Queue">
      <div className="px-4 py-4">
        <p className="text-small font-bold text-navy-900">
          {state === "not_configured" ? "No database, so nothing was read" : "The read failed"}
        </p>
        <p className="mt-1 text-small leading-relaxed text-navy-700">{message}</p>
        <p className="mt-2 text-small leading-relaxed text-navy-700">
          Every number on this page comes from the <code className="font-mono text-caption">jobs</code>{" "}
          and <code className="font-mono text-caption">email_outbox</code> tables. Without them
          there is no depth to report, so none is shown — a zero would read as &ldquo;nothing
          queued&rdquo;, which is a different claim entirely.
        </p>
        <p className="mt-2 text-caption text-navy-500">
          Set DATABASE_URL and SUPABASE_SERVICE_ROLE_KEY, run the migrations, then start the
          queue with <code className="font-mono">{worker}</code> or a scheduler calling{" "}
          <code className="font-mono">/api/cron/tick</code>.
        </p>
      </div>
    </Panel>
  );
}
