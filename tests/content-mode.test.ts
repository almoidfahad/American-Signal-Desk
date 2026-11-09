import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Content mode decides whether a reader sees real journalism, labelled samples, or an
 * honest outage notice. Getting it wrong in either direction is a product failure: samples
 * presented as news is a fabrication, and an outage notice on a working site is a false
 * alarm.
 *
 * The module caches its Supabase client in a module-level variable, so each case has to run
 * against a freshly imported module. `vi.resetModules()` plus a dynamic import is what makes
 * these assertions mean anything - a shared module would carry the first case's client into
 * every later one and four of these five tests would pass for the wrong reason.
 */
const original = { ...process.env };

function clearEnv() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.ASD_ALLOW_SAMPLE_CONTENT;
}

async function mode(env: Record<string, string>): Promise<string> {
  clearEnv();
  Object.assign(process.env, env);
  vi.resetModules();
  const { contentMode } = await import("@/server/content/repository");
  return contentMode();
}

function backendBuild() {
  // NODE_ENV is declared readonly; these cases have to vary it, so assign through a cast.
  (process.env as Record<string, string>).NODE_ENV = "production";
}

beforeEach(() => {
  clearEnv();
});

afterEach(() => {
  process.env = { ...original };
  clearEnv();
});

describe("content mode", () => {
  it("prefers live content whenever a database is configured, flag or no flag", async () => {
    expect(
      await mode({
        NEXT_PUBLIC_SUPABASE_URL: "https://demo.example.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        ASD_ALLOW_SAMPLE_CONTENT: "1",
      }),
    ).toBe("live");
  });

  it("shows samples in development with no database", async () => {
    expect(await mode({})).toBe("demo");
  });

  it("refuses to invent news in a production build with no database", async () => {
    // NODE_ENV is typed as a literal union; varying it is the whole point of the case.
    // NODE_ENV is declared readonly; the test must vary it, so assign through a cast.
    backendBuild();
    expect(await mode({})).toBe("unavailable");
  });

  it("allows labelled samples in production only when explicitly opted in", async () => {
    // NODE_ENV is declared readonly; the test must vary it, so assign through a cast.
    backendBuild();
    expect(await mode({ ASD_ALLOW_SAMPLE_CONTENT: "1" })).toBe("demo");
  });

  it("ignores any opt-in value other than the exact string", async () => {
    // NODE_ENV is declared readonly; the test must vary it, so assign through a cast.
    backendBuild();
    for (const value of ["true", "yes", "0", ""]) {
      expect(await mode({ ASD_ALLOW_SAMPLE_CONTENT: value }), `value: ${JSON.stringify(value)}`).toBe(
        "unavailable",
      );
    }
  });
});
