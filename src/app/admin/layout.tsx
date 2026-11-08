import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { getAdminSession } from "@/server/auth/session";

/**
 * Admin shell.
 *
 * This layout renders navigation only. It is NOT the security boundary — every admin page
 * and every mutation independently calls requireAdminSession()/requirePermission() on the
 * server. A user who forges their way to this layout still sees nothing and can do nothing.
 *
 * The session read below only decides whether to draw the sidebar; it never decides access.
 */
export const metadata: Metadata = {
  title: { default: "Admin", template: "%s | ASD Admin" },
  robots: { index: false, follow: false, nocache: true },
};

const NAV: { group: string; items: { href: string; label: string; badge?: string }[] }[] = [
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
    <div className="min-h-dvh bg-navy-50">
      <header className="bg-navy-900">
        <div className="mx-auto flex max-w-[1800px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/admin" aria-label="ASD Admin home">
            <Wordmark variant="light" size="sm" />
          </Link>
          <div className="flex items-center gap-4 text-xs">
            <Link href="/" className="text-navy-200 hover:text-white hover:underline">
              View live site
            </Link>
            {session ? (
              <span className="flex items-center gap-2 text-navy-100">
                <span
                  aria-hidden="true"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-navy-700 text-[10px] font-bold text-white"
                >
                  {(session.displayName || session.email || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{session.displayName ?? session.email}</span>
              </span>
            ) : (
              <Link href="/admin/login" className="font-semibold text-white hover:underline">
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1800px] gap-6 px-4 py-6 sm:px-6">
        <aside
          aria-label="Admin navigation"
          className="hidden w-60 shrink-0 lg:block"
        >
          <nav className="sticky top-6 space-y-5">
            {NAV.map((group) => (
              <div key={group.group}>
                <h2 className="px-2 text-[10px] font-bold tracking-widest text-navy-500 uppercase">
                  {group.group}
                </h2>
                <ul className="mt-1.5 space-y-0.5">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex items-center justify-between rounded px-2 py-1.5 text-[13px] font-medium text-navy-800 hover:bg-white"
                      >
                        <span>{item.label}</span>
                        {item.badge && (
                          <span className="rounded bg-signal-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                            {item.badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
