/**
 * The scheduler that drives the queue must be honest about being one.
 *
 * The queue exists (migrations 0006/0007) but nothing runs it on a serverless platform:
 * the admin Queue Monitor reports "nothing claimed a job recently" and scheduled articles
 * never publish. This workflow is the driver - and it must never paper over the two states
 * that decide everything: no secret configured (nothing runs; say so loudly) and the site
 * refusing the call (fail, with the reason attached).
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PATH = ".github/workflows/queue-tick.yml";
const WORKFLOW = readFileSync(join(process.cwd(), PATH), "utf8");

describe("queue tick workflow", () => {
  it("exists and runs on a schedule, with a manual trigger", () => {
    expect(existsSync(join(process.cwd(), PATH))).toBe(true);
    expect(WORKFLOW).toContain("schedule:");
    expect(WORKFLOW).toContain('cron: "*/5 * * * *"');
    expect(WORKFLOW).toContain("workflow_dispatch:");
  });

  it("authenticates with the secret, never with anything else", () => {
    expect(WORKFLOW).toContain("Authorization: Bearer $CRON_SECRET");
    expect(WORKFLOW).toContain("/api/cron/tick");
    // No literal token may appear in the file.
    expect(WORKFLOW).not.toMatch(/Bearer [A-Za-z0-9]/);
    // Least privilege: the workflow only calls a URL.
    expect(WORKFLOW).toContain("permissions:");
    expect(WORKFLOW).toContain("contents: read");
  });

  it("warns loudly when the secret is missing instead of passing quietly", () => {
    // A green run must never imply the queue moved. Unconfigured = a warning annotation
    // and a step summary that says plainly the queue has no driver.
    expect(WORKFLOW).toContain("::warning");
    expect(WORKFLOW).toContain("GITHUB_STEP_SUMMARY");
    expect(WORKFLOW).toMatch(/CRON_SECRET is not configured/);
    expect(WORKFLOW).toMatch(/no driver/);
  });

  it("fails hard when the site refuses the tick, with the reason attached", () => {
    expect(WORKFLOW).toContain("::error");
    expect(WORKFLOW).toMatch(/exit 1/);
    // The two refusal codes are diagnosable from the failure message alone.
    expect(WORKFLOW).toMatch(/401/);
    expect(WORKFLOW).toMatch(/503/);
  });

  it("reports the tick result it received", () => {
    // The response is the health signal: whatever the endpoint returned is echoed to the
    // run summary, so a reader sees the real outcome rather than a bare green check.
    expect(WORKFLOW).toContain("Queue tick ran");
  });
});
