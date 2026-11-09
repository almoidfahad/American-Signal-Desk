/**
 * The type scale is a ladder, not a mood.
 *
 * Before this suite the reader-facing surfaces used seventeen different pixel sizes —
 * seven of them body-ish values within 2px of each other (11, 11.5, 12, 12.5, 13, 14, 15,
 * 16), and the same role rendered at different sizes on different pages (a page h1 was
 * 28px on search, 32/40 on a category, 32/42 on an article, 30 serif on prose pages).
 *
 * The ladder lives in globals.css and every size a reader sees is one of its steps. These
 * assertions keep it that way: no free-hand pixels in reader-facing markup, one size per
 * role, and the ladder itself pinned so a casual tweak cannot re-scatter the scale.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const GLOBALS = read("src/app/globals.css");

// Reader-facing scope: public pages and the components that render what readers see.
// Deliberately excluded: src/components/brand.tsx (the wordmark is a logo asset, and the
// ladder documents that wordmarks sit outside it) and src/app/admin (the console has its
// own density and is reviewed separately).
const tsx = (dir: string) =>
  readdirSync(join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));

const SCOPE = [
  ...tsx("src/app/(public)"),
  "src/app/error.tsx",
  "src/app/not-found.tsx",
  ...tsx("src/components/news"),
  ...tsx("src/components/site"),
  "src/components/ui/states.tsx",
  "src/components/ui/styles.ts",
];

const LADDER_H1 = /text-display|text-headline|text-dek/;

describe("the ladder itself", () => {
  it("defines each step at its documented size", () => {
    // Pin the values: a scale whose steps drift is just scatter with names.
    const steps: Record<string, string> = {
      "--text-micro": "0.625rem",
      "--text-caption": "0.75rem",
      "--text-small": "0.8125rem",
      "--text-body": "0.9375rem",
      "--text-title": "1rem",
      "--text-body-lg": "1.0625rem",
      "--text-dek": "1.1875rem",
      "--text-heading": "1.5rem",
      "--text-headline": "clamp(1.625rem, 1.15rem + 1.55vw, 2.375rem)",
      "--text-display": "clamp(2rem, 1.55rem + 1.45vw, 2.625rem)",
    };
    for (const [token, value] of Object.entries(steps)) {
      expect(GLOBALS).toContain(`${token}: ${value};`);
    }
  });

  it("documents the one-size-per-role rule and the wordmark exemption", () => {
    expect(GLOBALS).toContain("One size per role");
    expect(GLOBALS).toContain("outside this scale");
    expect(GLOBALS).toContain("--text-display--line-height");
  });

  it("reads in-article sizes from the ladder too", () => {
    // prose-asd is typography; it may not keep a private set of sizes.
    expect(GLOBALS).toContain("font-size: var(--text-heading);");
    expect(GLOBALS).toContain("font-size: var(--text-dek);");
    expect(GLOBALS).toContain("font-size: var(--text-caption);");
  });
});

describe("reader-facing markup uses the ladder", () => {
  it("has no free-hand pixel sizes left", () => {
    for (const file of SCOPE) {
      const source = read(file);
      expect(source, `${file} has a free-hand size`).not.toMatch(/text-\[[0-9.]+px\]/);
    }
  });

  it("has no default Tailwind text sizes left", () => {
    // text-sm & co. are a *different* ladder; mixing the two is how the scatter started.
    for (const file of SCOPE) {
      const source = read(file);
      expect(source, `${file} uses a default text size`).not.toMatch(
        /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/,
      );
    }
  });

  it("does not grow broken tokens out of replacements", () => {
    // `text-sm` is a substring of `text-small`; a sloppy sweep once produced `text-bodyall`.
    for (const file of SCOPE) {
      const source = read(file);
      expect(source, `${file} contains a broken token`).not.toMatch(/text-bodya|text-small[a-z]|text-caption[a-z]/);
    }
  });
});

describe("one size per role", () => {
  it("gives every news page title the display step", () => {
    for (const page of [
      "src/app/(public)/article/[slug]/page.tsx",
      "src/app/(public)/category/[slug]/page.tsx",
      "src/app/(public)/search/page.tsx",
    ]) {
      expect(read(page), page).toContain("text-display");
    }
  });

  it("gives every prose page title the headline step, in the serif register", () => {
    for (const page of [
      "src/app/(public)/about/page.tsx",
      "src/app/(public)/advertise/page.tsx",
      "src/app/(public)/contact/page.tsx",
      "src/app/(public)/newsletter/page.tsx",
      "src/app/(public)/corrections/page.tsx",
      "src/app/(public)/[...policy]/page.tsx",
      "src/app/error.tsx",
      "src/app/not-found.tsx",
    ]) {
      expect(read(page), page).toMatch(/font-serif text-headline/);
    }
  });

  it("maps every visible h1 to a documented title step", () => {
    // display (news), headline (prose), dek (panel titles) — nothing else may claim an h1.
    // An sr-only heading has no visible type, so it carries no size.
    for (const file of SCOPE) {
      const source = read(file);
      for (const match of source.matchAll(/<h1 [^>]*className="([^"]*)"/g)) {
        const classes = match[1] ?? "";
        if (classes.trim() === "sr-only") continue;
        expect(classes, `${file} h1`).toMatch(LADDER_H1);
      }
    }
  });

  it("keeps the card hierarchy on named steps", () => {
    // Lead title, card title, compact title — the three editorial weights.
    const cards = read("src/components/news/article-card.tsx");
    expect(cards).toContain("text-headline");
    expect(cards).toContain("text-title");
    expect(cards).toContain("text-small");
    expect(cards).toContain("text-caption"); // byline and badges
  });
});
