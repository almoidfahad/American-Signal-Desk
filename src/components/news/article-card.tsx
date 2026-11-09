import Link from "next/link";
import type { ArticleCard as ArticleCardModel } from "@/server/content/types";
import { formatDate } from "@/lib/dates";

/**
 * Story presentation.
 *
 * Every variant here is a different *editorial weight*, not a different decoration:
 *   LeadStory   one per page, with artwork and a dek — the story the desk is leading on
 *   ArticleCard horizontal, image left — the standard "latest" row
 *   CompactPick image on top, title only — editor's picks and category strips
 *   HeadlineRow numbered text-only row — trending / most-read lists
 *
 * Alt text is never optional: an image with no alt text renders as a labelled placeholder
 * instead, because a missing description is an accessibility defect, not a design choice.
 */

/** Placeholder artwork that looks intentional without pretending to be a photograph. */
function ArtworkPlaceholder({
  label,
  tone = "dark",
}: {
  label: string;
  tone?: "dark" | "light";
}) {
  return (
    <div
      aria-hidden="true"
      className={`relative flex h-full w-full items-center justify-center overflow-hidden ${
        tone === "dark"
          ? "bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900"
          : "bg-gradient-to-br from-navy-100 via-navy-50 to-navy-200"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute -top-6 -right-6 h-20 w-20 rounded-full border ${
          tone === "dark" ? "border-white/10" : "border-navy-200"
        }`}
      />
      <span
        className={`px-4 text-center text-caption font-bold tracking-[0.18em] uppercase ${
          tone === "dark" ? "text-navy-300" : "text-navy-500"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function CategoryTag({
  name,
  href,
  tone = "solid",
}: {
  name: string;
  href?: string;
  tone?: "solid" | "plain";
}) {
  const className =
    tone === "solid"
      ? "inline-block rounded bg-signal-600 px-2 py-0.5 text-caption font-extrabold tracking-[0.1em] text-white uppercase"
      : "text-caption font-extrabold tracking-[0.1em] uppercase text-signal-700";

  if (!href) return <span className={className}>{name}</span>;
  return (
    <Link href={href} className={`${className} hover:underline`}>
      {name}
    </Link>
  );
}

export function MetaLine({
  article,
  tone = "muted",
}: {
  article: ArticleCardModel;
  tone?: "muted" | "onDark";
}) {
  const base = tone === "onDark" ? "text-navy-200" : "text-navy-500";
  const badge =
    tone === "onDark"
      ? "bg-white/15 text-white"
      : "bg-navy-100 text-navy-700";

  return (
    <div className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-caption ${base}`}>
      {article.author && (
        <>
          <span className="font-semibold">{article.author.name}</span>
          <span aria-hidden="true">&bull;</span>
        </>
      )}
      {article.publishedAt && (
        <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
      )}
      <span aria-hidden="true">&bull;</span>
      <span>{article.readingMinutes} min read</span>
      {article.isAiAssisted && (
        <>
          <span aria-hidden="true">&bull;</span>
          <span className={`rounded px-1.5 py-0.5 text-caption font-semibold ${badge}`}>
            AI-assisted &middot; editor reviewed
          </span>
        </>
      )}
    </div>
  );
}

export function ArticleCard({
  article,
  showDek = false,
}: {
  article: ArticleCardModel;
  showDek?: boolean;
}) {
  return (
    <article className="group">
      <div className="flex gap-4">
        <div className="h-[88px] w-[124px] shrink-0 overflow-hidden rounded-md bg-navy-100 sm:h-24 sm:w-36">
          {article.imageUrl && article.imageAlt ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote optimisation deferred to the media phase
            <img
              src={article.imageUrl}
              alt={article.imageAlt}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <ArtworkPlaceholder label="No artwork" tone="light" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <CategoryTag name={article.categoryName} tone="plain" />
          <h3 className="mt-1 text-title leading-snug font-bold text-navy-900 group-hover:text-signal-700">
            <Link href={`/article/${article.slug}`} className="focus-visible:underline">
              {article.title}
            </Link>
          </h3>
          {showDek && article.dek && (
            <p className="mt-1 line-clamp-2 text-small leading-relaxed text-navy-600">
              {article.dek}
            </p>
          )}
          <div className="mt-1.5">
            <MetaLine article={article} />
          </div>
        </div>
      </div>
    </article>
  );
}

export function LeadStory({ article }: { article: ArticleCardModel }) {
  return (
    <article className="group relative overflow-hidden rounded-lg bg-navy-900">
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/10]">
        {article.imageUrl && article.imageAlt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt={article.imageAlt}
            className="h-full w-full object-cover"
            fetchPriority="high"
          />
        ) : (
          <ArtworkPlaceholder label="Lead artwork pending" />
        )}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-navy-950 via-navy-950/60 to-navy-950/5"
        />
        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-7">
          <span className="inline-block rounded bg-signal-600 px-2.5 py-1 text-caption font-extrabold tracking-[0.14em] text-white uppercase">
            {article.isExclusive ? "Top Story" : article.categoryName}
          </span>
          <h2 className="mt-3 text-headline leading-[1.12] font-extrabold text-white">
            <Link href={`/article/${article.slug}`} className="hover:underline">
              {article.title}
            </Link>
          </h2>
          {article.dek && (
            <p className="mt-2.5 hidden max-w-2xl text-body leading-relaxed text-navy-100 sm:block">
              {article.dek}
            </p>
          )}
          <div className="mt-4">
            <MetaLine article={article} tone="onDark" />
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
        {article.imageUrl && article.imageAlt ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt={article.imageAlt}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <ArtworkPlaceholder label="No artwork" tone="light" />
        )}
      </div>
      <h3 className="mt-2.5 text-small leading-snug font-bold text-navy-900 group-hover:text-signal-700">
        <Link href={`/article/${article.slug}`}>{article.title}</Link>
      </h3>
      <p className="mt-1 text-caption text-navy-500">{formatDate(article.publishedAt)}</p>
    </article>
  );
}

/**
 * Numbered headline row. Used for trending and most-read lists, where the ordering *is*
 * the information — hence the visible ordinal, which is also announced to screen readers.
 */
export function HeadlineRow({
  article,
  index,
}: {
  article: ArticleCardModel;
  index: number;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="w-5 shrink-0 pt-0.5 text-title leading-none font-extrabold text-signal-600 tabular"
      >
        {index + 1}
      </span>
      <Link
        href={`/article/${article.slug}`}
        className="text-small leading-snug font-semibold text-navy-800 hover:text-signal-700 hover:underline"
      >
        <span className="sr-only">{index + 1}. </span>
        {article.title}
      </Link>
    </li>
  );
}
