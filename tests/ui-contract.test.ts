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
