/**
 * Supabase clients — the only place one is constructed.
 *
 * Nine modules used to build their own client, with three different option sets and two
 * different keys, and nothing in the signature said which. "Which client am I holding?"
 * is a security question: the service-role key bypasses every RLS policy in the database,
 * and a function that takes a `SupabaseClient` gives the reader no way to know whether the
 * policies still apply. So the two are separate types here, and the privileged one carries
 * a brand that cannot be produced by accident:
 *
 *   anonClient()      → publishable key, RLS enforced. Safe for anything a reader can see.
 *   serviceClient()   → service-role key, RLS bypassed. Only for server-side code that has
 *                       already decided authorization, and never in a component.
 *
 * `ServiceClient` cannot be written by hand — the brand symbol is not exported — so a
 * function that requires one cannot be passed the other, and vice versa. That turns
 * "did someone use the service key here?" from a code-review question into a type error.
 *
 * Caching: one client per key per process. A client is stateless besides its auth storage,
 * which is disabled, so reuse is safe and avoids a new connection pool per request.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare const SERVICE_BRAND: unique symbol;

/** A client holding the publishable key. RLS still applies. */
export type AnonClient = SupabaseClient & { readonly [SERVICE_BRAND]?: never };

/**
 * A client holding the service-role key. RLS does NOT apply.
 *
 * The brand is a `unique symbol` that is never exported, so the only way to obtain this
 * type is from `serviceClient()`. Anything accepting `ServiceClient` is thereby stating
 * "I have already made the authorization decision".
 */
export type ServiceClient = SupabaseClient & { readonly [SERVICE_BRAND]: true };

export type SupabaseEnv = { url: string; anonKey: string };
export type SupabaseServiceEnv = { url: string; serviceKey: string };

/** Read the publishable-key configuration, or null when either half is missing. */
export function readAnonEnv(): SupabaseEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/** Read the service-role configuration, or null when either half is missing. */
export function readServiceEnv(): SupabaseServiceEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? { url, serviceKey } : null;
}

export const ANON_ENV_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
export const SERVICE_ENV_VARS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

let anonCache: { key: string; client: AnonClient } | null = null;
let serviceCache: { key: string; client: ServiceClient } | null = null;

/**
 * Publishable-key client. Returns null when unconfigured, which is the signal every
 * caller already handles: "we never asked" is different from "we asked and got nothing".
 */
export function anonClient(env: SupabaseEnv | null = readAnonEnv()): AnonClient | null {
  if (!env) return null;
  const cacheKey = `${env.url}\u0000${env.anonKey}`;
  if (anonCache?.key === cacheKey) return anonCache.client;

  const client = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "american-signal-desk/anon" } },
  }) as AnonClient;

  anonCache = { key: cacheKey, client };
  return client;
}

/**
 * Service-role client. RLS is bypassed — callers own the authorization decision.
 *
 * Kept off the public surface deliberately: this module is only importable from
 * `src/server/**`, which the API route guard enforces (tests/service-client.test.ts).
 */
export function serviceClient(env: SupabaseServiceEnv | null = readServiceEnv()): ServiceClient | null {
  if (!env) return null;
  const cacheKey = `${env.url}\u0000${env.serviceKey}`;
  if (serviceCache?.key === cacheKey) return serviceCache.client;

  const client = createClient(env.url, env.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { "X-Client-Info": "american-signal-desk/service" } },
  }) as ServiceClient;

  serviceCache = { key: cacheKey, client };
  return client;
}

/** Test seam: drop cached clients so environment changes are observed. */
export function resetClients(): void {
  anonCache = null;
  serviceCache = null;
}

/** True when the privileged key is present. Does not construct anything. */
export function hasServiceEnv(): boolean {
  return readServiceEnv() !== null;
}
