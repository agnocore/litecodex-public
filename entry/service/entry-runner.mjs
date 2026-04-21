import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifyEntitlement } from "./entitlement-verifier.mjs";
import { verifyUpdateManifest } from "./update-verifier.mjs";

const SERVICE_NAME = process.env.LITECODEX_ENTRY_SERVICE || "litecodex-entry";
const ENTRY_HOST = process.env.LITECODEX_ENTRY_HOST || "127.0.0.1";
const ENTRY_PORT = Number.parseInt(process.env.LITECODEX_ENTRY_PORT || "43985", 10);
const ENTRY_LISTEN = `${ENTRY_HOST}:${ENTRY_PORT}`;
const MODE = "community_edition";

const thisFile = fileURLToPath(import.meta.url);
const serviceDir = path.dirname(thisFile);
const entryDir = path.resolve(serviceDir, "..");
const rootDir = path.resolve(entryDir, "..");
const logsDir = path.join(entryDir, "logs");
const stateDir = path.join(entryDir, "state");
const entryLog = path.join(logsDir, "entry.log");
const entryErrorLog = path.join(logsDir, "entry-error.log");
const stateFile = path.join(stateDir, "entry-state.json");
const pidFile = path.join(stateDir, "entry.pid");
const serverScript = path.join(serviceDir, "entry-server.mjs");
const entitlementFile = process.env.LITECODEX_ENTITLEMENT_FILE || path.join(stateDir, "entitlement.v1.json");
const updateManifestFile = process.env.LITECODEX_RELEASE_MANIFEST_FILE || path.join(stateDir, "release-manifest.v1.json");

let shuttingDown = false;
let child = null;
let fallbackServer = null;
let crashTimestamps = [];
const serviceStartedAt = new Date().toISOString();
const state = {
  service: SERVICE_NAME,
  listen: ENTRY_LISTEN,
  edition: "community",
  pid: process.pid,
  startedAt: serviceStartedAt,
  lastHealthCheck: serviceStartedAt,
  restartCount: 0,
  degraded: false,
  lastError: null,
  mode: MODE,
  status: "online",
  serverPid: null,
  security: {
    communityEdition: true,
    officialCapabilitiesEnabled: false,
    entitlement: null,
    updates: null
  }
};

function buildSecurityState() {
  const entitlement = verifyEntitlement({ repoRoot: rootDir, entitlementFile });
  const updates = verifyUpdateManifest({ repoRoot: rootDir, manifestFile: updateManifestFile });
  const officialCapabilitiesEnabled =
    entitlement.status === "valid" && entitlement.features && entitlement.features.official_advanced === true;
  return {
    communityEdition: true,
    officialCapabilitiesEnabled,
    entitlement,
    updates
  };
}

function applySecurityPolicy() {
  const security = buildSecurityState();
  const failClosed = Boolean(security.entitlement?.failClosed || security.updates?.failClosed);
  state.security = security;
  state.degraded = failClosed;
  if (failClosed) {
    state.lastError = `SECURITY_FAIL_CLOSED:${security.entitlement?.reason || "none"}:${security.updates?.reason || "none"}`;
  } else if (typeof state.lastError === "string" && state.lastError.startsWith("SECURITY_FAIL_CLOSED:")) {
    state.lastError = null;
  }
}

function ensureDirs() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
}

function ts() {
  return new Date().toISOString();
}

function appendLine(filePath, line) {
  fs.appendFileSync(filePath, `${line}\n`, "utf8");
}

function log(message) {
  appendLine(entryLog, `[${ts()}] ${message}`);
}

function logError(message) {
  appendLine(entryErrorLog, `[${ts()}] ${message}`);
}

function writeState() {
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  if (Number.isFinite(state.pid) && state.pid > 0) {
    fs.writeFileSync(pidFile, `${state.pid}\n`, "utf8");
  } else {
    fs.rmSync(pidFile, { force: true });
  }
}

function syncStateToChild() {
  if (child?.connected) {
    child.send({ type: "state", state });
  }
}

function updateState(patch = {}) {
  Object.assign(state, patch);
  if (state.status !== "stopped") {
    state.status = state.degraded ? "degraded" : "online";
  }
  writeState();
  syncStateToChild();
}

function writeStoppedState() {
  state.pid = null;
  state.serverPid = null;
  state.status = "stopped";
  state.lastError = "STOPPED";
  state.degraded = false;
  state.lastHealthCheck = ts();
  writeState();
}

