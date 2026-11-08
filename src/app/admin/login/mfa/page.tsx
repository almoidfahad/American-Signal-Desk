import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotConfigured } from "@/components/ui/states";
import { getAdminSession } from "@/server/auth/session";
import { MfaForm } from "./mfa-form";

export const metadata: Metadata = {
  title: "দুই-ধাপ যাচাই",
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
          feature="দুই-ধাপ যাচাই"
          requiredEnv={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]}
          detail="অথেন্টিকেশন কনফিগার করা নেই, তাই MFA চালু করা সম্ভব নয়।"
        />
      </div>
    );
  }

  // Already satisfied a second factor → straight to the dashboard.
  const session = await getAdminSession();
  if (session?.mfaVerified) redirect("/admin");

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="text-2xl font-extrabold text-navy-900">দুই-ধাপ যাচাই</h1>
      <p className="mt-1 text-sm text-navy-600">
        অ্যাডমিন প্যানেলে ঢোকার জন্য আপনার অথেনটিকেটর অ্যাপের ৬-সংখ্যার কোডটি দিন।
      </p>

      <div className="mt-6 rounded-lg bg-white p-6 ring-1 ring-navy-100">
        <MfaForm />
      </div>

      <div className="mt-4 flex justify-between text-xs">
        <Link href="/admin/login" className="font-semibold text-navy-700 hover:underline">
          ← আবার সাইন ইন
        </Link>
        <Link href="/contact" className="text-navy-500 hover:underline">
          সহায়তা দরকার?
        </Link>
      </div>
    </div>
  );
}
