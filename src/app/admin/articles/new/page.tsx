import { SERVICE_ENV_VARS, hasServiceEnv } from "@/server/db/client";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, Panel } from "@/components/admin/ui";
import { ArticleForm } from "@/components/admin/article-form";
import { NotConfigured } from "@/components/ui/states";
import { createArticleAction } from "../actions";
import { listCategoriesForAdmin } from "@/server/admin/categories";
import { can } from "@/server/authz/permissions";
import { requireAdminPage } from "@/server/admin/guard";

export const metadata: Metadata = { title: "Add News" };
export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const access = await requireAdminPage();
  if (!access.ok) return access.node;
  const session = access.session;

  const actor = { userId: session.userId, roles: session.roles };

  if (!can(actor, "article.create")) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <h1 className="text-dek font-bold text-navy-900">Not permitted</h1>
        <p className="mt-2 text-small text-navy-600">
          Your role does not include permission to create articles (
          <code className="font-mono">article.create</code>). Ask a Super Admin to correct your
          role assignment.
        </p>
        <Link
          href="/admin/articles"
          className="mt-4 inline-block text-small font-semibold text-navy-800 underline"
        >
          Back to news management
        </Link>
      </div>
    );
  }

  const configured = hasServiceEnv();

  const categories = await listCategoriesForAdmin();

  return (
    <div className="max-w-4xl">
      <nav aria-label="Breadcrumb" className="mb-2 text-caption text-navy-500">
        <Link href="/admin/articles" className="hover:text-navy-900 hover:underline">
          News Management
        </Link>
        <span aria-hidden="true" className="mx-1.5">
          /
        </span>
        <span aria-current="page">Add News</span>
      </nav>

      <PageHeader
        title="Add News"
        description="Saving stores the article as a draft. Publishing requires the review chain."
      />

      {configured ? (
        <Panel bodyClassName="p-5">
          <ArticleForm
            mode="create"
            action={createArticleAction}
            categories={categories.map((category) => ({ id: category.id, name: category.name }))}
          />
        </Panel>
      ) : (
        <NotConfigured
          feature="Saving articles"
          requiredEnv={SERVICE_ENV_VARS}
          detail="No database is configured, so nothing can be saved. The form is shown so the layout can be reviewed, but submitting fails explicitly - there is no fake 'saved' message."
        />
      )}
    </div>
  );
}
