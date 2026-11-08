/** Small style primitives. Kept as plain functions (no client JS) so server components can use them. */

const base =
  "inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors " +
  "focus-visible:outline-3 disabled:cursor-not-allowed disabled:opacity-60";

const sizes = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
  lg: "h-12 px-6 text-base",
} as const;

const variants = {
  primary: "bg-signal-600 text-white hover:bg-signal-700 active:bg-signal-800",
  navy: "bg-navy-900 text-white hover:bg-navy-800",
  secondary: "bg-navy-50 text-navy-900 ring-1 ring-navy-200 hover:bg-navy-100",
  ghost: "text-navy-800 hover:bg-navy-50",
  outline: "ring-1 ring-navy-300 text-navy-900 hover:bg-navy-50",
  danger: "bg-signal-700 text-white hover:bg-signal-800",
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  extra = "",
): string {
  return [base, sizes[size], variants[variant], extra].filter(Boolean).join(" ");
}

export function cardClass(extra = ""): string {
  return ["rounded-[--radius-card]", "bg-white ring-1 ring-navy-100 shadow-sm", extra]
    .filter(Boolean)
    .join(" ");
}

/** Status pill used for article states and system health. Colour + text, never colour alone. */
const statusTones = {
  neutral: "bg-navy-50 text-navy-700 ring-navy-200",
  success: "bg-verify-500/10 text-verify-600 ring-verify-500/30",
  warning: "bg-amber-50 text-amber-800 ring-amber-300",
  danger: "bg-signal-50 text-signal-700 ring-signal-300",
  info: "bg-navy-100 text-navy-800 ring-navy-300",
} as const;

export type StatusTone = keyof typeof statusTones;

export function statusClass(tone: StatusTone = "neutral"): string {
  return `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${statusTones[tone]}`;
}

/** Maps an article status to a tone + human label, so statuses read the same everywhere. */
export const ARTICLE_STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "Pending Review", tone: "warning" },
  changes_requested: { label: "Changes Requested", tone: "warning" },
  approved: { label: "Approved", tone: "info" },
  scheduled: { label: "Scheduled", tone: "info" },
  published: { label: "Published", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  archived: { label: "Archived", tone: "neutral" },
  trash: { label: "Trash", tone: "danger" },
};
