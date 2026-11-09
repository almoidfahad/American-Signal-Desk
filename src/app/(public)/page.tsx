import Link from "next/link";
import type { Metadata } from "next";
import {
  ArticleCard,
  CompactPick,
  HeadlineRow,
  LeadStory,
  MetaLine,
} from "@/components/news/article-card";
import { NewsletterForm } from "@/components/news/newsletter-form";
import { NoticeBanner } from "@/components/ui/states";
import { getHomePage } from "@/server/content/repository";

/**
 * Public homepage.
 *
 * Layout follows the editorial reference: a lead story with artwork, a stack of secondary
 * stories beside it, and a right rail carrying trending, newsletter and most-read. Below
 * the fold: editor's picks as a four-up strip, then a two-column "more stories / browse
 * categories" band.
 *
 * Honesty: when the content layer has no database, the page says so at the top and renders
 * no stories. Every rail that would otherwise be empty shows an explicit empty state rather
 * than filler. Nothing on this page is invented to make the layout look finished.
 */

// Public homepage caches for 60s and is revalidated by tag when an article publishes.
export const revalidate = 60;

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  description:
    "American Signal Desk — breaking news, in-depth analysis and expert insight on the issues shaping the United States.",
};

export default async function HomePage() {
  const data = await getHomePage();
  const hasContent = data.lead.slug !== "";
  const categories = data.categories.length > 0 ? data.categories : null;

  return (
    <div className="shell space-y-8 py-6">
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

      {/* ---------------- Lead band ---------------- */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="lead-heading" className="lg:col-span-6">
          <h1 id="lead-heading" className="sr-only">
            Top stories
          </h1>
          <LeadStory article={data.lead} />
        </section>

        <section aria-labelledby="latest-heading" className="lg:col-span-3">
          <h2 id="latest-heading" className="section-label">
            Latest
          </h2>
          {data.secondary.length > 0 ? (
            <div className="mt-4 space-y-5">
              {data.secondary.slice(0, 4).map((article) => (
                <ArticleCard key={article.slug} article={article} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-navy-500">No additional stories yet.</p>
          )}
        </section>

        <aside aria-label="Trending, newsletter and most read" className="space-y-5 lg:col-span-3">
          <section
            aria-labelledby="trending-heading"
            className="overflow-hidden rounded-card ring-1 ring-navy-100"
          >
            <h2
              id="trending-heading"
              className="flex items-center gap-1.5 border-b border-navy-100 bg-navy-50/60 px-4 py-2.5 text-[11px] font-extrabold tracking-[0.14em] text-navy-900 uppercase"
            >
              <span aria-hidden="true" className="text-signal-600">
                &#9650;
              </span>
              Trending Now
            </h2>
            {data.mostRead.length > 0 ? (
              <ol className="space-y-3 px-4 py-4">
                {data.mostRead.slice(0, 5).map((item, index) => (
                  <HeadlineRow
                    key={item.slug}
                    index={index}
                    article={{
                      slug: item.slug,
                      title: item.title,
                      dek: "",
                      categorySlug: "",
                      categoryName: "",
                      publishedAt: null,
                      readingMinutes: 0,
                      imageUrl: null,
                      imageAlt: "",
                      author: null,
                    }}
                  />
                ))}
              </ol>
            ) : (
              <p className="px-4 py-4 text-sm text-navy-500">Nothing trending yet.</p>
            )}
          </section>

          <section aria-labelledby="newsletter-heading" className="rounded-card bg-navy-900 p-4 on-dark">
            <h2
              id="newsletter-heading"
              className="flex items-center gap-2 text-[13px] font-bold text-white"
            >
              <span aria-hidden="true" className="text-signal-500">
                &#9993;
              </span>
              Newsletter Signup
            </h2>
            <p className="mt-1 text-[12px] text-navy-300">
              Get the latest news delivered to your inbox.
            </p>
            <NewsletterForm source="homepage-rail" />
          </section>
        </aside>
      </div>

      {/* ---------------- Editor's picks ---------------- */}
      {data.editorsPicks.length > 0 && (
        <section
          aria-labelledby="picks-heading"
          className="overflow-hidden rounded-card ring-1 ring-navy-100"
        >
          <h2
            id="picks-heading"
            className="flex items-center gap-2 border-b border-navy-100 px-4 py-3 text-[11px] font-extrabold tracking-[0.14em] text-navy-900 uppercase"
          >
            <span aria-hidden="true" className="text-signal-600">
              &#9733;
            </span>
            Editor&apos;s Picks
          </h2>
          <div className="grid gap-5 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {data.editorsPicks.slice(0, 4).map((article) => (
              <CompactPick key={article.slug} article={article} />
            ))}
          </div>
        </section>
      )}

      {/* ---------------- More stories + categories ---------------- */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-labelledby="more-heading" className="lg:col-span-8">
          <h2 id="more-heading" className="section-label">
            More Stories
          </h2>
          {data.latest.length > 0 ? (
            <div className="mt-4 divide-y divide-navy-100">
              {data.latest.slice(0, 6).map((article) => (
                <div key={article.slug} className="py-4 first:pt-0">
                  <ArticleCard article={article} />
                  {article.dek && (
                    <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-navy-600">
                      {article.dek}
                    </p>
                  )}
                  <MetaLine article={article} />
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-navy-500">No more stories right now.</p>
          )}
        </section>

        <aside aria-labelledby="categories-heading" className="lg:col-span-4">
          <h2 id="categories-heading" className="section-label">
            Popular Categories
          </h2>
          {categories ? (
            <ul className="mt-4 grid grid-cols-2 gap-2">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="flex h-full items-center gap-2 rounded-md bg-navy-50 px-3 py-3 text-[12.5px] font-semibold text-navy-800 transition-colors hover:bg-navy-100 hover:text-signal-700"
                  >
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-signal-600"
                    />
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-navy-500">Categories are not available.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
