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

export const KNOWN_ENV: Omit<EnvFact, "present">[] = [
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
    // Kept, but re-described. The queue is a Postgres table, so setting this changes nothing
    // today; the old copy implied that a queue existed only when Redis did, which was never
    // true after 0006.
    name: "REDIS_URL",
    purpose: "Reserved for a future cache. The job queue does not use it",
    ifMissing: "Nothing today. Setting it enables no feature",
  },
  {
    name: "CRON_SECRET",
    purpose: "Shared secret the scheduler presents to POST /api/cron/tick",
    ifMissing: "The cron endpoint refuses every call, so scheduled articles never publish",
  },
  {
    name: "RESEND_API_KEY",
    purpose: "Mail provider key used by the outbox worker",
    ifMissing: "Confirmation emails stay queued forever and every signup sits at pending",
  },
  {
    name: "EMAIL_FROM",
    purpose: "From-address for outgoing mail; must be on a domain you control",
    ifMissing: "No mail is sent, even with a provider key set",
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

/**
 * The two ways the queue can be driven, as configuration facts rather than claims.
 *
 * Neither proves a scheduler is running — `CRON_SECRET` set means a call *could* be
 * authenticated, not that one is arriving. The jobs page checks for evidence separately.
 */
export function schedulerPosture(): { cronSecret: boolean; workerCommand: string } {
  return {
    cronSecret: Boolean(process.env.CRON_SECRET && process.env.CRON_SECRET.length >= 16),
    workerCommand: "npm run worker",
  };
}

/** What the mail path needs, named so an operator can act on it. */
export function mailPosture(): { provider: string; fromAddress: boolean } {
  const apiKey = Boolean(process.env.RESEND_API_KEY);
  const from = Boolean(process.env.EMAIL_FROM);
  return {
    provider: apiKey && from ? "resend" : `not configured (missing ${[
      !apiKey && "RESEND_API_KEY",
      !from && "EMAIL_FROM",
    ].filter(Boolean).join(", ")})`,
    fromAddress: from,
  };
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
