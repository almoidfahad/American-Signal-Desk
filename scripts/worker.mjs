#!/usr/bin/env node
/**
 * Worker loop.
 *
 * The long-lived form of the same tick the cron endpoint runs. It exists so the queue is
 * not tied to a platform feature: anything that can run `node` can run this, and the
 * behaviour is identical because it calls the same function.
 *
 *   npm run worker              tick every 15s
 *   npm run worker -- --once    one tick, print the result, exit
 *
 * Why a loop and not an event: the queue is a table. Claiming is atomic, so polling is
 * correct — and for work measured in minutes, a 15 second poll is indistinguishable from
 * being notified. Polling also means a crashed worker needs no reconnection logic.
 */
const INTERVAL_MS = Number(process.env.WORKER_INTERVAL_MS ?? 15_000);

async function main() {
  const { tick } = await import("../src/server/jobs/runner.ts");
  const { serviceClient } = await import("../src/server/db/client.ts");

  if (!serviceClient()) {
    console.error(
      "The worker needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. Nothing will run.",
    );
    // A worker that exits 0 when it cannot work looks healthy to any supervisor. Exit 1.
    process.exit(1);
  }

  const once = process.argv.includes("--once");
  const workerId = `worker:${process.pid}:${Date.now().toString(36)}`;
  let stopping = false;

  const stop = (signal) => {
    if (stopping) return;
    stopping = true;
    console.error(`[worker] ${signal} received, finishing the current tick`);
  };
  process.on("SIGINT", () => stop("SIGINT"));
  process.on("SIGTERM", () => stop("SIGTERM"));

  do {
    try {
      const result = await tick({ workerId });
      if (once) console.log(JSON.stringify(result, null, 2));
      if (result.error) console.error(`[worker] tick could not run: ${result.error}`);
    } catch (error) {
      // An exception here means the tick itself failed (not a job): log it and keep the
      // loop alive. A worker that dies on one bad tick is a worker that stops on a blip.
      console.error("[worker] tick threw:", error instanceof Error ? error.message : error);
    }

    if (once || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, INTERVAL_MS));
  } while (!stopping);

  console.error("[worker] stopped");
}

main().catch((error) => {
  console.error("[worker] fatal:", error);
  process.exit(1);
});
