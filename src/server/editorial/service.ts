/**
 * Editorial service layer.
 *
 * Every article write goes through here. Route handlers and server actions never touch the
 * `articles` table directly, so the authorization rules cannot be forgotten in one place and
 * remembered in another.
 *
 * Enforcement is layered on purpose:
 *   1. here — permission + transition legality + ownership, in TypeScript, unit-tested;
 *   2. RLS — row visibility and edit rights;
 *   3. trigger (migration 0003) — refuses an unauthorised *status* change even if 1 and 2
 *      are bypassed by a direct API call.
 *
 * If the database is not configured, mutations fail explicitly. There is no in-memory
 * pretend-CMS: a "saved" article that was never persisted would be the worst possible lie.
 */
import { serviceClient, type ServiceClient } from "@/server/db/client";
import {
  AuthorizationError,
  can,
  permissionsForRoles,
  type Actor,
} from "@/server/authz/permissions";
import {
  canTransition,
  denialReason,
  isArticleStatus,
  permissionForStatus,
  type ArticleStatus,
} from "@/server/editorial/workflow";
import { readingTimeMinutes } from "@/server/editorial/reading-time";
import { articleInputSchema, type ArticleInput } from "@/lib/validation/article";

export interface ArticleRecord {
  id: string;
  slug: string;
  title: string;
  dek: string;
  bodyHtml: string;
  status: ArticleStatus;
  createdBy: string | null;
  publishAt: string | null;
  updatedAt: string | null;
  categoryId: string | null;
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ServiceErrorCode; message: string };

export type ServiceErrorCode =
  | "NOT_CONFIGURED"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID"
  | "ILLEGAL_TRANSITION"
  | "CONFLICT";

const NOT_CONFIGURED: ServiceResult<never> = {
  ok: false,
  code: "NOT_CONFIGURED",
  message:
    "No newsroom database is configured. Nothing was saved.",
};

/**
 * Audits a privileged action. Failures here are logged, not swallowed silently, but they do
 * not roll back a successful business operation — the database trigger records status changes
 * independently, so a logging hiccup cannot erase the trail entirely.
 */
async function writeAudit(
  db: ServiceClient,
  actor: Actor,
  action: string,
  articleId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("audit_logs").insert({
    actor_id: actor.userId,
    actor_type: "user",
    action,
    resource_type: "article",
    resource_id: articleId,
    outcome: "success",
    metadata,
  });
  if (error) {
    console.error(`[audit] failed to record ${action} for ${articleId}: ${error.message}`);
  }
}

function rowToRecord(row: Record<string, unknown>): ArticleRecord {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    dek: (row.dek as string) ?? "",
    bodyHtml: (row.body_html as string) ?? "",
    status: row.status as ArticleStatus,
    createdBy: (row.created_by as string | null) ?? null,
    publishAt: (row.publish_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    categoryId: (row.category_id as string | null) ?? null,
  };
}

/** Loads an article the caller is allowed to see, or null. */
export async function getArticleForEditing(
  actor: Actor,
  id: string,
): Promise<ServiceResult<ArticleRecord>> {
  const db = serviceClient();
  if (!db) return NOT_CONFIGURED as ServiceResult<ArticleRecord>;

  const { data, error } = await db
    .from("articles")
    .select("id,slug,title,dek,body_html,status,created_by,publish_at,updated_at,category_id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error(`[editorial] load failed: ${error.message}`);
    return { ok: false, code: "CONFLICT", message: "The article could not be loaded." };
  }
  if (!data) return { ok: false, code: "NOT_FOUND", message: "The article was not found." };

  const record = rowToRecord(data);
  const isOwner = record.createdBy === actor.userId;
  const canRead = can(actor, "article.review") || can(actor, "article.edit.any") || isOwner;

  if (!canRead) return { ok: false, code: "FORBIDDEN", message: "You do not have permission to view this article." };
  return { ok: true, data: record };
}

/**
 * Creates a draft. The author of record is always the caller — never a client-supplied id,
 * which would allow attributing work to someone else.
 */
