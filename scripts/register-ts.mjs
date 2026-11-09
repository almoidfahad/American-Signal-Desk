/**
 * Registers the alias resolver and lets `@/` imports work under plain Node.
 *
 * Kept separate from the worker so the same registration can be reused by any future
 * script that needs to import application code (a migration helper, a backfill, a one-off
 * report) without each one growing its own bootstrap.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-alias-loader.mjs", pathToFileURL("./scripts/"));
