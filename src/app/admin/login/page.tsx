import type { Metadata } from "next";
import { Wordmark } from "@/components/brand";
import { NotConfigured } from "@/components/ui/states";
import { AdminLoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Admin Sign In",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminLoginPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <aside className="relative hidden flex-col justify-between bg-navy-950 p-10 lg:flex">
        <Wordmark variant="light" size="lg" />
        <div>
          <p className="inline-block rounded bg-signal-600 px-2 py-1 text-xs font-bold tracking-wide text-white uppercase">
            Welcome to
          </p>
          <h1 className="mt-3 font-serif text-4xl font-extrabold text-white">
            American <span className="text-signal-500">Signal Desk</span>
          </h1>
          <p className="mt-2 border-t border-navy-700 pt-3 font-serif text-2xl text-navy-100">
            Admin Panel
          </p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-navy-300">
            Manage news, users and content with ease. Every privileged action is authorised on the
            server and written to an append-only audit log.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          {[
            ["News Management", "Draft → review → publish"],
            ["User Management", "Role-based access"],
            ["Audit Trail", "Append-only records"],
            ["Secure Access", "MFA enforced"],
          ].map(([label, detail]) => (
            <div key={label} className="rounded-md bg-navy-900/70 p-3 ring-1 ring-navy-800">
              <dt className="text-xs font-bold text-white">{label}</dt>
              <dd className="mt-1 text-[11px] text-navy-400">{detail}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[10px] tracking-[0.3em] text-navy-500 uppercase">
          Inform &bull; Empower &bull; Inspire
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="rounded-xl bg-white p-8 ring-1 ring-navy-100">
            <div className="text-center">
              <h2 className="text-2xl font-extrabold text-navy-900">Admin Panel Login</h2>
              <p className="mt-1 text-sm text-navy-600">Sign in to your account to continue</p>
            </div>

            <div className="mt-6">
              {configured ? (
                <AdminLoginForm />
              ) : (
                <NotConfigured
                  feature="Sign in"
                  requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
                  detail="Authentication is provided by Supabase Auth and is not configured in this environment. Sign-in is disabled rather than simulated — there is no development bypass."
                />
              )}
            </div>

            {/* Federated providers are listed only once they are actually configured. */}
            {configured && (
              <p className="mt-6 text-center text-[11px] leading-relaxed text-navy-500">
                Federated sign-in (Google, Microsoft, GitHub) appears here once the providers are
                enabled in Supabase Auth. Adding a button before the provider works would be
                misleading, so it is omitted.
              </p>
            )}
          </div>

          <p className="mt-4 text-center text-[11px] text-navy-500">
            &copy; {new Date().getFullYear()} American Signal Desk. All rights reserved.
          </p>
        </div>
      </main>
    </div>
  );
}
