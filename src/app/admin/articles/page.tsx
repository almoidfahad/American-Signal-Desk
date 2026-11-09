import { SERVICE_ENV_VARS } from "@/server/db/client";
import { NO_DATE_ADMIN, formatNewsroom } from "@/lib/dates";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, DataTable, LinkButton, PageHeader, Panel, TableEmpty } from "@/components/admin/ui";
import { statusTone } from "@/components/ui/status-tone";
import { NotConfigured } from "@/components/ui/states";
import { can } from "@/server/authz/permissions";
import { requireAdminPage } from "@/server/admin/guard";
import { listArticlesForActor } from "@/server/editorial/service";
import { ARTICLE_STATUSES, type ArticleStatus } from "@/server/editorial/workflow";
import { ARTICLE_STATUS_META } from "@/components/ui/styles";

export const metadata: Metadata = { title: "News Management" };
export const dynamic = "force-dynamic";

/**
 * Article list.
 *
 * This page lists only what the signed-in actor may see: the service layer narrows the query
 * by permission, and RLS narrows it again. The status filter is a convenience, not a
 * security boundary - filtering by "published" does not grant the ability to read drafts.
 */

function formatRowDate(iso: string | null): string {
  return formatNewsroom(iso, "compact", NO_DATE_ADMIN);
}

export default async function ArticlesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const access = await requireAdminPage();
  if (!access.ok) return access.node;
  const session = access.session;

  const actor = { userId: session.userId, roles: session.roles };
  const { status: statusParam } = await searchParams;
  const statusFilter: ArticleStatus | "all" =
    statusParam && (ARTICLE_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as ArticleStatus)
      : "all";

  const result = await listArticlesForActor(actor, { status: statusFilter, limit: 25 });
  const configured = result.ok || result.code !== "NOT_CONFIGURED";
  const canSeeEverything = can(actor, "article.review") || can(actor, "article.edit.any");

  return (
    <div>
      <PageHeader
        title="News Management"
        description={
          canSeeEverything
            ? "All articles in the newsroom."
            : "Your own articles. Reviewers can see the whole queue."
        }
        actions={
          can(actor, "article.create") ? (
            <LinkButton href="/admin/articles/new">+ Add News</LinkButton>
          ) : null
        }
      />

      {/* Status filter */}
      <nav aria-label="Filter by status" className="mb-4 flex flex-wrap gap-1.5">
        <Link
          href="/admin/articles"
          aria-current={statusFilter === "all" ? "page" : undefined}
          className={`rounded-md px-2.5 py-1.5 text-caption font-bold ring-1 transition-colors ${
            statusFilter === "all"
              ? "bg-navy-900 text-white ring-navy-900"
              : "bg-white text-navy-700 ring-navy-200 hover:bg-navy-50"
          }`}
        >
          All
        </Link>
        {ARTICLE_STATUSES.map((status) => {
          const meta = ARTICLE_STATUS_META[status];
          const active = statusFilter === status;
          return (
            <Link
              key={status}
              href={`/admin/articles?status=${status}`}
              aria-current={active ? "page" : undefined}
              className={`rounded-md px-2.5 py-1.5 text-caption font-bold ring-1 transition-colors ${
                active
                  ? "bg-navy-900 text-white ring-navy-900"
                  : "bg-white text-navy-700 ring-navy-200 hover:bg-navy-50"
              }`}
            >
              {meta?.label ?? status}
            </Link>
          );
        })}
      </nav>

      {!configured ? (
        <NotConfigured
          feature="Article list"
          requiredEnv={SERVICE_ENV_VARS}
          detail="No database is configured, so there are no articles to list. This is a configuration gap, not an empty newsroom."
        />
      ) : !result.ok ? (
        <p
          role="alert"
          className="rounded-md bg-signal-50 px-4 py-3 text-small text-signal-800 ring-1 ring-signal-300"
        >
          {result.message}
        </p>
      ) : (
        <Panel bodyClassName="">
          <DataTable
            caption="Articles"
            head={
              <>
                <th scope="col" className="px-4 py-2.5">
                  Title
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Status
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Last updated
                </th>
                <th scope="col" className="px-4 py-2.5">
                  Actions
                </th>
              </>
            }
          >
            {result.data.items.length === 0 ? (
              <TableEmpty colSpan={4}>
                {statusFilter === "all"
                  ? "No articles yet. Start by creating the first one."
                  : "No articles with this status."}
              </TableEmpty>
            ) : (
              result.data.items.map((article) => {
                const meta = ARTICLE_STATUS_META[article.status];
                return (
                  <tr key={article.id} className="hover:bg-navy-50/60">
                    <td className="max-w-[360px] px-4 py-3">
                      <Link
                        href={`/admin/articles/${article.id}`}
                        className="line-clamp-1 font-semibold text-navy-900 hover:text-signal-700 hover:underline"
                      >
                        {article.title}
                      </Link>
                      <p className="mt-0.5 font-mono text-micro text-navy-400">
                        /{article.slug}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(article.status)}>
                        {meta?.label ?? article.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-navy-500 tabular">
                      {formatRowDate(article.updatedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/articles/${article.id}`}
                        className="text-caption font-bold text-navy-700 hover:text-signal-700 hover:underline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </DataTable>
          {result.data.truncated && (
            <p className="border-t border-navy-100 px-4 py-2 text-caption text-navy-500">
              Showing the first 25 articles. There are more.
            </p>
          )}
        </Panel>
      )}
    </div>
  );
}
