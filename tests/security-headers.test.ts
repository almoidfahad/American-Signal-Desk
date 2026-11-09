import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Framing policy, pinned in both directions.
 *
 * The dev preview is embedded in an iframe. With the original unconditional
 * `X-Frame-Options: DENY` and `frame-ancestors 'none'`, that preview rendered as a broken
 * frame instead of the site. The fix relaxed both headers - and a relaxation of a security
 * header is exactly the kind of change that quietly becomes permanent. These assertions fail
 * if the production values are ever weakened, and they fail if the dev exception is deleted,
 * because a deleted exception means someone will "fix" the preview by weakening production
 * next time.
 *
 * They are source-level checks, not header checks, because the header value is chosen at
 * build time from NODE_ENV and this suite runs in one environment.
 */

const ROOT = join(import.meta.dirname, "..");
const proxy = readFileSync(join(ROOT, "src/proxy.ts"), "utf8");
const config = readFileSync(join(ROOT, "next.config.ts"), "utf8");

describe("framing policy", () => {
  it("keeps production CSP framing closed", () => {
    expect(proxy).toContain(`"frame-ancestors 'none'"`);
  });

  it("only opens framing behind an isDev branch", () => {
    // The open value must be guarded by the dev flag, not applied unconditionally.
    expect(proxy).toMatch(/isDev \?\s*"frame-ancestors 'self' https: http:"\s*:\s*"frame-ancestors 'none'"/);
  });

  it("keeps X-Frame-Options at DENY for production builds", () => {
    expect(config).toMatch(/key: "X-Frame-Options", value: isProd \? "DENY" : ""/);
  });

  it("allows a wss connect-source in development, since a secure preview uses it", () => {
    // Without wss: the preview page loads but the HMR socket never connects.
    expect(proxy).toMatch(/isDev \? "ws: wss:/);
  });
});
