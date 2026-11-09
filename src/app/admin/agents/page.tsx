import type { Metadata } from "next";
import { PlannedFeature } from "@/components/admin/planned-feature";
import { requireAdminPage } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Agent Control Center" };
export const dynamic = "force-dynamic";

/**
 * Agent Control Center.
 *
 * The authorization half of this exists and is unit-tested: agent scopes live in a separate
 * namespace from human permissions, `FORBIDDEN_AGENT_SCOPES` makes publishing impossible for
 * an agent by construction, and `agentCan()` rejects revoked and expired principals. What
 * does not exist is storage for agents, keys or runs — there is no `agents` table in the
 * schema. So this page describes the model that is enforced and refuses to invent run data.
 */
export default async function AgentsPage() {
  const access = await requireAdminPage("agent.read");
  if (!access.ok) return access.node;

  return (
    <PlannedFeature
      title="Agent Control Center"
      summary="Where autonomous agents are registered, scoped and revoked. The scope model is enforced and tested; the registry that would hold real agents is not built."
      permission="agent.read"
      status="not_implemented"
      missing={[
        {
          item: "No agents table",
          detail:
            "The migrations define profiles, roles and audit_logs, but nothing that stores an agent identity, its scopes, or its keys. There is nowhere for a real agent to be registered.",
        },
        {
          item: "No key issuance or revocation path",
          detail:
            "agentCan() checks revokedAt and expiresAt, but no code writes those fields. A control that shows 'revoke' without a key store behind it would be a lie.",
        },
        {
          item: "No run history",
          detail:
            "Every agent action is meant to be audited with actor_type 'agent'. The audit table accepts that value; nothing yet produces such rows, so a run list would be empty by construction.",
        },
        {
          item: "No job runtime",
          detail:
            "Agents act by queuing jobs. The queue needs REDIS_URL and a consumer, neither of which exists in this deployment.",
        },
      ]}
      whenReady={[
        "Agents are created with an explicit scope list drawn only from the agent namespace.",
        "Publishing, approving, deleting and user management are refused at key creation time and re-checked on every request, not by convention.",
        "Revoking an agent takes effect on the next request; keys carry an expiry the server enforces.",
        "Every run appears in the audit log with the actor recorded as an agent, separately from human actions.",
      ]}
      alternatives={[
        {
          href: "/admin/audit",
          label: "Audit Logs",
          note: "Human actions are recorded and readable today",
        },
        {
          href: "/admin/articles/review",
          label: "Review Queue",
          note: "Agent drafts would land here for a human decision",
        },
      ]}
    />
  );
}
