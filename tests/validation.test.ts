import { describe, expect, it } from "vitest";
import { emailSchema, loginSchema, newsletterSchema, passwordSchema } from "@/lib/validation/auth";

describe("email validation", () => {
  it("accepts a normal address and lowercases it", () => {
    expect(emailSchema.parse("  Reader@Example.COM  ")).toBe("reader@example.com");
  });

  it("rejects malformed addresses", () => {
    for (const bad of ["", "no-at-sign", "a@b", "a b@example.com", "a@@example.com"]) {
      expect(emailSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("rejects an over-long address", () => {
    expect(emailSchema.safeParse(`${"a".repeat(250)}@example.com`).success).toBe(false);
  });
});

describe("password policy", () => {
  it("requires at least 12 characters", () => {
    expect(passwordSchema.safeParse("short").success).toBe(false);
    expect(passwordSchema.safeParse("longenough12").success).toBe(true);
  });

  it("rejects obvious defaults", () => {
    expect(passwordSchema.safeParse("passwordpassword").success).toBe(false);
    expect(passwordSchema.safeParse("123456123456").success).toBe(false);
  });
});

describe("login schema", () => {
  it("does not reveal the password policy at sign-in", () => {
    // A short password must be allowed through validation so sign-in fails generically
    // rather than disclosing the current policy to an attacker.
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
  });

  it("still requires an email", () => {
    expect(loginSchema.safeParse({ email: "", password: "x" }).success).toBe(false);
  });
});

describe("newsletter schema", () => {
  it("accepts a valid submission", () => {
    const result = newsletterSchema.safeParse({ email: "a@b.co", source: "homepage" });
    expect(result.success).toBe(true);
  });

  it("rejects a filled honeypot", () => {
    const result = newsletterSchema.safeParse({ email: "a@b.co", company: "spam bot" });
    expect(result.success).toBe(false);
  });

  it("allows an empty honeypot", () => {
    expect(newsletterSchema.safeParse({ email: "a@b.co", company: "" }).success).toBe(true);
  });
});
