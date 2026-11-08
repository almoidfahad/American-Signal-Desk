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
      setError(parsed.error.issues[0]?.message ?? "সঠিক ইমেইল দিন।");
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
      setError("সাময়িকভাবে সমস্যা হচ্ছে। আবার চেষ্টা করুন।");
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <div role="status">
        <p className="text-sm font-semibold text-navy-900">অনুরোধ গ্রহণ করা হয়েছে</p>
        <p className="mt-2 text-sm text-navy-600">
          যদি এই ইমেইলে কোনো অ্যাকাউন্ট থাকে, একটি রিসেট লিংক পাঠানো হয়েছে। লিংকটি কিছুক্ষণের
          মধ্যেই আসবে; না এলে স্প্যাম ফোল্ডার দেখুন।
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="reset-email" className="block text-sm font-semibold text-navy-900">
          ইমেইল ঠিকানা
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
          className="mt-1 h-11 w-full rounded-md border border-navy-200 px-3 text-sm"
          disabled={pending}
        />
      </div>

      {error && (
        <p
          role="alert"
          aria-live="polite"
          className="rounded-md bg-signal-50 px-3 py-2 text-xs text-signal-800 ring-1 ring-signal-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-md bg-signal-600 text-sm font-bold text-white hover:bg-signal-700 disabled:opacity-60"
      >
        {pending ? "পাঠানো হচ্ছে…" : "রিসেট লিংক পাঠান"}
      </button>
    </form>
  );
}
