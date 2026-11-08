import type { Metadata } from "next";
import Link from "next/link";
import { statusClass } from "@/components/ui/styles";
import { NotConfigured } from "@/components/ui/states";
import { getDashboardStats } from "@/server/admin/stats";
import { tryAdminSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

// Admin data is per-user and must never be cached by a shared cache.
export const dynamic = "force-dynamic";

const DENIAL_COPY = {
  unauthenticated: {
    title: "Sign in required",
    body: "This dashboard is restricted to authorised staff. Sign in with your ASD account to continue.",
    action: { href: "/admin/login", label: "Go to sign in" },
  },
  no_role: {
    title: "No role assigned",
    body: "Your account is signed in but has no administrative role. Ask a Super Admin to assign one.",
    action: { href: "/", label: "Return to the site" },
  },
  mfa: {
    title: "Multi-factor authentication required",
    body: "Privileged accounts must complete a second factor before the dashboard unlocks.",
    action: { href: "/admin/login", label: "Complete sign in" },
  },
} as const;

function formatMetric(value: number | null, format?: "number" | "currency"): string {
  if (value === null) return "—";
  if (format === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US").format(value);
}

export default async function AdminDashboardPage() {
  const access = await tryAdminSession();

  if (!access.ok) {
    const copy = DENIAL_COPY[access.reason];
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="rounded-lg bg-white p-8 ring-1 ring-navy-100">
          <h1 className="text-xl font-bold text-navy-900">{copy.title}</h1>
          <p className="mt-2 text-sm text-navy-600">{copy.body}</p>
          <Link
            href={copy.action.href}
            className="mt-5 inline-block rounded-md bg-signal-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-signal-700"
          >
            {copy.action.label}
          </Link>
          <p className="mt-6 border-t border-navy-100 pt-4 text-xs text-navy-500">
            Authorisation is enforced on the server for every admin page and action. Hiding
            navigation is not how access is controlled here.
          </p>
        </div>
      </div>
    );
  }

  const stats = await getDashboardStats();

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-navy-900">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-navy-600">
          Welcome back{access.session.displayName ? `, ${access.session.displayName}` : ""}. Roles:{" "}
          {access.session.roles.join(", ")}
        </p>
      </header>

      {stats.status === "unavailable" && (
        <NotConfigured
          feature="Dashboard metrics"
          requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]}
          detail={stats.reason ?? "No verified data source is available."}
        />
      )}

      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {stats.metrics.map((m) => (
            <div key={m.key} className="rounded-lg bg-white p-4 ring-1 ring-navy-100">
              <p className="text-xs font-semibold tracking-wide text-navy-500 uppercase">
                {m.label}
              </p>
              <p className="mt-2 text-2xl font-extrabold text-navy-900 tabular-nums">
                {formatMetric(m.value, m.format)}
              </p>
              {m.status === "unavailable" ? (
                <p className="mt-1 text-[11px] leading-snug text-amber-700">
                  Not available — {m.note ?? "no data source"}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-verify-600">Verified from the database</p>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="recent-heading" className="rounded-lg bg-white ring-1 ring-navy-100 lg:col-span-2">
          <h2
            id="recent-heading"
            className="border-b border-navy-100 px-4 py-3 text-sm font-bold text-navy-900"
          >
            Recent News Posts
          </h2>
          {stats.recentArticles.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-navy-50 text-[11px] tracking-wide text-navy-600 uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Title
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2 font-semibold">
                      Updated
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-navy-50">
                  {stats.recentArticles.map((a, i) => (
                    <tr key={`${a.title}-${i}`}>
                      <td className="px-4 py-2 font-medium text-navy-900">{a.title}</td>
                      <td className="px-4 py-2 text-navy-600">{a.category}</td>
                      <td className="px-4 py-2">
                        <span className={statusClass(a.status === "published" ? "success" : "neutral")}>
                          {a.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-navy-500">
                        {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString("en-US") : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-8 text-center text-sm text-navy-500">
              No articles yet. Published and draft articles will appear here.
            </p>
          )}
        </section>

        <section aria-labelledby="health-heading" className="rounded-lg bg-white ring-1 ring-navy-100">
          <h2
            id="health-heading"
            className="border-b border-navy-100 px-4 py-3 text-sm font-bold text-navy-900"
          >
            Configuration Status
          </h2>
          <ul className="divide-y divide-navy-50">
            {stats.systemChecks.map((check) => (
              <li key={check.label} className="flex items-start justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-[13px] font-medium text-navy-900">{check.label}</p>
                  <p className="mt-0.5 text-[11px] text-navy-500">{check.detail}</p>
                </div>
                <span
                  className={statusClass(
                    check.state === "ok" ? "success" : check.state === "degraded" ? "warning" : "neutral",
                  )}
                >
                  {check.state === "ok" ? "Configured" : check.state === "degraded" ? "Degraded" : "Unknown"}
                </span>
              </li>
            ))}
          </ul>
          <p className="border-t border-navy-100 px-4 py-3 text-[11px] leading-relaxed text-navy-500">
            &ldquo;Configured&rdquo; means credentials are present, not that the service was probed.
            Live health probes arrive with the worker and monitoring phases.
          </p>
        </section>
      </div>
    </div>
  );
}
