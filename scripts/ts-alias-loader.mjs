/**
 * Resolves the `@/` import alias for plain Node.
 *
 * The worker runs outside Next, so it does not get Next's path mapping. Rather than adding
 * a build step or a dependency (tsx, ts-node) just to run one script, this module hooks the
 * ESM resolver: `@/server/...` becomes `./src/server/...`, and an extensionless specifier
 * picks up `.ts`. Node 22 strips the types itself.
 *
 * A build step would also work. This was chosen because the worker should be runnable on a
 * machine that has only `npm install && npm run worker`, and because a resolver is easier to
 * audit than a transpiler config.
 */
import { pathToFileURL, fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";
import { resolve as resolvePath, dirname } from "node:path";

const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

/** Candidate files for an extensionless specifier, in the order Node would not try. */
const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

function withExtension(basePath) {
  if (existsSync(basePath) && statSync(basePath).isFile()) return basePath;
  for (const ext of EXTENSIONS) {
    const candidate = basePath + ext;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = resolvePath(basePath, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // 1. The application alias.
  if (specifier.startsWith("@/")) {
    const target = withExtension(resolvePath(ROOT, "src", specifier.slice(2)));
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true };
  }

  // 2. A relative import written for TypeScript (no extension), from a .ts file.
  if (specifier.startsWith(".") && context.parentURL?.endsWith(".ts")) {
    const base = resolvePath(dirname(fileURLToPath(context.parentURL)), specifier);
    const target = withExtension(base);
    if (target) return { url: pathToFileURL(target).href, shortCircuit: true };
  }

  return nextResolve(specifier, context);
}
