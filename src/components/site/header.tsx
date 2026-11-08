import Link from "next/link";
import { BrandLink } from "@/components/brand";

const PRIMARY_NAV = [
  { href: "/category/us-news", label: "U.S. News" },
  { href: "/category/politics", label: "Politics" },
  { href: "/category/world", label: "World" },
  { href: "/category/business", label: "Business" },
  { href: "/category/technology", label: "Technology" },
  { href: "/category/health", label: "Health" },
  { href: "/category/science", label: "Science" },
  { href: "/category/sports", label: "Sports" },
  { href: "/category/entertainment", label: "Entertainment" },
  { href: "/category/opinion", label: "Opinion" },
];

const UTILITY_NAV = [
  { href: "/about", label: "About Us" },
  { href: "/contact", label: "Contact" },
  { href: "/advertise", label: "Advertise" },
  { href: "/newsletter", label: "Newsletter" },
];

function TODAY(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  }).format(new Date());
}

export function SiteHeader() {
  return (
    <header className="border-b border-navy-100 bg-white">
      {/* Utility strip */}
      <div className="bg-navy-950 text-white">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-2 px-4 py-1.5 text-[12px] sm:px-6">
          <p className="font-medium text-navy-200">
            <time dateTime={new Date().toISOString().slice(0, 10)}>{TODAY()}</time>
          </p>
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
        </div>
      </div>

      {/* Masthead */}
      <div className="mx-auto flex max-w-[1560px] flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:justify-between">
        <BrandLink size="lg" />
        <div className="hidden text-right md:block">
          <p className="font-serif text-2xl font-bold tracking-tight text-navy-900">
            Real News. Real Impact.
          </p>
          <p className="mt-1 text-xs font-semibold tracking-wide text-navy-500 uppercase">
            Breaking News &bull; In-Depth Analysis &bull; Expert Insights
          </p>
        </div>
      </div>

      {/* Primary nav */}
      <nav aria-label="Sections" className="bg-navy-900">
        <div className="mx-auto max-w-[1560px] px-4 sm:px-6">
          <ul className="flex flex-wrap items-center gap-x-1">
            <li>
              <Link
                href="/"
                className="block px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-signal-600"
              >
                Home
              </Link>
            </li>
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-3 py-3 text-sm font-medium text-navy-100 transition-colors hover:bg-navy-800 hover:text-white"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="ml-auto">
              <Link
                href="/search"
                className="block px-3 py-3 text-sm font-medium text-navy-100 transition-colors hover:bg-navy-800 hover:text-white"
              >
                Search
              </Link>
            </li>
          </ul>
        </div>
      </nav>
    </header>
  );
}
