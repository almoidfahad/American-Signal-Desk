import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POLICIES } from "../policies";

/**
 * Static institutional pages: editorial standards, terms, privacy, cookies, disclaimer.
 *
 * `dynamicParams = false` means only slugs present in POLICIES resolve and everything else
 * 404s, so this route cannot be used to probe for hidden pages.
 *
 * The corrections page deliberately does NOT live here. It reads a live ledger, and mixing
 * a dynamic page into a statically-prerendered catch-all with `dynamicParams = false`
 * produced a 404 in `next start` even though the build reported success — every path was
 * prerendered, so the fallback never existed. Corrections now has its own route at
 * `(public)/corrections`, where the dynamic behaviour is explicit and testable.
 */
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ policy: string[] }>;
}

export function generateStaticParams() {
  return POLICIES.filter((p) => p.slug !== "corrections").map((p) => ({ policy: [p.slug] }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { policy } = await params;
  const doc = POLICIES.find((p) => p.slug === policy.join("/"));
  if (!doc) return { title: "Page not found", robots: { index: false } };
  return {
    title: doc.title,
    description: doc.summary,
    alternates: { canonical: `/${doc.slug}` },
  };
}

export default async function PolicyPage({ params }: PageProps) {
  const { policy } = await params;
  const doc = POLICIES.find((p) => p.slug === policy.join("/"));
  if (!doc) notFound();

  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl font-extrabold text-navy-900">{doc.title}</h1>
      <p className="mt-2 text-sm text-navy-600">{doc.summary}</p>
      <p className="mt-1 text-xs text-navy-500">
        Last updated{" "}
        <time dateTime="2026-11-08">{doc.updated}</time>
      </p>

      <div className="prose-asd mt-8 text-[16px] text-navy-900">
        {doc.sections.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.body.map((paragraph, i) => (
              <p key={i}>{paragraph}</p>
            ))}
          </section>
        ))}
      </div>
    </article>
  );
}
