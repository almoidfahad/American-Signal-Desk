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
  { href: "/category/technology", label: "Technology" },
  { href: "/category/opinion", label: "Opinion" },
];

export function SiteFooter() {
  return (
    <footer className="mt-16 bg-navy-950 text-navy-200">
      <div className="mx-auto max-w-[1560px] px-4 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <BrandLink variant="light" size="md" />
            <p className="mt-4 max-w-md text-sm leading-relaxed text-navy-300">
              American Signal Desk reports on the news that shapes the country — with sourcing,
              editorial review and a corrections policy you can actually read.
            </p>
          </div>

          <nav aria-labelledby="footer-sections">
            <h2 id="footer-sections" className="text-xs font-bold tracking-widest text-white uppercase">
              Sections
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {SECTION_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-policies">
            <h2 id="footer-policies" className="text-xs font-bold tracking-widest text-white uppercase">
              Policies
            </h2>
            <ul className="mt-3 space-y-2 text-sm">
              {POLICY_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-white hover:underline">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-navy-800 pt-6 text-xs text-navy-400 sm:flex-row sm:items-center sm:justify-between">
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
