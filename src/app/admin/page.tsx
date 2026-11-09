import { SERVICE_ENV_VARS } from "@/server/db/client";
import { formatNewsroom } from "@/lib/dates";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, DataTable, LinkButton, PageHeader, Panel, StatCard } from "@/components/admin/ui";
import { statusTone } from "@/components/ui/status-tone";
import { NotConfigured } from "@/components/ui/states";
import {
  ChartIcon,
  ClockIcon,
  FileTextIcon,
  MailIcon,
  MediaIcon,
  PencilIcon,
  SectionsIcon,
  UploadIcon,
  UsersIcon,
} from "@/components/ui/icons";
import { getDashboardStats } from "@/server/admin/stats";
import { tryAdminSession } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dashboard" };

// Admin data is per-user and must never be cached by a shared cache.
export const dynamic = "force-dynamic";

/**
 * Dashboard.
 *
 * Layout mirrors the editorial control-room reference: a row of metric tiles, then a
 * three-column band of recent posts, quick actions and configuration status.
 *
 * The reference screenshot shows invented traffic figures (958.6K visitors, 4.8M page
 * views, "99.9% uptime", "All Systems Operational"). This dashboard shows none of that,
 * because none of it is measured yet. Where a number has no verified source it renders an
 * em dash with the reason underneath. A control room that flatters itself is worse than one
 * that admits it is empty - the operator acts on these tiles.
 */

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

/**
 * Quick actions.
 *
 * The icons are inline SVG, not characters. A pencil and an envelope drawn as Unicode render
 * as empty boxes on any system whose font lacks the glyph, which makes the tile look broken
 * rather than plain.
 */
const QUICK_ACTIONS: {
  href: string;
  label: string;
  Icon: (props: { className?: string }) => React.ReactElement;
}[] = [
  { href: "/admin/articles/new", label: "Add News", Icon: PencilIcon },
  { href: "/admin/categories", label: "Categories", Icon: SectionsIcon },
  { href: "/admin/analytics", label: "Analytics", Icon: ChartIcon },
  { href: "/admin/users", label: "Manage Users", Icon: UsersIcon },
  { href: "/admin/media", label: "Media Library", Icon: MediaIcon },
  { href: "/admin/deployments", label: "Deploy Site", Icon: UploadIcon },
];

function todayLabel(): string {
  return formatNewsroom(new Date().toISOString(), "day");
}

