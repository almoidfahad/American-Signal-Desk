import type { Metadata } from "next";
import { PlannedFeature } from "@/components/admin/planned-feature";
import { requireAdminPage } from "@/server/admin/guard";

export const metadata: Metadata = { title: "API Management" };
export const dynamic = "force-dynamic";

/**
 * API keys.
 *
 * `apikey.read` and `apikey.manage` are defined permissions, but there is no keys table, no
 * issuance endpoint and no rate limiting in this build. Listing "keys" here would require
 * inventing them, so it is not done.
 */
export default async function ApiPage() {
  const access = await requireAdminPage("apikey.read");
  if (!access.ok) return access.node;

  return (
    <PlannedFeature
      title="API Management"
      summary="Issued keys, their scopes, last use and revocation. None of that is stored yet, so this page holds the design rather than a key list."
      permission="apikey.read"
      status="not_implemented"
      missing={[
        {
          item: "No key store",
          detail:
            "Keys need a table with a hashed secret, the owning principal, scope list, created and revoked timestamps. No migration creates one.",
        },
        {
          item: "No public API surface",
          detail:
            "An issued key would have nothing to authenticate against: there are no /api/v1 routes beyond the health probe.",
        },
        {
          item: "No usage tracking",
          detail:
            "Last-used and request counts come from rate-limit state in Redis. Without REDIS_URL there is no counter to read, and showing 0 requests would be false.",
        },
      ]}
      whenReady={[
        "A key is shown exactly once at creation; only its hash is stored afterwards.",
        "Scopes are validated against the agent namespace at creation, and forbidden scopes are refused with a reason.",
        "Revocation and expiry are checked on every request, not just at the edge.",
        "Each key shows its real last-used time and which routes it called.",
      ]}
      alternatives={[
        {
          href: "/admin/audit",
          label: "Audit Logs",
          note: "Existing API-relevant actions are already logged",
        },
      ]}
    />
  );
}
