import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POLICIES } from "../policies";

/**
 * Catch-all for static institutional pages. Only slugs present in POLICIES resolve;
 * everything else 404s, so the catch-all cannot be used to probe for hidden routes.
 */
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ policy: string[] }>;
}

export function generateStaticParams() {
  return POLICIES.map((p) => ({ policy: [p.slug] }));
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
