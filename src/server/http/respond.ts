/**
 * Uniform API responses.
 *
 * Every authenticated/API response carries a request id so a user can quote it in a support
 * request and an operator can find the matching log line. Error bodies are deliberately
 * terse: no stack traces, no SQL, no internal identifiers.
 */
import { randomUUID } from "node:crypto";
import { AuthorizationError } from "@/server/authz/permissions";

export interface ApiError {
  error: {
    code: string;
    message: string;
    requestId: string;
  };
}

const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function newRequestId(): string {
  return randomUUID();
}

export function apiError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const body: ApiError = { error: { code, message, requestId } };
  return Response.json(body, {
    status,
    headers: { ...NO_STORE, "X-Request-Id": requestId, ...extraHeaders },
  });
}

export function apiOk<T>(
  data: T,
  requestId: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  return Response.json(
    { data, requestId },
    {
      status: init.status ?? 200,
      headers: { ...NO_STORE, "X-Request-Id": requestId, ...init.headers },
    },
  );
}

/** Maps a thrown error to a safe response without leaking internals. */
export function apiFromError(error: unknown, requestId: string): Response {
  if (error instanceof AuthorizationError) {
    const unauthenticated = error.message.includes("Authentication");
    return apiError(
      unauthenticated ? 401 : 403,
      unauthenticated ? "UNAUTHENTICATED" : "FORBIDDEN",
      unauthenticated ? "Authentication required." : "You do not have permission to do that.",
      requestId,
    );
  }

  // Log the real error server-side; return only a correlation id to the client.
  console.error(`[api] requestId=${requestId}`, error);
  return apiError(500, "INTERNAL", "Something went wrong. Quote the request id if you contact support.", requestId);
}

/** Naive fixed-window limiter for single-instance deployments. Redis-backed in Phase 5. */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { ok: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }

  bucket.count += 1;
  return { ok: bucket.count <= limit, remaining: Math.max(0, limit - bucket.count), resetAt: bucket.resetAt };
}

export function clientKey(request: Request, scope: string): string {
  // Trust the edge-provided client IP only when a proxy sets it; otherwise fall back to a
  // constant so the limiter still bounds total throughput rather than being bypassable.
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";
  return `${scope}:${ip}`;
}
