import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleCard } from "@/components/news/article-card";
import { EmptyState } from "@/components/ui/states";
import { getCategories } from "@/server/content/repository";
import { getArticlesByCategory } from "@/server/content/by-category";

export const revalidate = 60;

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  try {
    const categories = await getCategories();
    return categories.map((c) => ({ slug: c.slug }));
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

  return (
    <div>
      <header className="border-b-2 border-navy-900 pb-3">
        <h1 className="font-serif text-3xl font-extrabold text-navy-900">{category.name}</h1>
        <p className="mt-1 text-sm text-navy-600">{category.description}</p>
      </header>

      {isDemoData && (
        <p className="mt-4 rounded bg-amber-50 px-4 py-2 text-xs text-amber-900 ring-1 ring-amber-300">
          Sample content — the editorial database is not connected in this environment.
        </p>
      )}

      {contentUnavailable && (
        <p className="mt-4 rounded bg-signal-50 px-4 py-2 text-xs text-signal-900 ring-1 ring-signal-300">
          This deployment has no editorial database connected, so this section cannot be listed.
        </p>
      )}

      <div className="mt-6">
        {articles.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a) => (
              <div key={a.slug} className="rounded-lg p-1 ring-1 ring-navy-100">
                <ArticleCard article={a} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={`No ${category.name} stories yet`}
            description="When an editor publishes the first story in this section it will appear here."
            action={{ href: "/", label: "Back to the homepage" }}
          />
        )}
      </div>

      <nav aria-label="Other categories" className="mt-10 border-t border-navy-100 pt-4">
        <h2 className="text-xs font-bold tracking-widest text-navy-500 uppercase">Other sections</h2>
        <ul className="mt-2 flex flex-wrap gap-2">
          {categories
            .filter((c) => c.slug !== slug)
            .map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-block rounded-full bg-navy-50 px-3 py-1 text-xs font-semibold text-navy-700 hover:bg-navy-100"
                >
                  {c.name}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}
