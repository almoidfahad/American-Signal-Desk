/**
 * Health computation, kept pure so it can be tested without booting a server.
 *
 * The rule this file exists to enforce: the top-level status must be derived from the
 * individual checks, never written as a constant. A probe that answers "ok" while its
 * database and cache are both unconfigured teaches a monitor to ignore it.
 *
 * Semantics:
 *   - "unhealthy"      our own process cannot serve traffic. Non-200.
 *   - "degraded"       we serve pages, but a dependency is not usable. Non-200, because a
 *                      liveness probe that returns 200 while the newsroom is missing
 *                      credentials hides exactly the outage operators care about.
 *   - "ok"             every dependency reported a healthy, verified state.
 *   - "not_ready"      provisional-but-honest: credentials exist but have not been
 *                      verified. We cannot claim "ok" for a dependency we never probed.
 *
 * `not_ready` is deliberately distinct from `degraded` so an operator can tell "misconfigured"
 * apart from "configured, unverified". Both are non-200.
 */

export type CheckState = "ok" | "unknown" | "not_configured";

export interface HealthCheck {
  state: CheckState;
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
}

export function computeHealth({ hasDatabaseConfig, hasRedisConfig }: HealthInput): HealthReport {
  const database: HealthCheck = hasDatabaseConfig
    ? { state: "unknown", detail: "Credentials present; live probe not implemented yet" }
    : { state: "not_configured", detail: "Supabase credentials missing" };

  const redis: HealthCheck = hasRedisConfig
    ? { state: "unknown", detail: "REDIS_URL present; worker probe pending" }
    : { state: "not_configured", detail: "REDIS_URL missing" };

  const dependencies = [database, redis];
  const anyMissing = dependencies.some((check) => check.state === "not_configured");
  const anyUnverified = dependencies.some((check) => check.state === "unknown");

  let status: HealthReport["status"];
  if (anyMissing) {
    status = "degraded";
  } else if (anyUnverified) {
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
