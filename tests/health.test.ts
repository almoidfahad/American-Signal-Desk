import { describe, expect, it, vi, afterEach } from "vitest";
import { computeHealth } from "@/server/health/compute-health";
import { probeDatabase } from "@/server/health/probe-database";
import type { ServiceClient } from "@/server/db/client";

/**
 * Regression net for the health endpoint.
 *
 * The bug these tests exist for: the endpoint returned a hardcoded `status: "ok"` while both
 * dependencies reported `not_configured`. Uptime monitors keyed on that field would have
 * shown a green deployment for a newsroom with no database. The first test below would have
 * failed against the old implementation.
 *
 * The route-wiring suite exists for the second lie: an endpoint can compute an honest report
 * and still pass "credentials exist" as if it were a probe. The wiring is exercised against a
 * mocked client, so "ok" can only appear when a query actually succeeded.
 */

const dbMock = vi.hoisted(() => ({
  hasServiceEnv: (): boolean => false,
  serviceClient: (): unknown => null,
}));

vi.mock("@/server/db/client", () => ({
  hasServiceEnv: () => dbMock.hasServiceEnv(),
  serviceClient: () => dbMock.serviceClient(),
}));

function fakeClient(result: { count: number | null; error: { message: string } | null }): ServiceClient {
  return { from: () => ({ select: () => Promise.resolve(result) }) } as unknown as ServiceClient;
}

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
    // The coupling, not a constant: nothing here fabricates an "ok" check. With the real
    // probe wired in, "ok" is reachable only through a database query that succeeded.
    const report = computeHealth({ hasDatabaseConfig: true, hasRedisConfig: true });
    const allOk = Object.values(report.checks).every((check) => check.state === "ok");
    expect(report.status === "ok").toBe(allOk);
    expect(report.httpStatus).toBe(allOk ? 200 : 503);
  });

  it("reports ok and 200 once the database probe verifies, even without optional Redis", () => {
    const report = computeHealth({
      hasDatabaseConfig: true,
      hasRedisConfig: false,
      databaseProbe: { ok: true, detail: "Probe verified: articles reachable (0 rows)" },
    });
    expect(report.status).toBe("ok");
    expect(report.httpStatus).toBe(200);
    expect(report.checks.database.state).toBe("ok");
    expect(report.checks.redis.state).toBe("not_configured");
  });

  it("treats a failed database probe as degraded, not as unverified", () => {
    const report = computeHealth({
      hasDatabaseConfig: true,
      hasRedisConfig: false,
      databaseProbe: { ok: false, detail: "Probe failed: connection refused" },
    });
    expect(report.status).toBe("degraded");
    expect(report.httpStatus).toBe(503);
    expect(report.checks.database.state).toBe("error");
    expect(report.checks.database.detail).toMatch(/connection refused/);
  });

  it("keeps a configured-but-unprobed cache at not_ready even when the database verified", () => {
    const report = computeHealth({
      hasDatabaseConfig: true,
      hasRedisConfig: true,
      databaseProbe: { ok: true, detail: "Probe verified" },
    });
    expect(report.status).toBe("not_ready");
    expect(report.httpStatus).toBe(503);
    expect(report.checks.redis.state).toBe("unknown");
  });

  it("ignores a probe result when no database is configured", () => {
    const report = computeHealth({
      hasDatabaseConfig: false,
      hasRedisConfig: false,
      databaseProbe: { ok: true, detail: "Probe verified" },
    });
    expect(report.checks.database.state).toBe("not_configured");
    expect(report.status).toBe("degraded");
  });
});

describe("database probe", () => {
  it("verifies reachability with a real count query", async () => {
    const outcome = await probeDatabase(fakeClient({ count: 7, error: null }));
    expect(outcome.ok).toBe(true);
    expect(outcome.detail).toContain("7 rows");
  });

  it("reports a query error as a failed probe", async () => {
    const outcome = await probeDatabase(fakeClient({ count: null, error: { message: "boom" } }));
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toMatch(/boom/);
  });

  it("reports a thrown client error as a failed probe", async () => {
    const throwing = {
      from: () => ({ select: () => Promise.reject(new Error("socket hang up")) }),
    } as unknown as ServiceClient;
    const outcome = await probeDatabase(throwing);
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toMatch(/socket hang up/);
  });

  it("gives up after the timeout instead of hanging the endpoint", async () => {
    const never = { from: () => ({ select: () => new Promise(() => {}) }) } as unknown as ServiceClient;
    const outcome = await probeDatabase(never, 10);
    expect(outcome.ok).toBe(false);
    expect(outcome.detail).toMatch(/timed out/i);
  });
});

describe("health route wiring", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 200 only because the database probe actually verified", async () => {
    vi.stubEnv("REDIS_URL", "");
    dbMock.hasServiceEnv = () => true;
    dbMock.serviceClient = () => fakeClient({ count: 0, error: null });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.checks.database.state).toBe("ok");
    expect(body.checks.database.detail).toMatch(/Probe verified/);
    expect(body.checks.web.state).toBe("ok");
  });

  it("returns 503 degraded when the probe fails, and says why", async () => {
    vi.stubEnv("REDIS_URL", "");
    dbMock.hasServiceEnv = () => true;
    dbMock.serviceClient = () => fakeClient({ count: null, error: { message: "relation articles does not exist" } });
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.database.state).toBe("error");
    expect(body.checks.database.detail).toMatch(/does not exist/);
  });

  it("returns 503 with not_configured when there are no credentials to probe", async () => {
    vi.stubEnv("REDIS_URL", "");
    dbMock.hasServiceEnv = () => false;
    dbMock.serviceClient = () => null;
    const { GET } = await import("@/app/api/health/route");
    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("degraded");
    expect(body.checks.database.state).toBe("not_configured");
  });
});
