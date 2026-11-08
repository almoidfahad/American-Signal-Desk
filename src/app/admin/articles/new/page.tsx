import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArticleForm } from "@/components/admin/article-form";
import { NotConfigured } from "@/components/ui/states";
import { createArticleAction } from "../actions";
import { listCategoriesForAdmin } from "@/server/admin/categories";
import { getAdminSession } from "@/server/auth/session";
import { can } from "@/server/authz/permissions";

export const metadata: Metadata = { title: "নতুন লেখা" };
export const dynamic = "force-dynamic";

export default async function NewArticlePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const actor = { userId: session.userId, roles: session.roles };

  if (!can(actor, "article.create")) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <h1 className="text-xl font-bold text-navy-900">অনুমতি নেই</h1>
        <p className="mt-2 text-sm text-navy-600">
          আপনার ভূমিকায় নতুন লেখা তৈরির অনুমতি নেই (<code className="font-mono">article.create</code>)।
          একজন সুপার অ্যাডমিনকে আপনার ভূমিকা ঠিক করতে বলুন।
        </p>
        <Link href="/admin/articles" className="mt-4 inline-block text-sm font-semibold underline">
          লেখার তালিকায় ফিরে যান
        </Link>
      </div>
    );
  }

  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  const categories = await listCategoriesForAdmin();

  return (
    <div className="max-w-3xl">
      <nav aria-label="Breadcrumb" className="text-xs text-navy-500">
        <Link href="/admin/articles" className="hover:underline">
          সংবাদ ব্যবস্থাপনা
        </Link>{" "}
        / নতুন লেখা
      </nav>
      <h1 className="mt-1 text-2xl font-extrabold text-navy-900">নতুন লেখা</h1>
      <p className="mt-1 text-sm text-navy-600">
        সংরক্ষণ করলে লেখাটি <strong>ড্রাফট</strong> হিসেবে থাকবে। প্রকাশের জন্য রিভিউ প্রক্রিয়া
        পার করতে হবে।
      </p>

      <div className="mt-6">
        {configured ? (
          <ArticleForm
            mode="create"
            action={createArticleAction}
            categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          />
        ) : (
          <NotConfigured
            feature="লেখা সংরক্ষণ"
            requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]}
            detail="ডেটাবেস কনফিগার করা নেই, তাই কোনো লেখা সংরক্ষণ করা সম্ভব নয়। ফর্মটি দেখানো হচ্ছে বিন্যাস পরীক্ষার জন্য, কিন্তু জমা দিলে স্পষ্টভাবে ব্যর্থ হবে — ভুয়া 'সংরক্ষিত হয়েছে' বার্তা দেখানো হবে না।"
          />
        )}
      </div>
    </div>
  );
}
