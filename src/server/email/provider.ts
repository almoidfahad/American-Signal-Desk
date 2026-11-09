/**
 * The mail provider boundary.
 *
 * Nothing else in the codebase knows what Resend, Postmark or a bare SMTP relay looks like.
 * A provider is an object with `send()` and a name; the outbox worker picks one at send time
 * and records which one it used. That is deliberate: the moment the schema or the worker
 * imports a vendor SDK directly, changing provider becomes a migration.
 *
 * With no provider configured, `send()` is never called — the worker reports the message as
 * `failed` with a reason and stops retrying. It never pretends to have sent something.
 *
 * Adding a provider is one function. Not adding one is a supported state.
 */

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface SendResult {
  ok: boolean;
  providerId?: string;
  /** Present when `ok` is false. Transient failures are worth retrying; the rest are not. */
  error?: string;
  retryable?: boolean;
}

export interface MailProvider {
  name: string;
  send(message: MailMessage): Promise<SendResult>;
}

/**
 * Resend. Chosen as the reference implementation because its HTTP API is one POST with a
 * bearer token, so it needs no SDK and no new dependency.
 *
 * `RESEND_API_KEY` and `EMAIL_FROM` must both be set; a from-address is not something to
 * default, because sending as a domain you do not control fails SPF and lands in spam.
 */
function resendProvider(apiKey: string, from: string): MailProvider {
  return {
    name: "resend",
    async send(message) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
          }),
          // A mail provider that hangs must not hold a worker forever.
          signal: AbortSignal.timeout(15_000),
        });

        if (!response.ok) {
          const body = await response.text().catch(() => "");
          // 4xx is our fault (bad address, unverified domain) and will not improve by
          // retrying. 5xx and 429 are worth another attempt.
          const retryable = response.status >= 500 || response.status === 429;
          return {
            ok: false,
            error: `resend ${response.status}: ${body.slice(0, 200)}`,
            retryable,
          };
        }

        const data = (await response.json().catch(() => ({}))) as { id?: string };
        return { ok: true, providerId: data.id };
      } catch (error) {
        // Network error or timeout: always worth retrying.
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          retryable: true,
        };
      }
    },
  };
}

/**
 * Pick the configured provider, or null when none is.
 *
 * Returning null rather than a no-op provider is the point: a no-op would make every send
 * look successful and fill the outbox with messages that were never delivered.
 */
export function getMailProvider(env: Record<string, string | undefined> = process.env): MailProvider | null {
  const apiKey = env.RESEND_API_KEY;
  const from = env.EMAIL_FROM;
  if (apiKey && from) return resendProvider(apiKey, from);
  return null;
}

/** Which provider would be used, for the admin configuration page and the logs. */
export function describeMailProvider(env: Record<string, string | undefined> = process.env): string {
  const provider = getMailProvider(env);
  if (provider) return provider.name;
  const missing = [!env.RESEND_API_KEY && "RESEND_API_KEY", !env.EMAIL_FROM && "EMAIL_FROM"].filter(
    Boolean,
  );
  return `not configured (missing ${missing.join(", ")})`;
}
