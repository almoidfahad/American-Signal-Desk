/**
 * Configuration posture.
 *
 * Reports only *whether* a variable is set, never its value. This module is the reason the
 * settings and security pages can say something true without leaking a secret into a page
 * body, an HTML cache, or a screenshot pasted into a ticket.
 */
import { contentMode } from "@/server/content/repository";
import { computeHealth } from "@/server/health/compute-health";

export interface EnvFact {
  name: string;
  present: boolean;
  purpose: string;
  /** What breaks when this is absent. */
  ifMissing: string;
}

const KNOWN_ENV: Omit<EnvFact, "present">[] = [
  {
    name: "NEXT_PUBLIC_SUPABASE_URL",
    purpose: "Supabase project URL; without it no session can be resolved",
    ifMissing: "Admin sign-in is refused and every list page reports not configured",
  },
  {
    name: "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    purpose: "Browser auth client key",
    ifMissing: "Sign-in form cannot reach the identity provider",
  },
  {
    name: "SUPABASE_SERVICE_ROLE_KEY",
    purpose: "Server-side reads for the newsroom",
    ifMissing: "Article, category and audit queries are not attempted",
  },
  {
    name: "REDIS_URL",
    purpose: "Queue and cache",
    ifMissing: "No queue consumer exists; the jobs page has nothing to read",
  },
  {
    name: "REQUIRE_MFA_FOR_ADMIN",
    purpose: "Whether a second factor is required for privileged roles",
    ifMissing: "Defaults to required, which is the safer state",
  },
];

export function envFacts(): EnvFact[] {
  return KNOWN_ENV.map((fact) => ({
    ...fact,
    present: Boolean(process.env[fact.name] && process.env[fact.name] !== ""),
  }));
}

export interface Posture {
  contentMode: ReturnType<typeof contentMode>;
  health: ReturnType<typeof computeHealth>;
  mfaRequired: boolean;
  mfaExplicitlyDisabled: boolean;
}

export function posture(): Posture {
  const hasDatabaseConfig = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const hasRedisConfig = Boolean(process.env.REDIS_URL);
  const flag = process.env.REQUIRE_MFA_FOR_ADMIN;

  return {
    contentMode: contentMode(),
    health: computeHealth({ hasDatabaseConfig, hasRedisConfig }),
    mfaRequired: flag === undefined || flag === "true" || flag === "1",
    mfaExplicitlyDisabled: flag === "false" || flag === "0",
  };
}

/**
 * Tables whose append-only or RLS guarantees are asserted by the migration test suites.
 * Listed here so the security page describes the schema that exists rather than a wish list;
 * every name below appears in `supabase/migrations` and is exercised by `npm run test:db`.
 */
export const ENFORCED_BY_DATABASE = [
  { table: "audit_logs", rule: "Append-only: UPDATE and DELETE blocked by trigger" },
  { table: "article_revisions", rule: "Append-only: revision rows cannot be rewritten" },
  { table: "corrections", rule: "Public rows require an approver and an approval time" },
  { table: "articles", rule: "Status changes guarded by permission trigger" },
  { table: "profiles", rule: "RLS on; no anon read policy" },
  { table: "media_assets", rule: "Alt text required by check constraint" },
] as const;
