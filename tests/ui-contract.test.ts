import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * Guards for two defects that both shipped and both looked fine in a passing build.
 *
 * 1. Bangla copy in the product.
 *    The working language of this project is Bangla; the *product's* language is English.
 *    A Bangla string reached readers on /corrections and then spread through the admin UI,
 *    in both cases while the build, lint and test suite were green. A language has no type,
 *    so only a scan catches it.
 *
 * 2. Navigation pointing at routes that do not exist.
 *    The admin sidebar listed twelve links with no page behind them - every one a silent
 *    404 for a signed-in operator. That is not a typo, it is a broken promise repeated
 *    twelve times, and it is checkable from the filesystem.
 */

const ROOT = join(import.meta.dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

/** Lines containing Bengali script (U+0980-U+09FF). */
function bengaliLines(file: string): number[] {
  const hits: number[] = [];
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (/[\u0980-\u09FF]/.test(line)) hits.push(index + 1);
    });
  return hits;
}

describe("product copy language", () => {
  it("contains no Bengali script anywhere in src/", () => {
    const offenders = walk(join(ROOT, "src"))
      .map((file) => ({ file: relative(ROOT, file), lines: bengaliLines(file) }))
      .filter((entry) => entry.lines.length > 0);

    expect(
      offenders,
      `Bengali script found in product source. The UI is English-only; translate the string ` +
        `or move the note into a docs/ file:\n${offenders
          .map((o) => `  ${o.file}: lines ${o.lines.join(", ")}`)
          .join("\n")}`,
    ).toEqual([]);
  });
});

describe("icon rendering", () => {
  /**
   * Unicode pictographs (pencil, envelope, shield, star, arrows) were used as icons. They read
   * fine in a design tool and render as empty boxes on any system whose font lacks the glyph -
   * the control then looks broken rather than plain.
   *
   * Text punctuation such as an em dash inside a sentence is fine: a missing em dash degrades
   * to a hyphen. A *pictograph standing in for an icon* is not, because there is no fallback
   * that still communicates the meaning. Icons come from src/components/ui/icons.tsx.
   */
  // Arrows in a comment or a doc string are prose ("permission -> transition legality");
  // an arrow rendered as a glyph on the page is an icon. The scan therefore skips comment
  // lines and looks only at what can reach the DOM.
  const PICTOGRAPHS = /[\u2190-\u21FF\u2300-\u23FF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]|&#\d+;/;
  /**
   * A whole-line comment, or a trailing `// ...` comment. The latter matters because
   * `if (!isRole(role)) continue; // unknown role -> no permissions` is prose too, and a
   * check that flagged it would be turned off rather than fixed.
   */
  const isComment = (line: string) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return true;
    // Ignore a trailing comment, but not a `//` that appears inside a string literal.
    const marker = line.indexOf(" // ");
    if (marker === -1) return false;
    const before = line.slice(0, marker);
    return (before.match(/"/g)?.length ?? 0) % 2 === 0;
  };

  it("does not use Unicode characters as icons", () => {
    const offenders = walk(join(ROOT, "src"))
      .map((file) => {
        const lines = readFileSync(file, "utf8")
          .split("\n")
          .map((line, index) => ({ line, number: index + 1 }))
          .filter((entry) => !isComment(entry.line) && PICTOGRAPHS.test(entry.line))
          .map((entry) => `${entry.number}: ${entry.line.trim()}`);
        return { file: relative(ROOT, file), lines };
      })
      .filter((entry) => entry.lines.length > 0);

    expect(
      offenders,
      `Unicode used as an icon. Draw it in src/components/ui/icons.tsx instead:\n${offenders
        .map((o) => `  ${o.file}\n    ${o.lines.join("\n    ")}`)
        .join("\n")}`,
    ).toEqual([]);
  });

  it("keeps every icon out of the accessibility tree", () => {
    // An icon announced alongside its own label is read twice. The label carries the meaning.
    const icons = readFileSync(join(ROOT, "src/components/ui/icons.tsx"), "utf8");
    expect(icons).toContain('aria-hidden="true"');
    expect(icons).toContain("focusable=\"false\"");
  });
});

describe("admin navigation", () => {
  const layout = readFileSync(join(ROOT, "src/app/admin/layout.tsx"), "utf8");
  const hrefs: string[] = [...layout.matchAll(/href:\s*"(\/admin[^"]*)"/g)].map(
    (match) => match[1] as string,
  );

  it("declares at least the routes the reference sidebar needs", () => {
    // A vacuous pass is easy here: if the regex stops matching, the loop below proves nothing.
    expect(hrefs.length).toBeGreaterThanOrEqual(10);
    expect(hrefs).toContain("/admin/articles");
  });

  it("has a real page for every sidebar link", () => {
    const missing = hrefs.filter((href) => {
      const rest = href.replace(/^\/admin\/?/, "");
      const dir = rest === "" ? join(ROOT, "src/app/admin") : join(ROOT, "src/app/admin", rest);
      try {
        // Static segment: a page.tsx must exist. Dynamic links are not used in the nav.
        return !statSync(join(dir, "page.tsx")).isFile();
      } catch {
        return true;
      }
    });

    expect(missing, `Sidebar links with no route (these 404 for a real operator): ${missing}`).toEqual(
      [],
    );
  });
});

describe("typography", () => {
  /**
   * The design calls for Inter, and globals.css named it. For a while it named it and nothing
   * else: no @font-face, no font file, no loader. Every page therefore rendered in the system
   * stack while the CSS claimed otherwise - a difference invisible to lint, the type checker
   * and every screenshot taken on a machine that happens to have Inter installed.
   *
   * These assertions hold the three links of the chain together: a bundled file, a loader that
   * exposes it as a CSS variable, and a font stack that consumes that variable.
   */
  const layout = readFileSync(join(ROOT, "src/app/layout.tsx"), "utf8");
  const fontsModule = readFileSync(join(ROOT, "src/app/fonts.ts"), "utf8");
  const globals = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");

  it("bundles the font file rather than linking a CDN", () => {
    // The CSP is `font-src 'self' data:`, so a CDN link is blocked by the browser and falls
    // back silently - the exact failure this whole block exists to prevent.
    expect(globals).not.toMatch(/fonts\.googleapis\.com|fonts\.gstatic\.com/);
    expect(fontsModule).toContain('path: "../fonts/Inter-latin-var.woff2"');
    expect(statSync(join(ROOT, "src/fonts/Inter-latin-var.woff2")).size).toBeGreaterThan(10_000);
  });

  it("carries the font licence next to the file", () => {
    // SIL OFL requires the licence to travel with the font.
    const licence = readFileSync(join(ROOT, "src/fonts/Inter-LICENSE.txt"), "utf8");
    expect(licence).toMatch(/SIL Open Font License/i);
  });

  it("exposes the font as a CSS variable and puts it on <html>", () => {
    expect(fontsModule).toContain('variable: "--font-inter"');
    expect(layout).toMatch(/<html[^>]*className=\{inter\.variable\}/);
  });

  it("resolves the sans stack through that variable", () => {
    // If globals.css drops var(--font-inter), the loader is dead weight and the page silently
    // returns to the system font.
    expect(globals).toMatch(/--font-sans:\s*var\(--font-inter\)/);
  });

  it("keeps display swap so text is readable before the file arrives", () => {
    expect(fontsModule).toContain('display: "swap"');
  });
});
