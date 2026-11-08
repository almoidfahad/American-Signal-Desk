import Link from "next/link";
import type { CorrectionFeed } from "@/server/content/corrections";

/**
 * Renders the corrections ledger, keeping the three states visually distinct.
 *
 * The reason this is a component rather than a few lines inside the page: the difference
 * between "we have published no corrections" and "we could not read our corrections" is
 * the difference between a clean record and a hiding place. That distinction is enforced
 * in the data layer (see corrections.ts) and must survive into the markup — so an outage
 * never renders as an empty, reassuring page.
 */
export function CorrectionList({ feed }: { feed: CorrectionFeed }) {
  if (feed.state === "unavailable") {
    return (
      <div
        role="status"
        className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
      >
        <p className="font-semibold">Corrections are temporarily unavailable</p>
        <p className="mt-1">
          {feed.reason ??
            "We could not load the corrections ledger. This is a technical failure on our side, not a statement that no corrections exist."}
        </p>
      </div>
    );
  }

  if (feed.state === "empty") {
    return (
      <div className="mt-6 rounded-lg border border-navy-200 bg-navy-50 p-4 text-sm text-navy-800">
        <p className="font-semibold">No corrections have been published</p>
        <p className="mt-1">
          We have published no corrections to date. If you believe something we published is
          wrong, please tell us — the process is described above.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h2 className="font-serif text-xl font-bold text-navy-900">Published corrections</h2>
      <ol className="mt-4 space-y-6">
        {feed.corrections.map((entry) => (
          <li key={entry.id} className="border-l-4 border-red-600 pl-4">
            <time
              dateTime={entry.createdAt}
              className="text-xs font-semibold uppercase tracking-wide text-navy-500"
            >
              {formatDate(entry.createdAt)}
            </time>
            <h3 className="mt-1 font-serif text-lg font-bold text-navy-900">
              {entry.articleSlug ? (
                <Link href={`/article/${entry.articleSlug}`} className="hover:underline">
                  {entry.articleTitle || entry.articleSlug}
                </Link>
              ) : (
                entry.articleTitle
              )}
            </h3>
            <p className="mt-2 text-sm text-navy-700">
              <span className="font-semibold">What was wrong: </span>
              {entry.description}
            </p>
            <p className="mt-1 text-sm text-navy-700">
              <span className="font-semibold">What it says now: </span>
              {entry.correction}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}
