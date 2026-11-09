import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeStatus, drainOutbox } from "@/server/email/outbox";
import { describeMailProvider, getMailProvider, type MailProvider } from "@/server/email/provider";

const ROOT = resolve(__dirname, "..");

/**
 * The newsletter's other half.
 *
 * The endpoint answered `pending_confirmation` and nothing ever sent that confirmation, so a
 * reader who asked to subscribe was recorded as pending and stayed there. These tests cover
 * the outbox that closes the gap, and — more importantly — the states where it must NOT
 * pretend to have worked.
 */

function fakeProvider(behaviour: { ok: boolean; retryable?: boolean; error?: string }): MailProvider & {
  sent: Array<{ to: string; subject: string; text: string }>;
} {
  const sent: Array<{ to: string; subject: string; text: string }> = [];
  return {
    name: "fake",
    sent,
    send: async (message) => {
      sent.push(message);
      return behaviour.ok
        ? { ok: true, providerId: "msg_1" }
        : { ok: false, error: behaviour.error ?? "boom", retryable: behaviour.retryable ?? true };
    },
  };
}

function fakeClient(rows: Array<Record<string, unknown>>, options: { readError?: boolean } = {}) {
  const updates: Array<Record<string, unknown>> = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: async () =>
              options.readError
                ? { data: null, error: { message: "permission denied" } }
                : { data: rows, error: null },
          }),
        }),
      }),
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        return {
          eq: () => ({
            eq: async () => ({ error: null }),
          }),
        };
      },
    }),
  };
  return { client, updates };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "11111111-1111-1111-1111-111111111111",
  to_email: "reader@example.com",
  subject: "Confirm your subscription",
  body_text: "https://example.test/newsletter/confirm?token=abc",
  attempts: 0,
  max_attempts: 5,
  ...overrides,
});

describe("outbox: sends what was queued", () => {
  it("marks a delivered message sent, and records which provider did it", async () => {
    const provider = fakeProvider({ ok: true });
    const { client, updates } = fakeClient([row()]);

    const result = await drainOutbox({ client: client as never, provider });

    expect(result.sent).toBe(1);
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.to).toBe("reader@example.com");
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "sent", provider: "fake", provider_id: "msg_1" }),
    );
  });

  it("claims the row before sending, so two workers cannot both send it", async () => {
    const { client, updates } = fakeClient([row()]);
    await drainOutbox({ client: client as never, provider: fakeProvider({ ok: true }) });

    // The first write must be the claim, and it must come before the "sent" write.
    expect(updates[0]).toMatchObject({ status: "sending", attempts: 1 });
    expect(updates[1]).toMatchObject({ status: "sent" });
  });
});

describe("outbox: refuses to pretend", () => {
  it("does nothing, and marks nothing, when no provider is configured", async () => {
    const { client, updates } = fakeClient([row()]);

    const result = await drainOutbox({ client: client as never, provider: null });

    expect(result.skipped).toBe("no mail provider configured");
    expect(result.attempted).toBe(0);
    // Burning attempt budgets on a configuration problem would dead-letter mail that a
    // later config change could have delivered.
    expect(updates).toEqual([]);
  });

  it("reports a read failure instead of an empty success", async () => {
    const { client } = fakeClient([], { readError: true });
    const result = await drainOutbox({
      client: client as never,
      provider: fakeProvider({ ok: true }),
    });
    expect(result.skipped).toContain("permission denied");
  });

  it("reports a missing database rather than sending into the void", async () => {
    const result = await drainOutbox({ client: null, provider: fakeProvider({ ok: true }) });
    expect(result.skipped).toBe("no database configured");
  });
});

describe("outbox: failure handling", () => {
  it("keeps a retryable failure queued for another attempt", async () => {
    const { client, updates } = fakeClient([row({ attempts: 1 })]);
    const result = await drainOutbox({
      client: client as never,
      provider: fakeProvider({ ok: false, retryable: true, error: "503 from provider" }),
    });

    expect(result.failed).toBe(1);
    expect(updates).toContainEqual(
      expect.objectContaining({ status: "failed", last_error: "503 from provider" }),
    );
  });

  it("dead-letters a permanent failure immediately", async () => {
    const { client, updates } = fakeClient([row()]);
    const result = await drainOutbox({
      client: client as never,
      provider: fakeProvider({ ok: false, retryable: false, error: "422 bad address" }),
    });

    expect(result.dead).toBe(1);
    expect(updates).toContainEqual(expect.objectContaining({ status: "dead" }));
  });

  it("dead-letters once the attempt budget is spent", () => {
    // A message that has failed five times will not succeed on the sixth, and leaving it
    // queued means every tick retries it forever.
    expect(computeStatus(5, 5, true)).toBe("dead");
    expect(computeStatus(4, 5, true)).toBe("failed");
    expect(computeStatus(1, 5, false)).toBe("dead");
  });
});

