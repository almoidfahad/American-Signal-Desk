import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard } from "@/components/news/article-card";
import { EmptyState, NoticeBanner } from "@/components/ui/states";
import { searchArticles } from "@/server/content/search";

export const metadata: Metadata = {
  title: "Search",
  // Search result pages are not indexable: thin, duplicate, and query-driven.
  robots: { index: false, follow: true },
};

interface PageProps {
  searchParams: Promise<{ q?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = (q ?? "").trim().slice(0, 120);
  const { results, isDemoData, mode } = query
    ? await searchArticles(query)
    : { results: [], isDemoData: false, mode: "idle" as const };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl font-extrabold text-navy-900">Search</h1>

      <form action="/search" method="get" role="search" className="mt-4 flex gap-2">
        <label htmlFor="q" className="sr-only">
          Search news
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={query}
          placeholder="Search news, authors, or topics…"
          className="h-11 flex-1 rounded-md border border-navy-200 px-3 text-sm"
        />
        <button
          type="submit"
          className="h-11 rounded-md bg-navy-900 px-5 text-sm font-semibold text-white hover:bg-navy-800"
        >
          Search
        </button>
      </form>

      {isDemoData && (
        <div className="mt-4">
          <NoticeBanner tone="warning" title="Sample content">
            Results are drawn from placeholder articles because the database is not configured.
          </NoticeBanner>
        </div>
      )}

      {mode === "unavailable" && (
        <div className="mt-4">
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
          <h2 id="results-heading" className="text-sm font-bold tracking-widest text-navy-500 uppercase">
            {results.length} result{results.length === 1 ? "" : "s"} for “{query}”
          </h2>
          <div className="mt-4 divide-y divide-navy-50">
            {results.map((a) => (
              <div key={a.slug} className="py-4">
                <ArticleCard article={a} />
              </div>
            ))}
          </div>
        </section>
      )}

      {!query && (
        <p className="mt-6 text-sm text-navy-600">
          Enter a search term above, or browse{" "}
          <Link href="/category/us-news" className="underline">
            U.S. News
          </Link>{" "}
          and{" "}
          <Link href="/category/politics" className="underline">
            Politics
          </Link>
          .
        </p>
      )}
    </div>
  );
}
