import { formatNewsroom } from "@/lib/dates";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { statusTone } from "@/components/ui/status-tone";
import { ArticleForm } from "@/components/admin/article-form";
import {
  TransitionControls,
  type AvailableTransition,
} from "@/components/admin/transition-controls";
import { ARTICLE_STATUS_META } from "@/components/ui/styles";
import { requireAdminPage } from "@/server/admin/guard";
import { permissionsForRoles, type Actor } from "@/server/authz/permissions";
import { getArticleForEditing, listArticlesForActor } from "@/server/editorial/service";
import {
  TRANSITIONS,
  isEditableStatus,
  type ArticleStatus,
} from "@/server/editorial/workflow";
import { transitionArticleAction, updateArticleAction } from "../actions";
import { listCategoriesForAdmin } from "@/server/admin/categories";

export const metadata: Metadata = { title: "Edit Article" };
export const dynamic = "force-dynamic";

const LABELS: Record<ArticleStatus, string> = {
  draft: "Return to draft",
  pending_review: "Send for review",
  changes_requested: "Request changes",
  approved: "Approve",
  scheduled: "Schedule",
  published: "Publish",
  rejected: "Reject",
  archived: "Archive",
  trash: "Move to trash",
};

/**
 * Confirmations for actions a reasonable person could regret. Publishing puts words in front
 * of the public; archiving removes a live page; trash and rejection change what the author
 * sees. Routine forward steps inside the review chain are not confirmed - confirming
 * everything trains people to click through everything.
 */
const CONFIRM: Partial<Record<ArticleStatus, string>> = {
  published: "This publishes immediately to the public site. Continue?",
  archived: "This removes the article from the public site. Continue?",
  trash: "This moves the article to trash. It can be restored later. Continue?",
  rejected: "This marks the article rejected. Continue?",
};

/**
 * Computes which lifecycle buttons this actor may actually use.
 *
 * Mirrors the service-layer rules so the UI cannot offer an action that will be refused.
 * Authorization itself still happens on the server; this only prevents a confusing click.
 */
function availableTransitions(
  actor: Actor,
  from: ArticleStatus,
  ownerId: string | null,
): AvailableTransition[] {
  const granted = permissionsForRoles(actor.roles);
  const list: AvailableTransition[] = [];

  for (const rule of TRANSITIONS) {
    if (!rule.from.includes(from)) continue;

    const allowed =
      rule.permission === "article.edit.own"
        ? granted.has("article.edit.own") || granted.has("article.edit.any")
          ? ownerId === actor.userId || granted.has("article.edit.any")
          : false
        : granted.has(rule.permission);

    if (!allowed) continue;

    list.push({
      to: rule.to,
      label: LABELS[rule.to] ?? rule.label,
      tone:
        rule.to === "published"
          ? "primary"
          : rule.to === "trash" || rule.to === "rejected"
            ? "danger"
            : "secondary",
      confirm: CONFIRM[rule.to],
    });
  }

  return list;
}

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireAdminPage();
  if (!access.ok) return access.node;
  const session = access.session;

  const { id } = await params;
  const actor: Actor = { userId: session.userId, roles: session.roles };

  const result = await getArticleForEditing(actor, id);

  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <div className="mx-auto max-w-lg py-16">
        <h1 className="text-xl font-bold text-navy-900">This article cannot be opened</h1>
        <p className="mt-2 text-[13px] text-navy-600">{result.message}</p>
        <Link
          href="/admin/articles"
          className="mt-4 inline-block text-[13px] font-semibold text-navy-800 underline"
        >
          Back to the list
        </Link>
      </div>
    );
  }

  const article = result.data;
  const meta = ARTICLE_STATUS_META[article.status];
  const editable = isEditableStatus(article.status);
  const transitions = availableTransitions(actor, article.status, article.createdBy);

  const categories = await listCategoriesForAdmin();
  const selectedCategoryId = categories.find((c) => c.id === article.categoryId)?.id ?? null;

  const isReviewer =
    session.roles.includes("editor") ||
    session.roles.includes("admin") ||
    session.roles.includes("super_admin");

  const queue = isReviewer
    ? await listArticlesForActor(actor, { status: "pending_review", limit: 5 })
    : null;

  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <nav aria-label="Breadcrumb" className="mb-2 text-[11.5px] text-navy-500">
          <Link href="/admin/articles" className="hover:text-navy-900 hover:underline">
            News Management
          </Link>
          <span aria-hidden="true" className="mx-1.5">
            /
          </span>
          <span aria-current="page">Edit</span>
        </nav>

        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <h1 className="text-[21px] leading-tight font-extrabold tracking-tight text-navy-900">
            Edit Article
          </h1>
          <Badge tone={statusTone(article.status)}>{meta?.label ?? article.status}</Badge>
        </div>
        <p className="-mt-2 mb-4 font-mono text-[11px] text-navy-400">/article/{article.slug}</p>

        <Panel bodyClassName="p-5">
          <ArticleForm
            mode="edit"
            action={updateArticleAction}
            article={{
              id: article.id,
              title: article.title,
              slug: article.slug,
              dek: article.dek,
              bodyHtml: article.bodyHtml,
              categoryId: selectedCategoryId,
              heroImageUrl: null,
              heroImageAlt: null,
            }}
            categories={categories.map((category) => ({ id: category.id, name: category.name }))}
            readOnly={!editable}
          />
        </Panel>
      </div>

      <aside className="space-y-4">
        <Panel title="Next step" bodyClassName="p-4">
          <p className="text-[11.5px] leading-relaxed text-navy-500">
            Every transition is authorised on the server and written to the audit log.
          </p>
          <div className="mt-3">
            <TransitionControls
              articleId={article.id}
              transitions={transitions}
              action={transitionArticleAction}
            />
          </div>
        </Panel>

        <Panel title="Details" bodyClassName="p-4">
          <dl className="space-y-2.5 text-[12px]">
            <div className="flex items-start justify-between gap-3">
              <dt className="text-navy-500">Your role</dt>
              <dd className="text-right font-semibold text-navy-900">
                {session.roles.join(", ") || "-"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-navy-500">Ownership</dt>
              <dd className="text-right font-semibold text-navy-900">
                {article.createdBy === session.userId ? "Yours" : "Another author's"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-navy-500">Publish time</dt>
              <dd className="text-right font-semibold text-navy-900 tabular">
                {article.publishAt ? formatNewsroom(article.publishAt, "datetime") : "-"}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="text-navy-500">Editable</dt>
              <dd className="text-right font-semibold text-navy-900">
                {editable ? "Yes, in this state" : "No - return to draft first"}
              </dd>
            </div>
          </dl>
        </Panel>

        {queue?.ok && queue.data.items.length > 0 && (
          <Panel title="Waiting for review" bodyClassName="p-4">
            <ul className="divide-y divide-navy-50">
              {queue.data.items.map((item) => (
                <li key={item.id} className="py-2 first:pt-0">
                  <Link
                    href={`/admin/articles/${item.id}`}
                    className="line-clamp-2 text-[12.5px] font-medium text-navy-800 hover:text-signal-700 hover:underline"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/admin/articles/review"
              className="mt-2 inline-block text-[11.5px] font-bold text-signal-700 hover:underline"
            >
              Open the full queue
            </Link>
          </Panel>
        )}
      </aside>
    </div>
  );
}
