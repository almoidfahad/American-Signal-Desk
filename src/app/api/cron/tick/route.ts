import { timingSafeEqual, createHash } from "node:crypto";
import { serviceClient } from "@/server/db/client";
import { tick } from "@/server/jobs/runner";
import { apiError, newRequestId } from "@/server/http/respond";

/**
 * POST/GET /api/cron/tick — run one tick of the job queue.
 *
 * This is how the queue runs on a platform without a long-lived process: a scheduler calls
 * this endpoint, which does exactly one tick and returns. The same `tick()` is what a
 * long-lived worker would call in a loop, so there is one implementation of the behaviour
 * and two ways to drive it.
 *
 * Authentication is a shared secret in `CRON_SECRET`, compared in constant time. Vercel Cron
 * sends it as `Authorization: Bearer <secret>`; a manual call can use `?token=`. Failure is
 * a 401 with no detail — an endpoint that says "wrong secret" versus "no secret configured"
 * tells an attacker which one to work on.
 */
export const dynamic = "force-dynamic";

function secretMatches(provided: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !provided) return false;

  // Hash both sides first: timingSafeEqual throws on different lengths, and the length of
  // the secret should not be inferable from the response time either.
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function providedSecret(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return header.slice(7).trim();
  return new URL(request.url).searchParams.get("token");
}

async function run(request: Request): Promise<Response> {
  const requestId = newRequestId();

  if (!secretMatches(providedSecret(request))) {
    return apiError(401, "UNAUTHENTICATED", "Not authorised.", requestId);
  }

  if (!serviceClient()) {
    // Honest, and machine-readable: nothing ran, and the reason is configuration.
    return apiError(
      503,
      "NOT_CONFIGURED",
      "The job queue needs a database. Nothing ran.",
      requestId,
    );
  }

  const workerId = `cron:${process.env.VERCEL_REGION ?? "local"}:${requestId.slice(0, 8)}`;
  const result = await tick({ workerId });

  if (result.error) {
    return apiError(500, "INTERNAL", result.error, requestId);
  }

  // Small numbers only. The response is a health signal for the scheduler, not a report.
  return Response.json(
    { ok: true, requestId, ...result },
    { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}