export async function createDraft(
  actor: Actor,
  input: unknown,
): Promise<ServiceResult<ArticleRecord>> {
  if (!can(actor, "article.create")) {
    return { ok: false, code: "FORBIDDEN", message: "You do not have permission to create articles." };
  }

  const parsed = articleInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID",
      message: parsed.error.issues[0]?.message ?? "Those details are not valid.",
    };
  }

  const db = serviceClient();
  if (!db) return NOT_CONFIGURED as ServiceResult<ArticleRecord>;

  const { data, error } = await db
    .from("articles")
    .insert({
      slug: parsed.data.slug,
      title: parsed.data.title,
      dek: parsed.data.dek,
      body_html: parsed.data.bodyHtml,
      category_id: parsed.data.categoryId ?? null,
      status: "draft",
      created_by: actor.userId, // server-assigned, not from the client
      publish_at: null,
      reading_minutes: readingTimeMinutes(parsed.data.bodyHtml),
      hero_image_url: parsed.data.heroImageUrl ?? null,
      hero_image_alt: parsed.data.heroImageAlt ?? null,
      ai_assisted: false,
    })
    .select("id,slug,title,dek,body_html,status,created_by,publish_at,updated_at,category_id")
    .single();

  if (error) {
    // A duplicate slug is a user-fixable conflict, not a server fault.
    if (error.code === "23505") {
      return { ok: false, code: "CONFLICT", message: "That slug is already in use." };
    }
    console.error(`[editorial] create failed: ${error.message}`);
    return { ok: false, code: "CONFLICT", message: "The draft could not be saved." };
  }

  const record = rowToRecord(data);
  await writeAudit(db, actor, "article.created", record.id, { slug: record.slug });
  return { ok: true, data: record };
}

/** Updates editable fields of an owned draft. Status is not touched here. */
export async function updateDraft(
  actor: Actor,
  id: string,
  input: unknown,
): Promise<ServiceResult<ArticleRecord>> {
  const loaded = await getArticleForEditing(actor, id);
  if (!loaded.ok) return loaded;

  const article = loaded.data;

  if (!can(actor, "article.edit.own", { ownerId: article.createdBy })) {
    return { ok: false, code: "FORBIDDEN", message: "You do not have permission to edit this article." };
  }

  // Published copy must not be silently rewritten: that is how corrections get laundered.
  if (article.status === "published") {
    return {
      ok: false,
      code: "ILLEGAL_TRANSITION",
      message:
        "A published article cannot be edited in place. Return it to draft first so the correction is kept in the revision history.",
    };
  }

  const parsed = articleInputSchema.partial().safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "INVALID",
      message: parsed.error.issues[0]?.message ?? "Those details are not valid.",
    };
  }

  const db = serviceClient();
  if (!db) return NOT_CONFIGURED as ServiceResult<ArticleRecord>;

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.dek !== undefined) patch.dek = parsed.data.dek;
  if (parsed.data.bodyHtml !== undefined) {
    patch.body_html = parsed.data.bodyHtml;
    patch.reading_minutes = readingTimeMinutes(parsed.data.bodyHtml);
  }
  if (parsed.data.categoryId !== undefined) patch.category_id = parsed.data.categoryId;
  if (parsed.data.heroImageUrl !== undefined) patch.hero_image_url = parsed.data.heroImageUrl;
  if (parsed.data.heroImageAlt !== undefined) patch.hero_image_alt = parsed.data.heroImageAlt;

  if (Object.keys(patch).length === 0) return { ok: true, data: article };

  const { data, error } = await db
    .from("articles")
    .update(patch)
    .eq("id", id)
    .select("id,slug,title,dek,body_html,status,created_by,publish_at,updated_at,category_id")
    .single();

  if (error) {
    console.error(`[editorial] update failed: ${error.message}`);
    return { ok: false, code: "CONFLICT", message: "The changes could not be saved." };
  }

  const record = rowToRecord(data);
  await writeAudit(db, actor, "article.updated", id, { fields: Object.keys(patch) });
  return { ok: true, data: record };
}

/**
 * The single entry point for lifecycle changes.
 *
 * Checks, in order: permission → transition legality → ownership → status permission.
 * Only then writes, and only after the trigger has a chance to veto independently.
 */
