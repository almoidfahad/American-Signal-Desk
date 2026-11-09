import type { Metadata } from "next";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requireAdminPage } from "@/server/admin/guard";
import { ENFORCED_BY_DATABASE, posture } from "@/server/admin/config";
import { getAdminSession } from "@/server/auth/session";
import { permissionsForRoles } from "@/server/authz/permissions";

export const metadata: Metadata = { title: "Security Center" };
export const dynamic = "force-dynamic";

/**
 * Security center.
 *
 * Splits cleanly into three things that are easy to blur together, and blurring them is how
 * teams end up believing they are protected:
 *
 *   1. What the database enforces - the claims are all backed by a migration and a test.
 *   2. What this session holds - real, resolved server-side for the person reading the page.
 *   3. What is simply not verified - stated as such, with no green light.
 *
 * The reference design puts "All Systems Operational" on this kind of screen. That sentence
 * would be untrue here, and there is no honest way to soften it, so it is absent.
 */
export default async function SecurityPage() {
  const access = await requireAdminPage("security.read");
  if (!access.ok) return access.node;

  const session = await getAdminSession();
  const perms = session ? permissionsForRoles(session.roles) : new Set<string>();
  const state = posture();

  const unverified = [
    {
      label: "Authentication provider",
      detail: "Sessions are resolved against Supabase Auth. Live sign-in has not been exercised in this environment, so it is not reported as verified.",
      ok: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    },
    {
      label: "Second factor",
      detail: session?.mfaVerified
        ? "This session presented a second factor."
        : "This session has not presented a second factor, or the policy does not require one.",
      ok: session?.mfaVerified ?? false,
    },
    {
      label: "Queue and cache",
      detail: state.health.checks.redis.detail,
      ok: state.health.checks.redis.state === "ok",
    },
    {
      label: "Database reachability",
      detail: state.health.checks.database.detail,
      ok: state.health.checks.database.state === "ok",
    },
  ];

  return (
    <div>
      <PageHeader
        title="Security Center"
        description="What the database enforces, what this session actually holds, and what has not been verified."
      />

      <div className="mb-4 rounded-md bg-navy-50 px-4 py-3 text-[12.5px] leading-relaxed text-navy-700 ring-1 ring-navy-200">
        <p className="font-bold">This page is not a green light</p>
        <p className="mt-1">
          No status is invented here. Each row below either cites the database rule that
          enforces it, or says plainly that it has not been verified in this environment.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Enforced by the database" bodyClassName="p-0">
          <ul className="divide-y divide-navy-50">
            {ENFORCED_BY_DATABASE.map((entry) => (
              <li key={entry.table} className="flex items-start gap-3 px-4 py-3">
                <Badge tone="green">Rule</Badge>
                <div className="min-w-0">
                  <p className="font-mono text-[12px] font-semibold text-navy-900">{entry.table}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-navy-600">{entry.rule}</p>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-4">
          <Panel title="This session" bodyClassName="p-4">
            <dl className="space-y-2.5 text-[12px]">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-navy-500">Account</dt>
                <dd className="text-right font-semibold text-navy-900">
                  {session?.email ?? "Not resolved"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-navy-500">Roles</dt>
                <dd className="text-right font-semibold text-navy-900">
                  {session?.roles.join(", ") || "None"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-navy-500">Second factor</dt>
                <dd className="text-right font-semibold text-navy-900">
                  {session?.mfaVerified ? "Verified" : "Not presented"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-navy-500">Permissions granted</dt>
                <dd className="text-right font-semibold text-navy-900 tabular">
                  {perms.size}
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel title="Not verified here" bodyClassName="p-0">
            <ul className="divide-y divide-navy-50">
              {unverified.map((check) => (
                <li key={check.label} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-navy-900">{check.label}</p>
                    <Badge tone={check.ok ? "green" : "amber"}>
                      {check.ok ? "Verified" : "Unverified"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-navy-600">
                    {check.detail}
                  </p>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <p className="mt-3 max-w-2xl text-[11.5px] leading-relaxed text-navy-500">
        Session revocation, device lists and sign-in history are not shown because they are not
        read from anywhere. The provider owns that data; this build has no integration for it.
      </p>
    </div>
  );
}
