import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Contact",
  description: "How to reach the American Signal Desk newsroom.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-serif text-3xl font-extrabold text-navy-900">Contact Us</h1>
      <p className="mt-2 text-sm text-navy-600">
        Choose the right desk so your message reaches the people who can act on it.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <section className="rounded-lg p-5 ring-1 ring-navy-100">
          <h2 className="text-base font-bold text-navy-900">Newsroom</h2>
          <p className="mt-2 text-sm text-navy-600">
            Story tips and editorial enquiries.
          </p>
          <p className="mt-3 font-mono text-sm text-navy-800">newsroom@americansignaldesk.com</p>
        </section>

        <section className="rounded-lg p-5 ring-1 ring-navy-100">
          <h2 className="text-base font-bold text-navy-900">Corrections</h2>
          <p className="mt-2 text-sm text-navy-600">
            Report an error in a published article. Include the URL and the specific passage.
          </p>
          <p className="mt-3 font-mono text-sm text-navy-800">corrections@americansignaldesk.com</p>
        </section>

        <section className="rounded-lg p-5 ring-1 ring-navy-100">
          <h2 className="text-base font-bold text-navy-900">Advertising</h2>
          <p className="mt-2 text-sm text-navy-600">Partnerships and media kit requests.</p>
          <p className="mt-3 font-mono text-sm text-navy-800">ads@americansignaldesk.com</p>
        </section>

        <section className="rounded-lg p-5 ring-1 ring-navy-100">
          <h2 className="text-base font-bold text-navy-900">Privacy</h2>
          <p className="mt-2 text-sm text-navy-600">
            Data access, correction and deletion requests.
          </p>
          <p className="mt-3 font-mono text-sm text-navy-800">privacy@americansignaldesk.com</p>
        </section>
      </div>

      <p className="mt-8 rounded-md bg-navy-50 px-4 py-3 text-xs text-navy-600">
        A contact form with server-side validation and spam protection is wired in a later phase.
        Email addresses above are the working contact route until then.
      </p>
    </div>
  );
}
