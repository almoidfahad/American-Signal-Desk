import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { NotConfigured } from "@/components/ui/states";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "Password reset",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ResetPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex justify-center">
        <Wordmark size="md" />
      </div>

      <div className="rounded-xl bg-white p-7 shadow-xl shadow-navy-900/5 ring-1 ring-navy-100">
        <h1 className="text-heading font-extrabold text-navy-900">Reset your password</h1>
        <p className="mt-1 text-small text-navy-600">
          Enter your account email and we will send a reset link.
        </p>

        <div className="mt-5">
          {configured ? (
            <ResetForm />
          ) : (
            <NotConfigured
              feature="Password reset"
              requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
              detail="Authentication is not configured, so no reset email can be sent. There is no offline workaround, and none is simulated."
            />
          )}
        </div>
      </div>

      <Link
        href="/admin/login"
        className="mt-4 text-center text-caption font-semibold text-navy-700 hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
