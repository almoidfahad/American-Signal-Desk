import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard, formatPublished } from "@/components/news/article-card";
import { NoticeBanner } from "@/components/ui/states";
import { getArticle, listArticleSlugs } from "@/server/content/repository";
import { htmlToText, sanitizeArticleHtml } from "@/server/content/sanitize";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  try {
    const slugs = await listArticleSlugs(50);
    return slugs.filter((s) => s.slug).map((s) => ({ slug: s.slug }));
  } catch {
    // Build must not fail because the database is unreachable at build time.
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getArticle(slug).catch(() => null);
  if (!data) return { title: "Article not found", robots: { index: false, follow: false } };

  const { article } = data;
  const description = article.dek || htmlToText(article.bodyHtml, 160);

  return {
    title: article.title,
    description,
    alternates: { canonical: `/article/${article.slug}` },
    openGraph: {
      type: "article",
      title: article.title,
      description,
      url: `/article/${article.slug}`,
      publishedTime: article.publishedAt ?? undefined,
      modifiedTime: article.updatedAt ?? undefined,
      authors: article.author ? [article.author.name] : undefined,
      section: article.categoryName,
      images: article.imageUrl ? [{ url: article.imageUrl, alt: article.imageAlt }] : undefined,
    },
    twitter: {
      card: article.imageUrl ? "summary_large_image" : "summary",
      title: article.title,
      description,
    },
    robots: data.isDemoData ? { index: false, follow: false } : undefined,
  };
}

export default async function ArticlePage({ params }: PageProps) {
  const { slug } = await params;
  const data = await getArticle(slug);
  if (!data) notFound();

  const { article, related } = data;
  const safeBody = sanitizeArticleHtml(article.bodyHtml);
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  // Structured data. Only factual, on-page claims — no invented ratings or author credentials.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.dek || htmlToText(article.bodyHtml, 160),
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
    articleSection: article.categoryName,
    author: article.author ? [{ "@type": "Person", name: article.author.name }] : undefined,
    publisher: {
      "@type": "Organization",
      name: "American Signal Desk",
      url: siteUrl,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `${siteUrl}/article/${article.slug}` },
    ...(article.imageUrl ? { image: [article.imageUrl] } : {}),
  };

  return (
    <div className="grid gap-8 lg:grid-cols-12">
      <article className="lg:col-span-8">
        {data.isDemoData && (
          <div className="mb-5">
            <NoticeBanner tone="warning" title="Sample content — not real reporting">
              This page is placeholder content used to preview the article template.
            </NoticeBanner>
          </div>
        )}

        <script
          type="application/ld+json"
          // Serialise safely: JSON.stringify escaping prevents breaking out of the script tag.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
          }}
        />

        <nav aria-label="Breadcrumb" className="text-xs text-navy-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-navy-900 hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link
                href={`/category/${article.categorySlug}`}
                className="hover:text-navy-900 hover:underline"
              >
                {article.categoryName}
              </Link>
            </li>
          </ol>
        </nav>

        <p className="mt-4 text-xs font-bold tracking-widest text-signal-600 uppercase">
          {article.categoryName}
        </p>

        <h1 className="mt-2 font-serif text-3xl leading-tight font-extrabold text-navy-900 sm:text-4xl">
          {article.title}
        </h1>

        {article.dek && (
          <p className="mt-3 text-lg leading-relaxed text-navy-700">{article.dek}</p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-navy-100 py-3 text-xs text-navy-600">
          {article.author && (
            <span className="font-semibold text-navy-900">
              By{" "}
              <Link href={`/author/${article.author.slug}`} className="hover:underline">
                {article.author.name}
              </Link>
            </span>
          )}
          {article.publishedAt && (
            <>
              <span aria-hidden="true">&bull;</span>
              <time dateTime={article.publishedAt}>
                Published {formatPublished(article.publishedAt)}
              </time>
            </>
          )}
          {article.updatedAt && article.updatedAt !== article.publishedAt && (
            <>
              <span aria-hidden="true">&bull;</span>
              <time dateTime={article.updatedAt}>
                Updated {formatPublished(article.updatedAt)}
              </time>
            </>
          )}
          <span aria-hidden="true">&bull;</span>
          <span>{article.readingMinutes} min read</span>
        </div>

        {article.aiProvenance?.assisted && (
          <div className="mt-4">
            <NoticeBanner tone="info" title="Editorial disclosure">
              AI tools assisted with drafting this article. It was reviewed and approved for
              publication by a human editor
              {article.aiProvenance.reviewedBy ? ` (${article.aiProvenance.reviewedBy})` : ""}.
            </NoticeBanner>
          </div>
        )}

        {article.imageUrl ? (
          <figure className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.imageUrl}
              alt={article.imageAlt}
              className="w-full rounded-lg object-cover"
            />
            <figcaption className="mt-2 text-xs text-navy-500">{article.imageAlt}</figcaption>
          </figure>
        ) : (
          <div
            aria-hidden="true"
            className="mt-6 flex aspect-[16/7] w-full items-center justify-center rounded-lg bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900"
          >
            <span className="text-xs font-semibold tracking-widest text-navy-300 uppercase">
              {article.categoryName} — artwork pending
            </span>
          </div>
        )}

        <div
          className="prose-asd mt-8 max-w-[68ch] text-[17px] text-navy-900"
          // Sanitised above with a strict allowlist; no scripts, styles or handlers survive.
          dangerouslySetInnerHTML={{ __html: safeBody }}
        />

        {article.tags.length > 0 && (
          <ul className="mt-8 flex flex-wrap gap-2 border-t border-navy-100 pt-4">
            {article.tags.map((tag) => (
              <li key={tag}>
                <Link
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  className="inline-block rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-100"
                >
                  #{tag}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8 rounded-lg bg-navy-50 p-4 text-xs leading-relaxed text-navy-600">
          <p>
            <strong className="text-navy-900">Corrections policy.</strong> Found an error?{" "}
            <Link href="/corrections" className="underline">
              Report a correction
            </Link>
            . Corrections are logged publicly and the revision history is preserved.
          </p>
        </div>
      </article>

      <aside aria-label="Related coverage" className="lg:col-span-4">
        <h2 className="border-b-2 border-navy-900 pb-1 text-sm font-bold tracking-widest text-navy-900 uppercase">
          Related Coverage
        </h2>
        {related.length > 0 ? (
          <div className="mt-4 space-y-5">
            {related.map((a) => (
              <ArticleCard key={a.slug} article={a} />
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-navy-500">No related stories yet.</p>
        )}
      </aside>
    </div>
  );
}
