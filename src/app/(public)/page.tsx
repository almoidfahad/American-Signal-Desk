import Link from "next/link";
import type { Metadata } from "next";
import { ArticleCard, CompactPick, LeadStory, MetaLine } from "@/components/news/article-card";
import { NoticeBanner } from "@/components/ui/states";
import { getHomePage } from "@/server/content/repository";

// Public homepage caches for 60s and is revalidated by tag when an article publishes.
export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const data = await getHomePage();
  const hasContent = data.lead.slug !== "";

  return (
    <div className="space-y-8">
      {data.isUnavailable && (
        <NoticeBanner tone="danger" title="Content service is not configured">
          This deployment has no editorial database connected, so no articles can be displayed.
          Rather than showing placeholder news to real readers, the homepage reports the problem.
          An operator should set <code className="font-mono">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="font-mono">NEXT_PUBLIC_SUPABASE_ANON_KEY</code>.
        </NoticeBanner>
      )}

      {data.isDemoData && (
        <NoticeBanner tone="warning" title="Sample content — not real reporting">
          Supabase is not configured in this environment, so the interface is showing clearly
          labelled placeholder articles. Connect the database and every story here is replaced by
          live editorial content.
        </NoticeBanner>
      )}

      {!hasContent && !data.isDemoData && !data.isUnavailable && (
        <NoticeBanner tone="info" title="The newsroom has no published stories yet">
          Editors can publish the first article from the{" "}
          <Link href="/admin" className="underline">
            admin dashboard
          </Link>
          .
        </NoticeBanner>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Lead + latest */}
        <section aria-labelledby="lead-heading" className="lg:col-span-6">
          <h1 id="lead-heading" className="sr-only">
            Top stories
          </h1>
          <LeadStory article={data.lead} />
        </section>

        {/* Secondary stack */}
        <section aria-labelledby="secondary-heading" className="lg:col-span-4">
          <h2
            id="secondary-heading"
            className="mb-3 border-b-2 border-navy-900 pb-1 text-sm font-bold tracking-widest text-navy-900 uppercase"
          >
            Latest
          </h2>
          {data.secondary.length > 0 ? (
            <div className="space-y-5">
              {data.secondary.map((a) => (
                <ArticleCard key={a.slug} article={a} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-navy-500">No additional stories yet.</p>
          )}
        </section>

        {/* Right rail: trending + newsletter */}
        <aside aria-label="Trending and newsletter" className="space-y-6 lg:col-span-2">
          <section aria-labelledby="trending-heading" className="rounded-lg ring-1 ring-navy-100">
            <h2
              id="trending-heading"
              className="border-b border-navy-100 px-4 py-2.5 text-xs font-bold tracking-widest text-signal-700 uppercase"
            >
              Trending Now
            </h2>
            <ol className="divide-y divide-navy-50">
              {data.mostRead.map((item, index) => (
                <li key={item.slug} className="flex gap-3 px-4 py-3">
                  <span
                    aria-hidden="true"
                    className="text-sm font-extrabold text-signal-600 tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <Link
                    href={`/article/${item.slug}`}
                    className="text-[13px] leading-snug font-semibold text-navy-800 hover:text-signal-700"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
              {data.mostRead.length === 0 && (
                <li className="px-4 py-3 text-sm text-navy-500">Nothing trending yet.</li>
              )}
            </ol>
          </section>

          <section aria-labelledby="newsletter-heading" className="rounded-lg bg-navy-900 p-4">
            <h2 id="newsletter-heading" className="text-sm font-bold text-white">
              Newsletter Signup
            </h2>
            <p className="mt-1 text-xs text-navy-200">
              Get the latest news delivered to your inbox.
            </p>
            <NewsletterForm />
          </section>
        </aside>
      </div>

      {/* Editor's picks */}
      {data.editorsPicks.length > 0 && (
        <section aria-labelledby="picks-heading" className="rounded-lg ring-1 ring-navy-100">
          <h2
            id="picks-heading"
            className="flex items-center gap-2 border-b border-navy-100 px-4 py-3 text-sm font-bold tracking-widest text-navy-900 uppercase"
          >
            <span aria-hidden="true" className="text-signal-600">
              ★
            </span>
            Editor&apos;s Picks
          </h2>
          <div className="grid gap-5 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.editorsPicks.map((a) => (
              <CompactPick key={a.slug} article={a} />
            ))}
          </div>
        </section>
      )}

      {/* Latest news list */}
      {data.latest.length > 0 && (
        <section aria-labelledby="latest-heading" className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <h2
              id="latest-heading"
              className="mb-3 border-b-2 border-navy-900 pb-1 text-sm font-bold tracking-widest text-navy-900 uppercase"
            >
              More Stories
            </h2>
            <div className="divide-y divide-navy-50">
              {data.latest.map((a) => (
                <div key={a.slug} className="py-4">
                  <ArticleCard article={a} />
                  {a.dek && <p className="mt-2 text-sm text-navy-600">{a.dek}</p>}
                  <MetaLine article={a} />
                </div>
              ))}
            </div>
          </div>

          <section aria-labelledby="categories-heading" className="rounded-lg ring-1 ring-navy-100">
            <h2
              id="categories-heading"
              className="border-b border-navy-100 px-4 py-2.5 text-xs font-bold tracking-widest text-navy-900 uppercase"
            >
              Browse Categories
            </h2>
            <ul className="grid grid-cols-2 gap-px bg-navy-50">
              {data.categories.map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/category/${c.slug}`}
                    className="block bg-white px-3 py-3 text-[13px] font-semibold text-navy-800 hover:bg-navy-50"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </section>
      )}
    </div>
  );
}

/**
 * Newsletter capture.
 *
 * Deliberately a plain form posting to a server action (added in Phase 4). It is not wired
 * to a fake success toast — until the subscription endpoint exists, submitting shows an
 * honest "not yet connected" message.
 */
function NewsletterForm() {
  return (
    <form action="/api/v1/newsletter/subscribe" method="post" className="mt-3 space-y-2">
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="Enter your email address"
        className="h-9 w-full rounded border border-navy-700 bg-white px-2.5 text-xs text-navy-900 placeholder:text-navy-400"
      />
      <button
        type="submit"
        className="h-9 w-full rounded bg-signal-600 text-xs font-bold text-white hover:bg-signal-700"
      >
        Subscribe
      </button>
      <p className="text-[10px] leading-snug text-navy-300">
        By subscribing you agree to our privacy policy. Unsubscribe at any time.
      </p>
    </form>
  );
}
