import { serviceClient } from "@/server/db/client";
import { newsletterSchema } from "@/lib/validation/auth";
import { apiError, apiOk, apiFromError, clientKey, newRequestId, rateLimit } from "@/server/http/respond";

/**
 * POST /api/v1/newsletter/subscribe
 *
 * Honest behaviour in this phase: if Supabase is not configured, return 503 with a clear
 * message. The endpoint never returns a fake "subscribed" success.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const limit = rateLimit(clientKey(request, "newsletter"), 5, 60_000);
    if (!limit.ok) {
      return apiError(429, "RATE_LIMITED", "Too many attempts. Try again in a minute.", requestId, {
        "Retry-After": String(Math.ceil((limit.resetAt - Date.now()) / 1000)),
      });
    }

    const contentType = request.headers.get("content-type") ?? "";
    let payload: unknown;
    if (contentType.includes("application/json")) {
      payload = await request.json().catch(() => null);
    } else {
      const form = await request.formData().catch(() => null);
      payload = form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : null;
    }

    const parsed = newsletterSchema.safeParse(payload);
    if (!parsed.success) {
      return apiError(
        422,
        "VALIDATION",
        parsed.error.issues[0]?.message ?? "Check the submitted details.",
        requestId,
      );
    }

    // The service-role client: writing a subscription is not something an anonymous
    // caller may do directly, and the table has no public INSERT policy.
    const db = serviceClient();
    if (!db) {
      return apiError(
        503,
        "NOT_CONFIGURED",
        "Newsletter subscriptions are not connected yet. Nothing was saved.",
        requestId,
      );
    }

    // Idempotent: a repeat submission of the same address does not create a duplicate row.
    const { error } = await db.from("newsletter_subscriptions").upsert(
      {
        email: parsed.data.email,
        source: parsed.data.source ?? "website",
        status: "pending",
      },
      { onConflict: "email", ignoreDuplicates: false },
    );

    if (error) {
      console.error(`[newsletter] requestId=${requestId} ${error.message}`);
      return apiError(500, "INTERNAL", "Could not save your subscription. Try again later.", requestId);
    }

    // Double opt-in: the confirmation email is sent by a worker, not inline.
    return apiOk({ status: "pending_confirmation" }, requestId, { status: 202 });
  } catch (error) {
    return apiFromError(error, requestId);
  }
}
