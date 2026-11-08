/**
 * Authorization core — pure functions, no I/O, fully unit-tested.
 *
 * Design decisions:
 *  - Deny by default. An unknown permission is denied, never allowed.
 *  - Human permissions and agent scopes live in *disjoint namespaces*. There is deliberately
 *    no agent scope that maps to `article.publish`: an agent can never publish, by construction,
 *    not merely by configuration.
 *  - Every check is a server-side call into this module. Hiding a button is not authorization.
 */

/** Every capability a human account can hold. */
export const PERMISSIONS = [
  // Editorial
  "article.create",
  "article.edit.own",
  "article.edit.any",
  "article.submit",
  "article.review",
  "article.approve",
  "article.publish",
  "article.unpublish",
  "article.schedule",
  "article.delete",
  "article.purge",
  "article.restore",
  "category.manage",
  "tag.manage",
  "media.upload",
  "media.delete",
  "comment.moderate",

  // Users & roles
  "user.read",
  "user.invite",
  "user.manage",
  "role.manage",

  // Platform
  "settings.read",
  "settings.write",
  "newsletter.manage",
  "ads.manage",
  "analytics.read",
  "audit.read",
  "security.read",
  "security.manage",

  // AI / agents / API
  "agent.read",
  "agent.manage",
  "agent.revoke",
  "apikey.read",
  "apikey.manage",
  "job.read",
  "job.retry",
  "job.cancel",

  // Credits & billing
  "credit.read",
  "credit.grant",
  "billing.reconcile",

  // Deployment
  "deploy.request",
  "deploy.approve.preview",
  "deploy.approve.production",
  "deploy.rollback",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLES = ["super_admin", "admin", "editor", "author", "analyst"] as const;
export type Role = (typeof ROLES)[number];

/**
 * Baseline role → permission matrix.
 *
 * Least privilege: an Author cannot approve, publish, unpublish or delete anything
 * they do not own. Only Super Admin can purge permanently, manage roles, or approve
 * production deployment.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  super_admin: PERMISSIONS, // full set, still audited on every privileged action

  admin: [
    "article.create",
    "article.edit.any",
    "article.submit",
    "article.review",
    "article.approve",
    "article.publish",
    "article.unpublish",
    "article.schedule",
    "article.delete",
    "article.restore",
    "category.manage",
    "tag.manage",
    "media.upload",
    "media.delete",
    "comment.moderate",
    "user.read",
    "user.invite",
    "user.manage",
    "settings.read",
    "newsletter.manage",
    "ads.manage",
    "analytics.read",
    "audit.read",
    "security.read",
    "agent.read",
    "agent.manage",
    "agent.revoke",
    "apikey.read",
    "apikey.manage",
    "job.read",
    "job.retry",
    "job.cancel",
    "credit.read",
    "deploy.request",
    "deploy.approve.preview",
  ],

  editor: [
    "article.create",
    "article.edit.own",
    "article.edit.any",
    "article.submit",
    "article.review",
    "article.approve",
    "article.publish",
    "article.unpublish",
    "article.schedule",
    "article.delete",
    "article.restore",
    "category.manage",
    "tag.manage",
    "media.upload",
    "comment.moderate",
    "user.read",
    "analytics.read",
    "agent.read",
    "job.read",
    "audit.read",
  ],

  author: [
    "article.create",
    "article.edit.own",
    "article.submit",
    "media.upload",
    "analytics.read",
  ],

  analyst: ["user.read", "analytics.read", "audit.read", "agent.read", "job.read", "credit.read"],
};

/* -------------------------------------------------------------------------- */
/* Agent scopes — a separate namespace with no path to publishing.            */
/* -------------------------------------------------------------------------- */

export const AGENT_SCOPES = [
  "articles:read",
  "articles:draft",
  "sources:collect",
  "seo:suggest",
  "translate:draft",
  "media:read",
  "jobs:run",
  "repo:read",
  "deploy:request",
] as const;

export type AgentScope = (typeof AGENT_SCOPES)[number];

/**
 * Scopes that can never be granted to an agent, even if a caller asks for them.
 * Enforced at key creation and re-checked at every request.
 */
export const FORBIDDEN_AGENT_SCOPES: readonly string[] = [
  "article.publish",
  "article.approve",
  "article.delete",
  "article.purge",
  "user.manage",
  "role.manage",
  "settings.write",
  "security.manage",
  "apikey.manage",
  "billing.reconcile",
  "deploy.approve.production",
  "deploy.approve.preview",
  "credit.grant",
];

export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN" as const;
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

const permissionSets = new Map<Role, ReadonlySet<Permission>>(
  (Object.entries(ROLE_PERMISSIONS) as [Role, readonly Permission[]][]).map(([role, perms]) => [
    role,
    new Set(perms),
  ]),
);

export function isPermission(value: string): value is Permission {
  return (PERMISSIONS as readonly string[]).includes(value);
}

export function isRole(value: string): value is Role {
  return (ROLES as readonly string[]).includes(value);
}

export function isAgentScope(value: string): value is AgentScope {
  return (AGENT_SCOPES as readonly string[]).includes(value);
}

/** Union of permissions for a set of roles. Unknown roles contribute nothing. */
export function permissionsForRoles(roles: readonly string[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    if (!isRole(role)) continue; // unknown role → no permissions (deny by default)
    for (const p of permissionSets.get(role) ?? []) result.add(p);
  }
  return result;
}

export interface Actor {
  readonly userId: string;
  readonly roles: readonly string[];
}

/**
 * The single human-authorization entry point.
 *
 * `resource` lets ownership-sensitive permissions (`article.edit.own`) be evaluated
 * without pushing that logic into route handlers.
 */
export function can(
  actor: Actor,
  permission: Permission,
  resource?: { ownerId?: string | null },
): boolean {
  if (!actor.userId) return false; // unauthenticated
  if (!isPermission(permission)) return false; // unknown permission → deny

  const granted = permissionsForRoles(actor.roles);

  if (permission === "article.edit.own") {
    // 'own' is satisfied either by edit.any or by true ownership.
    if (granted.has("article.edit.any")) return true;
    if (!resource?.ownerId) return false; // missing ownership info → deny
    return resource.ownerId === actor.userId && granted.has("article.edit.own");
  }

  return granted.has(permission);
}

/** Throwing variant for service-layer use. */
export function requirePermission(
  actor: Actor,
  permission: Permission,
  resource?: { ownerId?: string | null },
): void {
  if (!can(actor, permission, resource)) {
    throw new AuthorizationError(`Missing permission: ${permission}`);
  }
}

/* -------------------------------------------------------------------------- */
/* Agent authorization                                                        */
/* -------------------------------------------------------------------------- */

export interface AgentPrincipal {
  readonly agentId: string;
  readonly scopes: readonly string[];
  /** Keys issued before this instant are rejected regardless of DB state. */
  readonly revokedAt?: Date | null;
  readonly expiresAt?: Date | null;
}

/**
 * Agents are authorized *only* by scope, and only for scopes in the agent namespace.
 * A human permission string can never satisfy an agent check.
 */
export function agentCan(agent: AgentPrincipal, scope: AgentScope, now = new Date()): boolean {
  if (agent.revokedAt) return false;
  if (agent.expiresAt && agent.expiresAt.getTime() <= now.getTime()) return false;
  if (FORBIDDEN_AGENT_SCOPES.includes(scope)) return false;
  if (!isAgentScope(scope)) return false;
  return agent.scopes.includes(scope);
}

/**
 * Validates a requested scope list before it is stored on an API key or agent.
 * Returns the offending scopes so the caller can produce an honest error message.
 */
export function validateAgentScopes(requested: readonly string[]): {
  ok: boolean;
  rejected: string[];
  accepted: AgentScope[];
} {
  const rejected: string[] = [];
  const accepted: AgentScope[] = [];
  for (const scope of requested) {
    if (FORBIDDEN_AGENT_SCOPES.includes(scope) || !isAgentScope(scope)) {
      rejected.push(scope);
    } else {
      accepted.push(scope);
    }
  }
  return { ok: rejected.length === 0, rejected, accepted };
}
