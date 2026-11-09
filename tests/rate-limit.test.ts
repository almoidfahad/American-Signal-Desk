import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  bucketKey,
  clientIdentity,
  rateLimit,
  rateLimitHeaders,
  resetMemoryLimiter,
} from "@/server/http/rate-limit";
import { resetClients } from "@/server/db/client";

const ROOT = resolve(__dirname, "..");

/**
 * The defect this file exists for: a module-level Map that looks like a rate limiter and
 * is not one on a serverless platform. These tests therefore assert the *source* of every
 * decision, not only the decision — "it returned 429" is worthless if the count lived in
 * one process.
 */

describe("rate limiting: identity never leaves the process raw", () => {
  it("hashes the identity, so no IP or email is stored", () => {
    const key = bucketKey("newsletter", "203.0.113.9");
    expect(key).toMatch(/^newsletter:[0-9a-f]{32}$/);
    expect(key).not.toContain("203.0.113.9");
  });

  it("is stable and collision-separated by scope", () => {
    expect(bucketKey("newsletter", "a")).toBe(bucketKey("newsletter", "a"));
    expect(bucketKey("newsletter", "a")).not.toBe(bucketKey("contact", "a"));
    expect(bucketKey("newsletter", "a")).not.toBe(bucketKey("newsletter", "b"));
  });

  it("reads the left-most forwarded address, then x-real-ip, then falls back", () => {
    const forwarded = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.9, 70.41.3.18" },
    });
    expect(clientIdentity(forwarded)).toBe("203.0.113.9");

    const realIp = new Request("https://x.test", { headers: { "x-real-ip": "198.51.100.7" } });
    expect(clientIdentity(realIp)).toBe("198.51.100.7");

    // No header: a constant, so total throughput is still bounded rather than unlimited.
    expect(clientIdentity(new Request("https://x.test"))).toBe("unknown");
  });
});

describe("rate limiting: without a database it degrades visibly", () => {
  beforeEach(() => {
    resetMemoryLimiter();
    resetClients();
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  });
  afterEach(() => vi.unstubAllEnvs());

  it("still limits, and says the guarantee is per-instance", async () => {
    const input = { scope: "newsletter", identity: "1.2.3.4", limit: 2, windowMs: 60_000 };

    const first = await rateLimit(input);
    expect(first.ok).toBe(true);
    expect(first.source).toBe("memory");

    expect((await rateLimit(input)).ok).toBe(true);

    const third = await rateLimit(input);
    expect(third.ok).toBe(false);
    expect(third.remaining).toBe(0);
    // The important assertion: the weaker guarantee is reported, not hidden.
    expect(third.source).toBe("memory");
  });

  it("keeps scopes independent in the fallback too", async () => {
    const base = { identity: "1.2.3.4", limit: 1, windowMs: 60_000 };
    expect((await rateLimit({ ...base, scope: "a" })).ok).toBe(true);
    expect((await rateLimit({ ...base, scope: "a" })).ok).toBe(false);
    expect((await rateLimit({ ...base, scope: "b" })).ok).toBe(true);
  });

  it("reports the limit, the remainder and a retry delay a client can act on", async () => {
    const input = { scope: "newsletter", identity: "9.9.9.9", limit: 1, windowMs: 60_000 };
    const first = await rateLimit(input);
    const headers = rateLimitHeaders(first, 1);
    expect(headers["X-RateLimit-Limit"]).toBe("1");
    expect(headers["X-RateLimit-Remaining"]).toBe("0");
    expect(headers["X-RateLimit-Source"]).toBe("memory");
    // Allowed, so no Retry-After is claimed.
    expect(headers["Retry-After"]).toBeUndefined();

    const second = await rateLimit(input);
    const denied = rateLimitHeaders(second, 1);
    expect(denied["Retry-After"]).toBeDefined();
    expect(Number(denied["Retry-After"])).toBeGreaterThan(0);
    expect(Number(denied["Retry-After"])).toBeLessThanOrEqual(60);
  });
});

