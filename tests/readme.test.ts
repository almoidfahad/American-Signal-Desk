import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(__dirname, "..");
const readme = readFileSync(resolve(ROOT, "README.md"), "utf8");
const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
  scripts: Record<string, string>;
};

function count(pattern: RegExp, text: string): number {
  return [...text.matchAll(pattern)].length;
}

function files(dir: string, test: (name: string) => boolean): string[] {
  const path = resolve(ROOT, dir);
  if (!existsSync(path)) return [];
  return readdirSync(path).filter((name) => {
    const full = join(path, name);
    return statSync(full).isFile() && test(name);
  });
}

/**
 * Why a README needs a test.
 *
 * This repository's whole argument is that a claim should be checked rather than asserted.
 * The README was the one file exempt from that rule, and it was wrong in both directions: it
 * still said "Phases 5–8 not started" and pointed at a `workers/` directory that did not
 * exist, months after the queue shipped. Stale documentation is not a cosmetic problem here
 * — it is the same failure mode the code is written to avoid.
 *
 * These tests pin the numbers and the structural claims to the repository, so the next
 * change that invalidates one of them fails here instead of misleading a reader.
 */
describe("README: the numbers match the repository", () => {
  it("names the real migration count", () => {
    const migrations = files("supabase/migrations", (n) => n.endsWith(".sql"));
    expect(readme).toContain(`migrations \`0002\`–\`0004\``);
    // The status table quotes the range; the count appears in the verified block.
    expect(migrations.length).toBeGreaterThanOrEqual(6);
    expect(readme).toContain(`0001–000${migrations.length}`);
  });

  it("names the real test count and file count", () => {
    // The count is derived from the suites on disk rather than asserted as a literal, so
    // adding a test cannot leave the README one number behind — which it already was by 14.
    const suites = files("tests", (n) => /\.test\.ts$/.test(n));
    const tests = suites.reduce((total, name) => {
      const text = readFileSync(join(resolve(ROOT, "tests"), name), "utf8");
      return total + count(/^\s+it\(/gm, text);
    }, 0);

    expect(readme).toContain(`${tests} unit tests`);
    expect(readme).toContain(`${tests} tests, ${suites.length} files`);
  });

  it("names the real RLS suite count", () => {
    const suites = files("supabase/tests", (n) => /^rls_.*\.sql$/.test(n));
    expect(readme).toContain(`${suites.length} RLS/authorization suites`);
    expect(readme).toContain(`supabase/tests/        RLS/authorization SQL suites (${suites.length})`);
  });

  it("names the real API route count and paths", () => {
    const routes: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(ROOT, dir))) {
        const rel = join(dir, entry);
        if (statSync(resolve(ROOT, rel)).isDirectory()) walk(rel);
        else if (entry === "route.ts") routes.push(rel);
      }
    };
    walk("src/app/api");
    expect(routes).toHaveLength(3);
    expect(readme).toContain("3 API routes");
    expect(readme).toContain("health · v1/newsletter · cron/tick");
  });

  it("only documents scripts that actually exist", () => {
    // A documented command that is not in package.json wastes a reader's afternoon.
    const documented = [...readme.matchAll(/`npm run ([a-z:]+)`/g)]
      .map((m) => m[1])
      .filter((name): name is string => Boolean(name));
    expect(documented.length).toBeGreaterThan(5);
    for (const name of new Set(documented)) {
      expect(pkg.scripts[name], `README documents "npm run ${name}" but package.json has no such script`)
        .toBeDefined();
    }
  });

  it("documents every script a maintainer is expected to know", () => {
    // The reverse direction: a script nobody documents is a script nobody uses.
    const undocumented = ["dev", "dev:clean", "dev:next", "build", "worker", "worker:once", "typecheck", "lint", "test", "test:db", "test:all", "verify"].filter(
      (name) => pkg.scripts[name] && !readme.includes(`npm run ${name}`),
    );
    expect(undocumented).toEqual([]);
  });
});

