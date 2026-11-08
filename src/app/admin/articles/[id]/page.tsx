import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArticleForm } from "@/components/admin/article-form";
import {
  TransitionControls,
  type AvailableTransition,
} from "@/components/admin/transition-controls";
import { ARTICLE_STATUS_META, statusClass } from "@/components/ui/styles";
import { getAdminSession } from "@/server/auth/session";
import { permissionsForRoles, type Actor } from "@/server/authz/permissions";
import { getArticleForEditing, listArticlesForActor } from "@/server/editorial/service";
import {
  TRANSITIONS,
  isEditableStatus,
  type ArticleStatus,
} from "@/server/editorial/workflow";
import { transitionArticleAction, updateArticleAction } from "../actions";
import { listCategoriesForAdmin } from "@/server/admin/categories";

export const metadata: Metadata = { title: "লেখা সম্পাদনা" };
export const dynamic = "force-dynamic";

const LABELS: Record<ArticleStatus, string> = {
  draft: "ড্রাফটে ফিরিয়ে আনুন",
  pending_review: "রিভিউয়ের জন্য পাঠান",
  changes_requested: "পরিবর্তন চান",
  approved: "অনুমোদন করুন",
  scheduled: "শিডিউল করুন",
  published: "প্রকাশ করুন",
  rejected: "প্রত্যাখ্যান করুন",
  archived: "আর্কাইভ করুন",
  trash: "ট্র্যাশে সরান",
};

const CONFIRM: Partial<Record<ArticleStatus, string>> = {
  published: "এই লেখাটি এখনই পাবলিক সাইটে প্রকাশিত হবে। নিশ্চিত?",
  archived: "লেখাটি পাবলিক সাইট থেকে সরে যাবে। নিশ্চিত?",
  trash: "লেখাটি ট্র্যাশে যাবে। পরে পুনরুদ্ধার করা যাবে। নিশ্চিত?",
  rejected: "লেখাটি প্রত্যাখ্যাত হিসেবে চিহ্নিত হবে। নিশ্চিত?",
};

/**
 * Computes which lifecycle buttons this actor may actually use.
 *
 * Mirrors the service-layer rules so the UI cannot offer an action that will be refused.
 * Authorization itself still happens on the server; this only prevents a confusing click.
 */
function availableTransitions(actor: Actor, from: ArticleStatus, ownerId: string | null): AvailableTransition[] {
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

    // Publishing from 'approved' requires a real human decision; keep the wording explicit.
    list.push({
      to: rule.to,
      label: LABELS[rule.to] ?? rule.label,
      tone: rule.to === "published" ? "primary" : rule.to === "trash" || rule.to === "rejected" ? "danger" : "secondary",
      confirm: CONFIRM[rule.to],
    });
  }

  return list;
}

export default async function EditArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const { id } = await params;
  const actor: Actor = { userId: session.userId, roles: session.roles };

  const result = await getArticleForEditing(actor, id);

  if (!result.ok) {
    if (result.code === "NOT_FOUND") notFound();
    return (
      <div className="mx-auto max-w-lg py-16">
        <h1 className="text-xl font-bold text-navy-900">লেখাটি খোলা যাচ্ছে না</h1>
        <p className="mt-2 text-sm text-navy-600">{result.message}</p>
        <Link href="/admin/articles" className="mt-4 inline-block text-sm font-semibold underline">
          তালিকায় ফিরে যান
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

  // Reviewers benefit from seeing the queue they are working through.
  const queue =
    session.roles.includes("editor") || session.roles.includes("admin") || session.roles.includes("super_admin")
      ? await listArticlesForActor(actor, { status: "pending_review", limit: 5 })
      : null;

  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <nav aria-label="Breadcrumb" className="text-xs text-navy-500">
          <Link href="/admin/articles" className="hover:underline">
            সংবাদ ব্যবস্থাপনা
          </Link>{" "}
          / সম্পাদনা
        </nav>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-extrabold text-navy-900">লেখা সম্পাদনা</h1>
          <span className={statusClass(meta?.tone ?? "neutral")}>{meta?.label ?? article.status}</span>
        </div>
        <p className="mt-1 font-mono text-xs text-navy-500">/{article.slug}</p>

        <div className="mt-6 rounded-lg bg-white p-5 ring-1 ring-navy-100">
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
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
            readOnly={!editable}
          />
        </div>
      </div>

      <aside className="space-y-5">
        <section aria-labelledby="actions-heading" className="rounded-lg bg-white p-4 ring-1 ring-navy-100">
          <h2 id="actions-heading" className="text-sm font-bold text-navy-900">
            পরবর্তী ধাপ
          </h2>
          <p className="mt-1 text-xs text-navy-500">
            প্রতিটি ধাপ সার্ভারে অনুমোদিত হয় এবং অডিট লগে রেকর্ড হয়।
          </p>
          <div className="mt-3">
            <TransitionControls
              articleId={article.id}
              transitions={transitions}
              action={transitionArticleAction}
            />
          </div>
        </section>

        <section aria-labelledby="meta-heading" className="rounded-lg bg-white p-4 ring-1 ring-navy-100">
          <h2 id="meta-heading" className="text-sm font-bold text-navy-900">
            তথ্য
          </h2>
          <dl className="mt-2 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-navy-500">আপনার ভূমিকা</dt>
              <dd className="font-medium text-navy-900">{session.roles.join(", ") || "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-navy-500">মালিকানা</dt>
              <dd className="font-medium text-navy-900">
                {article.createdBy === session.userId ? "আপনার নিজের" : "অন্য লেখকের"}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-navy-500">প্রকাশের সময়</dt>
              <dd className="font-medium text-navy-900">
                {article.publishAt
                  ? new Intl.DateTimeFormat("bn-BD", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Dhaka",
                    }).format(new Date(article.publishAt))
                  : "—"}
              </dd>
            </div>
          </dl>
          {editable && (
            <p className="mt-3 border-t border-navy-100 pt-2 text-[11px] leading-relaxed text-navy-500">
              এই স্ট্যাটাসে লেখা সম্পাদনাযোগ্য।
            </p>
          )}
        </section>

        {queue?.ok && queue.data.items.length > 0 && (
          <section aria-labelledby="queue-heading" className="rounded-lg bg-white p-4 ring-1 ring-navy-100">
            <h2 id="queue-heading" className="text-sm font-bold text-navy-900">
              রিভিউয়ের অপেক্ষায়
            </h2>
            <ul className="mt-2 divide-y divide-navy-50">
              {queue.data.items.map((item) => (
                <li key={item.id} className="py-2">
                  <Link
                    href={`/admin/articles/${item.id}`}
                    className="text-[13px] font-medium text-navy-800 hover:text-signal-700 hover:underline"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href="/admin/articles/review"
              className="mt-2 inline-block text-xs font-semibold text-navy-700 hover:underline"
            >
              পুরো কিউ দেখুন →
            </Link>
          </section>
        )}
      </aside>
    </div>
  );
}
