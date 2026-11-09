/**
 * Environment contract.
 *
 * Rules enforced here:
 *  - Server secrets are parsed only in server code. `serverEnv()` throws if called client-side.
 *  - Public values (safe to ship to the browser) are namespaced `NEXT_PUBLIC_` and validated separately.
 *  - Parsing is lazy and memoised so that `next build` works without production secrets present,
 *    while any real request to a feature that needs a secret fails fast and loudly.
 */
import { z } from "zod";

const booleanish = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const url = z.string().url();

/** Anything shipped to the browser. Must never contain a secret. */
export const publicEnvSchema = z.object({
  NEXT_PUBLIC_SITE_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_SITE_NAME: z.string().min(1).default("American Signal Desk"),
  NEXT_PUBLIC_SUPABASE_URL: url.optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
});

/** Server-only. Never imported from a client component. */
export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // APP_ENV was declared and read nowhere. Removed for the same reason as
  // SESSION_COOKIE_NAME: a setting nobody honours is a setting that lies.


  // --- Supabase -------------------------------------------------------------
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),

  // --- Redis / BullMQ -------------------------------------------------------
  REDIS_URL: z.string().min(1).optional(),

  // --- Auth ----------------------------------------------------------------
  /** Set true to require a verified MFA factor before admin access is granted. */
  REQUIRE_MFA_FOR_ADMIN: booleanish,
  // SESSION_COOKIE_NAME was declared here and read nowhere: supabase-js SSR owns the
  // session cookie names ("sb-<ref>-auth-token"), so a setting that claims to override
  // them was simply false. Removed rather than left as a knob that does nothing — the
  // failure mode this whole codebase is written against.

  // --- Optional integrations (absent = feature disabled, never faked) -------
  AI_PROVIDER_API_KEY: z.string().min(1).optional(),
  PAYMENT_PROVIDER_SECRET: z.string().min(1).optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().min(1).optional(),
  GITHUB_APP_ID: z.string().min(1).optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
  DEPLOYMENT_PROVIDER_TOKEN: z.string().min(1).optional(),
  CRON_SECRET: z.string().min(16).optional(),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedPublic: PublicEnv | undefined;
let cachedServer: ServerEnv | undefined;

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("\n");
}

export function publicEnv(): PublicEnv {
  if (cachedPublic) return cachedPublic;
  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_SITE_NAME: process.env.NEXT_PUBLIC_SITE_NAME,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(`Invalid public environment:\n${formatIssues(parsed.error)}`);
  }
  cachedPublic = parsed.data;
  return cachedPublic;
}

/**
 * Server environment. Throws if reached from a browser bundle — a guardrail against
 * accidentally importing this module into a client component.
 */
export function serverEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "serverEnv() was called in the browser. Server secrets must never reach client code.",
    );
  }
  if (cachedServer) return cachedServer;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid server environment:\n${formatIssues(parsed.error)}`);
  }
  if (parsed.data.NODE_ENV === "production" && parsed.data.REQUIRE_MFA_FOR_ADMIN === false) {
    // Warn loudly rather than throw: an operator may have a documented reason,
    // but this must never silently pass as a security default.
    console.warn(
      "[security] REQUIRE_MFA_FOR_ADMIN is disabled in production. Privileged accounts are protected by password only.",
    );
  }
  cachedServer = parsed.data;
  return cachedServer;
}

/**
 * Feature gate helper: returns true only when the integration is actually configured.
 * Features must check this and render an honest "not configured" state instead of
 * pretending the integration is live.
 */
export function isConfigured(feature: keyof ServerEnv): boolean {
  const value = serverEnv()[feature];
  return typeof value === "string" && value.length > 0;
}

/** Test-only: clears memoised env between cases. */
export function __resetEnvCache(): void {
  cachedPublic = undefined;
  cachedServer = undefined;
}
