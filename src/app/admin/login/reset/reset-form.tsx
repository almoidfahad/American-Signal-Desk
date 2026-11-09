"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { emailSchema } from "@/lib/validation/auth";

/**
 * Password reset request.
 *
 * Always reports the same outcome regardless of whether the address exists. That is
 * deliberate: revealing which emails have accounts is a privacy leak and an enumeration
 * vector for targeted attacks.
 */
export function ResetForm() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address.");
      return;
    }

    setPending(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      );

      await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/admin/login/reset/confirm`,
      });

      // Same message whether or not the account exists.
      setSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div role="status">
        <p className="text-body font-semibold text-navy-900">Request received</p>
        <p className="mt-2 text-body text-navy-600">
          If an account exists for that address, a reset link has been sent. It should arrive
          shortly; check your spam folder if it does not.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="reset-email" className="block text-body font-semibold text-navy-900">
          Email address
        </label>
        <input
          id="reset-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={Boolean(error)}
          className="mt-1 h-11 w-full rounded-md border border-navy-200 px-3 text-body"
          disabled={pending}
        />
      </div>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md bg-signal-50 px-3 py-2 text-caption text-signal-800 ring-1 ring-signal-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-md bg-signal-600 text-body font-bold text-white hover:bg-signal-700 disabled:opacity-60"
      >
        {pending ? "Sending..." : "Send reset link"}
      </button>
    </form>
  );
}
