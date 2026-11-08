import { describe, expect, it } from "vitest";
import {
  AGENT_SCOPES,
  FORBIDDEN_AGENT_SCOPES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  agentCan,
  can,
  permissionsForRoles,
  requirePermission,
  validateAgentScopes,
  type AgentPrincipal,
} from "@/server/authz/permissions";

const superAdmin = { userId: "u-super", roles: ["super_admin"] };
const admin = { userId: "u-admin", roles: ["admin"] };
const editor = { userId: "u-editor", roles: ["editor"] };
const author = { userId: "u-author", roles: ["author"] };
const analyst = { userId: "u-analyst", roles: ["analyst"] };

describe("deny by default", () => {
  it("denies an actor with no userId", () => {
    expect(can({ userId: "", roles: ["super_admin"] }, "article.publish")).toBe(false);
  });

  it("denies an actor with no roles", () => {
    expect(can({ userId: "u1", roles: [] }, "article.publish")).toBe(false);
  });

  it("denies unknown roles", () => {
    expect(can({ userId: "u1", roles: ["root"] }, "article.publish")).toBe(false);
    expect(permissionsForRoles(["root", "wheel"]).size).toBe(0);
  });

  it("denies an unknown permission", () => {
    // @ts-expect-error deliberately invalid permission string
    expect(can(superAdmin, "article.teleport")).toBe(false);
  });
});

describe("acceptance criteria: Author cannot publish or approve", () => {
  it("author cannot publish", () => {
    expect(can(author, "article.publish")).toBe(false);
  });

  it("author cannot approve", () => {
    expect(can(author, "article.approve")).toBe(false);
  });

  it("author cannot publish another user's article via any path", () => {
    for (const permission of PERMISSIONS) {
      if (permission === "article.publish" || permission === "article.approve") {
        expect(can(author, permission, { ownerId: author.userId })).toBe(false);
      }
    }
  });

  it("requirePermission throws for the author", () => {
    expect(() => requirePermission(author, "article.publish")).toThrow(/Missing permission/);
  });

  it("author can create and submit their own draft", () => {
    expect(can(author, "article.create")).toBe(true);
    expect(can(author, "article.submit")).toBe(true);
  });
});

describe("ownership-sensitive editing", () => {
  it("author can edit their own article", () => {
    expect(can(author, "article.edit.own", { ownerId: "u-author" })).toBe(true);
  });

  it("author cannot edit someone else's article", () => {
    expect(can(author, "article.edit.own", { ownerId: "u-other" })).toBe(false);
  });

  it("author cannot edit when ownership is unknown", () => {
    expect(can(author, "article.edit.own")).toBe(false);
    expect(can(author, "article.edit.own", { ownerId: null })).toBe(false);
  });

  it("editor can edit any article regardless of ownership", () => {
    expect(can(editor, "article.edit.own", { ownerId: "u-other" })).toBe(true);
  });
});

describe("privilege separation", () => {
  it("only super admin can purge permanently", () => {
    const withPurge = PERMISSIONS.filter((p) => {
      if (p !== "article.purge") return false;
      return true;
    });
    expect(withPurge).toHaveLength(1);
    expect(can(superAdmin, "article.purge")).toBe(true);
    expect(can(admin, "article.purge")).toBe(false);
    expect(can(editor, "article.purge")).toBe(false);
    expect(can(author, "article.purge")).toBe(false);
  });

  it("only super admin approves production deployment", () => {
    expect(can(superAdmin, "deploy.approve.production")).toBe(true);
    expect(can(admin, "deploy.approve.production")).toBe(false);
  });

  it("only super admin manages roles, security and settings writes", () => {
    for (const p of ["role.manage", "security.manage", "settings.write", "billing.reconcile"] as const) {
      expect(can(superAdmin, p)).toBe(true);
      expect(can(admin, p)).toBe(false);
      expect(can(editor, p)).toBe(false);
    }
  });

  it("analyst is read-only", () => {
    const analystPermissions = ROLE_PERMISSIONS.analyst;
    for (const p of analystPermissions) {
      expect(p.startsWith("article.") || p.endsWith(".manage") || p === "settings.write").toBe(false);
    }
    expect(can(analyst, "article.publish")).toBe(false);
    expect(can(analyst, "settings.write")).toBe(false);
  });

  it("roles are additive without escalation", () => {
    const both = { userId: "u", roles: ["author", "analyst"] };
    expect(can(both, "article.publish")).toBe(false);
    expect(can(both, "article.create")).toBe(true);
    expect(can(both, "analytics.read")).toBe(true);
  });
});

describe("agent scope isolation", () => {
  const base: Omit<AgentPrincipal, "scopes"> = { agentId: "agent-1" };

  it("no agent scope overlaps with a human publish permission", () => {
    const humanPermissions: readonly string[] = PERMISSIONS;
    for (const scope of AGENT_SCOPES) {
      expect(humanPermissions).not.toContain(scope);
    }
  });

  it("agents cannot be granted publish, approve, or purge", () => {
    for (const forbidden of FORBIDDEN_AGENT_SCOPES) {
      expect(AGENT_SCOPES as readonly string[]).not.toContain(forbidden);
    }
    expect(validateAgentScopes(["articles:draft", "article.publish"]).ok).toBe(false);
    expect(validateAgentScopes(["article.publish"]).rejected).toEqual(["article.publish"]);
  });

  it("granted scope is allowed, ungranted scope denied", () => {
    const agent = { ...base, scopes: ["articles:draft"] };
    expect(agentCan(agent, "articles:draft")).toBe(true);
    expect(agentCan(agent, "articles:read")).toBe(false);
    expect(agentCan(agent, "jobs:run")).toBe(false);
  });

  it("forbidden scope is denied even if present in the stored list", () => {
    const compromised = { ...base, scopes: ["article.publish", "articles:draft"] };
    // @ts-expect-error simulating a tampered database row
    expect(agentCan(compromised, "article.publish")).toBe(false);
    expect(agentCan(compromised, "articles:draft")).toBe(true);
  });

  it("revoked agent is denied immediately", () => {
    const revoked = { ...base, scopes: ["articles:draft" as const], revokedAt: new Date() };
    expect(agentCan(revoked, "articles:draft")).toBe(false);
  });

  it("expired agent key is denied", () => {
    const now = new Date("2026-11-08T12:00:00Z");
    const expired = {
      ...base,
      scopes: ["articles:draft" as const],
      expiresAt: new Date("2026-11-08T11:59:59Z"),
    };
    const valid = {
      ...base,
      scopes: ["articles:draft" as const],
      expiresAt: new Date("2026-11-09T00:00:00Z"),
    };
    expect(agentCan(expired, "articles:draft", now)).toBe(false);
    expect(agentCan(valid, "articles:draft", now)).toBe(true);
  });

  it("validateAgentScopes accepts only known scopes", () => {
    const result = validateAgentScopes(["articles:read", "seo:suggest", "users:delete"]);
    expect(result.ok).toBe(false);
    expect(result.rejected).toEqual(["users:delete"]);
    expect(result.accepted).toEqual(["articles:read", "seo:suggest"]);
  });
});
