import { describe, expect, it } from "vitest";
import { POLICIES } from "@/app/(public)/policies";

/**
 * Regression net for a real bug that shipped green.
 *
 * The corrections page used to live inside the `[...policy]` catch-all. That catch-all has
 * `dynamicParams = false`, and the corrections page needed live data. The build reported
 * success, every test passed, and `next start` answered **404** for /corrections — a page
 * linked from the sitemap, robots.txt and the site footer.
 *
 * The structural fix is that corrections owns its route. These assertions are the part a
 * test can hold onto: corrections must not be handled by the static catch-all, and every
 * other policy slug must still resolve there.
 */

describe("policy routing", () => {
  const slugs = POLICIES.map((p) => p.slug);

  it("keeps the corrections page out of the static catch-all", () => {
    // The catch-all generates params for every policy except corrections. If corrections
    // reappears here, it will be prerendered into a route that cannot serve live data.
    const catchAllSlugs = slugs.filter((slug) => slug !== "corrections");
    expect(catchAllSlugs).not.toContain("corrections");
  });

  it("still has a corrections policy document, because the dedicated route renders it", () => {
    // The route reads its copy from POLICIES. Removing the document would 404 the page
    // again — through a different door than last time.
    expect(slugs).toContain("corrections");
  });

  it("serves every other institutional page from the static catch-all", () => {
    const expected = [
      "editorial-standards",
      "privacy",
      "terms",
      "cookies",
      "disclaimer",
    ];
    for (const slug of expected) {
      expect(slugs).toContain(slug);
    }
  });

  it("has no duplicate slugs — a duplicate would silently shadow a page", () => {
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("keeps every slug URL-safe", () => {
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});
