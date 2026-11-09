import Link from "next/link";
import { BrandLink } from "@/components/brand";

const POLICY_LINKS = [
  { href: "/editorial-standards", label: "Editorial Standards" },
  { href: "/corrections", label: "Corrections" },
  { href: "/privacy", label: "Privacy Policy" },
  { href: "/terms", label: "Terms of Service" },
  { href: "/cookies", label: "Cookie Policy" },
  { href: "/disclaimer", label: "Disclaimer" },
];

const SECTION_LINKS = [
  { href: "/category/us-news", label: "U.S. News" },
  { href: "/category/politics", label: "Politics" },
  { href: "/category/world", label: "World" },
  { href: "/category/business", label: "Business" },
  { href: "/category/economy", label: "Economy" },
  { href: "/category/technology", label: "Technology" },
  { href: "/category/health", label: "Health" },
  { href: "/category/science", label: "Science" },
  { href: "/category/sports", label: "Sports" },
  { href: "/category/entertainment", label: "Entertainment" },
  { href: "/category/opinion", label: "Opinion" },
];

const COMPANY_LINKS = [
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

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-navy-950 text-navy-300 on-dark">
      <div className="shell py-12">
        <div className="grid gap-10 md:grid-cols-12">
          <div className="md:col-span-4">
            <BrandLink variant="light" size="md" />
            <p className="mt-4 max-w-sm text-body leading-relaxed text-navy-400">
              American Signal Desk reports on the news that shapes the country — with named
              sourcing, editorial review before publication, and a corrections ledger readers can
              inspect.
            </p>

            <div className="mt-6">
              <h2 className="text-caption font-bold tracking-[0.14em] text-white uppercase">
                Follow us
              </h2>
              <ul className="mt-2 flex items-center gap-2">
                {SOCIAL.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      aria-label={social.label}
                      rel="noopener noreferrer nofollow"
                      target="_blank"
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-800 text-navy-200 transition-colors hover:bg-signal-600 hover:text-white"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
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

          <nav aria-labelledby="footer-sections" className="md:col-span-4">
            <h2
              id="footer-sections"
              className="text-caption font-bold tracking-[0.14em] text-white uppercase"
            >
              Sections
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-body">
              {SECTION_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-policies" className="md:col-span-2">
            <h2
              id="footer-policies"
              className="text-caption font-bold tracking-[0.14em] text-white uppercase"
            >
              Policies
            </h2>
            <ul className="mt-3 space-y-2 text-body">
              {POLICY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-company" className="md:col-span-2">
            <h2
              id="footer-company"
              className="text-caption font-bold tracking-[0.14em] text-white uppercase"
            >
              Company
            </h2>
            <ul className="mt-3 space-y-2 text-body">
              {COMPANY_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="hover:text-white hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-navy-800 pt-6 text-caption text-navy-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} American Signal Desk. All rights reserved.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/sitemap.xml" className="hover:text-white">
              Sitemap
            </Link>
            <Link href="/admin" className="hover:text-white">
              Admin
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
