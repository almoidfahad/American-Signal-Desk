/**
 * Dates, in one place.
 *
 * A newsroom's dateline is a factual claim, so it cannot be assembled ad hoc at
 * each call site. Before this module there were six different formatters, and two
 * of them disagreed about the zone: story cards printed `America/New_York` while
 * the corrections ledger printed `UTC`. A correction filed at 21:00 in New York
 * therefore carried a date one day later than the article it corrected — on the
 * page whose whole purpose is to be the accurate record.
 *
 * Rules encoded here:
 *   - Readers are in New York. Everything a reader sees is formatted there, so a
 *     story and its correction never disagree about what day it is.
 *   - Admin surfaces are operational, not editorial: they show the newsroom's own
 *     clock and say so. `NEWSROOM_TZ` exists so that stays a single decision.
 *   - DST is `Intl`'s problem, not ours. No offset arithmetic anywhere.
 *   - An unparseable or missing date renders as an explicit placeholder, never as
 *     "Invalid Date" and never as today.
 */

/** Where the desk publishes from. Every reader-facing date uses this zone. */
export const NEWSROOM_TZ = "America/New_York";

/** Shown when a date is absent, so the gap reads as a decision rather than a bug. */
export const NO_DATE = "—";

/** Admin tables use a hyphen: a dash in a numeric column reads as a minus sign. */
export const NO_DATE_ADMIN = "-";

/** Narrower screens get what fits; the full form is for the masthead. */
export type DateStyle = "compact" | "long" | "ledger" | "datetime" | "day";

function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

const OPTIONS: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  /** "Nov 9, 2026" — card metadata, list rows. */
  compact: { month: "short", day: "numeric", year: "numeric" },
  /** "November 9, 2026" — corrections ledger, article footer. */
  ledger: { month: "long", day: "numeric", year: "numeric" },
  /** "Monday, November 9, 2026" — masthead dateline. */
  day: { weekday: "long", month: "long", day: "numeric", year: "numeric" },
  /** "Nov 9, 2026, 9:41 AM" — when the time of day is part of the record. */
  datetime: { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" },
  /** Long form of the above, for a single prominent timestamp. */
  long: { dateStyle: "long" as const },
};

/**
 * Reader-facing date. Always the newsroom's zone.
 *
 * Returns `fallback` (default "—") when the value cannot be read, so a caller
 * never renders an empty span where a date should be.
 */
export function formatDate(
  iso: string | null | undefined,
  style: DateStyle = "compact",
  options: { timeZone?: string; fallback?: string } = {},
): string {
  const date = parse(iso);
  if (!date) return options.fallback ?? NO_DATE;
  return new Intl.DateTimeFormat("en-US", {
    ...OPTIONS[style],
    timeZone: options.timeZone ?? NEWSROOM_TZ,
  }).format(date);
}

/** Explicitly the newsroom's clock — for admin surfaces that show local time. */
export function formatNewsroom(
  iso: string | null | undefined,
  style: DateStyle = "compact",
  fallback: string = NO_DATE_ADMIN,
): string {
  return formatDate(iso, style, { timeZone: NEWSROOM_TZ, fallback });
}

/**
 * Today's dateline in the newsroom's zone.
 *
 * `iso` is the calendar date *in New York*, not in UTC. Rendering a `time` element
 * with the UTC date would make the machine-readable value disagree with the visible
 * one for four hours every evening — which is exactly the mistake this module exists
 * to prevent.
 */
export function todayInNewsroom(now: Date = new Date()): { label: string; iso: string } {
  const label = new Intl.DateTimeFormat("en-US", {
    ...OPTIONS.day,
    timeZone: NEWSROOM_TZ,
  }).format(now);

  // en-CA renders ISO-8601 (YYYY-MM-DD), which is the correct machine form.
  const iso = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: NEWSROOM_TZ,
  }).format(now);

  return { label, iso };
}

/** Clock time with the zone abbreviation, so "9:41 AM" is never ambiguous. */
export function timeInNewsroom(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: NEWSROOM_TZ,
    timeZoneName: "short",
  }).format(now);
}

/**
 * How long ago, for live surfaces only (a ticker, a "just in" strip).
 *
 * Deliberately *not* used for article timestamps: "3 hr ago" on a story from
 * yesterday's print edition reads as fresher than it is. Relative time is for
 * things that are actually moving.
 *
 * `now` is a parameter, not `Date.now()`, so this is testable without freezing the
 * clock — and so a caller cannot accidentally make a server component render
 * differently on each request.
 */
export function formatRelative(
  iso: string | null | undefined,
  now: Date = new Date(),
  options: { fallback?: string } = {},
): string {
  const date = parse(iso);
  if (!date) return options.fallback ?? NO_DATE;

  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000);
  if (minutes < 0) return "Just now"; // Clock skew or a scheduled stamp: do not print "in -2 min".
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;

  return formatDate(iso, "compact");
}
