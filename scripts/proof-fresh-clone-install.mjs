import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { writeJson } from "./release-lib.mjs";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(thisFile);
const repoRoot = path.resolve(scriptsDir, "..");
const proofDir = path.join(repoRoot, "release", "proof");
const proofFile = path.join(proofDir, "fresh-clone-install-proof.json");
const remoteRepo = "https://github.com/agnocore/litecodex-public.git";
const runtimeSteps = [];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    timeout: options.timeout || 300000
  });
  return {
    command: [command, ...args].join(" "),
    code: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function runNpm(args, options = {}) {
  if (process.platform === "win32") {
    return run("cmd.exe", ["/d", "/s", "/c", `npm ${args.join(" ")}`], options);
  }
  return run("npm", args, options);
}

function parseLastJson(stdout) {
  const text = String(stdout || "").trim();
  if (!text) return null;
  const indexes = [];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "{") indexes.push(i);
  }
  for (let i = indexes.length - 1; i >= 0; i -= 1) {
    try {
      return JSON.parse(text.slice(indexes[i]));
    } catch {
      // continue
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port: 43985,
        path: pathname,
        timeout: 5000
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            // ignore parse failure
          }
          resolve({
            statusCode: res.statusCode || 0,
            body,
            json
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function getText(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port: 43985,
        path: pathname,
        timeout: 5000
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            body
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

function listPortListeners(port) {
  const res = run("netstat", ["-ano", "-p", "tcp"], { timeout: 20000 });
  const lines = `${res.stdout}\n${res.stderr}`.split(/\r?\n/);
  const pids = new Set();
  for (const lineRaw of lines) {
    const line = lineRaw.trim();
    if (!line) continue;
    const cols = line.split(/\s+/);
    if (cols.length < 5) continue;
    const localAddress = cols[1] || "";
    const state = cols[3] || "";
    const pidValue = cols[4] || "";
    const isTargetPort =
      localAddress.endsWith(`:${port}`) ||
      localAddress.endsWith(`.0:${port}`) ||
      localAddress.endsWith(`.1:${port}`);
    if (!isTargetPort) continue;
    if (!/^\d+$/.test(pidValue)) continue;
    const pid = Number(pidValue);
    if (!Number.isFinite(pid) || pid <= 0) continue;
    if (!["LISTENING", "ESTABLISHED", "TIME_WAIT", "CLOSE_WAIT"].includes(state)) continue;
    pids.add(pid);
  }
  return Array.from(pids).sort((a, b) => a - b);
}

async function waitForHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson("/health");
      if (
        health.statusCode === 200 &&
        health.json?.ok === true &&
        health.json?.service === "litecodex-entry" &&
        health.json?.listen === "127.0.0.1:43985"
      ) {
        return health;
      }
    } catch {
      // retry
    }
    await sleep(600);
  }
  throw new Error("fresh_clone_entry_health_timeout");
}

function ensure(condition, errorCode) {
  if (!condition) {
    throw new Error(errorCode);
  }
}

async function main() {
  fs.mkdirSync(proofDir, { recursive: true });

  // Ensure test is not piggybacking on a previously-running entry server.
  const gracefulStop = run(process.execPath, [path.join("entry", "cli.mjs"), "entry", "stop"]);
  runtimeSteps.push({ step: "graceful_stop_current_entry", result: gracefulStop });

  const listenersBeforeKill = listPortListeners(43985);
  runtimeSteps.push({ step: "listeners_before_kill", result: listenersBeforeKill });

  const killResults = [];
  for (const pid of listenersBeforeKill) {
    const kill = run("taskkill", ["/PID", String(pid), "/F"], { timeout: 30000 });
    killResults.push({ pid, ...kill });
  }
  runtimeSteps.push({ step: "kill_existing_listeners", result: killResults });

  await sleep(800);
  const listenersAfterKill = listPortListeners(43985);
  runtimeSteps.push({ step: "listeners_after_kill", result: listenersAfterKill });

  const cloneStamp = new Date().toISOString().replace(/[-:TZ.]/g, "");
  const cloneDir = path.join(repoRoot, "release", `fresh-clone-public-${cloneStamp}`);
  const cloneRun = run("git", ["clone", "--depth", "1", remoteRepo, cloneDir], { timeout: 180000 });
  runtimeSteps.push({ step: "git_clone_public_repo", result: cloneRun });
  ensure(cloneRun.code === 0, "fresh_clone_failed");

  const npmInstall = runNpm(["install"], { cwd: cloneDir, timeout: 300000 });
  runtimeSteps.push({ step: "npm_install", result: npmInstall });
  ensure(npmInstall.code === 0, "fresh_clone_npm_install_failed");

  const entryInstall = runNpm(["run", "entry:install"], { cwd: cloneDir, timeout: 240000 });
  runtimeSteps.push({ step: "entry_install", result: entryInstall });
  ensure(entryInstall.code === 0, "fresh_clone_entry_install_failed");

  const entryInstallJson = parseLastJson(entryInstall.stdout);
  ensure(entryInstallJson?.ok === true, "fresh_clone_entry_install_not_ok");

  const health = await waitForHealth();
  runtimeSteps.push({ step: "entry_health", result: health });

  const entryStatus = runNpm(["run", "entry:status"], { cwd: cloneDir, timeout: 120000 });
  runtimeSteps.push({ step: "entry_status", result: entryStatus });
  ensure(entryStatus.code === 0, "fresh_clone_entry_status_failed");
  const entryStatusJson = parseLastJson(entryStatus.stdout);
  ensure(entryStatusJson?.status === "online", "fresh_clone_entry_not_online");
  ensure(entryStatusJson?.remote?.body?.service === "litecodex-entry", "fresh_clone_entry_service_contract_invalid");
  ensure(entryStatusJson?.remote?.body?.listen === "127.0.0.1:43985", "fresh_clone_entry_listen_contract_invalid");

  const statusEndpoint = await getJson("/status");
  runtimeSteps.push({ step: "entry_status_endpoint", result: statusEndpoint });

  const home = await getText("/");
  const settings = await getText("/settings");
  const sessions = await getText("/sessions");
  runtimeSteps.push({
    step: "entry_pages",
    result: {
      home_status: home.statusCode,
      settings_status: settings.statusCode,
      sessions_status: sessions.statusCode
    }
  });
  ensure(home.statusCode === 200, "fresh_clone_home_unreachable");
  ensure(settings.statusCode === 200, "fresh_clone_settings_unreachable");
  ensure(sessions.statusCode === 200, "fresh_clone_sessions_unreachable");
  const homeLooksProductized =
    home.body.includes("lite-codex") &&
    home.body.includes("app.js") &&
    settings.body.includes("lite-codex") &&
    sessions.body.includes("lite-codex");
  ensure(homeLooksProductized, "fresh_clone_productized_entry_ui_missing");

  const proof = {
    generatedAt: new Date().toISOString(),
    ok: true,
    remoteRepo,
    cloneDir: path.relative(repoRoot, cloneDir).replace(/\\/g, "/"),
    checks: {
      noListenerReuse: listenersAfterKill.length === 0,
      entryInstallOk: entryInstallJson?.ok === true,
      healthContract: health.json,
      entryStatusOnline: entryStatusJson?.status === "online",
      entryStatusContractValid:
        entryStatusJson?.remote?.body?.service === "litecodex-entry" &&
        entryStatusJson?.remote?.body?.listen === "127.0.0.1:43985",
      statusEndpointOnline: statusEndpoint.statusCode === 200 && statusEndpoint.json?.status === "online",
      productizedPagesReachable:
        home.statusCode === 200 &&
        settings.statusCode === 200 &&
        sessions.statusCode === 200 &&
        homeLooksProductized
    },
    steps: runtimeSteps
  };
  writeJson(proofFile, proof);
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
}

main().catch((error) => {
  const failure = {
    generatedAt: new Date().toISOString(),
    ok: false,
    error: String(error?.message || error),
    steps: runtimeSteps
  };
  writeJson(proofFile, failure);
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
});
