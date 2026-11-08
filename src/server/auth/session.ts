/**
 * Server-side session resolution.
 *
 * This module is the single place where "who is calling?" is answered. It reads the
 * Supabase auth cookie server-side and resolves the caller's roles from the database
 * (never from a client-supplied claim).
 *
 * Current phase behaviour (documented, not hidden):
 *   - With Supabase configured, sessions come from supabase-js SSR cookies.
 *   - Without Supabase, there is NO session. Admin routes therefore deny everything.
 *     There is deliberately no "dev admin bypass" because a bypass flag that ships to
 *     production is exactly how these systems get breached.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { cache } from "react";
import type { Actor, Permission } from "@/server/authz/permissions";
import { AuthorizationError, can } from "@/server/authz/permissions";

export interface AdminSession {
  userId: string;
  email: string | null;
  displayName: string | null;
  roles: string[];
  /** Effective permissions, resolved server-side from the database. */
  permissions: string[];
  mfaVerified: boolean;
  /** True when privileged access should be blocked pending MFA enrolment. */
  mfaRequired: boolean;
}

function mfaRequiredByPolicy(): boolean {
  const flag = process.env.REQUIRE_MFA_FOR_ADMIN;
  // Default to requiring MFA unless explicitly disabled. Safer failure mode.
  return flag === undefined || flag === "true" || flag === "1";
}

function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Resolves the current admin session, or null. Memoised per request so multiple
 * components/policies in one render do not each hit the database.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  if (!isSupabaseConfigured()) return null;

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render: cookies are read-only there.
            // Session refresh is handled by middleware instead.
          }
        },
      },
    },
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name,email,status,mfa_enrolled")
    .eq("id", user.id)
    .maybeSingle();

  // A suspended or disabled account is treated as having no session at all.
  if (profile && (profile.status === "suspended" || profile.status === "disabled")) return null;

  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role,expires_at")
    .eq("user_id", user.id);

  const now = Date.now();
  const roles = (roleRows ?? [])
    .filter((r) => !r.expires_at || new Date(r.expires_at as string).getTime() > now)
    .map((r) => r.role as string);

  const { data: permRows } = await supabase
    .from("role_permissions")
    .select("role,permission")
    .in("role", roles.length > 0 ? roles : ["__none__"]);

  const permissions = [...new Set((permRows ?? []).map((r) => r.permission as string))];

  // MFA: the authoritative factor state lives in auth.mfa_factors; `aal` reflects whether
  // this session satisfied a second factor.
  let mfaVerified = false;
  try {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    mfaVerified = aal?.currentLevel === "aal2";
  } catch {
    mfaVerified = false;
  }

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? null,
    displayName: (profile?.display_name as string | null) ?? null,
    roles,
    permissions,
    mfaVerified,
    mfaRequired: mfaRequiredByPolicy(),
  };
});

export function sessionHasPermission(session: AdminSession, permission: Permission): boolean {
  return session.permissions.includes(permission);
}

/**
 * Guard for admin pages and privileged server actions.
 *
 * Throws instead of returning a boolean so a caller cannot accidentally ignore the result.
 * Route handlers map the thrown AuthorizationError to a 401/403 response.
 */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) {
    throw new AuthorizationError("Authentication required");
  }
  if (session.roles.length === 0) {
    throw new AuthorizationError("No administrative role assigned");
  }
  if (session.mfaRequired && !session.mfaVerified) {
    throw new AuthorizationError("Multi-factor authentication required");
  }
  return session;
}

export async function requirePermission(permission: Permission): Promise<AdminSession> {
  const session = await requireAdminSession();
  const actor: Actor = { userId: session.userId, roles: session.roles };
  if (!can(actor, permission)) {
    throw new AuthorizationError(`Missing permission: ${permission}`);
  }
  return session;
}

/** For page components: renders a denial view instead of throwing to an error boundary. */
export async function tryAdminSession(): Promise<
  { ok: true; session: AdminSession } | { ok: false; reason: "unauthenticated" | "no_role" | "mfa" }
> {
  const session = await getAdminSession();
  if (!session) return { ok: false, reason: "unauthenticated" };
  if (session.roles.length === 0) return { ok: false, reason: "no_role" };
  if (session.mfaRequired && !session.mfaVerified) return { ok: false, reason: "mfa" };
  return { ok: true, session };
}