function isPidRunning(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readExistingPid() {
  try {
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function getProcessCommandLine(pid) {
  const ps = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue; if($p){$p.CommandLine}`;
  const res = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], {
    encoding: "utf8"
  });
  if (res.status !== 0) return "";
  return (res.stdout || "").trim();
}

function isRunnerPid(pid) {
  const cmd = getProcessCommandLine(pid).replaceAll("/", "\\").toLowerCase();
  return cmd.includes("\\litecodex\\entry\\service\\entry-runner.mjs");
}

function computeBackoffMs(restartCount, degraded) {
  const exp = Math.min(6, Math.max(0, restartCount - 1));
  const base = 1000 * Math.pow(2, exp);
  const capped = degraded ? Math.min(60000, base) : Math.min(30000, base);
  return capped;
}

function markCrashAndMaybeDegrade() {
  const now = Date.now();
  crashTimestamps.push(now);
  crashTimestamps = crashTimestamps.filter((t) => now - t <= 5 * 60 * 1000);
  if (crashTimestamps.length > 5) {
    state.degraded = true;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function placeholderHtml() {
  const statusLabel = state.degraded ? "degraded" : "online";
  const entitlementStatus = state.security?.entitlement?.status || "missing";
  const updatesStatus = state.security?.updates?.status || "missing";
  const officialEnabled = state.security?.officialCapabilitiesEnabled ? "enabled" : "disabled";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Lite Codex Local Entry</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: linear-gradient(145deg, #f7fafc 0%, #e6eef8 100%); color: #0f172a; }
    .wrap { max-width: 840px; margin: 48px auto; padding: 24px; }
    .card { background: #ffffff; border: 1px solid #dbe4f0; border-radius: 16px; padding: 24px; box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08); }
    h1 { margin-top: 0; margin-bottom: 16px; font-size: 30px; letter-spacing: 0.2px; }
    h2 { margin: 18px 0 10px; font-size: 20px; }
    dl { margin: 0; display: grid; grid-template-columns: 220px 1fr; row-gap: 10px; }
    dt { font-weight: 600; color: #334155; }
    dd { margin: 0; color: #0f172a; word-break: break-all; }
    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; border: 1px solid #cbd5e1; background: ${state.degraded ? "#fff1f2" : "#ecfeff"}; }
    .hint { margin-top: 18px; color: #475569; font-size: 14px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Lite Codex Local Entry</h1>
      <h2>Community Edition</h2>
      <dl>
        <dt>listen</dt><dd>${escapeHtml(state.listen)}</dd>
        <dt>service</dt><dd>${escapeHtml(state.service)}</dd>
        <dt>edition</dt><dd>community</dd>
        <dt>status</dt><dd><span class="pill">${escapeHtml(statusLabel)}</span></dd>
        <dt>mode</dt><dd>${escapeHtml(state.mode)}</dd>
        <dt>startedAt</dt><dd>${escapeHtml(state.startedAt)}</dd>
        <dt>restartCount</dt><dd>${escapeHtml(state.restartCount)}</dd>
        <dt>lastHealthCheck</dt><dd>${escapeHtml(state.lastHealthCheck)}</dd>
        <dt>entitlement</dt><dd>${escapeHtml(entitlementStatus)}</dd>
        <dt>updatePolicy</dt><dd>${escapeHtml(updatesStatus)}</dd>
        <dt>officialCapabilities</dt><dd>${escapeHtml(officialEnabled)}</dd>
      </dl>
      <p class="hint">This entry serves Community Edition surface only. Private control plane capabilities are intentionally excluded from this local runtime.</p>
    </div>
  </div>
</body>
</html>`;
}

function writeJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function touchHealth() {
  updateState({
    lastHealthCheck: ts()
  });
}

function handleFallbackRequest(req, res) {
  const url = new URL(req.url || "/", `http://${ENTRY_LISTEN}`);
  if (req.method === "GET" && url.pathname === "/health") {
    touchHealth();
    writeJson(res, 200, {
      ok: true,
      service: state.service,
      listen: state.listen
    });
    return;
  }
  if (req.method === "GET" && url.pathname === "/status") {
    touchHealth();
    writeJson(res, 200, state);
    return;
  }
  if (req.method === "GET" && url.pathname === "/") {
    touchHealth();
    res.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    res.end(placeholderHtml());
    return;
  }
  writeJson(res, 404, {
    error: "not_found",
    service: state.service,
    path: url.pathname
  });
}

function startFallbackServer() {
  if (fallbackServer || shuttingDown) return;
  fallbackServer = http.createServer(handleFallbackRequest);
  fallbackServer.on("error", (error) => {
    logError(`fallback server error: ${error?.stack || error}`);
  });
  fallbackServer.listen(ENTRY_PORT, ENTRY_HOST, () => {
    log(`fallback server listening ${ENTRY_LISTEN}`);
  });
}

function stopFallbackServer() {
  return new Promise((resolve) => {
    if (!fallbackServer) {
      resolve();
      return;
    }
    const active = fallbackServer;
    fallbackServer = null;
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    const timeout = setTimeout(done, 1500);
    active.close(() => {
      clearTimeout(timeout);
      done();
    });
  });
}

async function spawnServer() {
  if (shuttingDown) return;
  await stopFallbackServer();

  const childEnv = {
    ...process.env,
    LITECODEX_ENTRY_SERVICE: SERVICE_NAME,
    LITECODEX_ENTRY_HOST: ENTRY_HOST,
    LITECODEX_ENTRY_PORT: String(ENTRY_PORT),
    LITECODEX_ENTRY_LISTEN: ENTRY_LISTEN,
    LITECODEX_ENTRY_MODE: MODE,
    LITECODEX_ENTRY_EDITION: "community",
    LITECODEX_ENTRY_STARTED_AT: state.startedAt,
    LITECODEX_ENTRY_RESTART_COUNT: String(state.restartCount),
    LITECODEX_ENTRY_DEGRADED: state.degraded ? "1" : "0"
  };

  child = spawn(process.execPath, [serverScript], {
    cwd: rootDir,
    stdio: ["ignore", "pipe", "pipe", "ipc"],
    windowsHide: true,
    env: childEnv
  });

  updateState({
    serverPid: child.pid || null,
    lastError: null
  });

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) log(`[server:${child.pid}] ${line}`);
    }
  });
  child.stderr?.on("data", (chunk) => {
    for (const line of chunk.split(/\r?\n/)) {
      if (line.trim()) logError(`[server:${child.pid}] ${line}`);
    }
  });

  child.on("message", (message) => {
    if (!message || typeof message !== "object") return;
    if (message.type === "ready") {
      updateState({
        serverPid: child?.pid || null,
        lastHealthCheck: ts(),
        lastError: null
      });
      log(`server ready pid=${child?.pid} listen=${ENTRY_LISTEN}`);
      return;
    }
    if (message.type === "health") {
      updateState({
        lastHealthCheck: message.at || ts()
      });
      return;
    }
    if (message.type === "fatal") {
      updateState({
        lastError: `${message.code || "SERVER_FATAL"}:${message.message || "unknown"}`
      });
    }
  });

  child.on("exit", (code, signal) => {
    const wasShuttingDown = shuttingDown;
    const previousPid = child?.pid || null;
    child = null;
    updateState({
      serverPid: null
    });

    if (wasShuttingDown) {
      log(`server stopped pid=${previousPid} code=${code} signal=${signal}`);
      return;
    }

    const abnormal = code !== 0;
    startFallbackServer();
    if (abnormal) {
      state.restartCount += 1;
      markCrashAndMaybeDegrade();
      state.lastError = code === 98 ? "PORT_CONFLICT" : `SERVER_EXIT:${code}:${signal || "nosignal"}`;
      updateState({});
      const backoff = computeBackoffMs(state.restartCount, state.degraded);
      logError(
        `server crashed pid=${previousPid} code=${code} signal=${signal || "none"} restartCount=${state.restartCount} degraded=${state.degraded} backoffMs=${backoff}`
      );
      setTimeout(() => {
        spawnServer();
      }, backoff);
      return;
    }

    log(`server exited normally pid=${previousPid}`);
    setTimeout(() => {
      spawnServer();
    }, 1000);
  });

  syncStateToChild();
}

function gracefulShutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`runner shutting down pid=${process.pid}`);

  const finalize = async () => {
    await stopFallbackServer();
    writeStoppedState();
    process.exit(exitCode);
  };

  if (!child) {
    finalize();
    return;
  }

  const timeout = setTimeout(() => {
    if (child) {
      try {
        child.kill("SIGKILL");
      } catch {
        // no-op
      }
    }
    finalize();
  }, 5000);

  child.once("exit", () => {
    clearTimeout(timeout);
    finalize();
  });

  try {
    child.kill("SIGTERM");
  } catch {
    clearTimeout(timeout);
    finalize();
  }
}

function singleInstanceGuard() {
  const existingPid = readExistingPid();
  if (!existingPid) return true;
  if (!isPidRunning(existingPid)) {
    fs.rmSync(pidFile, { force: true });
    return true;
  }
  if (existingPid === process.pid) return true;
  if (isRunnerPid(existingPid)) {
    log(`runner already running pid=${existingPid}; exiting duplicate pid=${process.pid}`);
    return false;
  }
  logError(`pid file points to foreign process pid=${existingPid}; taking over with current runner pid=${process.pid}`);
  return true;
}

function main() {
  ensureDirs();
  if (!singleInstanceGuard()) {
    process.exit(0);
    return;
  }

  applySecurityPolicy();
  state.pid = process.pid;
  state.serverPid = null;
  state.status = state.degraded ? "degraded" : "online";
  writeState();
  log(`runner started pid=${process.pid} listen=${ENTRY_LISTEN}`);
  spawnServer();

  process.on("SIGTERM", () => gracefulShutdown(0));
  process.on("SIGINT", () => gracefulShutdown(0));
  process.on("uncaughtException", (error) => {
    logError(`runner uncaughtException: ${error?.stack || error}`);
    gracefulShutdown(1);
  });
  process.on("unhandledRejection", (reason) => {
    logError(`runner unhandledRejection: ${reason?.stack || reason}`);
    gracefulShutdown(1);
  });
}

main();
