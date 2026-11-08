import { describe, expect, it } from "vitest";
import {
  ARTICLE_STATUSES,
  TRANSITIONS,
  canTransition,
  isEditableStatus,
  isPubliclyVisible,
} from "@/server/editorial/workflow";

describe("editorial state machine", () => {
  it("draft → pending_review → approved → published is the happy path", () => {
    expect(canTransition("draft", "pending_review").ok).toBe(true);
    expect(canTransition("pending_review", "approved").ok).toBe(true);
    expect(canTransition("approved", "published").ok).toBe(true);
  });

  it("cannot publish straight from a draft", () => {
    expect(canTransition("draft", "published").ok).toBe(false);
  });

  it("cannot publish from pending_review without approval", () => {
    expect(canTransition("pending_review", "published").ok).toBe(false);
  });

  it("cannot schedule from a draft", () => {
    expect(canTransition("draft", "scheduled").ok).toBe(false);
  });

  it("rejects unknown statuses and no-op transitions", () => {
    expect(canTransition("draft", "teleported").ok).toBe(false);
    expect(canTransition("published", "published").ok).toBe(false);
    expect(canTransition("", "").ok).toBe(false);
  });

  it("every transition target is a real status", () => {
    for (const rule of TRANSITIONS) {
      expect(ARTICLE_STATUSES).toContain(rule.to);
      for (const from of rule.from) expect(ARTICLE_STATUSES).toContain(from);
    }
  });

  it("every transition requires a valid permission name", () => {
    for (const rule of TRANSITIONS) {
      expect(rule.permission).toMatch(/^[a-z]+\.[a-z.]+$/);
    }
  });

  it("publishing transitions are flagged as public-impacting", () => {
    const publish = TRANSITIONS.filter((t) => t.to === "published");
    expect(publish.length).toBeGreaterThan(0);
    for (const rule of publish) expect(rule.publicImpact).toBe(true);
  });

  it("submitting for review is owner-only; approving is not", () => {
    const submit = TRANSITIONS.find((t) => t.to === "pending_review");
    const approve = TRANSITIONS.find((t) => t.to === "approved");
    expect(submit?.ownerOnly).toBe(true);
    expect(approve?.ownerOnly).toBe(false);
  });

  it("trash is reachable and restorable", () => {
    expect(canTransition("published", "trash").ok).toBe(true);
    expect(canTransition("trash", "draft").ok).toBe(true);
  });
});

describe("public visibility", () => {
  it("only published is public", () => {
    for (const status of ARTICLE_STATUSES) {
      expect(isPubliclyVisible(status)).toBe(status === "published");
    }
  });

  it("a scheduled future article is not public yet", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isPubliclyVisible("published", future)).toBe(false);
  });

  it("a past publish time is public", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isPubliclyVisible("published", past)).toBe(true);
  });

  it("trash is never public", () => {
    expect(isPubliclyVisible("trash")).toBe(false);
  });
});

describe("editability", () => {
  it("published and archived articles are not directly editable", () => {
    expect(isEditableStatus("published")).toBe(false);
    expect(isEditableStatus("archived")).toBe(false);
  });

  it("drafts and changes_requested are editable", () => {
    expect(isEditableStatus("draft")).toBe(true);
    expect(isEditableStatus("changes_requested")).toBe(true);
  });
});
