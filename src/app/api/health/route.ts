import { newRequestId } from "@/server/http/respond";
import { computeHealth } from "@/server/health/compute-health";
import { probeDatabase } from "@/server/health/probe-database";
import { hasServiceEnv, serviceClient } from "@/server/db/client";

/**
 * Readiness probe.
 *
 * Reports configuration presence honestly, then verifies the database with a real query:
 * `checks.database` becomes "ok" because a SELECT succeeded, never because credentials
 * exist. A health endpoint that lies is worse than none.
 *
 * The top-level status is derived from the checks (see compute-health.ts). While the
 * newsroom has no database configured this endpoint returns 503, so uptime monitoring
 * surfaces the configuration gap instead of painting the deployment green.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const client = serviceClient();
  const databaseProbe = client ? await probeDatabase(client) : undefined;
  const { status, httpStatus, checks } = computeHealth({
    // Asks the factory rather than re-deriving the rule: one definition of
    // "the database is configured", so the probe cannot disagree with the readers.
    hasDatabaseConfig: hasServiceEnv(),
    hasRedisConfig: Boolean(process.env.REDIS_URL),
    databaseProbe,
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
