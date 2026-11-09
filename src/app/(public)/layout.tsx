import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { BreakingTicker, type TickerItem } from "@/components/site/breaking-ticker";
import { getBreakingNews } from "@/server/content/breaking";
import { getCategories } from "@/server/content/repository";

/**
 * Public shell.
 *
 * The header needs the category list, which comes from the same content layer that already
 * reports "unavailable" honestly. If that read fails, the nav still renders with a fallback
 * list of the seeded sections rather than collapsing to a header with no links — a reader
 * should never lose their ability to navigate because a database call failed.
 */
const FALLBACK_SECTIONS = [
  { slug: "us-news", name: "U.S. News" },
  { slug: "politics", name: "Politics" },
  { slug: "world", name: "World" },
  { slug: "business", name: "Business" },
  { slug: "technology", name: "Technology" },
  { slug: "health", name: "Health" },
  { slug: "science", name: "Science" },
  { slug: "sports", name: "Sports" },
  { slug: "entertainment", name: "Entertainment" },
  { slug: "opinion", name: "Opinion" },
];

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // Captured once per render so the masthead is a pure function of its input: server
  // and client cannot disagree about the clock, and an ISR page states plainly which
  // instant it describes.
  const renderedAt = new Date().toISOString();
  const [items, categories] = await Promise.all([
    getBreakingNews().catch((): TickerItem[] => []),
    getCategories().catch(() => []),
  ]);

  const sections = categories.length > 0 ? categories.map(({ slug, name }) => ({ slug, name })) : FALLBACK_SECTIONS;

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to main content
      </a>
      <SiteHeader categories={sections} renderedAt={renderedAt} />
      <BreakingTicker items={items} />
      <main id="main" className="min-h-[50dvh]">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
