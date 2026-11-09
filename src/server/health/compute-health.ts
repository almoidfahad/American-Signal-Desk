/**
 * Health computation, kept pure so it can be tested without booting a server.
 *
 * The rule this file exists to enforce: the top-level status must be derived from the
 * individual checks, never written as a constant. A probe that answers "ok" while its
 * database and cache are both unconfigured teaches a monitor to ignore it.
 *
 * Semantics:
 *   - "unhealthy"      our own process cannot serve traffic. Non-200.
 *   - "degraded"       we serve pages, but a dependency is not usable: a required
 *                      dependency is missing or failed its probe. Non-200, because a
 *                      liveness probe that returns 200 while the newsroom is missing
 *                      credentials hides exactly the outage operators care about.
 *   - "ok"             every required dependency is verified healthy, and every optional
 *                      one is verified or deliberately absent.
 *   - "not_ready"      provisional-but-honest: credentials exist but have not been
 *                      verified. We cannot claim "ok" for a dependency we never probed.
 *
 * `not_ready` is deliberately distinct from `degraded` so an operator can tell "misconfigured"
 * apart from "configured, unverified". Both are non-200.
 *
 * The database is required. Redis is optional: with no REDIS_URL the job queue runs in
 * Postgres polling mode (see src/server/jobs), so an absent cache is a deployment choice,
 * not a dependency that is unusable — it must not keep a healthy newsroom at 503.
 */

export type CheckState = "ok" | "unknown" | "error" | "not_configured";

export interface HealthCheck {
  state: CheckState;
  detail: string;
}

export interface ProbeResult {
  ok: boolean;
  detail: string;
}

export interface HealthReport {
  status: "ok" | "degraded" | "not_ready" | "unhealthy";
  httpStatus: 200 | 503;
  checks: {
    web: HealthCheck;
    database: HealthCheck;
    redis: HealthCheck;
  };
}

export interface HealthInput {
  hasDatabaseConfig: boolean;
  hasRedisConfig: boolean;
  /** Result of a real database probe. Absent = never probed. Ignored when no config exists. */
  databaseProbe?: ProbeResult;
}

export function computeHealth({ hasDatabaseConfig, hasRedisConfig, databaseProbe }: HealthInput): HealthReport {
  const database: HealthCheck = !hasDatabaseConfig
    ? { state: "not_configured", detail: "Supabase credentials missing" }
    : !databaseProbe
      ? { state: "unknown", detail: "Credentials present; live probe not run" }
      : databaseProbe.ok
        ? { state: "ok", detail: databaseProbe.detail }
        : { state: "error", detail: databaseProbe.detail };

  const redis: HealthCheck = hasRedisConfig
    ? { state: "unknown", detail: "REDIS_URL present; worker probe pending" }
    : { state: "not_configured", detail: "REDIS_URL missing" };

  // The database is the required dependency; the cache is optional (polling mode).
  // A configured-but-unverified optional dependency still holds us at not_ready, and a
  // configured optional dependency that fails its probe is still a real degradation.
  let status: HealthReport["status"];
  if (database.state === "not_configured" || database.state === "error") {
    status = "degraded";
  } else if (database.state === "unknown") {
    status = "not_ready";
  } else if (redis.state === "error") {
    status = "degraded";
  } else if (redis.state === "unknown") {
    status = "not_ready";
  } else {
    status = "ok";
  }

  return {
    status,
    httpStatus: status === "ok" ? 200 : 503,
    checks: {
      web: { state: "ok", detail: "Serving requests" },
      database,
      redis,
    },
  };
}
