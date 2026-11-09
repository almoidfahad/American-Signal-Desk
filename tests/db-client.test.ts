import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  ANON_ENV_VARS,
  SERVICE_ENV_VARS,
  anonClient,
  hasServiceEnv,
  readAnonEnv,
  readServiceEnv,
  resetClients,
  serviceClient,
  type AnonClient,
  type ServiceClient,
} from "@/server/db/client";

const ROOT = resolve(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.tsx?$/.test(path)) out.push(path);
  }
  return out;
}

const SOURCES = walk(resolve(ROOT, "src")).map((path) => ({
  relative: path.slice(ROOT.length + 1),
  text: readFileSync(path, "utf8"),
}));

const VALID_ENV = { url: "https://example.supabase.co", anonKey: "anon-key" };
const VALID_SERVICE = { url: "https://example.supabase.co", serviceKey: "service-key" };

describe("supabase clients: one construction site", () => {
  beforeEach(() => resetClients());

  it("constructs no client anywhere but the factory", () => {
    // Nine modules used to call createClient themselves, with three different option
    // sets and two different keys. One construction site is what makes the question
    // "which key is this holding?" answerable.
    const offenders = SOURCES.filter(
      (file) => file.relative !== "src/server/db/client.ts" && /createClient\s*\(/.test(file.text),
    ).map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it("keeps the privileged key out of everything a component can import", () => {
    // A client component importing the factory would pull the service-role key path
    // into the browser bundle. Only src/server may import it.
    // Route handlers under src/app/api are server-only by construction — they cannot be
    // bundled into a client component. Everything else must go through src/server.
    const serverOnly = /^(src\/server\/|src\/app\/api\/.*\/route\.ts$)/;
    const offenders = SOURCES.filter(
      (file) =>
        !serverOnly.test(file.relative) &&
        /from "@\/server\/db\/client"/.test(file.text) &&
        /\bserviceClient\b/.test(file.text),
    ).map((file) => file.relative);
    expect(offenders).toEqual([]);
  });

  it("does not read SUPABASE_SERVICE_ROLE_KEY outside the factory", () => {
    // Naming the variable is fine — the admin UI has to tell an operator what to set,
    // and a zod schema has to declare it. *Reading the value* is not: that is how a
    // module ends up making its own privileged client.
    const declaring = /src\/(lib\/env\.ts|server\/admin\/config\.ts)$/;
    const offenders = SOURCES.filter(
      (file) =>
        file.relative !== "src/server/db/client.ts" &&
        !declaring.test(file.relative) &&
        /process\.env\.SUPABASE_SERVICE_ROLE_KEY|process\.env\["SUPABASE_SERVICE_ROLE_KEY"\]/.test(
          file.text,
        ),
    ).map((file) => file.relative);
    expect(offenders).toEqual([]);
  });
});

describe("supabase clients: configuration is read honestly", () => {
  it("returns null, not a half-built client, when either half is missing", () => {
    expect(anonClient(null)).toBeNull();
    expect(serviceClient(null)).toBeNull();
    expect(readAnonEnv()).toBeNull();
    expect(readServiceEnv()).toBeNull();
    expect(hasServiceEnv()).toBe(false);
  });

  it("names the exact variables an operator must set", () => {
    expect(ANON_ENV_VARS).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
    expect(SERVICE_ENV_VARS).toEqual(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  });

  it("caches per key, and rebuilds when the key changes", () => {
    const first = anonClient(VALID_ENV);
    expect(anonClient(VALID_ENV)).toBe(first);

    const second = anonClient({ ...VALID_ENV, anonKey: "different-key" });
    expect(second).not.toBe(first);
  });

  it("keeps the two keys in separate caches", () => {
    const anon = anonClient(VALID_ENV);
    const service = serviceClient(VALID_SERVICE);
    expect(anon).not.toBe(service);
    // Same url, same caching discipline, but never the same object.
    expect(serviceClient(VALID_SERVICE)).toBe(service);
  });
});

describe("supabase clients: the privileged type cannot be forged", () => {
  it("does not let an anon client satisfy a ServiceClient parameter", () => {
    // This is a compile-time guarantee asserted at runtime: the brand is a unique
    // symbol that is never exported, so `{ } as ServiceClient` cannot be written
    // outside this file. The `@ts-expect-error` below fails the build if the two
    // types ever become interchangeable.
    const anon: AnonClient = anonClient(VALID_ENV)!;
    // @ts-expect-error — an anon client must never be accepted where RLS-bypass is assumed.
    const wrong: ServiceClient = anon;
    expect(wrong).toBeDefined();
  });

  it("exports no symbol that would let a caller mint the brand", () => {
    const source = readFileSync(resolve(ROOT, "src/server/db/client.ts"), "utf8");
    // `declare const SERVICE_BRAND` is fine; exporting it would not be.
    expect(source).toMatch(/declare const SERVICE_BRAND: unique symbol/);
    expect(source).not.toMatch(/export\s+(const|type)\s+SERVICE_BRAND/);
  });
});
