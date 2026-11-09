import { serviceClient } from "@/server/db/client";
import { newsletterSchema } from "@/lib/validation/auth";
import { apiError, apiOk, apiFromError, newRequestId } from "@/server/http/respond";
import { clientIdentity, rateLimit, rateLimitHeaders } from "@/server/http/rate-limit";

/**
 * POST /api/v1/newsletter/subscribe
 *
 * Honest behaviour in this phase: if Supabase is not configured, return 503 with a clear
 * message. The endpoint never returns a fake "subscribed" success.
 */
export async function POST(request: Request) {
  const requestId = newRequestId();

  try {
    const PER_MINUTE = 5;
    const limit = await rateLimit({
      scope: "newsletter",
      identity: clientIdentity(request),
      limit: PER_MINUTE,
      windowMs: 60_000,
    });
    if (!limit.ok) {
      return apiError(429, "RATE_LIMITED", "Too many attempts. Try again in a minute.", requestId, {
        ...rateLimitHeaders(limit, PER_MINUTE),
        // Tells an operator whether this decision was global (database) or per-instance.
        "X-RateLimit-Scope": limit.source,
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

    // One function does the whole first half: record the pending subscription, issue (or
    // reuse) the confirmation token, and queue exactly one email. It has to be one call,
    // because "saved but no email queued" is the silent failure this endpoint used to have.
    const confirmUrl = new URL("/newsletter/confirm", request.url).toString();
    const siteName = process.env.NEXT_PUBLIC_SITE_NAME ?? "American Signal Desk";

    const { data, error } = await db.rpc("issue_newsletter_confirmation", {
      p_email: parsed.data.email,
      p_source: parsed.data.source ?? "website",
      p_confirm_url: confirmUrl,
      p_site_name: siteName,
    });

    if (error) {
      console.error(`[newsletter] requestId=${requestId} ${error.message}`);
      return apiError(500, "INTERNAL", "Could not save your subscription. Try again later.", requestId);
    }

    const row = (Array.isArray(data) ? data[0] : null) as { outcome?: string } | null;
    const outcome = row?.outcome ?? "queued";

    // The token is never returned. It travels in the email only, so a caller cannot
    // confirm an address they do not control.
    if (outcome === "already_confirmed") {
      return apiOk(
        {
          status: "already_confirmed",
          // Says plainly that nothing new was sent, rather than implying a fresh signup.
          message: "This address is already subscribed. No new email was sent.",
        },
        requestId,
        { status: 200 },
      );
    }

    // The email is queued by the same transaction that recorded the subscription; a worker
    // sends it. Reporting "pending_confirmation" is therefore a statement about the queue,
    // not a promise that mail has already left.
    return apiOk({ status: "pending_confirmation" }, requestId, { status: 202 });
  } catch (error) {
    return apiFromError(error, requestId);
  }
}
