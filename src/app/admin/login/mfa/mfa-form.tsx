"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

/**
 * TOTP challenge and enrolment.
 *
 * The second factor is verified against Supabase's MFA API; the resulting session carries
 * `aal2`, which the server-side session guard checks. This component never decides access.
 *
 * A first-time privileged sign-in has no factor yet, so this form enrols one when needed:
 * it shows the authenticator QR code and the manual-entry key, then verifies the first code
 * before the session reaches `aal2`.
 */
export function MfaForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"loading" | "verify" | "enroll">("loading");
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      );
      const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (factorError) {
        // Surface the problem on submit rather than guessing here.
        setMode("verify");
        return;
      }
      const totp = factors?.totp?.[0];
      if (totp) {
        setFactorId(totp.id);
        setMode("verify");
      } else {
        setMode("enroll");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onEnroll() {
    setError(null);
    setEnrolling(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      );
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp" });
      if (enrollError || !data) {
        setError("Authenticator setup is unavailable right now. Try again.");
        return;
      }
      setFactorId(data.id);
      setQrCode(data.totp?.qr_code ?? null);
      setSecret(data.totp?.secret ?? null);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setEnrolling(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) {
      setError("Enter the 6-digit code.");
      return;
    }

    setPending(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      );

      let id = factorId;
      if (!id) {
        const { data: factors, error: factorError } = await supabase.auth.mfa.listFactors();
        const totp = factors?.totp?.[0];
        if (factorError || !totp) {
          setError("This account has no authenticator enrolled. Choose setup first.");
          return;
        }
        id = totp.id;
        setFactorId(id);
      }

      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: id,
        code: trimmed,
      });

      if (verifyError) {
        // Generic message: do not distinguish "wrong code" from "expired challenge".
        setError("That code is not valid, or it has expired.");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setPending(false);
    }
  }

  if (mode === "loading") {
    return <p className="text-body text-navy-600">Checking your account…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {mode === "enroll" && !qrCode && (
        <div className="space-y-3">
          <p className="text-body text-navy-700">
            This account has no authenticator yet. Set one up to continue — privileged accounts
            require a second factor.
          </p>
          <button
            type="button"
            onClick={onEnroll}
            disabled={enrolling}
            className="h-11 w-full rounded-md bg-signal-600 text-body font-bold text-white hover:bg-signal-700 disabled:opacity-60"
          >
            {enrolling ? "Setting up…" : "Set up authenticator"}
          </button>
        </div>
      )}

      {(mode === "verify" || Boolean(qrCode)) && (
        <>
          {qrCode && (
            <div className="space-y-2">
              <p id="mfa-help" className="text-caption text-navy-600">
                Scan this QR code with your authenticator app (or enter the key manually), then
                enter the 6-digit code it shows.
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCode}
                alt="Authenticator enrolment QR code"
                className="mx-auto h-40 w-40 rounded-md ring-1 ring-navy-100"
              />
              {secret && (
                <p className="break-all rounded-md bg-navy-50 px-3 py-2 text-center font-mono text-caption text-navy-800">
                  {secret}
                </p>
              )}
            </div>
          )}

          <div>
            <label htmlFor="code" className="block text-body font-semibold text-navy-900">
              Verification code
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
              aria-describedby={error ? "mfa-error" : qrCode ? undefined : "mfa-help"}
              aria-invalid={Boolean(error)}
              className="mt-1 h-12 w-full rounded-md border border-navy-200 px-3 text-center font-mono text-heading tracking-[0.4em]"
              placeholder="000000"
              disabled={pending}
              autoFocus
            />
            {!qrCode && (
              <p id="mfa-help" className="mt-1 text-caption text-navy-500">
                The code changes every 30 seconds.
              </p>
            )}
          </div>
        </>
      )}

      {error && (
        <p
          id="mfa-error"
          role="alert"
          className="rounded-md bg-signal-50 px-3 py-2 text-caption text-signal-800 ring-1 ring-signal-200"
        >
          {error}
        </p>
      )}

      {(mode === "verify" || Boolean(qrCode)) && (
        <button
          type="submit"
          disabled={pending || code.length !== 6}
          className="h-11 w-full rounded-md bg-signal-600 text-body font-bold text-white hover:bg-signal-700 disabled:opacity-60"
        >
          {pending ? "Verifying..." : "Verify"}
        </button>
      )}
    </form>
  );
}
