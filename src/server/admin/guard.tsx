import Link from "next/link";
import type { ReactNode } from "react";
import { NotConfigured } from "@/components/ui/states";
import { tryAdminSession } from "@/server/auth/session";
import { can, type Permission } from "@/server/authz/permissions";
import type { AdminSession } from "@/server/auth/session";

/**
 * Shared gate for admin pages.
 *
 * Every page calls this before drawing anything. It is the same shape the dashboard uses,
 * and it exists so no admin page can be written that forgets the check: the data fetchers
 * take the returned session, so there is no path to the data without one.
 *
 * The three denial cases are kept distinct on purpose. "Sign in" is not the same problem as
 * "signed in with no role", and neither is the same as "second factor missing" - telling an
 * operator the wrong one sends them down the wrong road.
 */
export type AdminPageAccess =
  | { ok: true; session: AdminSession }
  | { ok: false; node: ReactNode };

const DENIAL: Record<
  "unauthenticated" | "no_role" | "mfa" | "forbidden",
  { title: string; body: string; href: string; label: string }
> = {
  unauthenticated: {
    title: "Sign in required",
    body: "This page is restricted to authorised staff. Sign in with your ASD account to continue.",
    href: "/admin/login",
    label: "Go to sign in",
  },
  no_role: {
    title: "No role assigned",
    body: "Your account is signed in but has no administrative role. Ask a Super Admin to assign one.",
    href: "/",
    label: "Return to the site",
  },
  mfa: {
    title: "Multi-factor authentication required",
    body: "Privileged accounts must complete a second factor before this page unlocks. Continue to the two-factor page to verify — or to set up an authenticator app if you have not enrolled one yet.",
    href: "/admin/login/mfa",
    label: "Continue to two-factor",
  },
  forbidden: {
    title: "Not your permission to use",
    body: "Your role does not include the permission this page requires. That decision is made on the server and is not affected by the navigation you can see.",
    href: "/admin",
    label: "Back to the dashboard",
  },
};

export async function requireAdminPage(permission?: Permission): Promise<AdminPageAccess> {
  const access = await tryAdminSession();

  if (!access.ok) return { ok: false, node: <DenialCard kind={access.reason} /> };

  if (permission) {
    const actor = { userId: access.session.userId, roles: access.session.roles };
    if (!can(actor, permission)) return { ok: false, node: <DenialCard kind="forbidden" /> };
  }

  return { ok: true, session: access.session };
}

export function DenialCard({ kind }: { kind: keyof typeof DENIAL }) {
  const copy = DENIAL[kind];
  return (
    <div className="mx-auto max-w-lg py-16">
      <div className="rounded-card bg-white p-8 ring-1 ring-navy-100 shadow-sm">
        <h1 className="text-xl font-bold text-navy-900">{copy.title}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-navy-600">{copy.body}</p>
        <Link
          href={copy.href}
          className="mt-5 inline-block rounded-md bg-signal-600 px-4 py-2.5 text-[13px] font-bold text-white hover:bg-signal-700"
        >
          {copy.label}
        </Link>
        <p className="mt-6 border-t border-navy-100 pt-4 text-[11.5px] leading-relaxed text-navy-500">
          Authorisation is enforced on the server for every admin page and action. Hiding a
          navigation link is not how access is controlled here.
        </p>
      </div>
    </div>
  );
}

/**
 * Renders the "this integration has no credentials" panel in a page body.
 * Used instead of showing an empty table, which would claim "zero records" when the truth
 * is "we never reached the database".
 */
export function IntegrationMissing({
  feature,
  env,
  detail,
}: {
  feature: string;
  env: string[];
  detail: string;
}) {
  return <NotConfigured feature={feature} requiredEnv={env} detail={detail} />;
}