describe("rate limiting: a database failure is reported, not disguised", () => {
  beforeEach(() => {
    resetMemoryLimiter();
    resetClients();
  });
  afterEach(() => vi.restoreAllMocks());

  it("falls back to memory and says so when the RPC fails", async () => {
    // The first version of this suite never exercised the database path at all, so a
    // sabotage that reported the fallback as "database" passed. A limiter that lies about
    // its own strength is exactly the defect being fixed, so this path is now covered.
    const db = await import("@/server/db/client");
    vi.spyOn(db, "anonClient").mockReturnValue({
      rpc: async () => ({ data: null, error: { message: "connection refused" } }),
    } as never);

    const { rateLimit: limited } = await import("@/server/http/rate-limit");
    const result = await limited({
      scope: "newsletter",
      identity: "5.5.5.5",
      limit: 1,
      windowMs: 60_000,
    });

    expect(result.ok).toBe(true);
    expect(result.source).toBe("memory");
  });

  it("reports database as the source when the RPC answers", async () => {
    const db = await import("@/server/db/client");
    vi.spyOn(db, "anonClient").mockReturnValue({
      rpc: async () => ({
        data: [{ allowed: false, hits: 9, reset_at: new Date(Date.now() + 30_000).toISOString() }],
        error: null,
      }),
    } as never);

    const { rateLimit: limited } = await import("@/server/http/rate-limit");
    const result = await limited({
      scope: "newsletter",
      identity: "6.6.6.6",
      limit: 5,
      windowMs: 60_000,
    });

    expect(result.ok).toBe(false);
    expect(result.source).toBe("database");
    expect(result.remaining).toBe(0);
  });

  it("treats an empty RPC answer as a failure, not as permission", async () => {
    const db = await import("@/server/db/client");
    vi.spyOn(db, "anonClient").mockReturnValue({
      rpc: async () => ({ data: [], error: null }),
    } as never);

    const { rateLimit: limited } = await import("@/server/http/rate-limit");
    const result = await limited({
      scope: "newsletter",
      identity: "7.7.7.7",
      limit: 5,
      windowMs: 60_000,
    });
    expect(result.source).toBe("memory");
  });
});

describe("rate limiting: the counter is not a per-process Map any more", () => {
  it("no module keeps its own Map of counters", () => {
    // A Map in a request handler is the exact defect: correct on one long-lived server,
    // absent on a serverless platform, and invisible either way.
    const respond = readFileSync(resolve(ROOT, "src/server/http/respond.ts"), "utf8");
    expect(respond).not.toMatch(/new Map<string, \{ count/);
    expect(respond).toContain('export { clientIdentity, rateLimit, rateLimitHeaders } from "./rate-limit"');
  });

  it("counts in the database through an atomic function, not read-then-write", () => {
    // A read followed by an insert would let two concurrent requests both see "under
    // limit". The migration must do it in one statement.
    const migration = readFileSync(
      resolve(ROOT, "supabase/migrations/0005_rate_limits.sql"),
      "utf8",
    );
    expect(migration).toContain("on conflict (bucket, window_start) do update");
    expect(migration).toContain("create or replace function public.consume_rate_limit");
    // Plumbing, not user data: RLS on with no policies, and no grants.
    expect(migration).toMatch(/alter table public\.rate_limit_hits enable row level security/);
    expect(migration).toContain("revoke all on table public.rate_limit_hits from anon, authenticated");
  });

  it("stores no raw identifier", () => {
    const migration = readFileSync(
      resolve(ROOT, "supabase/migrations/0005_rate_limits.sql"),
      "utf8",
    );
    // Column names must not imply the raw value is kept.
    expect(migration).not.toMatch(/\bip_address\b|\bemail\b\s+(text|varchar)/);
    expect(migration).toContain("bucket        text");
  });
});