export async function transitionArticle(
  actor: Actor,
  id: string,
  to: ArticleStatus,
  note?: string,
): Promise<ServiceResult<ArticleRecord>> {
  if (!isArticleStatus(to)) {
    return { ok: false, code: "INVALID", message: "Unknown status." };
  }

  const loaded = await getArticleForEditing(actor, id);
  if (!loaded.ok) return loaded;
  const article = loaded.data;

  const denial = denialReason(article.status, to, actor, article.createdBy);
  if (denial) {
    const illegal = !canTransition(article.status, to).ok;
    return {
      ok: false,
      code: illegal ? "ILLEGAL_TRANSITION" : "FORBIDDEN",
      message: denial,
    };
  }

  // The status itself requires a permission (edit rights alone are never enough to publish).
  const statusPermission = permissionForStatus(to);
  const granted = permissionsForRoles(actor.roles);
  const statusAllowed =
    statusPermission === "article.edit.own"
      ? granted.has("article.edit.own") || granted.has("article.edit.any")
      : granted.has(statusPermission);

  if (!statusAllowed) {
    return {
      ok: false,
      code: "FORBIDDEN",
      message: `You are not allowed to move the article to this status (${statusPermission}).`,
    };
  }

  const db = serviceClient();
  if (!db) return NOT_CONFIGURED as ServiceResult<ArticleRecord>;

  const patch: Record<string, unknown> = { status: to };

  if (to === "published") patch.publish_at = new Date().toISOString();
  if (to === "scheduled") {
    // Caller must have supplied a future publish time through updateDraft/schedule.
    if (!article.publishAt || new Date(article.publishAt).getTime() <= Date.now()) {
      return {
        ok: false,
        code: "INVALID",
        message: "Scheduling requires a publish time in the future.",
      };
    }
  }
  if (to === "trash") patch.deleted_at = new Date().toISOString();
  if (to === "draft") patch.deleted_at = null;

  const { data, error } = await db
    .from("articles")
    .update(patch)
    .eq("id", id)
    // Optimistic concurrency: the update only applies if the row is still in the state we
    // read. Two editors clicking "approve" cannot both win on stale data.
    .eq("status", article.status)
    .select("id,slug,title,dek,body_html,status,created_by,publish_at,updated_at,category_id")
    .maybeSingle();

  if (error) {
    console.error(`[editorial] transition failed: ${error.message}`);
    return { ok: false, code: "CONFLICT", message: "The status could not be changed." };
  }
  if (!data) {
    return {
      ok: false,
      code: "CONFLICT",
      message: "The article has already moved on. Refresh the page and try again.",
    };
  }

  const record = rowToRecord(data);
  await writeAudit(db, actor, "article.transition", id, {
    from: article.status,
    to,
    ...(note ? { note } : {}),
  });
  return { ok: true, data: record };
}

/** Articles visible to this actor, for the "Manage News" list. Read-only. */
export async function listArticlesForActor(
  actor: Actor,
  options: { status?: ArticleStatus | "all"; limit?: number } = {},
): Promise<ServiceResult<{ items: ArticleRecord[]; truncated: boolean }>> {
  const canSeeAll = can(actor, "article.review") || can(actor, "article.edit.any");
  if (!canSeeAll && !can(actor, "article.create")) {
    return { ok: false, code: "FORBIDDEN", message: "You do not have permission to view the article list." };
  }

  const db = serviceClient();
  if (!db) return NOT_CONFIGURED as ServiceResult<{ items: ArticleRecord[]; truncated: boolean }>;

  const limit = Math.min(options.limit ?? 25, 100);

  let query = db
    .from("articles")
    .select("id,slug,title,dek,body_html,status,created_by,publish_at,updated_at,category_id")
    .order("updated_at", { ascending: false })
    .limit(limit + 1);

  // An author without review rights sees only their own work — enforced here *and* by RLS.
  if (!canSeeAll) query = query.eq("created_by", actor.userId);
  if (options.status && options.status !== "all") query = query.eq("status", options.status);

  const { data, error } = await query;
  if (error) {
    console.error(`[editorial] list failed: ${error.message}`);
    return { ok: false, code: "CONFLICT", message: "The list could not be loaded." };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const truncated = rows.length > limit;
  return {
    ok: true,
    data: { items: rows.slice(0, limit).map(rowToRecord), truncated },
  };
}
