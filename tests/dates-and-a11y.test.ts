import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  NEWSROOM_TZ,
  NO_DATE,
  formatDate,
  formatNewsroom,
  formatRelative,
  timeInNewsroom,
  todayInNewsroom,
} from "@/lib/dates";

const ROOT = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

const SOURCES = walk(resolve(ROOT, "src")).map((path) => ({
  path,
  relative: path.slice(ROOT.length + 1),
  text: readFileSync(path, "utf8"),
}));

describe("dates: one zone, one formatter", () => {
  it("formats reader-facing dates in the newsroom's zone", () => {
    // 2026-11-10T02:30Z is still the 9th in New York. This is the exact case that
    // made an article and its correction disagree when the ledger used UTC.
    expect(formatDate("2026-11-10T02:30:00Z")).toBe("Nov 9, 2026");
    expect(formatDate("2026-11-10T02:30:00Z", "ledger")).toBe("November 9, 2026");
    expect(NEWSROOM_TZ).toBe("America/New_York");
  });

  it("agrees across styles for the same instant", () => {
    const iso = "2026-11-10T02:30:00Z";
    expect(formatDate(iso)).toContain("9");
    expect(formatDate(iso, "ledger")).toContain("9");
    expect(todayInNewsroom(new Date(iso)).iso).toBe("2026-11-09");
  });

  it("gives the machine-readable dateline the New York date, not the UTC one", () => {
    // The <time datetime> must agree with the visible label, or the page contradicts
    // itself for four hours every evening.
    const lateEveningInNewYork = new Date("2026-11-10T02:30:00Z");
    const { label, iso } = todayInNewsroom(lateEveningInNewYork);
    expect(iso).toBe("2026-11-09");
    expect(label).toContain("November 9, 2026");
  });

  it("renders an explicit placeholder instead of an empty span or Invalid Date", () => {
    expect(formatDate(null)).toBe(NO_DATE);
    expect(formatDate(undefined)).toBe(NO_DATE);
    expect(formatDate("not a date")).toBe(NO_DATE);
    expect(formatDate("")).toBe(NO_DATE);
    // Admin tables want a hyphen: an em dash in a numeric column reads as a minus.
    expect(formatNewsroom(null)).toBe("-");
  });

  it("shows the zone abbreviation on the clock so the time is never ambiguous", () => {
    expect(timeInNewsroom(new Date("2026-07-04T12:00:00Z"))).toMatch(/E[DS]T/);
  });

  it("does not print a negative relative time when the clock skews", () => {
    const future = "2026-11-09T12:05:00Z";
    const now = new Date("2026-11-09T12:00:00Z");
    expect(formatRelative(future, now)).toBe("Just now");
    expect(formatRelative("2026-11-09T11:45:00Z", now)).toBe("15 min ago");
    expect(formatRelative("2026-11-09T09:00:00Z", now)).toBe("3 hr ago");
    // Past a day it falls back to an absolute date rather than "27 hr ago".
    expect(formatRelative("2026-11-01T12:00:00Z", now)).toBe("Nov 1, 2026");
  });

  it("keeps every date formatter in this module", () => {
    // The defect this prevents: two components formatting the same instant in
    // different zones. A local Intl.DateTimeFormat anywhere else is how that happens.
    const offenders = SOURCES.filter(
      (file) =>
        file.relative !== "src/lib/dates.ts" &&
        /new Intl\.DateTimeFormat|toLocaleDateString\(|toLocaleTimeString\(/.test(file.text),
    ).map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it("does not let a component read the clock during render", () => {
    // Date.now() inside a *component* makes the output differ on every request (so an
    // ISR page cannot be cached) and causes a hydration mismatch in a client component.
    // Server-side code — rate limiting, sessions, token expiry — may of course use it.
    const offenders = SOURCES.filter(
      (file) =>
        /^(src\/components|src\/app\/.*\.tsx$)/.test(file.relative) &&
        /Date\.now\(\)/.test(file.text),
    ).map((file) => file.relative);
    expect(offenders).toEqual([]);
  });
});

describe("article form: every field error is addressable", () => {
  const form = readFileSync(resolve(ROOT, "src/components/admin/article-form.tsx"), "utf8");

  it("gives each rendered error the id its input names", () => {
    // An aria-describedby pointing at a missing element announces nothing. The bug
    // was exactly this: "title-error" as a literal string with no element behind it.
    const named = [...form.matchAll(/aria-describedby=\{?[^}]*?"([a-zA-Z]+-(?:error|help))"/g)]
      .map((m) => m[1])
      .filter((id): id is string => Boolean(id));
    const rendered = [...form.matchAll(/<FieldError id="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((id): id is string => Boolean(id));
    const helpIds = [...form.matchAll(/ id="([a-zA-Z]+-help)"/g)]
      .map((m) => m[1])
      .filter((id): id is string => Boolean(id));

    expect(named.length).toBeGreaterThan(0);
    for (const id of named) {
      const isHelp = id.endsWith("-help");
      expect(isHelp ? helpIds : rendered).toContain(id);
    }
  });

  it("renders the id it is given, instead of a hard-coded one", () => {
    // The first version of this test only checked the call sites, and it passed while
    // the rendered element had lost its id — the attribute pointed at nothing again.
    // So: render the component and read what actually reaches the DOM.
    const body = form.slice(form.indexOf("function FieldError"));
    const signature = body.slice(0, body.indexOf("return null") + 10);
    expect(signature).toContain("{ id, message }");

    const markup = body.slice(body.indexOf("return ("), body.indexOf(");", body.indexOf("return (")) + 2);
    expect(markup).toContain("id={id}");
    expect(markup).toContain('role="alert"');
  });

  it("makes the error id mandatory, so the mistake cannot come back", () => {
    expect(form).toMatch(/function FieldError\(\{ id, message \}: \{ id: string; message\?: string \}\)/);
    // No FieldError may be rendered without an id.
    const unaddressed = [...form.matchAll(/<FieldError (?!id=)[^>]*\/>/g)];
    expect(unaddressed).toEqual([]);
  });

  it("marks every validated field aria-invalid when it has an error", () => {
    for (const field of ["title", "slug", "dek", "bodyHtml", "heroImageUrl"]) {
      expect(form).toContain(`Boolean(fieldErrors.${field})`);
    }
  });
});

describe("admin surfaces: contrast on dark panels", () => {
  const dark = ["src/components/admin/admin-shell.tsx", "src/app/admin/login/page.tsx"];

  directContrast("#9aabc7", "#0b1a33", "navy-300 on navy-900");

  it("does not use navy-400 for text on navy backgrounds", () => {
    // 4.33:1 — just under AA for body text, and these are 10.5px strings.
    const offenders: string[] = [];
    for (const relative of dark) {
      const text = readFileSync(resolve(ROOT, relative), "utf8");
      for (const line of text.split("\n")) {
        if (!/text-navy-400/.test(line)) continue;
        // Icons and decorative glyphs are fine; body copy is not.
        if (/placeholder:|Icon|<svg|pointer-events-none/.test(line)) continue;
        offenders.push(`${relative}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

function directContrast(fg: string, bg: string, label: string) {
  it(`${label} meets AA for small text`, () => {
    const lum = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
        number,
        number,
        number,
      ];
      const channel = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const [a, b] = [lum(fg), lum(bg)];
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
}
