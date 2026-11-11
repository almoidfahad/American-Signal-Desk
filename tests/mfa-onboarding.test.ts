import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const read = (relative: string) => readFileSync(resolve(ROOT, relative), "utf8");

/**
 * Regression guard for the first privileged sign-in.
 *
 * The policy requires a second factor by default, so a brand-new admin account has to be
 * able to ENROL one. An earlier revision had no enrolment path at all: the two-factor page
 * only verified existing factors, and the sign-in form only routed users there once a
 * factor existed - leaving a first-time admin bounced between "sign in" and "MFA required"
 * forever. These assertions keep the three links of that chain intact.
 */
describe("MFA onboarding for a first privileged sign-in", () => {
  it("routes a session without a second factor to the two-factor page", () => {
    const form = read("src/app/admin/login/login-form.tsx");
    expect(form).toContain('router.push("/admin/login/mfa")');
    // The old rule only routed users who already had a factor enrolled.
    expect(form).not.toContain('aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2"');
  });

  it("the two-factor form enrols an authenticator when the account has none", () => {
    const form = read("src/app/admin/login/mfa/mfa-form.tsx");
    expect(form).toContain("mfa.enroll");
    expect(form).toContain("challengeAndVerify");
  });

  it("the MFA denial card leads to the two-factor page, not back to sign-in", () => {
    const guard = read("src/server/admin/guard.tsx");
    expect(guard).toContain('href: "/admin/login/mfa"');
    expect(guard).not.toContain('label: "Complete sign in"');
  });
});
