#!/usr/bin/env node
/**
 * Dev server launcher with a fixed port.
 *
 * `next dev` does not fail when its port is taken — it quietly moves to 3111, then
 * 3112, and so on. In a preview environment every listening port becomes its own
 * visible preview, so a server left running from an earlier session turns the list
 * into three identical "Website" entries and there is no way to tell which one is
 * the app. The failure is silent in the worst way: the new server works perfectly,
 * it is just invisible behind a stale twin.
 *
 * This launcher refuses to drift. Either the canonical port is ours and we reuse it,
 * or it belongs to something else and we stop with a message naming the owner.
 *
 *   node scripts/dev.mjs           start on PORT (default 3000), refuse to drift
 *   node scripts/dev.mjs --clean   kill stray dev servers for this repo
 */
import { createServer } from "node:net";
import { spawn, execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, readlinkSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";

/** Ports a stray server is allowed to have drifted to. */
const DRIFT_FROM = 3100;
const DRIFT_TO = 3199;

function canListen(port, host) {
  return new Promise((done) => {
    const probe = createServer();
    probe.unref();
    probe.once("error", () => done(false));
    probe.listen({ port, host, exclusive: true }, () => {
      probe.close(() => done(true));
    });
  });
}

/** Best-effort owner lookup. Returns a pid as a number, or null when unknown. */
function portOwner(port) {
  for (const [cmd, args] of [
    ["ss", ["-tlnp"]],
    ["lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"]],
  ]) {
    try {
      const out = execFileSync(cmd, args, { encoding: "utf8" });
      const m = cmd === "ss" ? out.split("\n").find((l) => l.includes(`:${port} `)) : out;
      const pid = m?.match(/pid=(\d+)/)?.[1] ?? m?.match(/^\S+\s+(\d+)/)?.[1];
      if (pid) return Number(pid);
    } catch {
      // Command absent or unreadable; try the next one.
    }
  }
  return null;
}

function pidDetail(pid) {
  if (!pid || !existsSync(`/proc/${pid}`)) return { cwd: null, cmd: null };
  const read = (p) => {
    try {
      return readFileSync(p, "utf8").replace(/\0/g, " ").trim();
    } catch {
      return null;
    }
  };
  let cwd = null;
  try {
    cwd = readlinkSync(`/proc/${pid}/cwd`);
  } catch {
    // Not a directory or not ours to read.
  }
  return { cwd, cmd: read(`/proc/${pid}/cmdline`) };
}

/**
 * Next 16 writes .next/dev/lock with the pid and port of the server it started.
 * That file is the best answer to "is a dev server already running here", better
 * than scanning /proc, because it is the same signal Next itself uses.
 */
const LOCK = resolve(ROOT, ".next/dev/lock");

function readLock() {
  try {
    const lock = JSON.parse(readFileSync(LOCK, "utf8"));
    return lock && typeof lock.pid === "number" ? lock : null;
  } catch {
    return null;
  }
}

/** A lock whose process is gone is worse than no lock: it makes Next refuse to boot. */
function clearStaleLock() {
  const lock = readLock();
  if (!lock) return null;
  if (existsSync(`/proc/${lock.pid}`)) return lock;
  try {
    rmSync(LOCK, { force: true });
    console.log(`Removed stale lock (pid ${lock.pid}, port ${lock.port}) left by a dead server.`);
  } catch {
    // Read-only filesystem; the port check still decides.
  }
  return null;
}

/**
 * True when this port is served by a dev server of this very repo.
 *
 * Deliberately not `X-Powered-By`: next.config.ts turns `poweredByHeader` off on
 * purpose, so a header check would call our own server a stranger. Process
 * identity (cwd + listening port) is the honest signal.
 */
function looksLikeUs(port) {
  const pid = portOwner(port);
  if (!pid) return false;
  const { cwd, cmd } = pidDetail(pid);
  return cwd === ROOT && Boolean(cmd && /next-server|next dev/.test(cmd));
}

/** Every next-server dev process whose working directory is this repo. */
function ourDevServers() {
  const found = [];
  if (!existsSync("/proc")) return found;
  for (const entry of readdirSync("/proc")) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (pid === process.pid) continue;
    const { cwd, cmd } = pidDetail(pid);
    if (cwd !== ROOT || !cmd) continue;
    if (!/next-server|next dev/.test(cmd)) continue;
    found.push({ pid, cmd });
  }
  return found;
}

