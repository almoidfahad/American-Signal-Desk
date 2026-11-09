/**
 * Density parity with the homepage bands.
 *
 * The homepage band treatment is this product's reference for how dense a story surface is:
 * which card renders a story (`LeadStory` / `CompactPick` / `ArticleCard`), the 24px band
 * gutter (`gap-6`), the 20px card-strip gap (`gap-5`), the 16px list rows (`py-4` with a
 * divider), the 20px rail stack (`space-y-5`), and the image ratios (4:3 cards, 16:10 lead).
 *
 * The category front and the article page grew bespoke lead markup and looser spacing of
 * their own, so the same story was a different size on every surface. These assertions pin
 * the shared system — a page that drifts back to a private card or a free-form image ratio
 * fails here before a reader can see the inconsistency.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const HOMEPAGE = read("src/app/(public)/page.tsx");
const CATEGORY = read("src/app/(public)/category/[slug]/page.tsx");
const ARTICLE = read("src/app/(public)/article/[slug]/page.tsx");
const CARDS = read("src/components/news/article-card.tsx");

// The band grid is one token set across surfaces: a 24px gutter on the 12-column grid.
// (Class order may vary where a page root merges `shell` and the grid, so match with slack.)
const BAND_GRID = /grid gap-6[^"]*lg:grid-cols-12/;

describe("the homepage band treatment is the reference", () => {
  it("defines the band rhythm the other surfaces must match", () => {
    expect(HOMEPAGE).toContain("shell space-y-8 py-6"); // band spacing: 32px
    expect(HOMEPAGE).toMatch(BAND_GRID); // gutter: 24px
    expect(CARDS).toContain("aspect-[4/3]"); // card image ratio
    expect(CARDS).toContain("sm:aspect-[16/10]"); // lead image ratio
  });
});

describe("the category front matches the reference", () => {
  it("renders its lead with the shared LeadStory card, not a bespoke one", () => {
    expect(CATEGORY).toContain("<LeadStory");
    // The bespoke lead was an inline <article> with its own image box and byline block.
    expect(CATEGORY).not.toMatch(/<article className="group/);
    expect(CATEGORY).not.toContain("MetaLine");
  });

  it("keeps the band gutter and rail stack at the reference width", () => {
    expect(CATEGORY).toMatch(BAND_GRID);
    expect(CATEGORY).toContain("space-y-5 lg:col-span-4");
    expect(CATEGORY).not.toContain("gap-8");
  });

  it("spaces its bands like the homepage spaces its bands", () => {
    expect(CATEGORY).toContain("shell space-y-8 py-6");
  });

  it("lists the remainder like the homepage's More Stories band", () => {
    expect(CATEGORY).toContain("divide-y divide-navy-100");
    expect(CATEGORY).toMatch(/<ArticleCard article=\{article\} showDek \/>/);
  });

  it("takes every image ratio from the card system", () => {
    // No aspect-ratio classes of its own: the cards own the ratios.
    expect(CATEGORY).not.toMatch(/aspect-\[/);
  });
});

describe("the article page matches the reference", () => {
  it("keeps the band gutter at the reference width", () => {
    expect(ARTICLE).toMatch(BAND_GRID);
    expect(ARTICLE).not.toContain("gap-8");
  });

  it("gives the hero the reference lead ratio instead of free-form height", () => {
    // A hero with no ratio changed the page's density with every photo's shape.
    expect(ARTICLE).toContain("aspect-[16/10] w-full rounded-lg object-cover");
    expect(ARTICLE).not.toContain("aspect-[16/7]");
  });

  it("stacks related stories on the reference row rhythm", () => {
    // The Latest rail on the homepage is the same stack: 20px between card rows.
    expect(ARTICLE).toContain("mt-4 space-y-5");
  });
});
