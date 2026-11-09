import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/news/article-card";
import { EmptyState, NoticeBanner } from "@/components/ui/states";
import { getCategories } from "@/server/content/repository";
import { searchArticles } from "@/server/content/search";

export const metadata: Metadata = {
  title: "Search",
  // Search result pages are not indexable: thin, duplicate, and query-driven.
  robots: { index: false, follow: true },
};

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

const SUGGESTIONS = ["Economy", "Congress", "Climate", "Technology", "Courts"];

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  // Bound the query before it reaches any query builder or full-text parser.
  const query = (q ?? "").trim().slice(0, 120);
  const { results, isDemoData, mode } = query
    ? await searchArticles(query)
    : { results: [], isDemoData: false, mode: "idle" as const };

  const categories = await getCategories().catch(() => []);

  return (
    <div className="shell py-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-display font-extrabold tracking-tight text-navy-900">Search</h1>
        <p className="mt-1 text-body text-navy-600">
          Search reporting by headline, standfirst and body text.
        </p>

        <form action="/search" method="get" role="search" className="mt-5 flex gap-2">
          <label htmlFor="q" className="sr-only">
            Search news
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={query}
            placeholder="Search news, authors, or topics…"
            className="h-11 min-w-0 flex-1 rounded-md border border-navy-300 px-3 text-body text-navy-900 placeholder:text-navy-400 focus:border-navy-900"
          />
          <button
            type="submit"
            className="h-11 shrink-0 rounded-md bg-signal-600 px-5 text-body font-bold text-white hover:bg-signal-700"
          >
            Search
          </button>
        </form>

        {!query && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-caption font-bold tracking-[0.1em] text-navy-500 uppercase">
              Try
            </span>
            {SUGGESTIONS.map((suggestion) => (
              <Link
                key={suggestion}
                href={`/search?q=${encodeURIComponent(suggestion)}`}
                className="rounded-full bg-navy-50 px-3 py-1 text-caption font-semibold text-navy-700 hover:bg-navy-100"
              >
                {suggestion}
              </Link>
            ))}
          </div>
        )}

        {isDemoData && (
          <div className="mt-5">
            <NoticeBanner tone="warning" title="Sample content">
              Results are drawn from placeholder articles because the database is not configured.
            </NoticeBanner>
          </div>
        )}

        {mode === "unavailable" && (
          <div className="mt-5">
            <NoticeBanner tone="danger" title="Search is unavailable">
              The search service is not configured. No results are shown rather than showing
              incomplete results.
            </NoticeBanner>
          </div>
        )}

        {query && results.length === 0 && mode === "live" && (
          <div className="mt-6">
            <EmptyState
              title={`No results for “${query}”`}
              description="Try a shorter query, a different spelling, or browse a section from the navigation."
              action={{ href: "/", label: "Back to the homepage" }}
            />
          </div>
        )}

        {results.length > 0 && (
          <section aria-labelledby="results-heading" className="mt-6">
            <h2 id="results-heading" className="section-label">
              {results.length} result{results.length === 1 ? "" : "s"} for “{query}”
            </h2>
            <div className="mt-4 divide-y divide-navy-100">
              {results.map((article) => (
                <div key={article.slug} className="py-4 first:pt-0">
                  <ArticleCard article={article} />
                </div>
              ))}
            </div>
          </section>
        )}

        {!query && (
          <section aria-labelledby="browse-heading" className="mt-10">
            <h2 id="browse-heading" className="section-label">
              Browse by section
            </h2>
            <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(categories.length > 0
                ? categories
                : [
                    { slug: "us-news", name: "U.S. News" },
                    { slug: "politics", name: "Politics" },
                    { slug: "world", name: "World" },
                  ]
              ).map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/category/${category.slug}`}
                    className="flex items-center gap-2 rounded-md bg-navy-50 px-3 py-2.5 text-caption font-semibold text-navy-800 hover:bg-navy-100 hover:text-signal-700"
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
          </section>
        )}
      </div>
    </div>
  );
}
