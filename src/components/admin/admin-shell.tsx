"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { ExternalIcon } from "@/components/ui/icons";

export interface NavItem {
  href: string;
  label: string;
  badge?: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

/**
 * Admin chrome: top bar, sidebar, content area.
 *
 * Security note: this component decides what to *draw*, never what is permitted. Every admin
 * page and every mutation calls requireAdminSession()/requirePermission() on the server. A
 * user who forces this sidebar to render still sees an empty page, because the data behind
 * each link is fetched under its own server-side check.
 *
 * Mobile: the sidebar becomes a drawer. It is `hidden` from the accessibility tree when
 * closed, so a screen reader is not read a list of links that is not visible.
 */
export function AdminShell({
  children,
  nav,
  session,
}: {
  children: React.ReactNode;
  nav: NavGroup[];
  session: { displayName: string | null; email: string | null; roles: string[] } | null;
}) {
  const pathname = usePathname();
  const [drawerFor, setDrawerFor] = useState<string | null>(null);
  // Deriving drawer state from the path closes it on navigation without an effect.
  const drawerOpen = drawerFor === pathname;

  const initial = (session?.displayName || session?.email || "?").slice(0, 1).toUpperCase();

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    if (href === "/admin/articles") {
      return pathname === "/admin/articles" || /^\/admin\/articles\/[^/]+$/.test(pathname);
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="min-h-dvh bg-navy-50">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-navy-800 bg-navy-950 text-white on-dark">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setDrawerFor(drawerOpen ? null : pathname)}
            aria-expanded={drawerOpen}
            aria-controls="admin-sidebar"
            className="flex h-9 w-9 items-center justify-center rounded hover:bg-navy-800 lg:hidden"
          >
            <span aria-hidden="true" className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
            </span>
            <span className="sr-only">{drawerOpen ? "Close navigation" : "Open navigation"}</span>
          </button>

          <Link href="/admin" aria-label="ASD Admin home" className="shrink-0">
            <Wordmark variant="light" size="sm" />
          </Link>

          <form
            action="/admin/articles"
            role="search"
            className="ml-2 hidden max-w-md flex-1 items-center gap-2 md:flex"
          >
            <label htmlFor="admin-search" className="sr-only">
              Search articles
            </label>
            <div className="relative w-full">
              <input
                id="admin-search"
                name="q"
                type="search"
                placeholder="Search articles, authors, or slugs…"
                className="h-9 w-full rounded-md border border-navy-700 bg-navy-900 pl-9 pr-3 text-[13px] text-white placeholder:text-navy-300 focus:border-navy-400"
              />
              <svg
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-navy-400"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </div>
          </form>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <SystemStateChip />
            <Link
              href="/"
              className="hidden items-center gap-1.5 rounded-md bg-signal-600 px-3 py-1.5 text-[12px] font-bold text-white hover:bg-signal-700 sm:flex"
            >
              <ExternalIcon className="h-3.5 w-3.5" />
              View Live Site
            </Link>
            {session ? (
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-700 text-[12px] font-bold text-white"
                >
                  {initial}
                </span>
                <span className="hidden leading-tight sm:block">
                  <span className="block text-[12px] font-semibold text-white">
                    {session.displayName ?? session.email ?? "Signed in"}
                  </span>
                  <span className="block text-[10.5px] text-navy-300">
                    {session.roles.length > 0 ? session.roles.join(", ") : "No role assigned"}
                  </span>
                </span>
              </div>
            ) : (
              <Link
                href="/admin/login"
                className="rounded-md bg-white px-3 py-1.5 text-[12px] font-bold text-navy-900"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside
          id="admin-sidebar"
          aria-label="Admin navigation"
          className={`${
            drawerOpen ? "block" : "hidden"
          } fixed inset-y-14 left-0 z-30 w-64 overflow-y-auto border-r border-navy-800 bg-navy-950 pb-6 lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:w-60 lg:shrink-0`}
        >
          <nav className="px-2 py-3">
            {nav.map((group) => (
              <div key={group.group} className="mb-4">
                <h2 className="px-2 pb-1.5 text-[10px] font-bold tracking-[0.14em] text-navy-500 uppercase">
                  {group.group}
                </h2>
                <ul className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setDrawerFor(null)}
                          className={`flex items-center justify-between rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors ${
                            active
                              ? "bg-signal-600 font-semibold text-white"
                              : "text-navy-200 hover:bg-navy-800 hover:text-white"
                          }`}
                        >
                          <span>{item.label}</span>
                          {item.badge && (
                            <span className="rounded bg-signal-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="mx-2 mt-2 rounded-md border border-navy-800 bg-navy-900 p-3">
            <p className="text-[11px] font-bold text-white">Server-authorised</p>
            <p className="mt-1 text-[10.5px] leading-snug text-navy-300">
              Every admin page and action is checked on the server. Hiding a link is not how
              access is controlled here.
            </p>
          </div>
        </aside>

        {/* Drawer scrim */}
        {drawerOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerFor(null)}
            className="fixed inset-0 z-20 bg-navy-950/50 lg:hidden"
          />
        )}

        <main id="main" className="min-w-0 flex-1 px-3 py-5 sm:px-5 lg:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Honest environment chip.
 *
 * It reports what this build can actually see. It does not say "System Online" - that would
 * be a claim about the database, the queue and the deployment, and this component cannot see
 * any of them. It only ever states which environment the reader is looking at.
 */
function SystemStateChip() {
  return (
    <span className="hidden items-center gap-1.5 rounded-md border border-navy-700 bg-navy-900 px-2.5 py-1.5 text-[11px] font-semibold text-navy-200 sm:flex">
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-400" />
      Admin preview
    </span>
  );
}
