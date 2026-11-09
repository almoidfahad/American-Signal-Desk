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

/**
 * Rate limiting lives in ./rate-limit.ts.
 *
 * It used to live here as a module-level Map, which is not a limiter on a serverless
 * platform: the map is per process, so the count resets on every cold start and is
 * multiplied by the number of instances. Re-exported here only so the import site stays
 * the same for existing callers.
 */
export { clientIdentity, rateLimit, rateLimitHeaders } from "./rate-limit";

/**
 * @deprecated Use `clientIdentity` plus `rateLimit({ scope, identity, ... })`.
 * Kept because it makes the scope/identity split explicit at the call site.
 */
export function clientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identity = forwarded ?? request.headers.get("x-real-ip")?.trim() ?? "unknown";
  return `${scope}:${identity}`;
}
