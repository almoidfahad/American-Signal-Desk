import { newRequestId } from "@/server/http/respond";
import { computeHealth } from "@/server/health/compute-health";
import { hasServiceEnv } from "@/server/db/client";

/**
 * Readiness probe.
 *
 * Reports configuration presence honestly. It does NOT claim the database is healthy just
 * because credentials exist — `checks.database` stays "unknown" until the worker phase adds
 * a real verified probe. A health endpoint that lies is worse than none.
 *
 * The top-level status is derived from the checks (see compute-health.ts). While the
 * newsroom has no database or cache configured this endpoint returns 503, so uptime
 * monitoring surfaces the configuration gap instead of painting the deployment green.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const { status, httpStatus, checks } = computeHealth({
    // Asks the factory rather than re-deriving the rule: one definition of
    // "the database is configured", so the probe cannot disagree with the readers.
    hasDatabaseConfig: hasServiceEnv(),
    hasRedisConfig: Boolean(process.env.REDIS_URL),
  });

  return Response.json(
    {
      status,
      requestId,
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: httpStatus, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}
