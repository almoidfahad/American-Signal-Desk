import type { ServiceClient } from "@/server/db/client";
import type { ProbeResult } from "./compute-health";

/**
 * Database reachability probe for the readiness endpoint.
 *
 * Runs one cheap query against a real table and reports exactly what happened. The
 * outcome is evidence, never a guess: a timeout is a failed probe, and a failed probe is
 * reported as such rather than as an absence of evidence.
 */

export async function probeDatabase(client: ServiceClient, timeoutMs = 3000): Promise<ProbeResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<ProbeResult>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, detail: `Probe timed out after ${timeoutMs} ms` }), timeoutMs);
  });

  const probe = (async (): Promise<ProbeResult> => {
    try {
      const { count, error } = await client.from("articles").select("id", { count: "exact", head: true });
      if (error) return { ok: false, detail: `Probe failed: ${error.message || "query error"}` };
      return { ok: true, detail: `Probe verified: articles reachable (${count ?? 0} rows)` };
    } catch (err) {
      return { ok: false, detail: `Probe failed: ${err instanceof Error ? err.message : "unknown error"}` };
    }
  })();

  try {
    return await Promise.race([probe, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
