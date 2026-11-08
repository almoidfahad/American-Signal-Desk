import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { statusClass } from "@/components/ui/styles";
import { NotConfigured } from "@/components/ui/states";
import { getAdminSession } from "@/server/auth/session";
import { can } from "@/server/authz/permissions";
import { listArticlesForActor } from "@/server/editorial/service";

export const metadata: Metadata = { title: "রিভিউ কিউ" };
export const dynamic = "force-dynamic";

export default async function ReviewQueuePage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const actor = { userId: session.userId, roles: session.roles };

  // Only reviewers may see the queue. An author landing here is told so honestly.
  if (!can(actor, "article.review") && !can(actor, "article.approve")) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <h1 className="text-xl font-bold text-navy-900">রিভিউ কিউ দেখার অনুমতি নেই</h1>
        <p className="mt-2 text-sm text-navy-600">
          রিভিউ কিউ শুধু সম্পাদকদের জন্য। আপনার ভূমিকায় <code className="font-mono">article.review</code>{" "}
          নেই।
        </p>
        <Link href="/admin/articles" className="mt-4 inline-block text-sm font-semibold underline">
          আপনার লেখার তালিকায় ফিরে যান
        </Link>
      </div>
    );
  }

  const result = await listArticlesForActor(actor, { status: "pending_review", limit: 50 });

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-navy-900">রিভিউ কিউ</h1>
      <p className="mt-1 text-sm text-navy-600">
        যে লেখাগুলো প্রকাশের অনুমোদনের অপেক্ষায় আছে। প্রতিটি সিদ্ধান্ত অডিট লগে সংরক্ষিত হয়।
      </p>

      <div className="mt-5">
        {!result.ok && result.code === "NOT_CONFIGURED" ? (
          <NotConfigured
            feature="রিভিউ কিউ"
            requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]}
            detail="ডেটাবেস কনফিগার করা নেই, তাই কিউ খালি — এটি কোনো লুকানো ত্রুটি নয়।"
          />
        ) : !result.ok ? (
          <p className="rounded-md bg-signal-50 px-4 py-3 text-sm text-signal-800 ring-1 ring-signal-300">
            {result.message}
          </p>
        ) : result.data.items.length === 0 ? (
          <div className="rounded-lg bg-white px-6 py-12 text-center ring-1 ring-navy-100">
            <p className="text-base font-semibold text-navy-900">কিউ খালি</p>
            <p className="mt-1 text-sm text-navy-600">
              রিভিউয়ের অপেক্ষায় কোনো লেখা নেই। লেখকরা জমা দিলে এখানে দেখা যাবে।
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {result.data.items.map((a) => (
              <li key={a.id} className="rounded-lg bg-white p-4 ring-1 ring-navy-100">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/admin/articles/${a.id}`}
                      className="text-base font-bold text-navy-900 hover:text-signal-700 hover:underline"
                    >
                      {a.title}
                    </Link>
                    <p className="mt-1 max-w-2xl text-sm text-navy-600">{a.dek || "—"}</p>
                    <p className="mt-1 font-mono text-[11px] text-navy-400">/{a.slug}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={statusClass("warning")}>রিভিউ অপেক্ষমাণ</span>
                    <Link
                      href={`/admin/articles/${a.id}`}
                      className="rounded-md bg-navy-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-navy-800"
                    >
                      পর্যালোচনা করুন
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
