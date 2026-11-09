import { describe, expect, it } from "vitest";
import { demoHomePage } from "@/server/content/demo";

/**
 * No story may appear in two slots of the homepage.
 *
 * The live page shipped with "More Stories" as an exact duplicate of "Editor's Picks": both
 * bands rendered the same four cards, one above the other. Every gate was green, because
 * nothing compared the sections to each other - the data was simply sliced with overlapping
 * ranges.
 *
 * These assertions describe the reader's view rather than the slicing arithmetic, so they
 * still hold if the slice indices are rewritten.
 */
describe("homepage sections", () => {
  const page = demoHomePage();

  const sections = {
    lead: [page.lead],
    latest: page.secondary,
    editorsPicks: page.editorsPicks,
    moreStories: page.latest,
  } as const;

  it("has content in every band", () => {
    // A vacuous pass is the failure mode here: if the demo set ever empties, the overlap
    // checks below would hold trivially. Assert there is something to compare first.
    expect(page.lead.slug).not.toBe("");
    expect(sections.latest.length).toBeGreaterThan(0);
    expect(sections.editorsPicks.length).toBeGreaterThan(0);
    expect(sections.moreStories.length).toBeGreaterThan(0);
  });

  it("does not repeat a story inside a single band", () => {
    for (const [name, cards] of Object.entries(sections)) {
      const slugs = cards.map((card) => card.slug);
      expect(new Set(slugs).size, `${name} repeats a story`).toBe(slugs.length);
    }
  });

  it("does not repeat a story across bands", () => {
    const seen = new Map<string, string>();
    for (const [name, cards] of Object.entries(sections)) {
      for (const card of cards) {
        const previous = seen.get(card.slug);
        expect(
          previous,
          `"${card.title}" appears in both ${previous} and ${name}`,
        ).toBeUndefined();
        seen.set(card.slug, name);
      }
    }
  });

  it("labels every card as sample content, never as real reporting", () => {
    // The banner is rendered from this flag; a card that escapes it would look like news.
    expect(page.isDemoData).toBe(true);
    expect(page.isUnavailable).toBe(false);
    for (const card of [page.lead, ...page.secondary, ...page.editorsPicks, ...page.latest]) {
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.imageUrl === null || typeof card.imageUrl === "string").toBe(true);
    }
  });
});
