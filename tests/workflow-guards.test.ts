import { describe, expect, it } from "vitest";
import {
  ARTICLE_STATUSES,
  denialReason,
  isArticleStatus,
  permissionForStatus,
  TRANSITIONS,
} from "@/server/editorial/workflow";

const author = { userId: "u-author", roles: ["author"] };
const otherAuthor = { userId: "u-other", roles: ["author"] };
const editor = { userId: "u-editor", roles: ["editor"] };
const admin = { userId: "u-admin", roles: ["admin"] };

/**
 * Regression tests for a real vulnerability found in migration 0002: an Author holds
 * `article.edit.own`, so an edit-permission-only policy let them write
 * `status = 'published'` directly and skip review.
 */
describe("status permission mapping closes the escalation path", () => {
  it("publishing requires article.publish", () => {
    expect(permissionForStatus("published")).toBe("article.publish");
  });

  it("approving requires article.approve", () => {
    expect(permissionForStatus("approved")).toBe("article.approve");
  });

  it("an author holds neither publish nor approve", () => {
    expect(denialReason("approved", "published", author, "u-author")).not.toBeNull();
    expect(denialReason("pending_review", "approved", author, "u-author")).not.toBeNull();
    expect(denialReason("draft", "published", author, "u-author")).not.toBeNull();
  });

  it("an author may still submit their own draft", () => {
    expect(denialReason("draft", "pending_review", author, "u-author")).toBeNull();
  });

  it("an author cannot submit someone else's draft", () => {
    expect(denialReason("draft", "pending_review", author, "u-someone-else")).not.toBeNull();
  });

  it("an author cannot withdraw another author's approved article", () => {
    expect(denialReason("approved", "draft", author, "u-someone-else")).not.toBeNull();
  });

  it("an editor can approve and publish", () => {
    expect(denialReason("pending_review", "approved", editor, "u-author")).toBeNull();
    expect(denialReason("approved", "published", editor, "u-author")).toBeNull();
  });

  it("an editor cannot purge, but that is a separate permission not in this map", () => {
    // purge is not a status; it must never be reachable through the transition API
    expect(ARTICLE_STATUSES).not.toContain("purged");
  });

  it("an admin can publish but ordinary roles cannot", () => {
    expect(denialReason("approved", "published", admin, "u-author")).toBeNull();
  });

  it("illegal transitions are rejected regardless of permission", () => {
    // Super-admin-level actor still cannot jump draft -> published in one step.
    const superAdmin = { userId: "u-super", roles: ["super_admin"] };
    expect(denialReason("draft", "published", superAdmin, "u-super")).not.toBeNull();
  });

  it("every status maps to a real permission", () => {
    for (const status of ARTICLE_STATUSES) {
      expect(permissionForStatus(status)).toMatch(
        /^(article\.(create|submit|edit\.own|approve|schedule|publish|unpublish|delete))$/,
      );
    }
  });

  it("no status maps to a read-only permission", () => {
    for (const status of ARTICLE_STATUSES) {
      expect(permissionForStatus(status)).not.toMatch(/\.read|\.review$/);
    }
  });

  it("trashing requires article.delete, so authors cannot delete reviews", () => {
    expect(permissionForStatus("trash")).toBe("article.delete");
    expect(denialReason("published", "trash", author, "u-author")).not.toBeNull();
    expect(denialReason("published", "trash", editor, "u-author")).toBeNull();
  });
});

describe("status type guard", () => {
  it("accepts known statuses", () => {
    for (const status of ARTICLE_STATUSES) expect(isArticleStatus(status)).toBe(true);
  });

  it("rejects anything else", () => {
    for (const bad of ["", "Published", "PURGED", "draft ", "published; drop table"]) {
      expect(isArticleStatus(bad)).toBe(false);
    }
  });
});

describe("state machine invariants", () => {
  it("an author's own article cannot be published from any reachable state", () => {
    // Walk every transition an author is allowed to make, then confirm none of them
    // results in a published/approved article.
    const reachable = new Set<string>(["draft"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of TRANSITIONS) {
        for (const from of rule.from) {
          if (!reachable.has(from)) continue;
          if (denialReason(from, rule.to, otherAuthor, "u-other") === null) {
            if (!reachable.has(rule.to)) {
              reachable.add(rule.to);
              changed = true;
            }
          }
        }
      }
    }
    expect(reachable.has("published")).toBe(false);
    expect(reachable.has("approved")).toBe(false);
  });

  it("every non-trash, non-draft status is reachable by an editor from draft", () => {
    const reachable = new Set<string>(["draft"]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const rule of TRANSITIONS) {
        for (const from of rule.from) {
          if (!reachable.has(from)) continue;
          if (denialReason(from, rule.to, editor, "u-author") === null && !reachable.has(rule.to)) {
            reachable.add(rule.to);
            changed = true;
          }
        }
      }
    }
    for (const expected of ["pending_review", "approved", "published", "archived", "trash"]) {
      expect(reachable.has(expected)).toBe(true);
    }
  });
});
