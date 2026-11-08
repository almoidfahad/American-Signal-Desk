import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ARTICLE_STATUS_META, buttonClass, statusClass } from "@/components/ui/styles";
import { NotConfigured } from "@/components/ui/states";
import { getAdminSession } from "@/server/auth/session";
import { can } from "@/server/authz/permissions";
import { listArticlesForActor } from "@/server/editorial/service";
import { ARTICLE_STATUSES, type ArticleStatus } from "@/server/editorial/workflow";

export const metadata: Metadata = { title: "সংবাদ ব্যবস্থাপনা" };
export const dynamic = "force-dynamic";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  }).format(new Date(iso));
}

export default async function ArticlesListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");

  const actor = { userId: session.userId, roles: session.roles };
  const { status: statusParam } = await searchParams;
  const statusFilter: ArticleStatus | "all" =
    statusParam && (ARTICLE_STATUSES as readonly string[]).includes(statusParam)
      ? (statusParam as ArticleStatus)
      : "all";

  const result = await listArticlesForActor(actor, { status: statusFilter, limit: 25 });

  const configured = result.ok || result.code !== "NOT_CONFIGURED";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-navy-900">সংবাদ ব্যবস্থাপনা</h1>
          <p className="mt-1 text-sm text-navy-600">
            {can(actor, "article.review") || can(actor, "article.edit.any")
              ? "সব লেখা দেখছেন।"
              : "শুধু আপনার নিজের লেখা দেখছেন।"}
          </p>
        </div>
        {can(actor, "article.create") && (
          <Link href="/admin/articles/new" className={buttonClass("primary", "sm")}>
            + নতুন লেখা
          </Link>
        )}
      </div>

      <nav aria-label="স্ট্যাটাস অনুযায়ী ফিল্টার" className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/admin/articles"
          className={statusClass(statusFilter === "all" ? "info" : "neutral")}
          aria-current={statusFilter === "all" ? "page" : undefined}
        >
          সব
        </Link>
        {ARTICLE_STATUSES.map((s) => {
          const meta = ARTICLE_STATUS_META[s];
          return (
            <Link
              key={s}
              href={`/admin/articles?status=${s}`}
              className={statusClass(statusFilter === s ? "info" : "neutral")}
              aria-current={statusFilter === s ? "page" : undefined}
            >
              {meta?.label ?? s}
            </Link>
          );
        })}
      </nav>

      <div className="mt-5">
        {!configured ? (
          <NotConfigured
            feature="লেখার তালিকা"
            requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]}
            detail="ডেটাবেস কনফিগার করা নেই, তাই কোনো লেখা নেই — এটি খালি সংবাদপত্র নয়, কনফিগারেশনের ঘাটতি।"
          />
        ) : !result.ok ? (
          <p className="rounded-md bg-signal-50 px-4 py-3 text-sm text-signal-800 ring-1 ring-signal-300">
            {result.message}
          </p>
        ) : result.data.items.length === 0 ? (
          <div className="rounded-lg bg-white px-6 py-12 text-center ring-1 ring-navy-100">
            <p className="text-base font-semibold text-navy-900">এই ফিল্টারে কোনো লেখা নেই</p>
            <p className="mt-1 text-sm text-navy-600">
              {statusFilter === "all"
                ? "প্রথম লেখাটি তৈরি করে শুরু করুন।"
                : "অন্য একটি স্ট্যাটাস ফিল্টার দেখুন।"}
            </p>
            {can(actor, "article.create") && (
              <Link href="/admin/articles/new" className={buttonClass("secondary", "sm", "mt-4")}>
                নতুন লেখা তৈরি করুন
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg bg-white ring-1 ring-navy-100">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">লেখার তালিকা</caption>
              <thead className="bg-navy-50 text-[11px] tracking-wide text-navy-600 uppercase">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    শিরোনাম
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    স্ট্যাটাস
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    সর্বশেষ পরিবর্তন
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-semibold">
                    কাজ
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {result.data.items.map((a) => {
                  const meta = ARTICLE_STATUS_META[a.status];
                  return (
                    <tr key={a.id} className="hover:bg-navy-50/40">
                      <td className="max-w-md px-4 py-3">
                        <Link
                          href={`/admin/articles/${a.id}`}
                          className="font-medium text-navy-900 hover:text-signal-700 hover:underline"
                        >
                          {a.title}
                        </Link>
                        <p className="mt-0.5 font-mono text-[11px] text-navy-400">/{a.slug}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={statusClass(meta?.tone ?? "neutral")}>
                          {meta?.label ?? a.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-navy-500">{formatDate(a.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/articles/${a.id}`}
                          className="text-xs font-semibold text-navy-700 hover:underline"
                        >
                          খুলুন →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {result.data.truncated && (
              <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-500">
                প্রথম ২৫টি লেখা দেখানো হচ্ছে। আরও আছে।
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
