import type { Metadata } from "next";
import Link from "next/link";
import { confirmSubscription, type ConfirmOutcome } from "@/server/newsletter/confirm";

/**
 * The page the confirmation link opens.
 *
 * Four outcomes, and they are deliberately not collapsed:
 *
 *   confirmed            the subscription is live
 *   already_confirmed    the same link was opened twice (or a mail scanner opened it first)
 *   invalid              the token is not a token
 *   unavailable          the database could not be reached — which is NOT "invalid link"
 *
 * That last distinction is the one worth the extra code. Telling a reader their link is
 * broken when the truth is "we could not check" would make them ask for a new email, and the
 * new email would not work either.
 *
 * This page is a GET with no side effect beyond an idempotent update, so a link scanner that
 * follows it in advance cannot do harm.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confirm your subscription",
  // A confirmation page has no business in an index.
  robots: { index: false, follow: false },
};

const COPY: Record<ConfirmOutcome, { title: string; body: string; tone: "ok" | "warn" | "bad" }> = {
  confirmed: {
    title: "You are subscribed",
    body: "Your address is confirmed. The next edition will arrive where you expect it.",
    tone: "ok",
  },
  already_confirmed: {
    title: "Already confirmed",
    body: "This address was confirmed earlier, so there is nothing left to do. Opening this link twice is harmless.",
    tone: "ok",
  },
  invalid: {
    title: "This link is not valid",
    body: "The link may have been shortened or copied incompletely. Sign up again and you will get a fresh one.",
    tone: "bad",
  },
  bounced: {
    title: "That address is not receiving mail",
    body: "Our last message to it was rejected by the mail server. A person has to look at this before it can be re-subscribed.",
    tone: "warn",
  },
  unavailable: {
    title: "We could not check that link",
    body: "The subscription service is not reachable right now. This is our problem, not a bad link — try again in a few minutes.",
    tone: "warn",
  },
};

export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const { outcome, email } = await confirmSubscription(token);
  const copy = COPY[outcome];

  const border =
    copy.tone === "ok"
      ? "border-verify-600/30 bg-verify-50"
      : copy.tone === "warn"
        ? "border-amber-300 bg-amber-50"
        : "border-signal-600/30 bg-signal-50";

  return (
    <div className="shell max-w-2xl py-16">
      <p className="text-[11px] font-bold tracking-[0.18em] text-navy-500 uppercase">Newsletter</p>
      <div className={`mt-4 rounded-lg border p-6 ${border}`}>
        <h1 className="text-xl font-bold text-navy-900">{copy.title}</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-navy-700">{copy.body}</p>
        {email && outcome !== "invalid" && (
          <p className="mt-3 font-mono text-[12px] text-navy-500">{email}</p>
        )}
      </div>

      <p className="mt-6 text-[13px] text-navy-500">
        <Link href="/" className="font-semibold text-navy-900 underline">
          Back to the front page
        </Link>
      </p>
    </div>
  );
}
