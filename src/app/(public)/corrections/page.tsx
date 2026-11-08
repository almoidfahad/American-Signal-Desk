import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { POLICIES } from "../policies";
import { CorrectionList } from "@/components/news/correction-list";
import { getPublicCorrections } from "@/server/content/corrections";

/**
 * The corrections page.
 *
 * It has its own route rather than living in the `[...policy]` catch-all because it is the
 * only institutional page with live data. Earlier it was a dynamic page inside a
 * statically-prerendered catch-all with `dynamicParams = false`; SITE_URL/sitemap/robots
 * still pointed here but `next start` answered 404, because every allowed path had been
 * prerendered and no fallback existed. A separate route makes the dynamic behaviour
 * explicit, and the build output now shows `ƒ /corrections` rather than silently omitting it.
 *
 * This page is the public half of the promise made in the policy text: published articles
 * keep an immutable revision history, and corrections are logged permanently. The ledger it
 * renders is append-only at the database level (migration 0004).
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Corrections",
  description: "Corrections published by American Signal Desk, with what was wrong and what changed.",
  alternates: { canonical: "/corrections" },
};

export default async function CorrectionsPage() {
  const doc = POLICIES.find((p) => p.slug === "corrections");
  if (!doc) notFound();

  const feed = await getPublicCorrections(50);

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

      <CorrectionList feed={feed} />
    </article>
  );
}
