/**
 * The admin console must work on a small screen, on the type ladder.
 *
 * Two obligations, both previously unguarded:
 *
 * 1. Responsive. The sidebar drawer exists, but Escape did not close it, and a wide
 *    DataTable scrolled horizontally with no way for a keyboard user to reach the scroll
 *    region (WCAG: a scrollable region must be focusable). Grids must collapse - a bare
 *    `grid-cols-3` squeezes a phone, so multi-column grids need a breakpoint prefix.
 *
 * 2. Density. The console carried twenty different type sizes (9 to 44px, including six
 *    values within 2px of each other) on top of the public ladder. It now names its steps
 *    like everything else, with `text-micro` for the dense chrome tier below caption.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

const SHELL = read("src/components/admin/admin-shell.tsx");
const UI = read("src/components/admin/ui.tsx");
const GLOBALS = read("src/app/globals.css");

const tsx = (dir: string) =>
  readdirSync(join(ROOT, dir), { recursive: true })
    .map(String)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => join(dir, f));

const ADMIN = [...tsx("src/app/admin"), ...tsx("src/components/admin")];

describe("the admin shell is usable on small screens", () => {
  it("gives the drawer an Escape exit", () => {
    expect(SHELL).toContain('event.key === "Escape"');
    expect(SHELL).toContain("window.removeEventListener");
  });

  it("keeps the drawer out of the accessibility tree when closed", () => {
    expect(SHELL).toContain('drawerOpen ? "block" : "hidden"');
    expect(SHELL).toContain('aria-controls="admin-sidebar"');
    expect(SHELL).toContain("aria-expanded");
  });

  it("makes the table's scroll region keyboard-reachable and named", () => {
    // A wide table scrolls on a phone; without tabIndex a keyboard user cannot scroll it.
    expect(UI).toContain("tabIndex={0}");
    expect(UI).toContain('role="region"');
    expect(UI).toContain("aria-label={caption ?? \"Data table\"}");
  });

  it("only opens multi-column grids behind a breakpoint", () => {
    // `grid-cols-2` is fine on a phone; three or more columns must wait for a wider screen.
    for (const file of ADMIN) {
      const source = read(file);
      for (const match of source.matchAll(/(?:^|[\s"'])((?:sm|md|lg|xl):)?grid-cols-([2-9])/g)) {
        const [full, prefix, cols] = match;
        if (Number(cols) >= 3) {
          expect(prefix, `${file}: "${full}" needs a breakpoint prefix`).toBeTruthy();
        }
      }
    }
  });
});

describe("the console sits on the type ladder", () => {
  it("defines the dense tier below caption", () => {
    expect(GLOBALS).toContain("--text-micro: 0.625rem;");
    expect(GLOBALS).toContain("console labels");
  });

  it("leaves no free-hand pixels or default sizes in admin markup", () => {
    for (const file of ADMIN) {
      const source = read(file);
      expect(source, `${file} has a free-hand size`).not.toMatch(/text-\[[0-9.]+px\]/);
      expect(source, `${file} uses a default text size`).not.toMatch(
        /text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/,
      );
      expect(source, `${file} contains a broken token`).not.toMatch(/text-small[a-z]|text-bodya/);
    }
  });

  it("puts page titles and metric values on named steps", () => {
    expect(UI).toContain("text-heading"); // PageHeader and StatCard value
    expect(read("src/app/admin/login/page.tsx")).toContain("text-display"); // login hero
  });
});
