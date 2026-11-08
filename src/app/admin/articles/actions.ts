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
      return "ডেটাবেস কনফিগার করা নেই। কিছুই সংরক্ষণ হয়নি।";
    case "FORBIDDEN":
      return "এই কাজটি করার অনুমতি আপনার নেই।";
    case "NOT_FOUND":
      return "লেখাটি পাওয়া যায়নি।";
    case "INVALID":
      return "তথ্যগুলো সঠিক নয়।";
    case "ILLEGAL_TRANSITION":
      return "এই ধাপটি অনুমোদিত নয়।";
    case "CONFLICT":
      return "একটি সংঘর্ষ হয়েছে। আবার চেষ্টা করুন।";
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
    return { ok: false, message: "সেশন শেষ হয়ে গেছে। আবার সাইন ইন করুন।" };
  }

  const parsed = articleInputSchema.safeParse(formToArticleInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "কিছু তথ্য সঠিক নয়।", fieldErrors };
  }

  const result = await createDraft(actor, parsed.data);
  if (!result.ok) return { ok: false, message: translate(result.code) };

  return {
    ok: true,
    message: "ড্রাফট সংরক্ষিত হয়েছে।",
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
    return { ok: false, message: "সেশন শেষ হয়ে গেছে। আবার সাইন ইন করুন।" };
  }

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, message: "লেখার আইডি পাওয়া যায়নি।" };

  const parsed = articleInputSchema.partial().safeParse(formToArticleInput(formData));
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, message: "কিছু তথ্য সঠিক নয়।", fieldErrors };
  }

  const result = await updateDraft(actor, id, parsed.data);
  if (!result.ok) return { ok: false, message: translate(result.code) };

  return { ok: true, message: "পরিবর্তন সংরক্ষিত হয়েছে।" };
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
    return { ok: false, message: "সেশন শেষ হয়ে গেছে। আবার সাইন ইন করুন।" };
  }

  const parsed = transitionInputSchema.safeParse({
    id: formData.get("id"),
    to: formData.get("to"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "অনুরোধটি সঠিক নয়।" };
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
    pending_review: "রিভিউয়ের জন্য পাঠানো হয়েছে।",
    approved: "অনুমোদিত হয়েছে।",
    changes_requested: "পরিবর্তনের অনুরোধ পাঠানো হয়েছে।",
    rejected: "প্রত্যাখ্যাত হয়েছে।",
    published: "প্রকাশিত হয়েছে। পাবলিক সাইটে এখন দৃশ্যমান।",
    scheduled: "শিডিউল করা হয়েছে।",
    archived: "আর্কাইভ করা হয়েছে এবং পাবলিক সাইট থেকে সরানো হয়েছে।",
    trash: "ট্র্যাশে সরানো হয়েছে।",
    draft: "ড্রাফটে ফিরিয়ে আনা হয়েছে।",
  };

  return { ok: true, message: messages[parsed.data.to] ?? "সম্পন্ন হয়েছে।" };
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
