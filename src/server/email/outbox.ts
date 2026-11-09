/**
 * Draining the outbox.
 *
 * The subscribe endpoint writes an intent to send; this sends it. Splitting the two is what
 * lets the endpoint answer in milliseconds and makes a provider outage a delayed email
 * rather than a failed signup.
 *
 * Delivery is at-least-once, and that is a deliberate trade. Marking a message `sending`
 * before the provider call means a crash between the call and the write re-sends it. The
 * alternative — marking it sent first — loses mail silently, which is worse for a
 * confirmation link. Confirmation emails are idempotent in effect (the token does not change
 * and confirming twice is a success), so a duplicate is harmless.
 */
import { serviceClient } from "@/server/db/client";
import { getMailProvider, type MailProvider } from "./provider";

export interface DrainResult {
  attempted: number;
  sent: number;
  failed: number;
  dead: number;
  skipped?: string;
}

interface OutboxRow {
  id: string;
  to_email: string;
  subject: string;
  body_text: string;
  attempts: number;
  max_attempts: number;
}

const BATCH = 20;

export function computeStatus(
  attempts: number,
  maxAttempts: number,
  retryable: boolean,
): "sent" | "failed" | "dead" {
  if (!retryable) return "dead";
  return attempts >= maxAttempts ? "dead" : "failed";
}

export async function drainOutbox(
  options: {
    client?: ReturnType<typeof serviceClient>;
    provider?: MailProvider | null;
    limit?: number;
  } = {},
): Promise<DrainResult> {
  const db = options.client ?? serviceClient();
  if (!db) return { attempted: 0, sent: 0, failed: 0, dead: 0, skipped: "no database configured" };

  const provider = options.provider === undefined ? getMailProvider() : options.provider;
  if (!provider) {
    // Not a failure of any individual message: nothing is attempted, so nothing is marked.
    // Marking rows failed here would burn their attempt budget on a configuration problem.
    return { attempted: 0, sent: 0, failed: 0, dead: 0, skipped: "no mail provider configured" };
  }

  const { data, error } = await db
    .from("email_outbox")
    .select("id,to_email,subject,body_text,attempts,max_attempts")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(options.limit ?? BATCH);

  if (error) {
    return { attempted: 0, sent: 0, failed: 0, dead: 0, skipped: `could not read outbox: ${error.message}` };
  }

  const rows = (data ?? []) as OutboxRow[];
  const result: DrainResult = { attempted: rows.length, sent: 0, failed: 0, dead: 0 };

  for (const row of rows) {
    const attempts = row.attempts + 1;

    // Claim the row before sending. A second worker sees `sending` and skips it; a crash
    // after this point re-sends, which is the safe direction.
    const { error: claimError } = await db
      .from("email_outbox")
      .update({ status: "sending", attempts })
      .eq("id", row.id)
      .eq("status", "queued");

    if (claimError) {
      result.failed += 1;
      continue;
    }

    const outcome = await provider.send({
      to: row.to_email,
      subject: row.subject,
      text: row.body_text,
    });

    if (outcome.ok) {
      await db
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider: provider.name,
          provider_id: outcome.providerId ?? null,
          last_error: null,
        })
        .eq("id", row.id);
      result.sent += 1;
      continue;
    }

    const status = computeStatus(attempts, row.max_attempts, outcome.retryable !== false);
    await db
      .from("email_outbox")
      .update({ status, last_error: outcome.error ?? "unknown error" })
      .eq("id", row.id);

    if (status === "dead") result.dead += 1;
    else result.failed += 1;

    console.error(`[outbox] ${row.id.slice(0, 8)} ${status}: ${outcome.error ?? "unknown"}`);
  }

  return result;
}
