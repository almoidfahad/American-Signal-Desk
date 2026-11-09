import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard, CompactPick, MetaLine } from "@/components/news/article-card";
import { NewsletterForm } from "@/components/news/newsletter-form";
import { EmptyState, NoticeBanner } from "@/components/ui/states";
import { getCategories } from "@/server/content/repository";
import { getArticlesByCategory } from "@/server/content/by-category";

/**
 * Section front.
 *
 * Editorial structure: the newest story in the section gets the lead treatment with a dek,
 * the next two run as image cards, and the remainder becomes a headline list — the same
 * descending weight a printed section front uses, so a reader can tell what matters most
 * without reading a word.
 */

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  try {
    const categories = await getCategories();
    return categories.map((category) => ({ slug: category.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const categories = await getCategories().catch(() => []);
  const category = categories.find((c) => c.slug === slug);
  if (!category) return { title: "Category not found", robots: { index: false } };
  return {
    title: category.name,
    description: category.description,
    alternates: { canonical: `/category/${category.slug}` },
  };
}

export default async function CategoryPage({ params }: PageProps) {
  const { slug } = await params;
  const categories = await getCategories();
  const category = categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const { articles, isDemoData, contentUnavailable } = await getArticlesByCategory(slug);

  const [lead, ...rest] = articles;
  const secondary = rest.slice(0, 2);
  const remainder = rest.slice(2);
  const others = categories.filter((c) => c.slug !== slug);

  return (
    <div className="shell py-6">
      <header className="border-b-2 border-navy-900 pb-4">
        <nav aria-label="Breadcrumb" className="text-[11.5px] text-navy-500">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-navy-900 hover:underline">
                Home
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="font-semibold text-navy-800">
              {category.name}
            </li>
          </ol>
        </nav>
        <h1 className="mt-2 text-[32px] leading-tight font-extrabold tracking-tight text-navy-900 sm:text-4xl">
          {category.name}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-navy-600">{category.description}</p>
      </header>

      {isDemoData && (
        <div className="mt-5">
          <NoticeBanner tone="warning" title="Sample content — not real reporting">
            The editorial database is not connected in this environment, so these stories are
            labelled placeholders.
          </NoticeBanner>
        </div>
      )}

      {contentUnavailable && (
        <div className="mt-5">
          <NoticeBanner tone="danger" title="Content service is not configured">
            This deployment has no editorial database connected, so this section cannot be listed.
          </NoticeBanner>
        </div>
      )}

      {articles.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title={`No ${category.name} stories yet`}
            description="When an editor publishes the first story in this section it will appear here."
            action={{ href: "/", label: "Back to the homepage" }}
          />
        </div>
      ) : (
        <div className="mt-6 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            {/* Lead */}
            {lead && (
              <article className="group grid gap-5 border-b border-navy-100 pb-6 sm:grid-cols-2">
                <div className="aspect-[4/3] overflow-hidden rounded-md bg-navy-100">
                  {lead.imageUrl && lead.imageAlt ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={lead.imageUrl}
                      alt={lead.imageAlt}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                      fetchPriority="high"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-navy-800 via-navy-700 to-navy-900 text-[10px] font-bold tracking-[0.18em] text-navy-300 uppercase"
                    >
                      {lead.categoryName} — artwork pending
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <h2 className="text-[24px] leading-tight font-extrabold text-navy-900 group-hover:text-signal-700 sm:text-[28px]">
                    <Link href={`/article/${lead.slug}`}>{lead.title}</Link>
                  </h2>
                  {lead.dek && (
                    <p className="mt-2 line-clamp-3 text-[14.5px] leading-relaxed text-navy-600">
                      {lead.dek}
                    </p>
                  )}
                  <div className="mt-3">
                    <MetaLine article={lead} />
                  </div>
                </div>
              </article>
            )}

            {/* Two-up */}
            {secondary.length > 0 && (
              <div className="mt-6 grid gap-6 border-b border-navy-100 pb-6 sm:grid-cols-2">
                {secondary.map((article) => (
                  <CompactPick key={article.slug} article={article} />
                ))}
              </div>
            )}

            {/* Remainder as a headline list */}
            {remainder.length > 0 && (
              <div className="mt-6 divide-y divide-navy-100">
                {remainder.map((article) => (
                  <div key={article.slug} className="py-4 first:pt-0">
                    <ArticleCard article={article} />
                  </div>
                ))}
              </div>
            )}
          </div>

          <aside className="space-y-6 lg:col-span-4">
            <section
              aria-labelledby="section-newsletter"
              className="rounded-card bg-navy-900 p-4 on-dark"
            >
              <h2 id="section-newsletter" className="text-[13px] font-bold text-white">
                Get {category.name} in your inbox
              </h2>
              <p className="mt-1 text-[12px] text-navy-300">
                The day&apos;s reporting from this desk, each morning.
              </p>
              <NewsletterForm source={`category-${category.slug}`} />
            </section>

            <section aria-labelledby="other-sections" className="rounded-card ring-1 ring-navy-100">
              <h2
                id="other-sections"
                className="border-b border-navy-100 px-4 py-2.5 text-[11px] font-extrabold tracking-[0.14em] text-navy-900 uppercase"
              >
                Other Sections
              </h2>
              <ul className="grid grid-cols-2 gap-px bg-navy-100">
                {others.map((other) => (
                  <li key={other.slug}>
                    <Link
                      href={`/category/${other.slug}`}
                      className="block bg-white px-3 py-2.5 text-[12.5px] font-semibold text-navy-800 hover:bg-navy-50 hover:text-signal-700"
                    >
                      {other.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
