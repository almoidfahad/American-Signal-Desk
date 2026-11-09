/**
 * Confirming a newsletter subscription.
 *
 * Lives in the server layer rather than in the page, for two reasons: a page that talks to
 * the database directly is a page that can only be tested through HTTP, and the service-role
 * client should be reachable from exactly one layer. The page renders the outcome; the
 * decision is here.
 */
import { serviceClient } from "@/server/db/client";

export type ConfirmOutcome =
  | "confirmed"
  | "already_confirmed"
  | "invalid"
  | "bounced"
  /** The database could not be reached. NOT the same as an invalid link. */
  | "unavailable";

export interface ConfirmResult {
  outcome: ConfirmOutcome;
  email: string | null;
}

const KNOWN: readonly ConfirmOutcome[] = [
  "confirmed",
  "already_confirmed",
  "invalid",
  "bounced",
  "unavailable",
];

export function isConfirmOutcome(value: string): value is ConfirmOutcome {
  return (KNOWN as readonly string[]).includes(value);
}

/**
 * Resolve a confirmation token.
 *
 * The distinction that matters most: an unreachable database must not be reported as a bad
 * link. A reader told their link is invalid asks for a new one, and the new one fails too —
 * so a transient outage would turn into a support problem with no evidence.
 */
export async function confirmSubscription(token: string | null | undefined): Promise<ConfirmResult> {
  if (!token) return { outcome: "invalid", email: null };

  const db = serviceClient();
  if (!db) return { outcome: "unavailable", email: null };

  const { data, error } = await db.rpc("confirm_newsletter_subscription", { p_token: token });

  if (error) {
    console.error(`[newsletter:confirm] ${error.message}`);
    return { outcome: "unavailable", email: null };
  }

  const row = (Array.isArray(data) ? data[0] : null) as { outcome?: string; email?: string } | null;
  const raw = row?.outcome ?? "invalid";

  return {
    outcome: isConfirmOutcome(raw) ? raw : "invalid",
    // Only shown for a real address, never for an unknown token.
    email: isConfirmOutcome(raw) && raw !== "invalid" ? (row?.email ?? null) : null,
  };
}
