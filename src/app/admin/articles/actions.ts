"use server";

/**
 * Editorial server actions.
 *
 * These are the only way the browser can change an article. They run on the server, resolve
 * the session themselves, and delegate every rule to the service layer — a caller cannot
 * influence the actor, the ownership or the permission set by crafting the request.
 *
 * Each action returns a plain serialisable result so the client can render an honest message
 * (in Bangla) instead of throwing into an error boundary.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Actor } from "@/server/authz/permissions";
import { getAdminSession } from "@/server/auth/session";
import { AuthorizationError } from "@/server/authz/permissions";
import {
  createDraft,
  transitionArticle,
  updateDraft,
  type ServiceErrorCode,
} from "@/server/editorial/service";
import { articleInputSchema, transitionInputSchema } from "@/lib/validation/article";
import type { ArticleStatus } from "@/server/editorial/workflow";

export interface ActionState {
  ok: boolean;
  message: string;
  /** Field-level errors, keyed by input name. */
  fieldErrors?: Record<string, string>;
  /** Redirect target on success. */
  redirectTo?: string;
}

/** Statuses that change what the public sees, and therefore invalidate the public cache. */
const PUBLIC_IMPACT: ReadonlySet<ArticleStatus> = new Set([
  "published",
  "archived",
  "trash",
  "draft",
  "approved",
  "scheduled",
]);

async function resolveActor(): Promise<Actor> {
  const session = await getAdminSession();
  if (!session) {
    throw new AuthorizationError("Authentication required");
  }
  return { userId: session.userId, roles: session.roles };
}

function translate(code: ServiceErrorCode): string {
  switch (code) {
    case "NOT_CONFIGURED":
      return "No database is configured. Nothing was saved.";
    case "FORBIDDEN":
      return "Your role does not permit this action.";
    case "NOT_FOUND":
      return "That article could not be found.";
    case "INVALID":
      return "Some details are not valid.";
    case "ILLEGAL_TRANSITION":
      return "That transition is not allowed from the current state.";
    case "CONFLICT":
      return "Someone else changed this article. Reload and try again.";
  }
}

function formToArticleInput(formData: FormData): Record<string, unknown> {
  const get = (key: string) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : undefined;
  };
  return {
    title: get("title"),
    slug: get("slug"),
    dek: get("dek") ?? "",
    bodyHtml: get("bodyHtml") ?? "",
    categoryId: get("categoryId") || null,
    heroImageUrl: get("heroImageUrl") || null,
    heroImageAlt: get("heroImageAlt") || null,
  };
}

/* -------------------------------------------------------------------------- */
/* Create a draft                                                             */
/* -------------------------------------------------------------------------- */
export async function createArticleAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const parsed = articleInputSchema.safeParse(formToArticleInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Some details are not valid.", fieldErrors };
  }

  const result = await createDraft(actor, parsed.data);
  if (!result.ok) return { ok: false, message: translate(result.code) };

  return {
    ok: true,
    message: "Draft saved.",
    redirectTo: `/admin/articles/${result.data.id}`,
  };
}

/* -------------------------------------------------------------------------- */
/* Save edits                                                                 */
/* -------------------------------------------------------------------------- */
export async function updateArticleAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "The article id is missing." };

  const parsed = articleInputSchema.partial().safeParse(formToArticleInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "Some details are not valid.", fieldErrors };
  }

  const result = await updateDraft(actor, id, parsed.data);
  if (!result.ok) return { ok: false, message: translate(result.code) };

  return { ok: true, message: "Changes saved." };
}

/* -------------------------------------------------------------------------- */
/* Lifecycle transition                                                       */
/* -------------------------------------------------------------------------- */
export async function transitionArticleAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  let actor: Actor;
  try {
    actor = await resolveActor();
  } catch {
    return { ok: false, message: "Your session has expired. Sign in again." };
  }

  const parsed = transitionInputSchema.safeParse({
    id: formData.get("id"),
    to: formData.get("to"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "That request is not valid." };
  }

  const result = await transitionArticle(actor, parsed.data.id, parsed.data.to as ArticleStatus, parsed.data.note);
  if (!result.ok) return { ok: false, message: translate(result.code) };

  /**
   * Publishing/archiving changes what the public can see, so the affected ISR pages are
   * revalidated — but only *after* the write succeeded. A failed transition must never
   * flush a healthy cache.
   *
   * Path-based revalidation is used rather than tag-based because the public pages are
   * ISR (`revalidate = 60`) — revalidatePath gives immediate read-your-own-writes, while
   * the 60s window remains the safety net if a flush is ever missed.
   */
  if (PUBLIC_IMPACT.has(parsed.data.to)) {
    const slug = result.data.slug;
    for (const path of ["/", `/article/${slug}`, "/sitemap.xml"]) {
      try {
        revalidatePath(path);
      } catch (error) {
        // Outside a request scope (e.g. a script) this can throw; logging is enough.
        console.error(`[revalidate] could not flush ${path}`, error);
      }
    }
  }

  const messages: Record<string, string> = {
    pending_review: "Sent for review.",
    approved: "Approved.",
    changes_requested: "Changes requested.",
    rejected: "Rejected.",
    published: "Published. It is now live on the public site.",
    scheduled: "Scheduled.",
    archived: "Archived and removed from the public site.",
    trash: "Moved to trash.",
    draft: "Returned to draft.",
  };

  return { ok: true, message: messages[parsed.data.to] ?? "Done." };
}

/* -------------------------------------------------------------------------- */
/* Sign out                                                                   */
/* -------------------------------------------------------------------------- */
export async function signOutAction(): Promise<void> {
  const { createServerClient } = await import("@supabase/ssr");
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) {
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          for (const { name, value, options } of toSet) {
            cookieStore.set(name, value, options);
          }
        },
      },
    });
    await supabase.auth.signOut();
  }

  redirect("/admin/login");
}
