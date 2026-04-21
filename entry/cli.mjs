#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVICE_NAME = "litecodex-entry";
const ENTRY_HOST = "127.0.0.1";
const ENTRY_PORT = 43985;
const ENTRY_LISTEN = `${ENTRY_HOST}:${ENTRY_PORT}`;
const DEFAULT_MODE = "placeholder";

const thisFile = fileURLToPath(import.meta.url);
const entryDir = path.dirname(thisFile);
const rootDir = path.resolve(entryDir, "..");
const binDir = path.join(entryDir, "bin");
const windowsDir = path.join(entryDir, "windows");
const serviceDir = path.join(entryDir, "service");
const logsDir = path.join(entryDir, "logs");
const stateDir = path.join(entryDir, "state");
const stateFile = path.join(stateDir, "entry-state.json");
const pidFile = path.join(stateDir, "entry.pid");
const runnerPath = path.join(serviceDir, "entry-runner.mjs");
const startupRegisterScript = path.join(windowsDir, "register-startup.ps1");
const startupUnregisterScript = path.join(windowsDir, "unregister-startup.ps1");
const startupTaskName = SERVICE_NAME;

function ensureEntryLayout() {
  fs.mkdirSync(entryDir, { recursive: true });
  fs.mkdirSync(serviceDir, { recursive: true });
  fs.mkdirSync(logsDir, { recursive: true });
  fs.mkdirSync(stateDir, { recursive: true });
}