export default async function AdminDashboardPage() {
  const access = await tryAdminSession();

  if (!access.ok) {
    const copy = DENIAL_COPY[access.reason];
    return (
      <div className="mx-auto max-w-lg py-16">
        <div className="rounded-card bg-white p-8 ring-1 ring-navy-100 shadow-sm">
          <h1 className="text-xl font-bold text-navy-900">{copy.title}</h1>
          <p className="mt-2 text-sm text-navy-600">{copy.body}</p>
          <Link
            href={copy.action.href}
            className="mt-5 inline-block rounded-md bg-signal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-signal-700"
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
    <div>
      <PageHeader
        title="Admin Dashboard"
        description={`Welcome back${access.session.displayName ? `, ${access.session.displayName}` : ""}. Here is what the newsroom can verify right now.`}
        actions={
          <>
            <span className="hidden items-center gap-2 rounded-md border border-navy-200 bg-white px-3 py-1.5 text-[12px] font-medium text-navy-600 md:flex">
              <span aria-hidden="true">🗓</span>
              {todayLabel()}
            </span>
            <LinkButton href="/">View Live Site</LinkButton>
          </>
        }
      />

      {stats.status === "unavailable" && (
        <div className="mb-5">
          <NotConfigured
            feature="Dashboard metrics"
            requiredEnv={SERVICE_ENV_VARS}
            detail={stats.reason ?? "No verified data source is available."}
          />
        </div>
      )}

      {/* Metric tiles */}
      <section aria-labelledby="metrics-heading">
        <h2 id="metrics-heading" className="sr-only">
          Key metrics
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {stats.metrics.map((metric) => (
            <StatCard
              key={metric.key}
              label={metric.label}
              value={metric.value}
              format={metric.format}
              emptyReason={
                metric.status === "unavailable"
                  ? `Not measured - ${metric.note ?? "no verified data source"}`
                  : "Read from the database"
              }
              icon={(() => {
                const MetricIcon = METRIC_ICONS[metric.key];
                return MetricIcon ? <MetricIcon className="h-4 w-4" /> : null;
              })()}
            />
          ))}
        </div>
      </section>

      <div className="mt-5 grid gap-4 xl:grid-cols-12">
        {/* Recent posts */}
        <div className="xl:col-span-7">
          <Panel
            title="Recent News Posts"
            action={
              <Link
                href="/admin/articles"
                className="text-[11.5px] font-bold text-signal-700 hover:underline"
              >
                View all
              </Link>
            }
            bodyClassName=""
          >
            {stats.recentArticles.length > 0 ? (
              <DataTable
                caption="Most recently updated articles"
                head={
                  <>
                    <th scope="col" className="px-4 py-2.5">
                      Title
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      Status
                    </th>
                    <th scope="col" className="px-4 py-2.5">
                      Updated
                    </th>
                  </>
                }
              >
                {stats.recentArticles.map((article, index) => (
                  <tr key={`${article.title}-${index}`} className="hover:bg-navy-50/60">
                    <td className="max-w-[280px] px-4 py-2.5">
                      <span className="line-clamp-1 font-semibold text-navy-900">
                        {article.title}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-navy-600">{article.category || "-"}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={statusTone(article.status)}>
                        {article.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-2.5 text-navy-500 tabular">
                      {article.updatedAt
                        ? formatNewsroom(article.updatedAt)
                        : "-"}
                    </td>
                  </tr>
                ))}
              </DataTable>
            ) : (
              <p className="px-4 py-10 text-center text-[12.5px] text-navy-500">
                No articles yet. Published and draft articles will appear here.
              </p>
            )}
          </Panel>
        </div>

        {/* Quick actions */}
        <div className="xl:col-span-5">
          <Panel title="Quick Actions" bodyClassName="p-3">
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {QUICK_ACTIONS.map((action) => (
                <li key={action.href}>
                  <Link
                    href={action.href}
                    className="flex h-full flex-col items-center justify-center gap-1.5 rounded-md bg-navy-50 px-2 py-4 text-center transition-colors hover:bg-navy-100 hover:text-signal-700"
                  >
                    <action.Icon className="h-[18px] w-[18px] text-navy-700" />
                    <span className="text-[11.5px] leading-tight font-bold text-navy-800">
                      {action.label}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="mt-4">
            <Panel title="Configuration Status" bodyClassName="">
              <ul className="divide-y divide-navy-50">
                {stats.systemChecks.map((check) => (
                  <li
                    key={check.label}
                    className="flex items-start justify-between gap-3 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-navy-900">{check.label}</p>
                      <p className="mt-0.5 text-[11px] leading-snug text-navy-500">
                        {check.detail}
                      </p>
                    </div>
                    <Badge
                      tone={
                        check.state === "ok"
                          ? "green"
                          : check.state === "degraded"
                            ? "amber"
                            : "slate"
                      }
                    >
                      {check.state === "ok"
                        ? "Configured"
                        : check.state === "degraded"
                          ? "Degraded"
                          : "Unknown"}
                    </Badge>
                  </li>
                ))}
              </ul>
              <p className="border-t border-navy-100 px-4 py-2.5 text-[11px] leading-relaxed text-navy-500">
                &ldquo;Configured&rdquo; means credentials are present, not that the service was
                probed. Live probes arrive with the worker phase.
              </p>
            </Panel>
          </div>
        </div>
      </div>
    </div>
  );
}

const METRIC_ICONS: Record<string, (props: { className?: string }) => React.ReactElement> = {
  articles: FileTextIcon,
  published: MediaIcon,
  drafts: PencilIcon,
  subscribers: MailIcon,
  pending_review: ClockIcon,
};
