import { SERVICE_ENV_VARS } from "@/server/db/client";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge, PageHeader } from "@/components/admin/ui";
import { LinkButton } from "@/components/admin/ui";
import { NotConfigured } from "@/components/ui/states";
import { can } from "@/server/authz/permissions";
import { requireAdminPage } from "@/server/admin/guard";
import { listArticlesForActor } from "@/server/editorial/service";

export const metadata: Metadata = { title: "Review Queue" };
export const dynamic = "force-dynamic";

/**
 * Review queue.
 *
 * Only reviewers may see it, and that check is repeated server-side on the article detail
 * page and again in the transition action - landing here is not what grants review rights.
 */
export default async function ReviewQueuePage() {
  const access = await requireAdminPage();
  if (!access.ok) return access.node;
  const session = access.session;

  const actor = { userId: session.userId, roles: session.roles };

  if (!can(actor, "article.review") && !can(actor, "article.approve")) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <h1 className="text-xl font-bold text-navy-900">No access to the review queue</h1>
        <p className="mt-2 text-[13px] text-navy-600">
          The review queue is for editors. Your role does not include{" "}
          <code className="font-mono">article.review</code>.
        </p>
        <Link
          href="/admin/articles"
          className="mt-4 inline-block text-[13px] font-semibold text-navy-800 underline"
        >
          Back to your articles
        </Link>
      </div>
    );
  }

  const result = await listArticlesForActor(actor, { status: "pending_review", limit: 50 });
  const count = result.ok ? result.data.items.length : 0;

  return (
    <div>
      <PageHeader
        title="Review Queue"
        description="Stories awaiting an approval decision. Every decision is recorded in the audit log."
        actions={
          <span className="rounded-md border border-navy-200 bg-white px-3 py-1.5 text-[12px] font-bold text-navy-800">
            {result.ok ? `${count} awaiting review` : "Count unavailable"}
          </span>
        }
      />

      {!result.ok && result.code === "NOT_CONFIGURED" ? (
        <NotConfigured
          feature="Review queue"
          requiredEnv={SERVICE_ENV_VARS}
          detail="No database is configured, so the queue cannot be read. An empty queue here is a configuration gap, not a finished review cycle."
        />
      ) : !result.ok ? (
        <p
          role="alert"
          className="rounded-md bg-signal-50 px-4 py-3 text-[13px] text-signal-800 ring-1 ring-signal-300"
        >
          {result.message}
        </p>
      ) : count === 0 ? (
        <div className="rounded-card bg-white px-6 py-14 text-center ring-1 ring-navy-100 shadow-sm">
          <p className="text-[15px] font-bold text-navy-900">The queue is clear</p>
          <p className="mx-auto mt-1 max-w-sm text-[13px] text-navy-600">
            Nothing is waiting for review. Stories appear here as soon as an author submits one.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {result.data.items.map((article) => (
            <li
              key={article.id}
              className="rounded-card bg-white p-4 ring-1 ring-navy-100 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/articles/${article.id}`}
                    className="text-[15px] leading-snug font-bold text-navy-900 hover:text-signal-700 hover:underline"
                  >
                    {article.title}
                  </Link>
                  <p className="mt-1 line-clamp-2 max-w-2xl text-[12.5px] text-navy-600">
                    {article.dek || "No summary provided."}
                  </p>
                  <p className="mt-1.5 font-mono text-[10.5px] text-navy-400">/{article.slug}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone="amber">Awaiting review</Badge>
                  <LinkButton href={`/admin/articles/${article.id}`}>Review</LinkButton>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
