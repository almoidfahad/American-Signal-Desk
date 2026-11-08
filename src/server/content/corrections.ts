/**
 * Corrections and revision history — read models for the public and admin surfaces.
 *
 * The public /corrections page makes a promise to readers: "Published articles keep an
 * immutable revision history, so the original wording is always recoverable." That promise
 * is enforced by migration 0004 (trigger + RLS + append-only guards). This module is the
 * read path that lets the promise be *shown* rather than merely asserted.
 *
 * Honesty rules carried over from the rest of the content layer:
 *   - With no database configured, nothing is invented. The reader sees an explicit
 *     "not available" state, and the admin sees an empty history with a reason.
 *   - An empty corrections list is a real answer ("we have published no corrections"),
 *     and it is distinguishable from "we could not read the corrections" — conflating the
 *     two would let an outage look like a clean record.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type CorrectionFeedState = "live" | "empty" | "unavailable";

export interface PublicCorrection {
  id: string;
  /** What was wrong. Written for readers, not for staff. */
  description: string;
  /** What the article says now. */
  correction: string;
  createdAt: string;
  articleSlug: string;
  articleTitle: string;
}

export interface CorrectionFeed {
  state: CorrectionFeedState;
  corrections: PublicCorrection[];
  /** Present when state is `unavailable`, so the page can say why without guessing. */
  reason?: string;
}

function anonClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Reads the public correction ledger.
 *
 * Uses the `public_corrections` view, which is `security_invoker`: the anon role's RLS
 * policies apply to it exactly as they do to the base table. This function therefore cannot
 * leak an unpublished or unapproved correction even if it were called carelessly.
 */
/** Upper bound on rows any single request may pull from the ledger. */
export const MAX_CORRECTIONS = 200;

/**
 * Clamps a requested row count into a sane range.
 *
 * Exported and pure so it can be tested without a database: a caller asking for 100_000
 * rows should not be able to make the corrections page (and the database behind it) do
 * that work, and a NaN/negative value must not reach the query builder at all.
 */
export function clampLimit(requested: number, max = MAX_CORRECTIONS): number {
  if (!Number.isFinite(requested)) return Math.min(50, max);
  return Math.min(Math.max(Math.trunc(requested), 1), max);
}

export async function getPublicCorrections(limit = 50): Promise<CorrectionFeed> {
  const db = anonClient();
  if (!db) {
    return {
      state: "unavailable",
      corrections: [],
      reason:
        "আমরা এখন সংশোধনের তালিকা পড়তে পারছি না, কারণ এই পরিবেশে ডেটাবেস কনফিগার করা নেই।",
    };
  }

  const { data, error } = await db
    .from("public_corrections")
    .select("id, description, correction, created_at, article_slug, article_title")
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit));

  if (error) {
    // A read failure is reported as a failure. Returning [] would render as
    // "no corrections have been published", which is a different and false statement.
    return {
      state: "unavailable",
      corrections: [],
      reason: "সংশোধনের তালিকা লোড করা যায়নি।",
    };
  }

  const corrections: PublicCorrection[] = (data ?? []).map((row) => ({
    id: String(row.id),
    description: String(row.description ?? ""),
    correction: String(row.correction ?? ""),
    createdAt: String(row.created_at ?? ""),
    articleSlug: String(row.article_slug ?? ""),
    articleTitle: String(row.article_title ?? ""),
  }));

  return {
    state: corrections.length === 0 ? "empty" : "live",
    corrections,
  };
}

// ---------------------------------------------------------------------------
// Admin-side revision history
// ---------------------------------------------------------------------------

export type RevisionHistoryState = "live" | "unavailable";

export interface RevisionEntry {
  revisionNo: number;
  title: string;
  status: string;
  changeReason: string;
  changedFields: string[];
  changedBy: string | null;
  createdAt: string;
  note: string | null;
}

export interface RevisionHistory {
  state: RevisionHistoryState;
  revisions: RevisionEntry[];
  reason?: string;
}

/**
 * Reads an article's revision history for the admin UI.
 *
 * Uses the service-role client because the admin panel is behind authentication and the
 * authorization decision has already been made server-side (`article.review` or
 * `article.edit.any`, or ownership). The table stays append-only regardless of which
 * client reads it.
 */
export async function getRevisionHistory(articleId: string): Promise<RevisionHistory> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return {
      state: "unavailable",
      revisions: [],
      reason: "ডেটাবেস কনফিগার করা নেই, তাই সংশোধনের ইতিহাস পাওয়া যাচ্ছে না।",
    };
  }

  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await db
    .from("article_revisions")
    .select("revision_no, title, status, change_reason, changed_fields, changed_by, created_at, note")
    .eq("article_id", articleId)
    .order("revision_no", { ascending: false })
    .limit(100);

  if (error) {
    return { state: "unavailable", revisions: [], reason: "সংশোধনের ইতিহাস লোড করা যায়নি।" };
  }

  const revisions: RevisionEntry[] = (data ?? []).map((row) => ({
    revisionNo: Number(row.revision_no ?? 0),
    title: String(row.title ?? ""),
    status: String(row.status ?? ""),
    changeReason: String(row.change_reason ?? ""),
    changedFields: Array.isArray(row.changed_fields) ? row.changed_fields.map(String) : [],
    changedBy: row.changed_by ? String(row.changed_by) : null,
    createdAt: String(row.created_at ?? ""),
    note: row.note ? String(row.note) : null,
  }));

  return { state: "live", revisions };
}

/**
 * The two most recent revisions, oldest first, for a before/after diff view.
 *
 * Returns null when fewer than two versions exist: a diff needs two states, and inventing
 * a second one to fill the UI would misrepresent history.
 */
export function latestDiffPair(
  revisions: RevisionEntry[],
): { previous: RevisionEntry; current: RevisionEntry } | null {
  if (revisions.length < 2) return null;
  const sorted = [...revisions].sort((a, b) => b.revisionNo - a.revisionNo);
  const current = sorted[0];
  const previous = sorted[1];
  if (!current || !previous) return null;
  return { previous, current };
}
