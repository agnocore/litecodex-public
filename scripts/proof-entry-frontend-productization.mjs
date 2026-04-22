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
const proofFile = path.join(proofDir, "entry-frontend-productization.json");
const entryCli = path.join(repoRoot, "entry", "cli.mjs");
const authEntFile = path.join(repoRoot, "release", "proof", "authorized-proof-entitlement.v1.json");
const authEntKeysFile = path.join(repoRoot, "release", "proof", "authorized-proof-entitlement-keys.v1.json");
const privateProviderEntry = path.join(
  repoRoot,
  "..",
  "private",
  "private-control-plane",
  "private-capability-provider",
  "index.mjs"
);
const invalidEntFile = path.join(repoRoot, "entry", "state", "entitlement.invalid.v1.json");
const invalidManifestFile = path.join(repoRoot, "entry", "state", "release-manifest.invalid.v1.json");

const steps = [];

function runNode(args, envExtra = {}) {
  const res = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...envExtra },
    timeout: 240000
  });
  return {
    command: `node ${args.join(" ")}`,
    code: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || ""
  };
}

function runEntryRestart(envExtra = {}) {
  return runNode([entryCli, "entry", "restart"], envExtra);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function request(method, pathname, payload = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: 43985,
        method,
        path: pathname,
        timeout: 8000,
        headers: payload ? { "content-type": "application/json" } : {}
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
            // no-op
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
    if (payload) req.write(JSON.stringify(payload));
    req.end();
  });
}

async function waitForEntry() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const health = await request("GET", "/health");
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
    await wait(500);
  }
  throw new Error("entry_unhealthy_timeout");
}

async function waitForHostConnected() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const preflight = await request("GET", "/entry/preflight");
      if (preflight.statusCode === 200 && preflight.json?.host_connected === true) {
        return preflight;
      }
    } catch {
      // retry
    }
    await wait(500);
  }
  throw new Error("host_connected_timeout");
}

function ensure(cond, code) {
  if (!cond) throw new Error(code);
}

async function setupCeReady() {
  const ws = await request("POST", "/entry/workspaces", { name: `ce-ui-${Date.now()}` });
  if (ws.statusCode !== 201) {
    throw new Error(`workspace_create_failed:${ws.statusCode}:${(ws.body || "").slice(0, 240)}`);
  }
  const access = await request("POST", "/entry/access/grant", {});
  if (access.statusCode !== 200) {
    throw new Error(`access_grant_failed:${access.statusCode}:${(access.body || "").slice(0, 240)}`);
  }
  const byo = await request("POST", "/entry/byo/openai/bind", { api_key: "sk-ui-proof-123456" });
  if (byo.statusCode !== 200) {
    throw new Error(`byo_bind_failed:${byo.statusCode}:${(byo.body || "").slice(0, 240)}`);
  }
  const sess = await request("POST", "/entry/sessions", { workspace_id: ws.json?.workspace?.id || null });
  if (sess.statusCode !== 201) {
    throw new Error(`session_create_failed:${sess.statusCode}:${(sess.body || "").slice(0, 240)}`);
  }
  return {
    workspace: ws.json?.workspace || null,
    session: sess.json?.session || null
  };
}

