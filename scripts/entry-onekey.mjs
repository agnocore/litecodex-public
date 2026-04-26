#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ENTRY_ORIGIN = "http://127.0.0.1:43985";
const HOST_ORIGIN = "http://127.0.0.1:4317";
const REPO_ROOT = process.cwd();
const FRONTEND_MANIFEST = path.join(REPO_ROOT, "entry", "service", "public", "frontend-runtime.manifest.v1.json");

function runOrThrow(command, args) {
  const res = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: false
  });
  if (res.error) {
    throw new Error(`command_spawn_error:${command} ${args.join(" ")}:${res.error.message}`);
  }
  if (res.status !== 0) {
    throw new Error(`command_failed:${command} ${args.join(" ")}:exit_${res.status}`);
  }
}

async function fetchJson(url, init = {}, expectedStatus = 200) {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }
  if (res.status !== expectedStatus) {
    throw new Error(`http_${res.status}:${url}:${JSON.stringify(payload)}`);
  }
  return payload;
}

function sha256Buffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function canonicalizeTextBuffer(buf, extHint) {
  const ext = String(extHint || "").toLowerCase();
  const textLike = ext === ".js" || ext === ".css" || ext === ".html" || ext === ".json" || ext === ".mjs";
  if (!textLike) return buf;
  const normalized = buf.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Buffer.from(normalized, "utf8");
}

function readFrontendManifest() {
  if (!fs.existsSync(FRONTEND_MANIFEST)) {
    throw new Error(`frontend_manifest_missing:${FRONTEND_MANIFEST}`);
  }
  return JSON.parse(fs.readFileSync(FRONTEND_MANIFEST, "utf8").replace(/^\uFEFF/, ""));
}

async function fetchBytes(url, expectedStatus = 200) {
  const res = await fetch(url);
  const arrayBuf = await res.arrayBuffer();
  if (res.status !== expectedStatus) {
    throw new Error(`http_${res.status}:${url}`);
  }
  return Buffer.from(arrayBuf);
}

async function verifyServedFrontend(manifest) {
  const rows = Array.isArray(manifest.files) ? manifest.files : [];
  const appRow = rows.find((x) => String(x.path || "") === "app.js");
  const stylesRow = rows.find((x) => String(x.path || "") === "styles.css");
  if (!appRow || !stylesRow) {
    throw new Error("frontend_manifest_missing_runtime_rows");
  }

  const appServed = await fetchBytes(`${ENTRY_ORIGIN}/app.js`);
  const stylesServed = await fetchBytes(`${ENTRY_ORIGIN}/styles.css`);
  const appHash = sha256Buffer(canonicalizeTextBuffer(appServed, ".js"));
  const stylesHash = sha256Buffer(canonicalizeTextBuffer(stylesServed, ".css"));
  const appExpected = String(appRow.sha256 || "").toLowerCase();
  const stylesExpected = String(stylesRow.sha256 || "").toLowerCase();
  if (appHash !== appExpected) {
    throw new Error(`served_app_hash_mismatch:${appHash}`);
  }
  if (stylesHash !== stylesExpected) {
    throw new Error(`served_styles_hash_mismatch:${stylesHash}`);
  }
  return {
    app_sha256: appHash,
    styles_sha256: stylesHash
  };
}

async function verifyUserFlow() {
  const frontendManifest = readFrontendManifest();
  const health43985 = await fetchJson(`${ENTRY_ORIGIN}/health`);
  const status43985 = await fetchJson(`${ENTRY_ORIGIN}/status`);
  const health4317 = await fetchJson(`${HOST_ORIGIN}/health`);
  const preflight = await fetchJson(`${ENTRY_ORIGIN}/entry/preflight`);
  const servedFrontend = await verifyServedFrontend(frontendManifest);

  const workspaceCreate = await fetchJson(
    `${ENTRY_ORIGIN}/entry/workspaces`,
    {
      method: "POST",
      body: JSON.stringify({ name: "entry-onekey" })
    },
    201
  );

  const sessionCreate = await fetchJson(
    `${ENTRY_ORIGIN}/entry/sessions`,
    {
      method: "POST",
      body: JSON.stringify({ workspace_id: workspaceCreate.workspace?.id || null, title: "onekey session" })
    },
    201
  );

  const turnCreate = await fetchJson(
    `${ENTRY_ORIGIN}/entry/sessions/${encodeURIComponent(sessionCreate.session?.id || "")}/turns`,
    {
      method: "POST",
      body: JSON.stringify({ prompt: "onekey verification", lane: "chat" })
    },
    201
  );

  const runId = String(turnCreate?.run?.id || turnCreate?.run_id || "").trim();
  if (!runId) {
    throw new Error("run_id_missing_after_turn");
  }

  const runDetail = await fetchJson(`${ENTRY_ORIGIN}/runs/${encodeURIComponent(runId)}`);
  if (!runDetail?.run?.id) {
    throw new Error("run_detail_missing");
  }

  return {
    health_43985: health43985,
    status_43985: status43985,
    health_4317: health4317,
    preflight,
    frontend_runtime: {
      manifest_version: frontendManifest.manifest_version || null,
      build_version: frontendManifest.build_version || null,
      served: servedFrontend
    },
    workspace_id: workspaceCreate.workspace?.id || null,
    session_id: sessionCreate.session?.id || null,
    run_id: runId,
    run_status: runDetail.run?.status || null,
    display_events: Array.isArray(runDetail.display_events) ? runDetail.display_events.length : 0
  };
}

async function main() {
  if (process.platform === "win32") {
    runOrThrow("cmd.exe", ["/d", "/s", "/c", "npm install"]);
  } else {
    runOrThrow("npm", ["install"]);
  }

  runOrThrow(process.execPath, ["scripts/verify-entry-frontend-runtime.mjs"]);
  runOrThrow(process.execPath, ["run-ledger/install.mjs", "--strict"]);
  runOrThrow(process.execPath, ["entry/cli.mjs", "entry", "install"]);
  runOrThrow(process.execPath, ["run-ledger/status.mjs"]);
  runOrThrow(process.execPath, ["entry/cli.mjs", "entry", "status"]);

  const flow = await verifyUserFlow();
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: true,
        command: "npm run entry:onekey",
        entry_origin: ENTRY_ORIGIN,
        host_origin: HOST_ORIGIN,
        verification: flow
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        ok: false,
        command: "npm run entry:onekey",
        error: String(error?.message || error)
      },
      null,
      2
    )}\n`
  );
  process.exit(1);
});