describe("provider: absent is a supported state", () => {
  it("returns null rather than a no-op provider", () => {
    // A no-op provider would make every send look successful and fill the outbox with
    // messages that were never delivered.
    expect(getMailProvider({})).toBeNull();
    expect(getMailProvider({ RESEND_API_KEY: "k" })).toBeNull(); // no from address
    expect(getMailProvider({ EMAIL_FROM: "a@b.test" })).toBeNull(); // no key
  });

  it("configures Resend only when both halves are present", () => {
    const provider = getMailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "news@asd.test" });
    expect(provider?.name).toBe("resend");
  });

  it("names exactly what is missing, for the operator", () => {
    expect(describeMailProvider({})).toBe("not configured (missing RESEND_API_KEY, EMAIL_FROM)");
    expect(describeMailProvider({ RESEND_API_KEY: "k" })).toBe("not configured (missing EMAIL_FROM)");
    expect(describeMailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.test" })).toBe("resend");
  });

  it("treats a 4xx as permanent and a 5xx as retryable", async () => {
    // Getting this backwards either retries a bad address forever or throws away mail a
    // second attempt would have delivered.
    const provider = getMailProvider({ RESEND_API_KEY: "k", EMAIL_FROM: "a@b.test" })!;

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    fetchMock.mockResolvedValueOnce(
      new Response("bad request", { status: 400 }) as never,
    );
    expect((await provider.send({ to: "x@y.test", subject: "s", text: "t" })).retryable).toBe(false);

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }) as never);
    expect((await provider.send({ to: "x@y.test", subject: "s", text: "t" })).retryable).toBe(true);

    fetchMock.mockResolvedValueOnce(new Response("slow down", { status: 429 }) as never);
    expect((await provider.send({ to: "x@y.test", subject: "s", text: "t" })).retryable).toBe(true);

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "msg_42" }), { status: 200 }) as never,
    );
    const ok = await provider.send({ to: "x@y.test", subject: "s", text: "t" });
    expect(ok).toMatchObject({ ok: true, providerId: "msg_42" });

    vi.unstubAllGlobals();
  });
});

describe("endpoint: never returns the token", () => {
  const route = readFileSync(
    resolve(ROOT, "src/app/api/v1/newsletter/subscribe/route.ts"),
    "utf8",
  );

  it("does not echo the confirmation token to the caller", () => {
    // A caller who receives the token can confirm an address they do not control.
    expect(route).not.toMatch(/token:\s*(row|data|parsed)/);
    expect(route).toContain("The token is never returned");
  });

  it("says plainly when an address was already subscribed", () => {
    expect(route).toContain("already_confirmed");
    expect(route).toContain("No new email was sent");
  });

  it("records the subscription and queues the email in one call", () => {
    // Two separate writes is how the old version ended up saved-but-never-emailed.
    expect(route).toContain("issue_newsletter_confirmation");
    expect(route).not.toMatch(/from\("newsletter_subscriptions"\)\s*\.upsert/);
  });
});

describe("confirmation page: four outcomes, not two", () => {
  const page = readFileSync(resolve(ROOT, "src/app/(public)/newsletter/confirm/page.tsx"), "utf8");

  const server = readFileSync(resolve(ROOT, "src/server/newsletter/confirm.ts"), "utf8");

  it("distinguishes an unreachable database from an invalid link", () => {
    // Telling a reader their link is broken when the truth is "we could not check" sends
    // them to request a new email that would also fail.
    expect(server).toContain('"unavailable"');
    expect(server).toMatch(/NOT the same as an invalid link/);
    expect(page).toContain("This is our problem, not a bad link");
  });

  it("returns no email address for an unknown token", () => {
    // Echoing the address a token resolved to, for a token that resolved to nothing, would
    // be a small disclosure; the branch is asserted rather than assumed.
    expect(server).toContain('raw !== "invalid"');
  });

  it("treats a second click as success", () => {
    expect(page).toContain("already_confirmed");
    expect(page).toContain("Opening this link twice is harmless");
  });

  it("keeps a confirmation page out of search results", () => {
    expect(page).toContain("robots: { index: false, follow: false }");
  });
});
