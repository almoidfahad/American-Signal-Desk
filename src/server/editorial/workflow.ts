/**
 * Editorial state machine — pure, exhaustively unit-tested.
 *
 * The database stores the status; this module decides which transitions are legal and which
 * permission each transition requires. Route handlers must call `assertTransition` inside the
 * same transaction that writes the new status, so a stale client cannot skip a review step.
 */
import { permissionsForRoles, type Permission } from "@/server/authz/permissions";

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

/**
 * The permission a *status value* itself requires, independent of any transition.
 *
 * This exists to close a real privilege-escalation path: an Author holds `article.edit.own`,
 * so a row-level UPDATE policy alone would let them set `status = 'published'` directly and
 * skip review entirely. Every write path must check this before persisting a status, and the
 * database enforces the same rule independently (migration 0003).
 */
/**
 * Permissions that only ever apply to an article you own. Holding the permission is not
 * sufficient — ownership is checked as well.
 */
const SUBMIT_LEVEL_PERMISSIONS: ReadonlySet<Permission> = new Set([
  "article.submit",
  "article.create",
]);

const STATUS_PERMISSION: Readonly<Record<ArticleStatus, Permission>> = {
  draft: "article.create",
  pending_review: "article.submit",
  changes_requested: "article.edit.own",
  rejected: "article.edit.own",
  approved: "article.approve",
  scheduled: "article.schedule",
  published: "article.publish",
  archived: "article.unpublish",
  trash: "article.delete",
};

export function permissionForStatus(status: ArticleStatus): Permission {
  return STATUS_PERMISSION[status];
}

export function isArticleStatus(value: string): value is ArticleStatus {
  return (ARTICLE_STATUSES as readonly string[]).includes(value);
}

/**
 * Explains, in plain language, why a listener cannot perform a transition.
 * Pure and testable so the UI and the API return the same wording.
 */
export function denialReason(
  from: string,
  to: string,
  actor: { userId: string; roles: readonly string[] },
  ownerId: string | null,
): string | null {
  const result = canTransition(from, to);
  if (!result.ok) return result.reason;

  const rule = result.rule;
  const granted = permissionsForRoles(actor.roles);

  if (rule.permission === "article.edit.own") {
    const ownsIt = Boolean(actor.userId) && ownerId === actor.userId;
    if (!ownsIt && !granted.has("article.edit.any")) {
      return "This action is only available on your own draft.";
    }
    return null;
  }

  if (!granted.has(rule.permission)) {
    return `Missing permission (${rule.permission}).`;
  }

  /**
   * Ownership still applies to submit/withdraw. An Author holds `article.submit`, but that
   * must only ever act on their *own* draft — otherwise one writer could push a colleague's
   * draft into the review queue. Found by tests/workflow-guards.test.ts.
   */
  if (SUBMIT_LEVEL_PERMISSIONS.has(rule.permission)) {
    const ownsIt = Boolean(actor.userId) && ownerId === actor.userId;
    if (!ownsIt && !granted.has("article.edit.any")) {
      return "This article belongs to another author, so this step is not yours to take.";
    }
  }

  return null;
}

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
    return { ok: false, reason: `Illegal transition: ${from} to ${to}` };
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