async function main() {
  fs.mkdirSync(proofDir, { recursive: true });

  const restartDefault = runEntryRestart({
    LITECODEX_ENTITLEMENT_FILE: "",
    LITECODEX_ENTITLEMENT_PUBLIC_KEYS_FILE: "",
    LITECODEX_PRIVATE_PROVIDER_ENTRY: "",
    LITECODEX_RELEASE_MANIFEST_FILE: ""
  });
  steps.push({ step: "restart_default", result: restartDefault });
  ensure(restartDefault.code === 0, "restart_default_failed");
  await waitForEntry();
  await waitForHostConnected();

  const cePreflight = await request("GET", "/entry/preflight");
  const cePages = {
    home: await request("GET", "/"),
    settings: await request("GET", "/settings"),
    sessions: await request("GET", "/sessions")
  };
  const ceSetup = await setupCeReady();
  const ceGeneral = await request("POST", "/entry/task/execute", {
    session_id: ceSetup.session?.id || null,
    prompt: "summarize this task in community lane",
    intent: "general"
  });
  const ceRestricted = await request("POST", "/entry/task/execute", {
    session_id: ceSetup.session?.id || null,
    prompt: "deploy this release",
    intent: "deploy"
  });
  steps.push({
    step: "ce_default_mode",
    result: {
      preflight: cePreflight,
      page_statuses: {
        home: cePages.home.statusCode,
        settings: cePages.settings.statusCode,
        sessions: cePages.sessions.statusCode
      },
      general: ceGeneral,
      restricted: ceRestricted
    }
  });
  ensure(cePreflight.statusCode === 200, "ce_preflight_unavailable");
  ensure(ceGeneral.statusCode === 200 && ceGeneral.json?.mode === "community", "ce_general_not_community");
  ensure(ceRestricted.statusCode === 403, "ce_restricted_not_403");
  ensure(cePages.home.body.includes("lite-codex"), "ce_home_missing_brand");

  const restartAuthorized = runEntryRestart({
    LITECODEX_ENTITLEMENT_FILE: authEntFile,
    LITECODEX_ENTITLEMENT_PUBLIC_KEYS_FILE: authEntKeysFile,
    LITECODEX_PRIVATE_PROVIDER_ENTRY: privateProviderEntry,
    LITECODEX_RELEASE_MANIFEST_FILE: ""
  });
  steps.push({ step: "restart_authorized", result: restartAuthorized });
  ensure(restartAuthorized.code === 0, "restart_authorized_failed");
  await waitForEntry();
  await waitForHostConnected();

  const authSetup = await setupCeReady();
  const authPreflight = await request("GET", "/entry/preflight");
  const authDeploy = await request("POST", "/entry/task/execute", {
    session_id: authSetup.session?.id || null,
    prompt: "deploy release candidate",
    intent: "deploy"
  });
  steps.push({ step: "authorized_mode", result: { preflight: authPreflight, deploy: authDeploy } });
  ensure(authPreflight.json?.provider_access?.authorized === true, "authorized_provider_not_loaded");
  ensure(authDeploy.statusCode === 200 && authDeploy.json?.mode === "enhanced", "authorized_deploy_not_enhanced");

  const restartFailClosed = runEntryRestart({
    LITECODEX_ENTITLEMENT_FILE: invalidEntFile,
    LITECODEX_RELEASE_MANIFEST_FILE: invalidManifestFile,
    LITECODEX_ENTITLEMENT_PUBLIC_KEYS_FILE: "",
    LITECODEX_PRIVATE_PROVIDER_ENTRY: ""
  });
  steps.push({ step: "restart_fail_closed", result: restartFailClosed });
  ensure(restartFailClosed.code === 0, "restart_fail_closed_failed");
  await waitForEntry();
  await waitForHostConnected();

  const failStatus = await request("GET", "/status");
  const failHome = await request("GET", "/");
  steps.push({ step: "fail_closed_mode", result: { status: failStatus, home_status: failHome.statusCode } });
  ensure(failStatus.statusCode === 200, "fail_closed_status_unavailable");
  ensure(failStatus.json?.degraded === true, "fail_closed_not_degraded");
  ensure(failHome.statusCode === 200, "fail_closed_home_unreachable");

  const restoreDefault = runEntryRestart({
    LITECODEX_ENTITLEMENT_FILE: "",
    LITECODEX_ENTITLEMENT_PUBLIC_KEYS_FILE: "",
    LITECODEX_PRIVATE_PROVIDER_ENTRY: "",
    LITECODEX_RELEASE_MANIFEST_FILE: ""
  });
  steps.push({ step: "restore_default", result: restoreDefault });
  ensure(restoreDefault.code === 0, "restore_default_failed");
  await waitForEntry();
  await waitForHostConnected();

  const proof = {
    generatedAt: new Date().toISOString(),
    ok: true,
    checks: {
      ceDefaultUiReachable: cePages.home.statusCode === 200 && cePages.settings.statusCode === 200 && cePages.sessions.statusCode === 200,
      ceGeneralExecutionWorks: ceGeneral.statusCode === 200 && ceGeneral.json?.mode === "community",
      restrictedReturns403: ceRestricted.statusCode === 403,
      authorizedEnhancedExecutionWorks: authPreflight.json?.provider_access?.authorized === true && authDeploy.json?.mode === "enhanced",
      failClosedStateVisible: failStatus.json?.degraded === true
    },
    steps
  };
  writeJson(proofFile, proof);
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
}

main().catch((error) => {
  const failure = {
    generatedAt: new Date().toISOString(),
    ok: false,
    error: String(error?.message || error),
    steps
  };
  writeJson(proofFile, failure);
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
});
