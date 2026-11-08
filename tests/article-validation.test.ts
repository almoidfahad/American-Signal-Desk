import { describe, expect, it } from "vitest";
import { articleInputSchema, slugify, transitionInputSchema } from "@/lib/validation/article";
import { readingTimeMinutes, wordCount } from "@/server/editorial/reading-time";

const valid = {
  title: "A credible headline about the economy",
  slug: "credible-headline-economy",
  dek: "Short summary.",
  bodyHtml: "<p>Body.</p>",
};

describe("article input validation", () => {
  it("accepts a valid draft", () => {
    expect(articleInputSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a title that is too short or too long", () => {
    expect(articleInputSchema.safeParse({ ...valid, title: "abc" }).success).toBe(false);
    expect(articleInputSchema.safeParse({ ...valid, title: "x".repeat(301) }).success).toBe(false);
  });

  it("rejects unsafe slugs", () => {
    for (const slug of [
      "Has-Uppercase",
      "has spaces",
      "../etc/passwd",
      "trailing-",
      "double--hyphen",
      "under_score",
      "query?x=1",
    ]) {
      expect(articleInputSchema.safeParse({ ...valid, slug }).success).toBe(false);
    }
  });

  it("rejects slugs colliding with application routes", () => {
    for (const slug of ["admin", "api", "auth", "sitemap", "robots"]) {
      expect(articleInputSchema.safeParse({ ...valid, slug }).success).toBe(false);
    }
  });

  it("rejects an oversized body", () => {
    expect(articleInputSchema.safeParse({ ...valid, bodyHtml: "x".repeat(500_001) }).success).toBe(
      false,
    );
  });

  it("rejects a javascript: URL in the hero image field", () => {
    // Regression: Zod's .url() accepts this; httpUrlSchema must not.
    expect(articleInputSchema.safeParse({ ...valid, heroImageUrl: "javascript:alert(1)" }).success).toBe(
      false,
    );
  });

  it("rejects data: and file: URLs", () => {
    for (const bad of ["data:text/html;base64,PHNjcmlwdD4=", "file:///etc/passwd", "vbscript:msgbox"]) {
      expect(articleInputSchema.safeParse({ ...valid, heroImageUrl: bad }).success).toBe(false);
    }
  });

  it("rejects URLs containing credentials", () => {
    expect(
      articleInputSchema.safeParse({ ...valid, heroImageUrl: "https://user:pass@example.com/a.jpg" })
        .success,
    ).toBe(false);
  });

  it("accepts a normal https image URL", () => {
    expect(
      articleInputSchema.safeParse({ ...valid, heroImageUrl: "https://cdn.example.com/a.jpg" }).success,
    ).toBe(true);
  });

  it("allows omitted optional fields", () => {
    const result = articleInputSchema.safeParse({
      title: valid.title,
      slug: valid.slug,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bodyHtml).toBe("");
      expect(result.data.dek).toBe("");
    }
  });
});

describe("transition input validation", () => {
  // A real v4 UUID: Zod 4 validates RFC 4122 version and variant bits, so placeholder
  // strings like 1111-1111-... are correctly rejected.
  const VALID_V4 = "2f1c9a4e-7b3d-4a51-9c8e-6d2f0b7a1e33";

  it("accepts a known status", () => {
    expect(transitionInputSchema.safeParse({ id: VALID_V4, to: "approved" }).success).toBe(true);
  });

  it("rejects an unknown status", () => {
    expect(
      transitionInputSchema.safeParse({ id: VALID_V4, to: "purged" }).success,
    ).toBe(false);
  });

  it("rejects a non-uuid article id", () => {
    expect(transitionInputSchema.safeParse({ id: "1", to: "approved" }).success).toBe(false);
  });
});

describe("slugify", () => {
  it("produces URL-safe slugs", () => {
    expect(slugify("White House Unveils New Economic Plan for 2027")).toBe(
      "white-house-unveils-new-economic-plan-for-2027",
    );
  });

  it("handles punctuation and repeated separators", () => {
    expect(slugify("  Hello — World!!  (Again)  ")).toBe("hello-world-again");
  });

  it("bounds the length", () => {
    expect(slugify("a ".repeat(200)).length).toBeLessThanOrEqual(100);
  });
});

describe("reading time", () => {
  it("returns at least 1 minute for empty content", () => {
    expect(readingTimeMinutes("")).toBe(1);
  });

  it("scales with length", () => {
    const short = readingTimeMinutes(`<p>${"word ".repeat(100)}</p>`);
    const long = readingTimeMinutes(`<p>${"word ".repeat(1000)}</p>`);
    expect(long).toBeGreaterThan(short);
  });

  it("never exceeds the database constraint of 180", () => {
    expect(readingTimeMinutes(`<p>${"word ".repeat(100_000)}</p>`)).toBeLessThanOrEqual(180);
  });

  it("counts words from text, not markup", () => {
    expect(wordCount("<p>one two three</p>")).toBe(3);
    expect(wordCount("<p><strong>one</strong> two</p>")).toBe(2);
  });
});
