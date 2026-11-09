"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { loginSchema } from "@/lib/validation/auth";

/**
 * Sign-in form.
 *
 * The browser client is used only to obtain a session; every authorization decision after
 * that happens on the server. Errors are deliberately generic ("Invalid email or password")
 * so the form cannot be used to enumerate accounts.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const parsed = loginSchema.safeParse({
      email: formData.get("email"),
      password: formData.get("password"),
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check your details and try again.");
      return;
    }

    setPending(true);
    try {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL as string,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
      );

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (signInError) {
        setError("Invalid email or password.");
        return;
      }

      // Privileged access additionally requires a verified second factor.
      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
        router.push("/admin/login/mfa");
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("Sign-in is temporarily unavailable. Try again shortly.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <label htmlFor="email" className="block text-caption font-semibold text-navy-700">
          Email Address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          aria-describedby={error ? "login-error" : undefined}
          className="mt-1 h-11 w-full rounded-md border border-navy-200 px-3 text-body"
          disabled={pending}
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-caption font-semibold text-navy-700">
          Password
        </label>
        <div className="relative mt-1">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            aria-describedby={error ? "login-error" : undefined}
            className="h-11 w-full rounded-md border border-navy-200 px-3 pr-20 text-body"
            disabled={pending}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-2 my-auto h-7 rounded px-2 text-caption font-semibold text-navy-600 hover:bg-navy-50"
            aria-pressed={showPassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-caption">
        <label className="flex items-center gap-2 text-navy-700">
          <input type="checkbox" name="remember" className="h-4 w-4 rounded border-navy-300" />
          Remember me
        </label>
        <Link href="/admin/login/reset" className="font-semibold text-navy-700 hover:underline">
          Forgot password?
        </Link>
      </div>

      {error && (
        <p id="login-error" role="alert" className="rounded-md bg-signal-50 px-3 py-2 text-caption text-signal-800 ring-1 ring-signal-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-md bg-signal-600 text-body font-bold text-white hover:bg-signal-700 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign In"}
      </button>

      <p className="border-t border-navy-100 pt-3 text-center text-caption leading-relaxed text-navy-500">
        Accounts are provisioned by invitation. Multi-factor authentication is required for
        privileged roles.
      </p>
    </form>
  );
}
