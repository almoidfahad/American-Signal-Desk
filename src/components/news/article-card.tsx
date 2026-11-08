import Link from "next/link";
import type { ArticleCard as ArticleCardModel } from "@/server/content/types";

export function formatPublished(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date(iso));
}

/** Placeholder artwork that is clearly a placeholder, not a photo standing in for real art. */
function ArtworkPlaceholder({ label }: { label: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900"
    >
      <span className="px-4 text-center text-[11px] font-semibold tracking-widest text-navy-300 uppercase">
        {label}
      </span>
    </div>
  );
}

export function MetaLine({ article }: { article: ArticleCardModel }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-navy-500">
      {article.publishedAt && (
        <time dateTime={article.publishedAt}>{formatPublished(article.publishedAt)}</time>
      )}
      <span aria-hidden="true">&bull;</span>
      <span>{article.readingMinutes} min read</span>
      {article.isAiAssisted && (
        <>
          <span aria-hidden="true">&bull;</span>
          <span className="rounded bg-navy-100 px-1.5 py-0.5 font-semibold text-navy-700">
            AI-assisted &middot; editor reviewed
          </span>
        </>
      )}
    </div>
  );
}

export function ArticleCard({ article }: { article: ArticleCardModel }) {
  return (
    <article className="group flex gap-4">
      <div className="h-24 w-32 shrink-0 overflow-hidden rounded-md bg-navy-100">
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- remote optimisation is configured later
          <img
            src={article.imageUrl}
            alt={article.imageAlt}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ArtworkPlaceholder label={article.categoryName} />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-bold tracking-wide text-signal-600 uppercase">
          {article.categoryName}
        </p>
        <h3 className="mt-1 text-base leading-snug font-bold text-navy-900 group-hover:text-signal-700">
          <Link href={`/article/${article.slug}`} className="focus-visible:underline">
            {article.title}
          </Link>
        </h3>
        <MetaLine article={article} />
      </div>
    </article>
  );
}

export function LeadStory({ article }: { article: ArticleCardModel }) {
  return (
    <article className="relative overflow-hidden rounded-lg bg-navy-900">
      <div className="relative aspect-[16/10] w-full sm:aspect-[16/9]">
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt={article.imageAlt}
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
        ) : (
          <ArtworkPlaceholder label={`${article.categoryName} — lead story artwork`} />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-navy-950/95 via-navy-950/45 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <span className="inline-block rounded bg-signal-600 px-2.5 py-1 text-[11px] font-bold tracking-widest text-white uppercase">
            {article.isExclusive ? "Top Story" : article.categoryName}
          </span>
          <h2 className="mt-3 max-w-3xl text-2xl leading-tight font-extrabold text-white sm:text-4xl">
            <Link href={`/article/${article.slug}`} className="hover:underline">
              {article.title}
            </Link>
          </h2>
          {article.dek && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-navy-100 sm:text-base">
              {article.dek}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-navy-200">
            {article.publishedAt && (
              <time dateTime={article.publishedAt}>{formatPublished(article.publishedAt)}</time>
            )}
            <span aria-hidden="true">&bull;</span>
            <span>{article.readingMinutes} min read</span>
          </div>
        </div>
      </div>
    </article>
  );
}

export function CompactPick({ article }: { article: ArticleCardModel }) {
  return (
    <article className="group">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-md bg-navy-100">
        {article.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt={article.imageAlt}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ArtworkPlaceholder label={article.categoryName} />
        )}
      </div>
      <h3 className="mt-2 text-sm leading-snug font-bold text-navy-900 group-hover:text-signal-700">
        <Link href={`/article/${article.slug}`}>{article.title}</Link>
      </h3>
      <p className="mt-1 text-[11px] text-navy-500">{formatPublished(article.publishedAt)}</p>
    </article>
  );
}
