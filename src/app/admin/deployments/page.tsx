import type { Metadata } from "next";
import { PlannedFeature } from "@/components/admin/planned-feature";
import { requireAdminPage } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Deployment Control" };
export const dynamic = "force-dynamic";

/**
 * Deployment control.
 *
 * The deployment permission model is real and deliberately split: an agent can request a
 * deploy, a human approves a preview, and only Super Admin can approve production. What is
 * missing is the pipeline integration, so this page does not show a deploy button that would
 * either do nothing or — worse — actually deploy without the approval chain it promises.
 */
export default async function DeploymentsPage() {
  const access = await requireAdminPage("deploy.request");
  if (!access.ok) return access.node;

  return (
    <PlannedFeature
      title="Deployment Control"
      summary="Promotion from preview to production with an approval record. The permission split exists; the pipeline integration and the approval ledger do not."
      permission="deploy.request"
      status="not_implemented"
      missing={[
        {
          item: "No deployment ledger",
          detail:
            "Every promotion needs a row naming who approved it, the commit it built and the environment it went to. No table stores that, so there is no history to show and no approval to enforce.",
        },
        {
          item: "No provider integration",
          detail:
            "Deployments are triggered outside this app today. Wiring a trigger in without the ledger first would remove the approval step that the permission model depends on.",
        },
        {
          item: "No rollback path",
          detail:
            "deploy.rollback exists as a permission. Rolling back needs a known-good previous build reference; nothing records build references yet.",
        },
      ]}
      whenReady={[
        "A deploy request records the commit, the environment and the requester before anything is built.",
        "Production promotion requires an explicit approval from a Super Admin, recorded with a reason.",
        "Rollback targets a named previous build, and the rollback itself is audited like any other privileged action.",
        "The live deployment shows the commit it was built from, so 'what is running' is answerable without asking a person.",
      ]}
      alternatives={[
        {
          href: "/api/health",
          label: "Health endpoint",
          note: "The only live deployment signal this build can offer",
        },
      ]}
    />
  );
}
