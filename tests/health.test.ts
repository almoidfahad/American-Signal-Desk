import { describe, expect, it } from "vitest";
import { computeHealth } from "@/server/health/compute-health";

/**
 * Regression net for the health endpoint.
 *
 * The bug these tests exist for: the endpoint returned a hardcoded `status: "ok"` while both
 * dependencies reported `not_configured`. Uptime monitors keyed on that field would have
 * shown a green deployment for a newsroom with no database. The first test below would have
 * failed against the old implementation.
 */
describe("health computation", () => {
  it("does not report ok when every dependency is unconfigured", () => {
    const report = computeHealth({ hasDatabaseConfig: false, hasRedisConfig: false });
    expect(report.status).not.toBe("ok");
    expect(report.status).toBe("degraded");
  });

  it("returns a non-200 status when degraded, so a monitor cannot miss it", () => {
    const report = computeHealth({ hasDatabaseConfig: false, hasRedisConfig: false });
    expect(report.httpStatus).toBe(503);
  });

  it("names the missing variable for each unconfigured dependency", () => {
    const report = computeHealth({ hasDatabaseConfig: false, hasRedisConfig: false });
    expect(report.checks.database.state).toBe("not_configured");
    expect(report.checks.database.detail).toMatch(/Supabase/i);
    expect(report.checks.redis.state).toBe("not_configured");
    expect(report.checks.redis.detail).toMatch(/REDIS_URL/);
  });

  it("reports the web process itself as serving while dependencies are down", () => {
    const report = computeHealth({ hasDatabaseConfig: false, hasRedisConfig: false });
    expect(report.checks.web.state).toBe("ok");
  });

  it("refuses to claim ok for a dependency whose credentials were never probed", () => {
    const report = computeHealth({ hasDatabaseConfig: true, hasRedisConfig: true });
    expect(report.status).toBe("not_ready");
    expect(report.httpStatus).toBe(503);
    expect(report.checks.database.state).toBe("unknown");
    expect(report.checks.redis.state).toBe("unknown");
  });

  it("separates misconfiguration from unverified configuration", () => {
    const missing = computeHealth({ hasDatabaseConfig: false, hasRedisConfig: true });
    const unverified = computeHealth({ hasDatabaseConfig: true, hasRedisConfig: true });
    expect(missing.status).toBe("degraded");
    expect(unverified.status).toBe("not_ready");
    expect(missing.status).not.toBe(unverified.status);
  });

  it("returns 200 only when every check is genuinely ok", () => {
    // Reaching "ok" requires a state this module cannot produce yet, by design: nothing here
    // fabricates an "ok" check. This asserts the coupling rather than the current value.
    const report = computeHealth({ hasDatabaseConfig: true, hasRedisConfig: true });
    const allOk = Object.values(report.checks).every((check) => check.state === "ok");
    expect(report.status === "ok").toBe(allOk);
    expect(report.httpStatus).toBe(allOk ? 200 : 503);
  });
});
