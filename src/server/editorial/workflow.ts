/**
 * Editorial state machine — pure, exhaustively unit-tested.
 *
 * The database stores the status; this module decides which transitions are legal and which
 * permission each transition requires. Route handlers must call `assertTransition` inside the
 * same transaction that writes the new status, so a stale client cannot skip a review step.
 */
import type { Permission } from "@/server/authz/permissions";

export const ARTICLE_STATUSES = [
  "draft",
  "pending_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "archived",
  "trash",
] as const;

export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

export interface TransitionRule {
  readonly from: readonly ArticleStatus[];
  readonly to: ArticleStatus;
  readonly permission: Permission;
  /** Ownership is evaluated when the permission is `article.edit.own`. */
  readonly ownerOnly: boolean;
  readonly label: string;
  /** Transitions that change what the public sees must invalidate caches. */
  readonly publicImpact: boolean;
}

export const TRANSITIONS: readonly TransitionRule[] = [
  {
    from: ["draft", "changes_requested", "rejected"],
    to: "pending_review",
    permission: "article.submit",
    ownerOnly: true,
    label: "Submit for review",
    publicImpact: false,
  },
  {
    from: ["pending_review"],
    to: "changes_requested",
    permission: "article.review",
    ownerOnly: false,
    label: "Request changes",
    publicImpact: false,
  },
  {
    from: ["pending_review"],
    to: "rejected",
    permission: "article.review",
    ownerOnly: false,
    label: "Reject",
    publicImpact: false,
  },
  {
    from: ["pending_review", "changes_requested"],
    to: "approved",
    permission: "article.approve",
    ownerOnly: false,
    label: "Approve",
    publicImpact: false,
  },
  {
    from: ["approved"],
    to: "scheduled",
    permission: "article.schedule",
    ownerOnly: false,
    label: "Schedule",
    publicImpact: false,
  },
  {
    from: ["approved"],
    to: "published",
    permission: "article.publish",
    ownerOnly: false,
    label: "Publish",
    publicImpact: true,
  },
  {
    from: ["scheduled"],
    to: "published",
    permission: "article.publish",
    ownerOnly: false,
    label: "Publish scheduled article",
    publicImpact: true,
  },
  {
    from: ["published"],
    to: "archived",
    permission: "article.unpublish",
    ownerOnly: false,
    label: "Unpublish and archive",
    publicImpact: true,
  },
  {
    from: ["published"],
    to: "draft",
    permission: "article.unpublish",
    ownerOnly: false,
    label: "Move back to draft",
    publicImpact: true,
  },
  {
    from: ["scheduled", "approved"],
    to: "draft",
    permission: "article.edit.own",
    ownerOnly: true,
    label: "Withdraw",
    publicImpact: false,
  },
  {
    from: [
      "draft",
      "changes_requested",
      "rejected",
      "approved",
      "scheduled",
      "archived",
      "pending_review",
      // Trashing a live article unpublishes it in the same transaction (publicImpact: true),
      // so the public site and the sitemap are revalidated together.
      "published",
    ],
    to: "trash",
    permission: "article.delete",
    ownerOnly: false,
    label: "Move to trash",
    publicImpact: true,
  },
  {
    from: ["trash"],
    to: "draft",
    permission: "article.restore",
    ownerOnly: false,
    label: "Restore from trash",
    publicImpact: false,
  },
];

export type TransitionResult =
  | { ok: true; rule: TransitionRule }
  | { ok: false; reason: string };

export function findTransition(from: string, to: string): TransitionRule | undefined {
  return TRANSITIONS.find((t) => t.to === to && t.from.includes(from as ArticleStatus));
}

/**
 * Legal-transition check *without* authorization. Kept separate so the workflow can drive
 * UI affordances; the caller must still enforce `rule.permission` server-side.
 */
export function canTransition(from: string, to: string): TransitionResult {
  const rule = findTransition(from, to);
  if (!rule) {
    return { ok: false, reason: `Illegal transition: ${from} → ${to}` };
  }
  return { ok: true, rule };
}

/**
 * Terminal states for the purposes of "is this article publicly visible".
 * Anything not published is invisible to the public site — including `scheduled`.
 */
export function isPubliclyVisible(status: string, publishAt?: Date | null, now = new Date()): boolean {
  if (status !== "published") return false;
  if (publishAt && publishAt.getTime() > now.getTime()) return false;
  return true;
}

/** States in which an article may still be edited by its author. */
export const EDITABLE_STATUSES: readonly ArticleStatus[] = [
  "draft",
  "changes_requested",
  "rejected",
  "pending_review",
];

export function isEditableStatus(status: string): boolean {
  return (EDITABLE_STATUSES as readonly string[]).includes(status);
}
