import { NotConfigured } from "@/components/ui/states";
import type { Result } from "@/server/admin/queries";

/**
 * The two ways a list can fail to exist, kept visually distinct.
 *
 * `not_configured` is a deployment problem the operator may not be able to fix from here.
 * `error` is a live query that failed, which usually means something is broken right now.
 * Both are shown as themselves; neither is rendered as an empty table, because an empty
 * table says "there are zero of these", which is a different and often false statement.
 */
export function ListUnavailable<T>({
  feature,
  requiredEnv,
  result,
  detail,
}: {
  feature: string;
  requiredEnv: readonly string[];
  result: Extract<Result<T>, { ok: false }>;
  detail: string;
}) {
  if (result.state === "not_configured") {
    return <NotConfigured feature={feature} requiredEnv={requiredEnv} detail={detail} />;
  }

  return (
    <div
      role="alert"
      className="rounded-md bg-signal-50 px-4 py-3 text-small text-signal-900 ring-1 ring-signal-300"
    >
      <p className="font-bold">This list could not be read</p>
      <p className="mt-1 leading-relaxed">
        The query ran and failed, so what you see is an error, not an empty result. The reason
        reported by the database was: <span className="font-mono text-caption">{result.message}</span>
      </p>
    </div>
  );
}
