"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * TOTP challenge.
 *
 * The second factor is verified against Supabase's MFA API; the resulting session carries
 * `aal2`, which the server-side session guard checks. This component never decides access.
 */
export function MfaForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("৬-সংখ্যার কোড দিন।");
      return;
    }

    setPending(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      );

      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (factorError) {
        setError("যাচাই করা যাচ্ছে না। আবার চেষ্টা করুন।");
        return;
      }

      const totp = factors?.totp?.[0];
      if (!totp) {
        setError(
          "এই অ্যাকাউন্টে কোনো TOTP ফ্যাক্টর নেই। প্রথমে MFA সেটআপ সম্পন্ন করুন অথবা সুপার অ্যাডমিনের সাথে যোগাযোগ করুন।",
        );
        return;
      }

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: totp.id,
        code: trimmed,
      });

      if (verifyError) {
        // Generic message: do not distinguish "wrong code" from "expired challenge".
        setError("কোডটি সঠিক নয় বা সময় শেষ হয়ে গেছে।");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("সাময়িকভাবে সমস্যা হচ্ছে। আবার চেষ্টা করুন।");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="code" className="block text-sm font-semibold text-navy-900">
          যাচাই কোড
        </label>
        <input
          id="code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          aria-describedby={error ? "mfa-error" : "mfa-help"}
          aria-invalid={Boolean(error)}
          className="mt-1 h-12 w-full rounded-md border border-navy-200 px-3 text-center font-mono text-2xl tracking-[0.4em]"
          placeholder="000000"
          disabled={pending}
          autoFocus
        />
        <p id="mfa-help" className="mt-1 text-xs text-navy-500">
          কোড প্রতি ৩০ সেকেন্ডে বদলায়।
        </p>
      </div>

      {error && (
        <p
          id="mfa-error"
          role="alert"
          className="rounded-md bg-signal-50 px-3 py-2 text-xs text-signal-800 ring-1 ring-signal-200"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || code.length !== 6}
        className="h-11 w-full rounded-md bg-signal-600 text-sm font-bold text-white hover:bg-signal-700 disabled:opacity-60"
      >
        {pending ? "যাচাই হচ্ছে…" : "যাচাই করুন"}
      </button>
    </form>
  );
}
