import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * The dev launcher exists because `next dev` degrades silently.
 *
 * When its port is taken it does not fail — it moves to 3111, then 3112. In a
 * preview environment every listening port is shown to the reader as its own
 * "Website" tile, so one forgotten server turns the panel into three identical
 * entries and nothing says which is live. Tests below pin the two halves of the
 * fix: the pinned port, and the refusal to drift.
 */

const ROOT = resolve(__dirname, "..");
const SCRIPT = resolve(ROOT, "scripts/dev.mjs");
const source = readFileSync(SCRIPT, "utf8");

describe("dev launcher", () => {
  it("is what `npm run dev` runs", () => {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.dev).toBe("node scripts/dev.mjs");
    // An escape hatch, so the launcher can never be the reason someone is blocked.
    expect(pkg.scripts["dev:next"]).toBe("next dev");
    expect(pkg.scripts["dev:clean"]).toBe("node scripts/dev.mjs --clean");
  });

  it("passes an explicit port to next, so it cannot choose its own", () => {
    expect(source).toMatch(/"dev",\s*\n?\s*"-H"/);
    expect(source).toContain('"-p", String(PORT)');
  });

  it("identifies our own server by process, not by a header", () => {
    // poweredByHeader is off in next.config.ts, so an X-Powered-By check would
    // mistake our own server for a stranger and refuse to run.
    expect(source).not.toContain("x-powered-by");
    expect(source).toContain("cwd === ROOT");
    expect(source).toContain("/next-server|next dev/");
  });

  it("exits non-zero instead of moving to another port", async () => {
    // Real behaviour, not a regex: hold the port with something that is not Next.
    const port = 3987;
    const holder = spawn(process.execPath, [
      "-e",
      `const s=require("http").createServer((q,r)=>r.end("x"));` +
        `s.listen(${port},"127.0.0.1");`,
    ]);

    // Wait for the port to answer rather than assuming a sleep is long enough.
    const deadline = Date.now() + 5000;
    let held = false;
    while (Date.now() < deadline && !held) {
      held = await fetch(`http://127.0.0.1:${port}/`)
        .then(() => true)
        .catch(() => false);
    }

    try {
      expect(held).toBe(true);
      const result = spawnSync(process.execPath, [SCRIPT], {
        cwd: ROOT,
        env: { ...process.env, PORT: String(port), HOST: "127.0.0.1" },
        encoding: "utf8",
        timeout: 15_000,
      });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/Refusing to start on a different port/);
      expect(result.stderr).toMatch(/npm run dev:clean/);
      // The port it was asked for is named, so the reader knows where to look.
      expect(result.stderr).toContain(`Port ${port} is taken`);
    } finally {
      holder.kill("SIGKILL");
    }
  }, 30_000);
});
