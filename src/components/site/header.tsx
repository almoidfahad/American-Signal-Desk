import Link from "next/link";
import { BrandLink } from "@/components/brand";
import { SiteNav } from "./site-nav";

/**
 * Site header: utility strip, masthead, navigation.
 *
 * Three bands, matching the editorial reference. The masthead carries the wordmark and the
 * positioning line; the nav band is a distinct darker blue so the eye can find the section
 * links without reading them.
 *
 * Data honesty note: the date is rendered from the current time in America/New_York, not a
 * frozen string, so it cannot silently go stale on a cached page.
 */

const UTILITY_NAV = [
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
  { href: "/advertise", label: "Advertise" },
  { href: "/newsletter", label: "Newsletter" },
];

const SOCIAL = [
  { href: "https://facebook.com", label: "Facebook", path: "M13 3h4V0h-4c-3 0-5 2-5 5v3H5v3h3v10h3V11h3l1-3h-4V5c0-1 1-2 2-2Z" },
  { href: "https://x.com", label: "X", path: "M17 3h3l-7 8 8 10h-6l-5-6-5 6H2l8-9-7-9h6l4 5 4-5Z" },
  { href: "https://youtube.com", label: "YouTube", path: "M22 8s0-3-1-4c-1-1-3-1-8-1s-7 0-8 1-1 4-1 4v8s0 3 1 4c1 1 3 1 8 1s7 0 8-1 1-4 1-4V8Zm-13 7V9l6 3-6 3Z" },
  { href: "https://linkedin.com", label: "LinkedIn", path: "M5 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3 9h4v12H3V9Zm7 0h4v2c1-1 2-2 4-2 3 0 4 2 4 5v7h-4v-6c0-2-1-3-2-3s-2 1-2 3v6h-4V9Z" },
];

function todayInNewYork(): { label: string; iso: string } {
  const now = new Date();
  const label = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(now);
  return { label, iso: now.toISOString().slice(0, 10) };
}

function timeInNewYork(): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  }).format(new Date());
}

export function SiteHeader({ categories }: { categories: { slug: string; name: string }[] }) {
  const today = todayInNewYork();

  return (
    <header className="border-b border-navy-100 bg-white">
      {/* Band 1 — utility */}
      <div className="bg-navy-950 text-white on-dark">
        <div className="shell flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-1.5 text-[11.5px]">
          <p className="flex items-center gap-2 font-medium text-navy-200">
            <time dateTime={today.iso}>{today.label}</time>
            <span aria-hidden="true" className="text-navy-600">
              |
            </span>
            <span className="tabular">{timeInNewYork()}</span>
          </p>
          <div className="flex items-center gap-4">
            <nav aria-label="Utility" className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {UTILITY_NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-navy-100 transition-colors hover:text-white hover:underline"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <ul aria-label="Social" className="hidden items-center gap-1.5 sm:flex">
              {SOCIAL.map((social) => (
                <li key={social.label}>
                  <a
                    href={social.href}
                    aria-label={social.label}
                    rel="noopener noreferrer nofollow"
                    target="_blank"
                    className="flex h-6 w-6 items-center justify-center rounded-full bg-navy-800 text-navy-100 transition-colors hover:bg-signal-600 hover:text-white"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="currentColor"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <path d={social.path} />
                    </svg>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Band 2 — masthead */}
      <div className="relative overflow-hidden">
        {/* Decorative dome silhouette, drawn in CSS so it costs no request and stays sharp. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 bg-gradient-to-l from-navy-100/70 via-navy-50/40 to-transparent md:block"
        />
        <div className="shell relative flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between md:py-6">
          <BrandLink size="lg" />
          <div className="hidden text-right md:block">
            <p className="font-serif text-[26px] leading-tight font-bold tracking-tight text-navy-900">
              Real News. Real Impact.
            </p>
            <p className="mt-1 text-[11px] font-bold tracking-[0.18em] text-navy-500 uppercase">
              Breaking News &bull; In-Depth Analysis &bull; Expert Insights
            </p>
          </div>
        </div>
      </div>

      {/* Band 3 — sections */}
      <SiteNav categories={categories} />
    </header>
  );
}
