"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface MegaColumn {
  slug: string;
  name: string;
}

/**
 * Primary navigation.
 *
 * Three things it must do, in priority order: be usable by keyboard, work at 320px, and
 * not consume half the viewport on a phone. The screenshot's mega-menus are desktop-only
 * affordances; on touch they collapse to the expandable panel below.
 */
export function SiteNav({ categories }: { categories: MegaColumn[] }) {
  const pathname = usePathname();
  /**
   * Which panel (if any) is open, and the route it was opened on.
   *
   * Storing the route alongside the panel means navigating away closes it by derivation
   * rather than by an effect — no state is set during render or after a commit, so there is
   * no cascading re-render. A panel opened on /politics is simply not open on /world.
   */
  const [openPanel, setOpenPanel] = useState<{ panel: "mobile" | "search"; path: string } | null>(
    null,
  );

  const mobileOpen = openPanel?.panel === "mobile" && openPanel.path === pathname;
  const searchOpen = openPanel?.panel === "search" && openPanel.path === pathname;

  const togglePanel = (panel: "mobile" | "search") => {
    setOpenPanel((current) =>
      current?.panel === panel && current.path === pathname ? null : { panel, path: pathname },
    );
  };

  // Escape closes whatever is open, and body scroll is restored.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenPanel(null);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <div className="bg-navy-900 text-white on-dark">
      <div className="shell">
        <div className="flex items-stretch">
          {/* Mobile menu trigger */}
          <button
            type="button"
            onClick={() => togglePanel("mobile")}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
            className="flex items-center gap-2 px-3 py-3 text-sm font-semibold hover:bg-navy-800 lg:hidden"
          >
            <span aria-hidden="true" className="flex flex-col gap-[3px]">
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
              <span className="block h-[2px] w-4 bg-current" />
            </span>
            {mobileOpen ? "Close" : "Menu"}
          </button>

          {/* Desktop navigation */}
          <nav aria-label="Sections" className="hidden lg:block">
            <ul className="flex items-stretch">
              <li>
                <Link
                  href="/"
                  aria-current={isActive("/") ? "page" : undefined}
                  className={`block px-4 py-3 text-[13px] font-bold uppercase tracking-wide transition-colors ${
                    isActive("/") ? "bg-signal-600" : "hover:bg-signal-600"
                  }`}
                >
                  Home
                </Link>
              </li>
              {categories.map((category) => {
                const href = `/category/${category.slug}`;
                return (
                  <li key={category.slug}>
                    <Link
                      href={href}
                      aria-current={isActive(href) ? "page" : undefined}
                      className={`block px-3 py-3 text-[13px] font-semibold transition-colors hover:bg-navy-800 ${
                        isActive(href) ? "bg-navy-800 text-white" : "text-navy-100"
                      }`}
                    >
                      {category.name}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="ml-auto flex items-stretch">
            <Link
              href="/opinion"
              className="hidden px-3 py-3 text-[13px] font-semibold text-navy-100 hover:bg-navy-800 md:block"
            >
              More
            </Link>
            <button
              type="button"
              onClick={() => togglePanel("search")}
              aria-expanded={searchOpen}
              aria-controls="nav-search"
              className="flex items-center gap-2 px-4 py-3 text-sm font-semibold hover:bg-navy-800"
            >
              <SearchIcon />
              <span className="sr-only sm:not-sr-only">Search</span>
            </button>
          </div>
        </div>

        {/* Search bar — expanded on demand so it does not cost vertical space on every page */}
        {searchOpen && (
          <form
            id="nav-search"
            action="/search"
            method="get"
            role="search"
            className="border-t border-navy-800 py-3"
          >
            <label htmlFor="nav-search-input" className="sr-only">
              Search news
            </label>
            <div className="flex gap-2">
              <input
                id="nav-search-input"
                name="q"
                type="search"
                autoFocus
                placeholder="Search news, authors, or topics…"
                className="h-10 min-w-0 flex-1 rounded-md border border-navy-600 bg-navy-950 px-3 text-sm text-white placeholder:text-navy-400 focus:border-white"
              />
              <button
                type="submit"
                className="h-10 rounded-md bg-signal-600 px-4 text-sm font-bold hover:bg-signal-700"
              >
                Search
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <nav
          id="mobile-nav"
          aria-label="Sections"
          className="max-h-[70dvh] overflow-y-auto border-t border-navy-800 bg-navy-950 lg:hidden"
        >
          <ul className="shell py-2">
            <li>
              <Link href="/" className="block rounded px-2 py-3 text-sm font-bold hover:bg-navy-800">
                Home
              </Link>
            </li>
            {categories.map((category) => (
              <li key={category.slug}>
                <Link
                  href={`/category/${category.slug}`}
                  className="block rounded px-2 py-3 text-sm font-medium text-navy-100 hover:bg-navy-800"
                >
                  {category.name}
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t border-navy-800 pt-2">
              <Link
                href="/search"
                className="block rounded px-2 py-3 text-sm font-semibold text-white hover:bg-navy-800"
              >
                Search
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
