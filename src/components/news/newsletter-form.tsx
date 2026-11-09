"use client";

import { useState } from "react";
import Link from "next/link";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/**
 * Newsletter capture.
 *
 * The form submits to a real endpoint and reports exactly what that endpoint said. It does
 * not show a success message it did not earn: when the endpoint answers 503 (no database
 * configured), the reader is told the subscription could not be saved and is not signed up.
 *
 * This is the single most tempting place in a media site to fake a green checkmark, because
 * a fake "you're subscribed" looks identical to a working one — until the first send.
 */
export function NewsletterForm({
  source = "website",
  tone = "onDark",
  ctaLabel = "Subscribe",
}: {
  source?: string;
  tone?: "onDark" | "light";
  ctaLabel?: string;
}) {
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("email") ?? "").trim();
    if (!email) return;

    setState({ kind: "submitting" });
    try {
      const response = await fetch("/api/v1/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });

      if (response.ok) {
        form.reset();
        setState({
          kind: "done",
          message: "Check your inbox to confirm your subscription.",
        });
        return;
      }

      // 503 = the newsroom has no database yet. Say so plainly.
      if (response.status === 503) {
        setState({
          kind: "error",
          message: "Signups are not open yet — the newsroom is not connected. You have not been subscribed.",
        });
        return;
      }

      setState({ kind: "error", message: "We could not save your signup. Please try again." });
    } catch {
      setState({ kind: "error", message: "Network error. Please try again." });
    }
  }

  const onDark = tone === "onDark";
  const inputClass = onDark
    ? "h-10 w-full min-w-0 rounded border border-white/25 bg-white px-2.5 text-small text-navy-900 placeholder:text-navy-400"
    : "h-11 w-full min-w-0 rounded border border-navy-300 bg-white px-3 text-body text-navy-900 placeholder:text-navy-400";

  if (state.kind === "done") {
    return (
      <p
        role="status"
        className={`mt-3 rounded px-3 py-2 text-small font-medium ${
          onDark ? "bg-white/15 text-white" : "bg-verify-50 text-verify-600"
        }`}
      >
        {state.message}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-3 space-y-2" noValidate={false}>
      <label htmlFor={`newsletter-email-${source}`} className="sr-only">
        Email address
      </label>
      <div className="flex gap-2">
        <input
          id={`newsletter-email-${source}`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Enter your email address"
          className={inputClass}
          disabled={state.kind === "submitting"}
        />
        <button
          type="submit"
          disabled={state.kind === "submitting"}
          className="h-10 shrink-0 rounded bg-signal-600 px-3 text-small font-bold text-white transition-colors hover:bg-signal-700 disabled:opacity-60"
        >
          {state.kind === "submitting" ? "…" : ctaLabel}
        </button>
      </div>

      {state.kind === "error" && (
        <p role="alert" className={`text-caption leading-snug ${onDark ? "text-signal-200" : "text-signal-700"}`}>
          {state.message}
        </p>
      )}

      <p className={`text-caption leading-snug ${onDark ? "text-navy-300" : "text-navy-500"}`}>
        By subscribing you agree to our{" "}
        <Link href="/privacy" className="underline">
          privacy policy
        </Link>
        . Unsubscribe at any time.
      </p>
    </form>
  );
}
