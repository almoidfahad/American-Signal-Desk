import type { Metadata } from "next";
import { PlannedFeature } from "@/components/admin/planned-feature";
import { requireAdminPage } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

/**
 * Traffic analytics.
 *
 * This is the page the reference design fills with 958.6K visitors, 4.8M page views and a
 * 99.9% uptime figure. None of those are measured here: no analytics provider is
 * configured, no pageview is recorded, and uptime is not something this app can know about
 * itself. A chart drawn from invented data is the most expensive kind of lie in a dashboard,
 * because it is the one people quote in meetings.
 */
export default async function AnalyticsPage() {
  const access = await requireAdminPage("analytics.read");
  if (!access.ok) return access.node;

  return (
    <PlannedFeature
      title="Analytics"
      summary="Readers, referrers and per-article performance. No measurement is wired up, so this page has no figures rather than placeholder ones."
      permission="analytics.read"
      status="not_implemented"
      missing={[
        {
          item: "Nothing records a page view",
          detail:
            "There is no analytics script, no server-side pageview log and no provider key. A visitor count would therefore have no data source at all.",
        },
        {
          item: "No uptime measurement",
          detail:
            "Uptime is observed by an external monitor. The app cannot measure its own availability, and a self-reported 99.9% would be meaningless.",
        },
        {
          item: "No article performance data",
          detail:
            "Views per article need the pageview log above. The admin can read article metadata today, which is a different thing from readership.",
        },
      ]}
      whenReady={[
        "Figures carry the window they were measured over and the time they were read.",
        "A broken analytics integration renders as 'not available', never as zero traffic.",
        "Per-article numbers link to the article so a surprising figure can be checked against the page itself.",
      ]}
      alternatives={[
        {
          href: "/admin/articles",
          label: "Manage News",
          note: "Publication metadata, which is real",
        },
        {
          href: "/admin/audit",
          label: "Audit Logs",
          note: "Staff activity, recorded as it happens",
        },
      ]}
    />
  );
}
