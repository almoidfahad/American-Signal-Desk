import { afterEach, describe, expect, it } from "vitest";
import {
  clampLimit,
  getPublicCorrections,
  latestDiffPair,
  MAX_CORRECTIONS,
  type RevisionEntry,
} from "@/server/content/corrections";

/**
 * The corrections feed carries a distinction the rest of the newsroom depends on:
 *
 *   empty        we read the ledger and it is genuinely empty
 *   unavailable  we could not read the ledger
 *
 * Rendering those the same way would let a database outage present itself to readers as
 * "this newsroom has never needed a correction" — a false statement about the publication,
 * made at the worst possible moment. These tests pin the distinction.
 */

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("public corrections feed", () => {
  it("reports unavailable — not empty — when the database is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const feed = await getPublicCorrections();
    expect(feed.state).toBe("unavailable");
    expect(feed.corrections).toEqual([]);
    expect(feed.reason).toBeTruthy();
  });

  it("distinguishes an unconfigured deployment from a clean corrections record", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const unconfigured = await getPublicCorrections();

    // A genuinely empty ledger would be `empty`. These must never collapse into one state.
    expect(unconfigured.state).not.toBe("empty");
  });

  it("never invents corrections when it cannot reach the database", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    const feed = await getPublicCorrections();
    expect(feed.corrections).toHaveLength(0);
  });

});

describe("row limit clamping", () => {
  // Tested as a pure function: asserting this through getPublicCorrections would make a
  // real network call, which is slow and tests the network rather than the bound.
  it("caps an excessive request at the maximum", () => {
    expect(clampLimit(100_000)).toBe(MAX_CORRECTIONS);
  });

  it("refuses to return zero or negative rows", () => {
    expect(clampLimit(0)).toBe(1);
    expect(clampLimit(-50)).toBe(1);
  });

  it("passes a reasonable request through", () => {
    expect(clampLimit(25)).toBe(25);
  });

  it("truncates fractional limits rather than sending them to the database", () => {
    expect(clampLimit(10.9)).toBe(10);
  });

  it("falls back to a safe default for a non-finite limit", () => {
    expect(clampLimit(Number.NaN)).toBe(50);
    expect(clampLimit(Number.POSITIVE_INFINITY)).toBe(50);
  });
});

describe("revision diff pairing", () => {
  const entry = (revisionNo: number): RevisionEntry => ({
    revisionNo,
    title: `Title v${revisionNo}`,
    status: "published",
    changeReason: "edited",
    changedFields: ["body_html"],
    changedBy: null,
    createdAt: new Date(0).toISOString(),
    note: null,
  });

  it("returns null when there is only one version — a diff needs two states", () => {
    expect(latestDiffPair([entry(1)])).toBeNull();
    expect(latestDiffPair([])).toBeNull();
  });

  it("pairs the two newest versions, oldest first", () => {
    const pair = latestDiffPair([entry(1), entry(3), entry(2)]);
    expect(pair).not.toBeNull();
    expect(pair?.previous.revisionNo).toBe(2);
    expect(pair?.current.revisionNo).toBe(3);
  });

  it("does not mutate the array it was given", () => {
    const revisions = [entry(1), entry(2)];
    const snapshot = revisions.map((r) => r.revisionNo);
    latestDiffPair(revisions);
    expect(revisions.map((r) => r.revisionNo)).toEqual(snapshot);
  });
});
