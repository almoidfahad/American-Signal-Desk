/**
 * Admin read queries.
 *
 * Every function here returns a `Result`, never a bare array. The distinction that matters
 * throughout the admin UI is between three states that look identical in a table:
 *
 *   not_configured  - there is no database; we never asked, so "0 rows" would be a lie
 *   error           - we asked and it failed; the operator needs the message
 *   ok              - we asked and this is the answer, even if the answer is empty
 *
 * Collapsing those three into an empty list is the single most common way an admin panel
 * starts lying to the person running it. Nothing here falls back to demo data.
 */

import { SERVICE_ENV_VARS, serviceClient } from "@/server/db/client";

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; state: "not_configured" | "error"; message: string };

export const NOT_CONFIGURED_ENV: readonly string[] = SERVICE_ENV_VARS;

const NOT_CONFIGURED = {
  ok: false,
  state: "not_configured",
  message: "No database is configured, so this list was never read.",
} as const;

function failed(scope: string, message: string): Result<never> {
  console.error(`[admin:${scope}] ${message}`);
  return { ok: false, state: "error", message };
}

/* -------------------------------------------------------------------------- */
/* Categories                                                                 */
/* -------------------------------------------------------------------------- */

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  isActive: boolean;
  sortOrder: number;
  articleCount: number | null;
}

export async function listCategories(): Promise<Result<CategoryRow[]>> {
  const db = serviceClient();
  if (!db) return NOT_CONFIGURED;

  const { data, error } = await db
    .from("categories")
    .select("id,slug,name,description,is_active,sort_order")
    .order("sort_order", { ascending: true });

  if (error) return failed("categories", error.message);

  // Counting articles per section is a second query because Supabase's embedded count on a
  // to-many join silently returns null for empty relations.
  const counts = await db.from("articles").select("category_id").neq("status", "trash");
  const tally = new Map<string, number>();
  if (!counts.error) {
    for (const row of counts.data ?? []) {
      const id = (row as { category_id: string | null }).category_id;
      if (id) tally.set(id, (tally.get(id) ?? 0) + 1);
    }
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      description: (row.description as string) ?? "",
      isActive: Boolean(row.is_active),
      sortOrder: Number(row.sort_order ?? 100),
      // null, not 0, when the count query itself failed.
      articleCount: counts.error ? null : (tally.get(row.id as string) ?? 0),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Users & roles                                                              */
/* -------------------------------------------------------------------------- */

export interface UserRow {
  id: string;
  email: string | null;
  displayName: string;
  status: string;
  mfaEnrolled: boolean;
  lastLoginAt: string | null;
  roles: string[];
}

export async function listUsers(limit = 100): Promise<Result<UserRow[]>> {
  const db = serviceClient();
  if (!db) return NOT_CONFIGURED;

  const { data: profiles, error } = await db
    .from("profiles")
    .select("id,email,display_name,status,mfa_enrolled,last_login_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return failed("users", error.message);

  const { data: roles, error: roleError } = await db.from("user_roles").select("user_id,role");
  if (roleError) return failed("users.roles", roleError.message);

  const byUser = new Map<string, string[]>();
  for (const row of roles ?? []) {
    const userId = (row as { user_id: string }).user_id;
    const list = byUser.get(userId) ?? [];
    list.push((row as { role: string }).role);
    byUser.set(userId, list);
  }

  return {
    ok: true,
    data: (profiles ?? []).map((row) => ({
      id: row.id as string,
      email: (row.email as string | null) ?? null,
      displayName: (row.display_name as string) ?? "Unnamed user",
      status: (row.status as string) ?? "active",
      mfaEnrolled: Boolean(row.mfa_enrolled),
      lastLoginAt: (row.last_login_at as string | null) ?? null,
      roles: byUser.get(row.id as string) ?? [],
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Media library                                                              */
/* -------------------------------------------------------------------------- */

export interface MediaRow {
  id: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  altText: string;
  credit: string | null;
  createdAt: string;
}

export async function listMedia(limit = 60): Promise<Result<MediaRow[]>> {
  const db = serviceClient();
  if (!db) return NOT_CONFIGURED;

  const { data, error } = await db
    .from("media_assets")
    .select("id,file_name,storage_path,mime_type,byte_size,width,height,alt_text,credit,created_at")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return failed("media", error.message);

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      fileName: row.file_name as string,
      storagePath: row.storage_path as string,
      mimeType: row.mime_type as string,
      byteSize: Number(row.byte_size ?? 0),
      width: (row.width as number | null) ?? null,
      height: (row.height as number | null) ?? null,
      altText: row.alt_text as string,
      credit: (row.credit as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

export interface AuditRow {
  id: number;
  occurredAt: string;
  actorType: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
}

export async function listAuditLog(limit = 100): Promise<Result<AuditRow[]>> {
  const db = serviceClient();
  if (!db) return NOT_CONFIGURED;

  const { data, error } = await db
    .from("audit_logs")
    .select("id,occurred_at,actor_type,action,resource_type,resource_id,outcome")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (error) return failed("audit", error.message);

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: Number(row.id),
      occurredAt: row.occurred_at as string,
      actorType: row.actor_type as string,
      action: row.action as string,
      resourceType: row.resource_type as string,
      resourceId: (row.resource_id as string | null) ?? null,
      outcome: row.outcome as string,
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* Corrections ledger (admin view)                                            */
/* -------------------------------------------------------------------------- */

export interface CorrectionRow {
  id: string;
  articleId: string;
  description: string;
  correction: string;
  isPublic: boolean;
  approvedAt: string | null;
  createdAt: string;
}

export async function listCorrections(limit = 50): Promise<Result<CorrectionRow[]>> {
  const db = serviceClient();
  if (!db) return NOT_CONFIGURED;

  const { data, error } = await db
    .from("corrections")
    .select("id,article_id,description,correction,is_public,approved_at,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return failed("corrections", error.message);

  return {
    ok: true,
    data: (data ?? []).map((row) => ({
      id: row.id as string,
      articleId: row.article_id as string,
      description: (row.description as string) ?? "",
      correction: (row.correction as string) ?? "",
      isPublic: Boolean(row.is_public),
      approvedAt: (row.approved_at as string | null) ?? null,
      createdAt: row.created_at as string,
    })),
  };
}
