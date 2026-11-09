import Link from "next/link";
import { Badge, Panel } from "@/components/admin/ui";

/**
 * A page for a subsystem that is specified but not implemented.
 *
 * Why this exists rather than a prettier mock: the navigation has an entry for every planned
 * control surface, and a link that 404s is worse than a page that says plainly what is
 * missing. Equally, a page full of greyed-out controls that look real is worse than both —
 * an operator cannot tell "disabled because of my role" from "disabled because it was never
 * built", and those demand completely different responses.
 *
 * So: no fake chart, no fake queue depth, no fake credit balance. What is shown is the real
 * design (the permission that will gate it, the table it will write, the dependency it needs)
 * and the exact reason it is not live yet.
 */
export interface PlannedFeatureProps {
  title: string;
  summary: string;
  /** The permission that will gate this surface once it exists. */
  permission: string;
  status: "not_implemented" | "blocked";
  /** Concrete, checkable reasons. Each should name a file, table or service. */
  missing: { item: string; detail: string }[];
  /** What would be true once it works — the acceptance shape, not a promise of a date. */
  whenReady: string[];
  /** Where the reader can go instead, because something adjacent does work. */
  alternatives?: { href: string; label: string; note: string }[];
}

const STATUS_COPY = {
  not_implemented: {
    label: "Not implemented",
    tone: "amber" as const,
    blurb: "This surface has no backend yet. Nothing is being simulated.",
  },
  blocked: {
    label: "Blocked on configuration",
    tone: "red" as const,
    blurb: "The code path exists but a required service is not configured in this environment.",
  },
};

export function PlannedFeature({
  title,
  summary,
  permission,
  status,
  missing,
  whenReady,
  alternatives,
}: PlannedFeatureProps) {
  const statusCopy = STATUS_COPY[status];

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-heading leading-tight font-extrabold tracking-tight text-navy-900">
            {title}
          </h1>
          <Badge tone={statusCopy.tone}>{statusCopy.label}</Badge>
        </div>
        <p className="mt-1.5 text-small leading-relaxed text-navy-600">{summary}</p>
      </div>

      <Panel bodyClassName="p-0">
        <div className="border-b border-navy-100 bg-navy-50/60 px-4 py-3">
          <p className="text-small leading-relaxed text-navy-700">
            {statusCopy.blurb} Everything on this page is a description of the design that
            exists in code or documentation; none of it is a reading taken from a running
            system.
          </p>
        </div>

        <div className="px-4 py-4">
          <h2 className="text-micro font-bold tracking-[0.12em] text-navy-500 uppercase">
            What is missing
          </h2>
          <ul className="mt-2 space-y-2.5">
            {missing.map((entry) => (
              <li key={entry.item} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-signal-500"
                />
                <div>
                  <p className="text-small font-bold text-navy-900">{entry.item}</p>
                  <p className="mt-0.5 text-caption leading-relaxed text-navy-600">{entry.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-t border-navy-100 px-4 py-4">
          <h2 className="text-micro font-bold tracking-[0.12em] text-navy-500 uppercase">
            What it will do once built
          </h2>
          <ul className="mt-2 space-y-1.5">
            {whenReady.map((line) => (
              <li key={line} className="flex gap-2 text-caption leading-relaxed text-navy-700">
                <span aria-hidden="true" className="text-verify-600">
                  +
                </span>
                {line}
              </li>
            ))}
          </ul>
          <p className="mt-3 rounded-md bg-navy-50 px-3 py-2 text-caption leading-relaxed text-navy-600">
            Gate: <span className="font-mono text-navy-800">{permission}</span>. This page is
            reachable now because the check is enforced by the page itself; the control
            surface will not appear until the backend it controls exists.
          </p>
        </div>

        {alternatives && alternatives.length > 0 && (
          <div className="border-t border-navy-100 bg-navy-50/40 px-4 py-3.5">
            <h2 className="text-micro font-bold tracking-[0.12em] text-navy-500 uppercase">
              Available now
            </h2>
            <ul className="mt-2 flex flex-wrap gap-2">
              {alternatives.map((alt) => (
                <li key={alt.href}>
                  <Link
                    href={alt.href}
                    className="inline-flex flex-col rounded-md border border-navy-200 bg-white px-3 py-2 text-caption font-semibold text-navy-800 hover:border-navy-300 hover:text-signal-700"
                  >
                    {alt.label}
                    <span className="mt-0.5 text-micro font-normal text-navy-500">
                      {alt.note}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
