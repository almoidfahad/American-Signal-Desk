import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { NotConfigured } from "@/components/ui/states";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Admin Sign In",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const CAPABILITIES = [
  { label: "News Management", detail: "Draft -> review -> publish", icon: "▤" },
  { label: "User Management", detail: "Role-based access", icon: "◉" },
  { label: "Audit Trail", detail: "Append-only records", icon: "▲" },
  { label: "Secure Access", detail: "MFA enforced", icon: "⛨" },
];

/**
 * Admin sign-in.
 *
 * Two-panel layout from the editorial reference. Two deliberate departures from the mockup:
 *
 *  1. The federated sign-in row (Google / Microsoft / GitHub) is not drawn unless those
 *     providers are actually configured. Buttons that do nothing are worse than absent ones:
 *     a newsroom editor who clicks "Microsoft" and is silently bounced will report the
 *     system as broken, and they would be right.
 *  2. When Supabase Auth is not configured, the form is replaced by an explicit notice.
 *     There is no development bypass and no fake success path.
 */
export default function AdminLoginPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-navy-950 p-10 text-white on-dark lg:flex">
        {/* Capitol silhouette suggested with layered shapes - no image request, stays crisp */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 opacity-40"
        >
          <div className="absolute bottom-0 left-1/2 h-full w-[520px] -translate-x-1/2 rounded-t-[999px] bg-gradient-to-t from-navy-800 via-navy-900 to-transparent" />
          <div className="absolute bottom-0 left-1/2 h-[45%] w-[320px] -translate-x-1/2 bg-gradient-to-t from-navy-700 to-transparent" />
          <div className="absolute bottom-0 left-0 h-1/3 w-full bg-gradient-to-t from-signal-900/40 to-transparent" />
        </div>

        <div className="relative">
          <Wordmark variant="light" size="lg" />
        </div>

        <div className="relative">
          <p className="inline-block rounded bg-signal-600 px-2.5 py-1 text-[11px] font-extrabold tracking-[0.12em] text-white uppercase">
            Welcome to
          </p>
          <h1 className="mt-3 text-[44px] leading-[1.05] font-extrabold tracking-tight">
            American
            <br />
            <span className="text-signal-500">Signal Desk</span>
          </h1>
          <p className="mt-3 flex items-center gap-3 font-serif text-[22px] text-navy-100">
            <span aria-hidden="true" className="h-px w-8 bg-navy-600" />
            Admin Panel
            <span aria-hidden="true" className="h-px flex-1 bg-navy-600" />
          </p>
          <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-navy-300">
            Manage news, users and content with ease. Every privileged action is authorised on
            the server and written to an append-only audit log.
          </p>
        </div>

        <dl className="relative grid grid-cols-2 gap-2.5 xl:grid-cols-4">
          {CAPABILITIES.map((capability) => (
            <div
              key={capability.label}
              className="rounded-md bg-navy-900/80 p-3 ring-1 ring-navy-800 backdrop-blur-sm"
            >
              <dt className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                <span aria-hidden="true" className="text-signal-500">
                  {capability.icon}
                </span>
                {capability.label}
              </dt>
              <dd className="mt-1 text-[10.5px] leading-snug text-navy-400">
                {capability.detail}
              </dd>
            </div>
          ))}
        </dl>

        <p className="relative text-[10px] tracking-[0.32em] text-navy-500 uppercase">
          Inform &bull; Empower &bull; Inspire
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex flex-col justify-center bg-navy-50 px-4 py-10 sm:px-8">
        <div className="mx-auto w-full max-w-[430px]">
          <div className="mb-6 flex justify-center lg:hidden">
            <Wordmark size="md" />
          </div>

          <div className="rounded-xl bg-white p-7 shadow-xl shadow-navy-900/5 ring-1 ring-navy-100 sm:p-8">
            <div className="text-center">
              <span
                aria-hidden="true"
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-navy-900 text-[20px] text-white"
              >
                ⛨
              </span>
              <h2 className="mt-3 text-[24px] leading-tight font-extrabold text-navy-900">
                Admin Panel Login
              </h2>
              <p className="mt-1 text-[13px] text-navy-600">Sign in to your account to continue</p>
              <div aria-hidden="true" className="mt-5 flex items-center gap-3">
                <span className="h-px flex-1 bg-navy-100" />
                <span className="text-[11px] text-signal-600">★</span>
                <span className="h-px flex-1 bg-navy-100" />
              </div>
            </div>

            <div className="mt-5">
              {configured ? (
                <AdminLoginForm />
              ) : (
                <NotConfigured
                  feature="Sign in"
                  requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
                  detail="Authentication is provided by Supabase Auth and is not configured in this environment. Sign-in is disabled rather than simulated - there is no development bypass."
                />
              )}
            </div>

            {configured && (
              <p className="mt-5 text-center text-[11px] leading-relaxed text-navy-500">
                Federated sign-in (Google, Microsoft, GitHub) appears here once the providers are
                enabled in Supabase Auth. Adding a button before the provider works would be
                misleading, so it is omitted.
              </p>
            )}
          </div>

          <div className="mt-5 rounded-lg bg-white p-3 text-center ring-1 ring-navy-100">
            <p className="flex items-center justify-center gap-1.5 text-[11.5px] font-bold text-navy-900">
              <span aria-hidden="true" className="text-verify-600">
                ⛨
              </span>
              Server-authorised access
            </p>
            <p className="mt-0.5 text-[10.5px] leading-snug text-navy-500">
              Authorisation is enforced on the server for every page and action - not by hiding
              buttons.
            </p>
          </div>

          <p className="mt-4 text-center text-[10.5px] text-navy-500">
            &copy; {new Date().getFullYear()} American Signal Desk. All rights reserved.
            <span className="mx-1.5" aria-hidden="true">
              |
            </span>
            <Link href="/privacy" className="hover:underline">
              Privacy
            </Link>
            <span className="mx-1.5" aria-hidden="true">
              |
            </span>
            <Link href="/terms" className="hover:underline">
              Terms
            </Link>
            <span className="mx-1.5" aria-hidden="true">
              |
            </span>
            <Link href="/contact" className="hover:underline">
              Contact
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
