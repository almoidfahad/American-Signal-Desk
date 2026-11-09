import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Admin design primitives.
 *
 * These exist so every admin screen has the same rhythm. The important constraint they
 * encode: a metric with no data must render as an em dash with a reason, never as a
 * plausible-looking number. `StatCard` therefore takes `value: number | null` and has no
 * default - a caller cannot accidentally pass 0 and have it read as "zero articles today".
 */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-heading leading-tight font-extrabold tracking-tight text-navy-900">
          {title}
        </h1>
        {description && <p className="mt-1 text-small text-navy-600">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`overflow-hidden rounded-card bg-white ring-1 ring-navy-100 shadow-sm ${className}`}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-navy-100 px-4 py-3">
          {title ? (
            <h2 className="text-caption font-extrabold tracking-[0.1em] text-navy-900 uppercase">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </header>
      )}
      <div className={bodyClassName || "p-4"}>{children}</div>
    </section>
  );
}

const TONES = {
  navy: "bg-navy-900/5 text-navy-700 ring-navy-200",
  red: "bg-signal-50 text-signal-700 ring-signal-200",
  green: "bg-verify-50 text-verify-600 ring-verify-500/25",
  amber: "bg-amber-50 text-amber-800 ring-amber-300",
  slate: "bg-navy-50 text-navy-600 ring-navy-200",
} as const;

export type BadgeTone = keyof typeof TONES;

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: BadgeTone;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-micro font-bold ring-1 ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Metric tile.
 *
 * `value === null` means "we could not measure this". It renders an em dash and the reason
 * is carried by the caller in `emptyReason`. There is deliberately no fallback to 0.
 */
export function StatCard({
  label,
  value,
  format,
  icon,
  change,
  changeLabel,
  emptyReason,
}: {
  label: string;
  value: number | null;
  format?: "number" | "currency";
  icon?: ReactNode;
  change?: number | null;
  changeLabel?: string;
  emptyReason?: string;
}) {
  const display =
    value === null
      ? "-"
      : format === "currency"
        ? new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            maximumFractionDigits: 0,
          }).format(value)
        : new Intl.NumberFormat("en-US").format(value);

  return (
    <div className="rounded-card bg-white p-4 ring-1 ring-navy-100 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-bold tracking-[0.06em] text-navy-500 uppercase">
          {label}
        </p>
        {icon && (
          <span
            aria-hidden="true"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-navy-900/5 text-small text-navy-700"
          >
            {icon}
          </span>
        )}
      </div>
      <p className="mt-2 text-heading leading-none font-extrabold text-navy-900 tabular">
        {display}
      </p>
      {value === null && emptyReason ? (
        <p className="mt-2 text-caption leading-snug text-navy-500">{emptyReason}</p>
      ) : change !== undefined && change !== null ? (
        <p className="mt-2 flex items-center gap-1 text-caption font-semibold text-verify-600">
          <span aria-hidden="true">{change >= 0 ? "▲" : "▼"}</span>
          {Math.abs(change)}%
          <span className="font-normal text-navy-500">{changeLabel ?? "vs. previous"}</span>
        </p>
      ) : changeLabel ? (
        <p className="mt-2 text-caption text-navy-500">{changeLabel}</p>
      ) : null}
    </div>
  );
}

export function DataTable({
  head,
  children,
  caption,
}: {
  head: ReactNode;
  children: ReactNode;
  caption?: string;
}) {
  return (
    // A scrollable region must be keyboard-reachable (WCAG): without tabindex a keyboard
    // user cannot scroll a wide table on a narrow screen. The label names the landmark.
    <div
      tabIndex={0}
      role="region"
      aria-label={caption ?? "Data table"}
      className="overflow-x-auto rounded-md focus-visible:outline-2 focus-visible:outline-navy-400"
    >
      <table className="w-full min-w-[640px] border-collapse text-left text-small">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-b border-navy-100 text-micro font-bold tracking-[0.08em] text-navy-500 uppercase">
            {head}
          </tr>
        </thead>
        <tbody className="divide-y divide-navy-50">{children}</tbody>
      </table>
    </div>
  );
}

export function PaginationNote({ shown, total }: { shown: number; total: number | null }) {
  return (
    <p className="mt-3 text-caption text-navy-500">
      Showing {shown}
      {total !== null ? ` of ${total}` : ""} record{shown === 1 ? "" : "s"}
      {total === null && " - total unavailable"}
    </p>
  );
}

/** A quiet, correct empty state for tables. */
export function TableEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-2 py-10 text-center text-small text-navy-500">
        {children}
      </td>
    </tr>
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const className =
    variant === "primary"
      ? "inline-flex h-9 items-center gap-1.5 rounded-md bg-signal-600 px-3.5 text-small font-bold text-white hover:bg-signal-700"
      : "inline-flex h-9 items-center gap-1.5 rounded-md border border-navy-200 bg-white px-3.5 text-small font-semibold text-navy-800 hover:bg-navy-50";
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
