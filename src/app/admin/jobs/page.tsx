import type { Metadata } from "next";
import { PlannedFeature } from "@/components/admin/planned-feature";
import { posture } from "@/server/admin/config";
import { requireAdminPage } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Queue Monitor" };
export const dynamic = "force-dynamic";

/**
 * Queue monitor.
 *
 * Status is derived from whether REDIS_URL is present, not written as a constant. If a queue
 * is configured later this page must start telling the truth about it rather than keeping its
 * current copy — the check below is what forces that edit to happen consciously.
 */
export default async function JobsPage() {
  const access = await requireAdminPage("job.read");
  if (!access.ok) return access.node;

  const hasRedis = posture().health.checks.redis.state !== "not_configured";

  return (
    <PlannedFeature
      title="Queue Monitor"
      summary="Depth, throughput, failures and retries for background work: scheduled publishing, media processing, newsletter delivery."
      permission="job.read"
      status={hasRedis ? "not_implemented" : "blocked"}
      missing={[
        {
          item: hasRedis ? "No worker process" : "REDIS_URL is not set",
          detail: hasRedis
            ? "A queue URL is configured, but no consumer was built. A queue that nothing drains is a backlog that grows silently, so no depth is displayed."
            : "Without a queue there is nothing to inspect. The health probe reports this dependency as not configured rather than green.",
        },
        {
          item: "No job table or retry ledger",
          detail:
            "job.retry and job.cancel exist as permissions with no implementation behind them. Retrying a job that was never recorded would be theatre.",
        },
        {
          item: "Scheduled publishing is not a worker",
          detail:
            "Articles can carry a publish_at time, but nothing promotes them when it arrives; that transition still needs a human or a scheduler that does not exist yet.",
        },
      ]}
      whenReady={[
        "Queue depth, in-flight count and failure count are read live, with the timestamp they were read at.",
        "A failed job shows its last error and can be retried once, with the retry attributed to the person who asked for it.",
        "Scheduled articles publish without a human only if the scheduler is healthy, and the transition is audited as a system action.",
      ]}
      alternatives={[
        {
          href: "/admin/articles?status=scheduled",
          label: "Scheduled articles",
          note: "Stored publish times, readable today",
        },
        {
          href: "/api/health",
          label: "Health endpoint",
          note: "Reports dependency state honestly, including this one",
        },
      ]}
    />
  );
}
