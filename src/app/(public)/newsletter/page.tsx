import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Newsletter",
  description: "Get the American Signal Desk morning briefing in your inbox.",
  alternates: { canonical: "/newsletter" },
};

export default function NewsletterPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-serif text-headline font-extrabold text-navy-900">The Daily Signal</h1>
      <p className="mt-2 text-navy-700">
        A concise briefing on the stories that matter, delivered each weekday morning.
      </p>

      <form
        action="/api/v1/newsletter/subscribe"
        method="post"
        className="mt-8 rounded-lg p-6 ring-1 ring-navy-100"
      >
        <label htmlFor="email" className="block text-body font-semibold text-navy-900">
          Email address
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          aria-describedby="email-help"
          className="mt-2 h-11 w-full rounded-md border border-navy-200 px-3 text-body"
        />
        <p id="email-help" className="mt-1 text-caption text-navy-500">
          We send one email per weekday. Unsubscribe in one click at any time.
        </p>
        <button
          type="submit"
          className="mt-4 h-11 rounded-md bg-signal-600 px-6 text-body font-bold text-white hover:bg-signal-700"
        >
          Subscribe
        </button>
      </form>

      <p className="mt-6 rounded-md bg-amber-50 px-4 py-3 text-caption text-amber-900 ring-1 ring-amber-300">
        The subscription endpoint and double opt-in flow are wired in a later phase. This form is
        intentionally not faking a success state — submitting before then returns a clear
        &ldquo;not yet available&rdquo; response.
      </p>
    </div>
  );
}
