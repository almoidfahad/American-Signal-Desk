import { newRequestId } from "@/server/http/respond";

/**
 * Liveness/readiness probe.
 *
 * Reports configuration presence honestly. It does NOT claim the database is healthy just
 * because credentials exist — `checks.database` stays "unknown" until the worker phase adds
 * a real verified probe. A health endpoint that lies is worse than none.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const requestId = newRequestId();
  const hasDbConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const hasRedisConfig = Boolean(process.env.REDIS_URL);

  return Response.json(
    {
      status: "ok",
      requestId,
      timestamp: new Date().toISOString(),
      checks: {
        web: { state: "ok", detail: "Serving requests" },
        database: {
          state: hasDbConfig ? "unknown" : "not_configured",
          detail: hasDbConfig
            ? "Credentials present; live probe not implemented yet"
            : "Supabase credentials missing",
        },
        redis: {
          state: hasRedisConfig ? "unknown" : "not_configured",
          detail: hasRedisConfig ? "REDIS_URL present; worker probe pending" : "REDIS_URL missing",
        },
      },
    },
    { headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}