describe("README: the structural claims are true", () => {
  it("does not point at directories that do not exist", () => {
    // "workers/, Phase 5" was the stale claim: the queue landed in src/server/jobs.
    expect(existsSync(resolve(ROOT, "workers"))).toBe(false);
    expect(readme).not.toMatch(/\bworkers\//);
    expect(existsSync(resolve(ROOT, "src/server/jobs"))).toBe(true);
  });

  it("does not claim Redis is part of the architecture", () => {
    // Redis was never implemented, and the queue deliberately does not use it.
    expect(readme).not.toMatch(/Redis \+ BullMQ/);
    expect(readme).toContain("**Redis is not used.**");
  });

  it("keeps its promise not to claim a hosted Supabase project", () => {
    expect(readme).toMatch(/A hosted Supabase project does not exist/);
    // And says what that leaves unverified, rather than leaving it implied.
    expect(readme).toMatch(/GoTrue, PostgREST or MFA/);
  });

  it("states the consequence of not driving the queue", () => {
    // The failure mode this guards: the queue exists, the docs look fine, and nothing runs
    // it, so scheduled articles never publish.
    expect(readme).toMatch(/scheduled articles never publish/i);
  });

  it("still says the policy copy is a draft", () => {
    expect(readme).toContain("not legal advice");
  });
});

describe("README: honest about what is unverified", () => {
  it("does not claim browser verification it could not do", () => {
    expect(readme).toMatch(/browser is untested/i);
    // If a headless browser is ever added, the claim must be revisited rather than left to
    // rot. This does not fail the build on a dependency appearing — it fails if the README
    // claims observation while nothing could observe.
    expect(readme).toMatch(/parsing server HTML/);
  });

  it("keeps the honesty rule visible", () => {
    expect(readme).toMatch(/Every number in this file was produced by running something/);
  });
});

describe("configuration: a setting nobody reads is a setting that lies", () => {
  const schema = readFileSync(resolve(ROOT, "src/lib/env.ts"), "utf8");

  it("declares no environment variable that the application never reads", () => {
    // SESSION_COOKIE_NAME and APP_ENV were both declared in the zod schema with comments
    // promising behaviour that did not exist. supabase-js SSR owns the session cookie
    // names, and nothing read APP_ENV at all. Both are removed; this test stops the next
    // one from appearing.
    const declared = [...schema.matchAll(/^ {2}([A-Z][A-Z0-9_]+):/gm)]
      .map((m) => m[1])
      .filter((name): name is string => Boolean(name));

    const used: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(ROOT, dir))) {
        const rel = join(dir, entry);
        const full = resolve(ROOT, rel);
        if (statSync(full).isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mjs)$/.test(entry) && !rel.endsWith("src/lib/env.ts")) {
          used.push(readFileSync(full, "utf8"));
        }
      }
    };
    walk("src");
    walk("scripts");
    walk("next.config.ts".replace("next.config.ts", ""));
    const haystack = [...used, readFileSync(resolve(ROOT, "next.config.ts"), "utf8")].join("\n");

    // Two exemptions, both stated rather than silent:
    //
    //   DATABASE_URL      used by the SQL test harness (`npm run test:db`), not the app.
    //                     The app talks to Postgres through PostgREST, so a direct
    //                     connection string would never be read at runtime.
    //   Phase 8 keys      declared for integrations that are explicitly not built. They are
    //                     read by the admin configuration page, which reports them missing;
    //                     that is the honest state, not a dead knob.
    const exempt = new Set([
      "DATABASE_URL",
      "PAYMENT_WEBHOOK_SECRET",
      "GITHUB_APP_ID",
      "GITHUB_APP_PRIVATE_KEY",
      "DEPLOYMENT_PROVIDER_TOKEN",
    ]);

    const unread = declared.filter((name) => !exempt.has(name) && !haystack.includes(name));
    expect(unread).toEqual([]);
  });

  it("does not advertise a knob in .env.example that the code ignores", () => {
    const example = readFileSync(resolve(ROOT, ".env.example"), "utf8");
    const documented = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)]
      .map((m) => m[1])
      .filter((name): name is string => Boolean(name));

    const schemaText = readFileSync(resolve(ROOT, "src/lib/env.ts"), "utf8");
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(resolve(ROOT, dir))) {
        const rel = join(dir, entry);
        const full = resolve(ROOT, rel);
        if (statSync(full).isDirectory()) walk(rel);
        else if (/\.(ts|tsx|mjs)$/.test(entry)) sources.push(readFileSync(full, "utf8"));
      }
    };
    walk("src");
    walk("scripts");
    const haystack = [...sources, schemaText, readFileSync(resolve(ROOT, "next.config.ts"), "utf8")].join("\n");

    const ignored = documented.filter((name) => !haystack.includes(name));
    expect(ignored).toEqual([]);
  });
});