function usage() {
  console.log(
    [
      "Usage:",
      "  litecodex entry install",
      "  litecodex entry uninstall",
      "  litecodex entry start",
      "  litecodex entry stop",
      "  litecodex entry restart",
      "  litecodex entry status",
      "  litecodex entry open"
    ].join("\n")
  );
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writePid(pid) {
  fs.writeFileSync(pidFile, `${pid}\n`, "utf8");
}

function readPid() {
  try {
    const raw = fs.readFileSync(pidFile, "utf8").trim();
    if (!raw) return null;
    const pid = Number.parseInt(raw, 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

function removePid() {
  try {
    fs.rmSync(pidFile, { force: true });
  } catch {
    // no-op
  }
}

function writeStoppedState() {
  const previous = readJson(stateFile, {});
  const restartCount = Number(previous?.restartCount);
  const stoppedState = {
    service: SERVICE_NAME,
    listen: ENTRY_LISTEN,
    pid: null,
    startedAt: typeof previous?.startedAt === "string" ? previous.startedAt : new Date().toISOString(),
    lastHealthCheck: new Date().toISOString(),
    restartCount: Number.isFinite(restartCount) ? restartCount : 0,
    degraded: false,
    lastError: "STOPPED",
    mode: typeof previous?.mode === "string" ? previous.mode : DEFAULT_MODE,
    status: "stopped",
    serverPid: null
  };
  fs.writeFileSync(stateFile, `${JSON.stringify(stoppedState, null, 2)}\n`, "utf8");
  removePid();
  return stoppedState;
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

function runPowerShell(commandOrArgs, asFile = false) {
  const args = asFile
    ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", ...commandOrArgs]
    : ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", commandOrArgs];
  return spawnSync("powershell", args, { encoding: "utf8" });
}

function getProcessCommandLine(pid) {
  const ps = `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}" -ErrorAction SilentlyContinue; if($p){$p.CommandLine}`;
  const res = runPowerShell(ps);
  if (res.status !== 0) return "";
  return (res.stdout || "").trim();
}

function findListeningPids() {
  const cmd = `Get-NetTCPConnection -State Listen -LocalAddress "${ENTRY_HOST}" -LocalPort ${ENTRY_PORT} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`;
  const ps = runPowerShell(cmd);
  const fromPs = [];
  if (ps.status === 0 && ps.stdout) {
    for (const line of ps.stdout.split(/\r?\n/)) {
      const v = Number.parseInt(line.trim(), 10);
      if (Number.isFinite(v)) fromPs.push(v);
    }
  }
  if (fromPs.length > 0) {
    return Array.from(new Set(fromPs));
  }

  const netstat = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  if (netstat.status !== 0 || !netstat.stdout) return [];
  const pids = [];
  for (const line of netstat.stdout.split(/\r?\n/)) {
    if (!line.includes(`${ENTRY_HOST}:${ENTRY_PORT}`)) continue;
    if (!line.match(/\bLISTENING\b/i) && !line.match(/\b侦听\b/i)) continue;
    const parts = line.trim().split(/\s+/);
    const pid = Number.parseInt(parts[parts.length - 1], 10);
    if (Number.isFinite(pid)) pids.push(pid);
  }
  return Array.from(new Set(pids));
}

function isOurEntryProcess(pid) {
  const cmdline = getProcessCommandLine(pid);
  if (!cmdline) return false;
  const normalized = cmdline.replaceAll("/", "\\").toLowerCase();
  return (
    normalized.includes("\\entry\\service\\entry-runner.mjs") ||
    normalized.includes("\\entry\\service\\entry-server.mjs")
  );
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(urlPath, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: ENTRY_HOST,
        port: ENTRY_PORT,
        path: urlPath,
        timeout: timeoutMs
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let parsed = null;
          try {
            parsed = JSON.parse(body);
          } catch {
            // no-op
          }
          resolve({ statusCode: res.statusCode || 0, headers: res.headers, body, json: parsed });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
    req.on("error", (error) => {
      reject(error);
    });
  });
}

function isValidHealthPayload(payload) {
  return (
    payload &&
    payload.ok === true &&
    payload.service === SERVICE_NAME &&
    payload.listen === ENTRY_LISTEN
  );
}

async function waitForHealthy(timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await getJson("/health", 2000);
      if (res.statusCode === 200 && isValidHealthPayload(res.json)) {
        return res.json;
      }
    } catch {
      // retry
    }
    await wait(500);
  }
  return null;
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

function addBinToUserPath() {
  const script = [
    "$ErrorActionPreference='Stop'",
    `$target='${binDir.replaceAll("'", "''")}'`,
    "$current=[Environment]::GetEnvironmentVariable('Path','User')",
    "if ([string]::IsNullOrWhiteSpace($current)) {",
    "  $newPath=$target",
    "} else {",
    "  $parts=$current.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }",
    "  if ($parts -notcontains $target) { $parts += $target }",
    "  $newPath=($parts -join ';')",
    "}",
    "[Environment]::SetEnvironmentVariable('Path',$newPath,'User')",
    "Write-Output $newPath"
  ].join("\n");
  const res = runPowerShell(script);
  if (res.status !== 0) {
    throw new Error(`Failed to update user PATH: ${res.stderr || "unknown error"}`);
  }
  const updated = (res.stdout || "").trim();
  if (updated) {
    process.env.PATH = `${binDir};${process.env.PATH || ""}`;
  }
}

function removeBinFromUserPath() {
  const script = [
    "$ErrorActionPreference='Stop'",
    `$target='${binDir.replaceAll("'", "''")}'`,
    "$current=[Environment]::GetEnvironmentVariable('Path','User')",
    "if ([string]::IsNullOrWhiteSpace($current)) { Write-Output ''; exit 0 }",
    "$parts=$current.Split(';') | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' -and $_ -ne $target }",
    "$newPath=($parts -join ';')",
    "[Environment]::SetEnvironmentVariable('Path',$newPath,'User')",
    "Write-Output $newPath"
  ].join("\n");
  const res = runPowerShell(script);
  if (res.status !== 0) {
    throw new Error(`Failed to remove PATH entry: ${res.stderr || "unknown error"}`);
  }
}

function registerStartupTask() {
  const res = runPowerShell(
    [
      startupRegisterScript,
      "-TaskName",
      startupTaskName,
      "-NodePath",
      process.execPath,
      "-CliPath",
      thisFile
    ],
    true
  );
  if (res.status !== 0) {
    throw new Error(`Startup registration failed: ${res.stderr || res.stdout || "unknown error"}`);
  }
}

function unregisterStartupTask() {
  const res = runPowerShell([startupUnregisterScript, "-TaskName", startupTaskName], true);
  if (res.status !== 0) {
    throw new Error(`Startup unregistration failed: ${res.stderr || res.stdout || "unknown error"}`);
  }
}

async function commandStart(extraEnv = {}, options = {}) {
  ensureEntryLayout();
  const silent = options?.silent === true;
  const respond = (result) => {
    if (!silent) {
      printJson(result);
    }
    if (!result.ok) {
      process.exitCode = result.code === "PORT_CONFLICT" ? 2 : 1;
    }
    return result;
  };

  const pid = readPid();
  if (pid && isPidRunning(pid) && isOurEntryProcess(pid)) {
    const health = await waitForHealthy(5000);
    if (health) {
      return respond({
        ok: true,
        service: SERVICE_NAME,
        listen: ENTRY_LISTEN,
        action: "start",
        alreadyRunning: true,
        pid,
        health
      });
    }
    return respond({
      ok: false,
      code: "RUNNING_NOT_HEALTHY",
      service: SERVICE_NAME,
      listen: ENTRY_LISTEN,
      action: "start",
      pid
    });
  }
  if (pid && !isPidRunning(pid)) {
    removePid();
  }

  const listeners = findListeningPids();
  if (listeners.length > 0) {
    const ours = listeners.every((listenerPid) => isOurEntryProcess(listenerPid));
    if (!ours) {
      return respond({
        ok: false,
        code: "PORT_CONFLICT",
        service: SERVICE_NAME,
        listen: ENTRY_LISTEN,
        ownerPids: listeners
      });
    }
    const health = await waitForHealthy(5000);
    if (health) {
      return respond({
        ok: true,
        service: SERVICE_NAME,
        listen: ENTRY_LISTEN,
        action: "start",
        alreadyRunning: true,
        ownerPids: listeners,
        health
      });
    }
    return respond({
      ok: false,
      code: "RUNNING_NOT_HEALTHY",
      service: SERVICE_NAME,
      listen: ENTRY_LISTEN,
      action: "start",
      ownerPids: listeners
    });
  }

  const child = spawn(process.execPath, [runnerPath], {
    cwd: rootDir,
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      LITECODEX_ENTRY_SERVICE: SERVICE_NAME,
      LITECODEX_ENTRY_HOST: ENTRY_HOST,
      LITECODEX_ENTRY_PORT: String(ENTRY_PORT),
      ...extraEnv
    }
  });
  child.unref();
  writePid(child.pid);

  const health = await waitForHealthy(20000);
  if (!health) {
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      // no-op
    }
    await wait(500);
    removePid();
    return respond({
      ok: false,
      code: "START_TIMEOUT",
      service: SERVICE_NAME,
      listen: ENTRY_LISTEN,
      pid: child.pid,
      state: readJson(stateFile, null)
    });
  }

  return respond({
    ok: true,
    service: SERVICE_NAME,
    listen: ENTRY_LISTEN,
    action: "start",
    pid: child.pid,
    health
  });
}

async function commandStop() {
  ensureEntryLayout();
  const pid = readPid();
  if (!pid || !isPidRunning(pid)) {
    const stoppedState = writeStoppedState();
    printJson({
      ok: true,
      service: SERVICE_NAME,
      listen: ENTRY_LISTEN,
      action: "stop",
      alreadyStopped: true,
      state: stoppedState
    });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // fallback below
  }

  const stopDeadline = Date.now() + 12000;
  while (Date.now() < stopDeadline) {
    if (!isPidRunning(pid)) break;
    await wait(300);
  }

  if (isPidRunning(pid)) {
    runPowerShell(`Stop-Process -Id ${pid} -Force -ErrorAction SilentlyContinue`);
    await wait(500);
  }

  const stoppedState = writeStoppedState();
  printJson({
    ok: true,
    service: SERVICE_NAME,
    listen: ENTRY_LISTEN,
    action: "stop",
    pid,
    stopped: !isPidRunning(pid),
    state: stoppedState
  });
}

async function commandStatus() {
  ensureEntryLayout();
  const pid = readPid();
  const pidRunning = pid ? isPidRunning(pid) : false;
  const listeners = findListeningPids();
  const state = readJson(stateFile, null);
  let remote = null;
  try {
    const res = await getJson("/status", 2000);
    const contractValid =
      res.statusCode === 200 &&
      res.json &&
      res.json.service === SERVICE_NAME &&
      res.json.listen === ENTRY_LISTEN;
    remote = {
      reachable: true,
      statusCode: res.statusCode,
      contractValid,
      body: res.json || res.body
    };
  } catch (error) {
    remote = {
      reachable: false,
      contractValid: false,
      error: String(error?.message || error)
    };
  }

  const status = remote?.reachable && remote?.contractValid ? "online" : pidRunning ? "starting_or_degraded" : "offline";
  printJson({
    service: SERVICE_NAME,
    listen: ENTRY_LISTEN,
    status,
    pid,
    pidRunning,
    listeners,
    state,
    remote
  });
}

async function commandRestart() {
  await commandStop();
  await commandStart();
}

async function commandOpen() {
  const url = `http://${ENTRY_LISTEN}`;
  runPowerShell(`Start-Process '${url}'`);
  printJson({
    ok: true,
    service: SERVICE_NAME,
    action: "open",
    url
  });
}

async function commandInstall() {
  ensureEntryLayout();
  registerStartupTask();
  addBinToUserPath();
  const startResult = await commandStart({ LITECODEX_ENTRY_STARTED_BY_INSTALL: "1" }, { silent: true });
  if (!startResult.ok) {
    throw new Error(`Install failed because entry start did not become healthy: ${startResult.code || "unknown"}`);
  }
  printJson({
    ok: true,
    service: SERVICE_NAME,
    action: "install",
    listen: ENTRY_LISTEN,
    startupTask: startupTaskName,
    cli: thisFile,
    health: startResult.health,
    commandHint: "litecodex entry status"
  });
}

async function commandUninstall() {
  await commandStop();
  unregisterStartupTask();
  removeBinFromUserPath();
  printJson({
    ok: true,
    service: SERVICE_NAME,
    action: "uninstall",
    startupTask: startupTaskName
  });
}

async function main() {
  ensureEntryLayout();
  const args = process.argv.slice(2);
  if (args.length < 2 || args[0] !== "entry") {
    usage();
    process.exitCode = 1;
    return;
  }

  const cmd = args[1];
  if (cmd === "install") {
    await commandInstall();
    return;
  }
  if (cmd === "uninstall") {
    await commandUninstall();
    return;
  }
  if (cmd === "start") {
    await commandStart(args.includes("--from-startup-task") ? { LITECODEX_ENTRY_STARTED_BY_TASK: "1" } : {});
    return;
  }
  if (cmd === "stop") {
    await commandStop();
    return;
  }
  if (cmd === "restart") {
    await commandRestart();
    return;
  }
  if (cmd === "status") {
    await commandStatus();
    return;
  }
  if (cmd === "open") {
    await commandOpen();
    return;
  }

  usage();
  process.exitCode = 1;
}

main().catch((error) => {
  printJson({
    ok: false,
    service: SERVICE_NAME,
    error: String(error?.stack || error?.message || error)
  });
  process.exitCode = 1;
});
