import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { NotConfigured } from "@/components/ui/states";
import { getAdminSession } from "@/server/auth/session";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = {
  title: "Two-factor verification",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  if (!configured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-6">
        <NotConfigured
          feature="Two-factor verification"
          requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
          detail="Authentication is not configured in this environment, so a second factor cannot be checked. Without a working identity provider this page cannot be exercised at all."
        />
      </div>
    );
  }

  // Already satisfied a second factor -> straight to the dashboard.
  const session = await getAdminSession();
  if (session?.mfaVerified) redirect("/admin");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-6 flex justify-center">
        <Wordmark size="md" />
      </div>

      <div className="rounded-xl bg-white p-7 shadow-xl shadow-navy-900/5 ring-1 ring-navy-100">
        <h1 className="text-[22px] font-extrabold text-navy-900">Two-factor verification</h1>
        <p className="mt-1 text-[13px] text-navy-600">
          Enter the 6-digit code from your authenticator app to continue.
        </p>
        <div className="mt-5">
          <MfaForm />
        </div>
      </div>

      <div className="mt-4 flex justify-between text-[11.5px]">
        <Link href="/admin/login" className="font-semibold text-navy-700 hover:underline">
          Back to sign in
        </Link>
        <Link href="/contact" className="text-navy-500 hover:underline">
          Need help?
        </Link>
      </div>
    </div>
  );
}
