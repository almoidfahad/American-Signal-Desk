import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About Us",
  description: "Who we are, how we report, and how our newsroom is organised.",
  alternates: { canonical: "/about" },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-headline font-extrabold text-navy-900">About American Signal Desk</h1>
      <p className="mt-3 text-dek text-navy-700">
        Trusted news. A stronger America.
      </p>

      <div className="prose-asd mt-8 text-body">
        <h2>What we do</h2>
        <p>
          American Signal Desk reports on national affairs, politics, the economy, technology and
          the issues that shape daily life in the United States. We publish reporting we can stand
          behind, attribute clearly what we cannot independently verify, and correct errors openly.
        </p>

        <h2>How the newsroom works</h2>
        <p>
          Writers produce drafts. Editors review, request changes, and approve. Only an approved
          article can be published, and every publication decision is recorded in an audit trail
          with the person who made it.
        </p>
        <p>
          We use AI tools for research assistance, summarisation and first-draft structure. Those
          tools are treated as untrusted sources: their output cannot be published without a human
          editor verifying claims against recorded sources. Articles that received AI assistance
          carry a visible disclosure.
        </p>

        <h2>Our standards</h2>
        <p>
          Our full standards — including sourcing requirements, labelling of opinion and analysis,
          and the corrections process — are published at{" "}
          <Link href="/editorial-standards">Editorial Standards</Link>.
        </p>

        <h2>Contact</h2>
        <p>
          General enquiries: <Link href="/contact">contact us</Link>. Corrections:{" "}
          <Link href="/corrections">corrections policy</Link>. Advertising:{" "}
          <Link href="/advertise">advertise with us</Link>.
        </p>
      </div>
    </div>
  );
}