function listeningPortsFor(pid) {
  const ports = [];
  const hex = (s) => parseInt(s.split(":").pop(), 16);
  for (const table of ["/proc/net/tcp", "/proc/net/tcp6"]) {
    if (!existsSync(table)) continue;
    const rows = readFileSync(table, "utf8").trim().split("\n").slice(1);
    for (const row of rows) {
      const f = row.trim().split(/\s+/);
      if (f[3] !== "0A") continue; // 0A = LISTEN
      const inode = f[9];
      for (const fd of readdirSync(`/proc/${pid}/fd`).filter(Boolean)) {
        try {
          if (readlinkSync(`/proc/${pid}/fd/${fd}`) === `socket:[${inode}]`) {
            ports.push(hex(f[1]));
          }
        } catch {
          // fd closed between readdir and readlink.
        }
      }
    }
  }
  return [...new Set(ports)].sort((a, b) => a - b);
}

async function clean() {
  const servers = ourDevServers().map((s) => ({ ...s, ports: listeningPortsFor(s.pid) }));
  if (servers.length === 0) {
    console.log("No dev servers are running for this repo.");
    return 0;
  }
  for (const s of servers) {
    console.log(`Stopping pid ${s.pid} (ports ${s.ports.join(", ") || "none"})`);
    try {
      process.kill(s.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
  // Give them a moment to release their sockets, then be firm about the stragglers.
  await new Promise((r) => setTimeout(r, 1500));
  for (const s of servers) {
    try {
      process.kill(s.pid, "SIGKILL");
    } catch {
      // Exited cleanly; nothing to escalate.
    }
  }
  console.log(`Stopped ${servers.length} dev server${servers.length === 1 ? "" : "s"}.`);
  return 0;
}

async function main() {
  if (process.argv.includes("--clean")) return clean();

  const liveLock = clearStaleLock();
  if (liveLock && liveLock.port === PORT && existsSync(`/proc/${liveLock.pid}`)) {
    console.log(`Already running on port ${PORT} (pid ${liveLock.pid}) — nothing to start.`);
    console.log(`Open ${liveLock.appUrl ?? `http://localhost:${PORT}`}`);
    return 0;
  }

  if (!(await canListen(PORT, HOST))) {
    if (looksLikeUs(PORT)) {
      console.log(`Already running on port ${PORT} — nothing to start.`);
      console.log(`Open http://localhost:${PORT}`);
      return 0;
    }
    const pid = portOwner(PORT);
    const detail = pidDetail(pid);
    console.error(`Port ${PORT} is taken by ${pid ? `pid ${pid}` : "another process"}.`);
    if (detail.cmd) console.error(`  command: ${detail.cmd}`);
    if (detail.cwd) console.error(`  cwd:     ${detail.cwd}`);
    console.error("");
    console.error("Refusing to start on a different port: a second preview under another");
    console.error("port looks identical to the first and hides which one is live.");
    console.error(`Free the port, or run: npm run dev:clean`);
    return 1;
  }

  const stray = ourDevServers()
    .map((s) => ({ ...s, ports: listeningPortsFor(s.pid) }))
    .filter((s) => s.ports.some((p) => p >= DRIFT_FROM && p <= DRIFT_TO));
  for (const s of stray) {
    console.log(`Note: stray dev server on ports ${s.ports.join(", ")} (pid ${s.pid}) — npm run dev:clean`);
  }

  const next = spawn(
    process.execPath,
    [resolve(ROOT, "node_modules/next/dist/bin/next"), "dev", "-H", HOST, "-p", String(PORT)],
    { cwd: ROOT, stdio: "inherit", env: process.env },
  );

  const forward = (signal) => () => {
    if (!next.killed) next.kill(signal);
  };
  process.once("SIGINT", forward("SIGINT"));
  process.once("SIGTERM", forward("SIGTERM"));

  next.once("exit", (code, signal) => {
    // 128+n is the shell convention for "terminated by signal n".
    process.exit(signal ? 1 : (code ?? 0));
  });
  return null;
}

main().then((code) => {
  if (code !== null) process.exit(code);
});
