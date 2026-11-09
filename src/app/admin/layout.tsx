import type { Metadata } from "next";
import { AdminShell, type NavGroup } from "@/components/admin/admin-shell";
import { getAdminSession } from "@/server/auth/session";

/**
 * Admin shell.
 *
 * This layout renders navigation only. It is NOT the security boundary — every admin page
 * and every mutation independently calls requireAdminSession()/requirePermission() on the
 * server. A user who forges their way to this layout still sees nothing and can do nothing.
 *
 * The session read below only decides whether to draw the account chip; it never decides
 * access. Items the signed-in user cannot use are drawn anyway and fail server-side, because
 * "the link is missing" is a usability decision, not a security control.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | ASD Admin" },
  robots: { index: false, follow: false, nocache: true },
};

const NAV: NavGroup[] = [
  { group: "Overview", items: [{ href: "/admin", label: "Dashboard" }] },
  {
    group: "News Management",
    items: [
      { href: "/admin/articles", label: "Manage News" },
      { href: "/admin/articles/new", label: "Add News" },
      { href: "/admin/articles/review", label: "Review Queue" },
      { href: "/admin/categories", label: "Categories" },
      { href: "/admin/media", label: "Media Library" },
    ],
  },
  {
    group: "AI & Agent Control",
    items: [
      { href: "/admin/agents", label: "Agent Control Center", badge: "NEW" },
      { href: "/admin/api", label: "API Management" },
      { href: "/admin/jobs", label: "Queue Monitor" },
      { href: "/admin/credits", label: "Credit Wallet" },
      { href: "/admin/deployments", label: "Deployment Control" },
    ],
  },
  {
    group: "Users & Platform",
    items: [
      { href: "/admin/users", label: "Users & Roles" },
      { href: "/admin/analytics", label: "Analytics" },
      { href: "/admin/settings", label: "Settings" },
      { href: "/admin/security", label: "Security Center" },
      { href: "/admin/audit", label: "Audit Logs" },
    ],
  },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getAdminSession();

  return (
    <AdminShell
      nav={NAV}
      session={
        session
          ? {
              displayName: session.displayName ?? null,
              email: session.email ?? null,
              roles: session.roles?.map(String) ?? [],
            }
          : null
      }
    >
      {children}
    </AdminShell>
  );
}
