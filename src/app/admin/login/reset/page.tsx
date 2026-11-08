import type { Metadata } from "next";
import Link from "next/link";
import { NotConfigured } from "@/components/ui/states";
import { ResetForm } from "./reset-form";

export const metadata: Metadata = {
  title: "পাসওয়ার্ড রিসেট",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

export default function ResetPage() {
  const configured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-extrabold text-navy-900">পাসওয়ার্ড রিসেট</h1>
      <p className="mt-1 text-sm text-navy-600">
        আপনার অ্যাকাউন্টের ইমেইল দিন। রিসেট লিংক পাঠানো হবে।
      </p>

      <div className="mt-6 rounded-lg bg-white p-6 ring-1 ring-navy-100">
        {configured ? (
          <ResetForm />
        ) : (
          <NotConfigured
            feature="পাসওয়ার্ড রিসেট"
            requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
            detail="অথেন্টিকেশন কনফিগার করা নেই, তাই রিসেট ইমেইল পাঠানো সম্ভব নয়।"
          />
        )}
      </div>

      <Link href="/admin/login" className="mt-4 text-xs font-semibold text-navy-700 hover:underline">
        ← সাইন ইনে ফিরে যান
      </Link>
    </div>
  );
}
