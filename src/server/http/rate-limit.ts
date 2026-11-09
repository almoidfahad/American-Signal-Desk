/**
 * Rate limiting.
 *
 * The previous limiter was a module-level `Map`. On a serverless platform each request
 * may be a fresh process, so the map was usually empty and the limit did nothing; on two
 * instances the real limit was multiplied by two. Neither failure is visible — the code
 * looks right, the tests pass, and nobody is limited.
 *
 * So the counter now lives in Postgres, where every instance sees the same number. But a
 * limiter that fails closed on a database hiccup turns an inconvenience into an outage,
 * and a limiter that fails open silently is what we are trying to stop shipping. The
 * resolution is explicit:
 *
 *   ACCEPT requests are counted in the database and the answer is authoritative.
 *   DEGRADE the database is unreachable, so we fall back to an in-process counter and
 *          report `degraded: true` — bounded per instance rather than not at all, and
 *          stated in the response header instead of being invisible.
 *
 * The fallback is not a silent second implementation of the same rule; it is a visibly
 * weaker guarantee, and the caller can tell which one it got.
 */
import { createHash } from "node:crypto";
import { anonClient } from "@/server/db/client";

export interface RateLimitInput {
  /** Namespace, so a burst on one endpoint does not spend another's budget. */
  scope: string;
  /** What is being limited — an IP, an email, a user id. Never stored raw. */
  identity: string;
  limit: number;
  windowMs: number;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetAt: number;
  /** Which limiter answered. `degraded` means per-instance only. */
  source: "database" | "memory";
}

/**
 * Hash the identity before it leaves the process.
 *
 * An IP address is personal data in several jurisdictions and an email address certainly
 * is; the limiter only needs equality, never the value. Truncated to 32 hex characters
 * (128 bits) — collision probability at this scale is nil, and it keeps the primary key
 * index small.
 */
export function bucketKey(scope: string, identity: string): string {
  const digest = createHash("sha256").update(`${scope}\u0000${identity}`).digest("hex");
  return `${scope}:${digest.slice(0, 32)}`;
}

/** Extract the client identity from a request, preferring the edge's own header. */
export function clientIdentity(request: Request): string {
  // Vercel and most proxies set x-forwarded-for; take the left-most (the original client).
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  // No proxy information: fall back to a constant, so the limiter bounds total
  // throughput rather than being trivially bypassed by omitting a header.
  return "unknown";
}

/* -------------------------------------------------------------------------- */
/* In-process fallback                                                        */
/* -------------------------------------------------------------------------- */

const memory = new Map<string, { count: number; resetAt: number }>();

/** Keeps the fallback from becoming a memory leak on a long-lived instance. */
function pruneMemory(now: number): void {
  if (memory.size < 5_000) return;
  for (const [key, bucket] of memory) {
    if (bucket.resetAt <= now) memory.delete(key);
  }
}

function memoryLimit(key: string, limit: number, windowMs: number, now: number): RateLimitResult {
  pruneMemory(now);
  const bucket = memory.get(key);
  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    memory.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt, source: "memory" };
  }
  bucket.count += 1;
  return {
    ok: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: bucket.resetAt,
    source: "memory",
  };
}

/** Test seam. */
export function resetMemoryLimiter(): void {
  memory.clear();
}

/* -------------------------------------------------------------------------- */
/* Public entry point                                                         */
/* -------------------------------------------------------------------------- */

export async function rateLimit(input: RateLimitInput): Promise<RateLimitResult> {
  const { limit, windowMs } = input;
  const key = bucketKey(input.scope, input.identity);
  const now = Date.now();

  const db = anonClient();
  if (!db) return memoryLimit(key, limit, windowMs, now);

  const { data, error } = await db.rpc("consume_rate_limit", {
    p_bucket: key,
    p_limit: limit,
    p_window_ms: windowMs,
  });

  // A failed RPC must not take the endpoint down with it, and must not be mistaken for
  // "under budget, normally served". The caller sees `source: "memory"`.
  if (error || !data || data.length === 0) {
    if (error) console.error(`[rate-limit] falling back to memory: ${error.message}`);
    return memoryLimit(key, limit, windowMs, now);
  }

  const row = data[0] as { allowed: boolean; hits: number; reset_at: string };
  return {
    ok: row.allowed,
    remaining: Math.max(0, limit - row.hits),
    resetAt: new Date(row.reset_at).getTime(),
    source: "database",
  };
}

/** Headers describing the limit, so a client can back off without guessing. */
export function rateLimitHeaders(result: RateLimitResult, limit: number): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(Math.max(0, result.remaining)),
  };
  if (!result.ok) {
    const seconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
    headers["Retry-After"] = String(seconds);
    headers["X-RateLimit-Reset"] = String(Math.ceil(result.resetAt / 1000));
  }
  // Says plainly which guarantee applied. `memory` is bounded per instance, not globally.
  headers["X-RateLimit-Source"] = result.source;
  return headers;
}
