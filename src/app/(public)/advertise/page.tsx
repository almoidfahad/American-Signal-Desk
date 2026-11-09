import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Advertise",
  description: "Advertising and partnership opportunities with American Signal Desk.",
  alternates: { canonical: "/advertise" },
};

export default function AdvertisePage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-headline font-extrabold text-navy-900">Advertise With Us</h1>
      <div className="prose-asd mt-6 text-body">
        <p>
          American Signal Desk reaches readers who follow national policy, markets and technology.
          We offer display placements and sponsored content, clearly labelled as sponsored.
        </p>
        <h2>Placements</h2>
        <ul>
          <li>Upper-funnel display: homepage rail and in-feed units</li>
          <li>Newsletter sponsorship, sold per send</li>
          <li>Clearly labelled sponsored articles, subject to editorial review</li>
        </ul>
        <h2>What we will not do</h2>
        <p>
          We do not sell editorial coverage, and sponsored material is never presented as reporting.
          Advertising is served from isolated slots so it can never inject content into an article
          body.
        </p>
        <h2>Contact</h2>
        <p>
          Email <span className="font-mono text-body">ads@americansignaldesk.com</span> for the current
          rate card. Campaign reporting is available in the admin panel once a campaign is booked.
        </p>
      </div>
    </div>
  );
}
