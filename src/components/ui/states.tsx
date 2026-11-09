/**
 * Honest state components.
 *
 * Rule from the brief: never display fake live metrics or fake security status.
 * These components make "not configured" and "unknown" first-class, visible states
 * so a feature can never silently pretend to be healthy.
 */
import Link from "next/link";
import { buttonClass, cardClass } from "@/components/ui/styles";

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className={`${cardClass()} px-6 py-12 text-center`}>
      <p className="text-base font-semibold text-navy-900">{title}</p>
      <p className="mx-auto mt-2 max-w-prose text-sm text-navy-600">{description}</p>
      {action && (
        <Link href={action.href} className={buttonClass("secondary", "sm", "mt-5")}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

export function NoticeBanner({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning" | "danger";
  title: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: "bg-navy-50 text-navy-900 ring-navy-200",
    warning: "bg-amber-50 text-amber-900 ring-amber-300",
    danger: "bg-signal-50 text-signal-900 ring-signal-300",
  } as const;

  return (
    <div role="status" className={`rounded-md px-4 py-3 text-sm ring-1 ${tones[tone]}`}>
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-[13px] leading-relaxed">{children}</div>}
    </div>
  );
}

/** Rendered whenever an integration lacks credentials. Never fakes a green light. */
export function NotConfigured({
  feature,
  requiredEnv,
  detail,
}: {
  feature: string;
  requiredEnv: readonly string[];
  detail: string;
}) {
  return (
    <div className={`${cardClass()} p-6`}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-800"
        >
          !
        </span>
        <div>
          <h3 className="text-base font-semibold text-navy-900">{feature} is not configured</h3>
          <p className="mt-1 text-sm text-navy-600">{detail}</p>
          <p className="mt-3 text-xs font-semibold tracking-wide text-navy-500 uppercase">
            Required environment variables
          </p>
          <ul className="mt-1 space-y-1">
            {requiredEnv.map((name) => (
              <li key={name}>
                <code className="rounded bg-navy-50 px-1.5 py-0.5 font-mono text-xs text-navy-800">
                  {name}
                </code>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-navy-500">
            Add these in your hosting provider&apos;s encrypted environment settings. Never paste
            secrets into chat.
          </p>
        </div>
      </div>
    </div>
  );
}
