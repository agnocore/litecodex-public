import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE_NAME = process.env.LITECODEX_ENTRY_SERVICE || "litecodex-entry";
const HOST = process.env.LITECODEX_ENTRY_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.LITECODEX_ENTRY_PORT || "43985", 10);
const LISTEN = process.env.LITECODEX_ENTRY_LISTEN || `${HOST}:${PORT}`;
const MODE = process.env.LITECODEX_ENTRY_MODE || "community_edition";

const AGENT_HOST = process.env.LITE_CODEX_HOST_HOST || "127.0.0.1";
const AGENT_PORT = Number.parseInt(process.env.LITE_CODEX_HOST_PORT || "4317", 10);

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const entryDir = path.resolve(thisDir, "..");
const rootDir = path.resolve(entryDir, "..");
const sharedDir = path.join(rootDir, "shared");
const uiDir = path.join(entryDir, "ui");
const stateDir = path.join(entryDir, "state");
const accessStateFile = path.join(stateDir, "access-state.json");
const agentHostScript = path.join(rootDir, "agent-host", "src", "server.mjs");

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

const state = {
  service: SERVICE_NAME,
  listen: LISTEN,
  edition: process.env.LITECODEX_ENTRY_EDITION || "community",
  pid: process.ppid,
  startedAt: process.env.LITECODEX_ENTRY_STARTED_AT || new Date().toISOString(),
  lastHealthCheck: new Date().toISOString(),
  restartCount: Number.parseInt(process.env.LITECODEX_ENTRY_RESTART_COUNT || "0", 10),
  degraded: process.env.LITECODEX_ENTRY_DEGRADED === "1",
  lastError: null,
  mode: MODE,
  status: process.env.LITECODEX_ENTRY_DEGRADED === "1" ? "degraded" : "online",
  serverPid: process.pid,
  security: {
    communityEdition: true,
    officialCapabilitiesEnabled: false,
    entitlement: null,
    updates: null
  }
};

let managedAgentHost = null;
let hostBootInFlight = false;

function nowIso() {
  return new Date().toISOString();
}

function sendMessage(payload) {
  if (typeof process.send === "function") {
    process.send(payload);
  }
}

function refreshHealth() {
  state.lastHealthCheck = nowIso();
  sendMessage({ type: "health", at: state.lastHealthCheck });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(res, statusCode, payload, extraHeaders = {}) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  res.end(body);
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
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
    .wrap { max-width: 920px; margin: 56px auto; padding: 20px; }
    .card { background: #fff; border: 1px solid #d9e2ef; border-radius: 14px; padding: 24px; }
    h1 { margin: 0 0 14px; font-size: 30px; }
    dl { margin: 0; display: grid; grid-template-columns: 220px 1fr; row-gap: 8px; }
    dt { font-weight: 600; color: #475569; }
    dd { margin: 0; word-break: break-all; }
    .pill { display: inline-block; border-radius: 999px; border: 1px solid #cbd5e1; padding: 2px 10px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>Lite Codex Local Entry</h1>
      <dl>
        <dt>listen</dt><dd>${escapeHtml(state.listen)}</dd>
        <dt>service</dt><dd>${escapeHtml(state.service)}</dd>
        <dt>status</dt><dd><span class="pill">${escapeHtml(statusLabel)}</span></dd>
        <dt>mode</dt><dd>${escapeHtml(state.mode)}</dd>
        <dt>startedAt</dt><dd>${escapeHtml(state.startedAt)}</dd>
        <dt>restartCount</dt><dd>${escapeHtml(state.restartCount)}</dd>
        <dt>lastHealthCheck</dt><dd>${escapeHtml(state.lastHealthCheck)}</dd>
        <dt>entitlement</dt><dd>${escapeHtml(entitlementStatus)}</dd>
        <dt>updatePolicy</dt><dd>${escapeHtml(updatesStatus)}</dd>
        <dt>officialCapabilities</dt><dd>${escapeHtml(officialEnabled)}</dd>
      </dl>
    </div>
  </div>
</body>
</html>`;
}

function getUiFile(pathname) {
  if (pathname === "/" || pathname === "/settings" || pathname === "/sessions") {
    return path.join(uiDir, "index.html");
  }
  if (pathname === "/app.js") {
    return path.join(uiDir, "app.js");
  }
  if (pathname === "/styles.css") {
    return path.join(uiDir, "styles.css");
  }
  return null;
}

function serveUi(pathname, res) {
  const filePath = getUiFile(pathname);
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const ext = path.extname(filePath).toLowerCase();
  const mime = mimeByExt[ext] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": mime,
    "cache-control": "no-store"
  });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error("request_body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseBodyJson(buffer) {
  if (!buffer || buffer.length === 0) {
    return {};
  }
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return {};
  }
}

function normalizeHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (!value) continue;
    const lower = key.toLowerCase();
    if (
      lower === "host" ||
      lower === "connection" ||
      lower === "content-length" ||
      lower === "transfer-encoding"
    ) {
      continue;
    }
    out[lower] = value;
  }
  return out;
}

function proxyToHost({ method, pathWithQuery, headers, bodyBuffer, timeoutMs = 8000 }) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: AGENT_HOST,
        port: AGENT_PORT,
        method,
        path: pathWithQuery,
        headers: {
          ...normalizeHeaders(headers),
          ...(bodyBuffer ? { "content-length": bodyBuffer.length } : {})
        },
        timeout: timeoutMs
      },
      (upstream) => {
        const chunks = [];
        upstream.on("data", (chunk) => chunks.push(chunk));
        upstream.on("end", () => {
          const body = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(body.toString("utf8"));
          } catch {
            // non-json payload
          }
          resolve({
            statusCode: upstream.statusCode || 0,
            headers: upstream.headers,
            body,
            text: body.toString("utf8"),
            json
          });
        });
      }
    );
    request.on("timeout", () => request.destroy(new Error("host_proxy_timeout")));
    request.on("error", reject);
    if (bodyBuffer && bodyBuffer.length > 0) {
      request.write(bodyBuffer);
    }
    request.end();
  });
}

function pipeEvents(req, res, pathWithQuery) {
  const upstream = http.request(
    {
      host: AGENT_HOST,
      port: AGENT_PORT,
      method: "GET",
      path: pathWithQuery,
      headers: normalizeHeaders(req.headers),
      timeout: 120000
    },
    (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 200, {
        ...upstreamRes.headers,
        "cache-control": "no-store"
      });
      upstreamRes.pipe(res);
    }
  );
  upstream.on("error", (error) => {
    writeJson(res, 503, {
      ok: false,
      error: "host_unavailable",
      message: String(error?.message || error)
    });
  });
  req.on("close", () => {
    upstream.destroy();
  });
  upstream.end();
}

async function isHostHealthy() {
  try {
    const probe = await proxyToHost({
      method: "GET",
      pathWithQuery: "/health",
      headers: {},
      bodyBuffer: null,
      timeoutMs: 1200
    });
    return probe.statusCode === 200 && probe.json?.ok === true;
  } catch {
    return false;
  }
}

function spawnManagedHost() {
  if (managedAgentHost || !fs.existsSync(agentHostScript)) {
    return;
  }
  managedAgentHost = spawn(process.execPath, [agentHostScript], {
    cwd: rootDir,
    env: {
      ...process.env,
      LITE_CODEX_HOST_PORT: String(AGENT_PORT)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  managedAgentHost.stdout?.setEncoding("utf8");
  managedAgentHost.stderr?.setEncoding("utf8");
  managedAgentHost.stdout?.on("data", (chunk) => {
    const line = String(chunk || "").trim();
    if (line) {
      sendMessage({ type: "host.log", stream: "stdout", line });
    }
  });
  managedAgentHost.stderr?.on("data", (chunk) => {
    const line = String(chunk || "").trim();
    if (line) {
      sendMessage({ type: "host.log", stream: "stderr", line });
    }
  });
  managedAgentHost.on("exit", (code, signal) => {
    managedAgentHost = null;
    sendMessage({ type: "host.exit", code, signal: signal || "none" });
  });
}

async function ensureHostAvailable() {
  if (await isHostHealthy()) {
    return { connected: true, started: false };
  }
  if (process.env.LITECODEX_ENTRY_AUTOSTART_HOST === "0") {
    return { connected: false, reason: "autostart_disabled" };
  }
  if (!hostBootInFlight) {
    hostBootInFlight = true;
    spawnManagedHost();
  }
  const deadline = Date.now() + 12000;
  while (Date.now() < deadline) {
    if (await isHostHealthy()) {
      hostBootInFlight = false;
      return { connected: true, started: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  hostBootInFlight = false;
  return { connected: false, reason: "host_boot_timeout" };
}

function defaultAccessState() {
  return {
    full_access_granted: false,
    status: "revoked",
    source: null,
    updated_at: null
  };
}

function loadAccessState() {
  const existing = readJson(accessStateFile, null);
  if (!existing || typeof existing !== "object") {
    return defaultAccessState();
  }
  return {
    full_access_granted: existing.full_access_granted === true,
    status: existing.full_access_granted === true ? "granted" : "revoked",
    source: typeof existing.source === "string" ? existing.source : null,
    updated_at: typeof existing.updated_at === "string" ? existing.updated_at : null
  };
}

function saveAccessState(next) {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(accessStateFile, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

function failClosed() {
  return Boolean(state.security?.entitlement?.failClosed || state.security?.updates?.failClosed || state.degraded);
}

function contractVersion(fileName, fallback = "v1") {
  const payload = readJson(path.join(sharedDir, fileName), null);
  return payload && payload.version ? String(payload.version) : fallback;
}

function contractVersions() {
  return {
    preflight: contractVersion("entry-preflight-contract.v1.json", "v1"),
    workspace: contractVersion("entry-workspace-contract.v1.json", "v1"),
    session: contractVersion("entry-session-contract.v1.json", "v1"),
    attachment: contractVersion("entry-attachment-contract.v1.json", "v1"),
    access: contractVersion("entry-access-contract.v1.json", "v1"),
    byo_openai: contractVersion("entry-byo-openai-contract.v1.json", "v1")
  };
}

async function handleAccess(req, res, pathname) {
  const method = String(req.method || "GET").toUpperCase();
  const current = loadAccessState();
  if (method === "GET") {
    writeJson(res, 200, { ...current, route: pathname });
    return;
  }
  if (method !== "POST") {
    writeJson(res, 405, { ok: false, error: "method_not_allowed" });
    return;
  }
  if (pathname.endsWith("/grant")) {
    if (failClosed()) {
      const revoked = saveAccessState({
        full_access_granted: false,
        status: "revoked",
        source: "security_fail_closed",
        updated_at: nowIso()
      });
      writeJson(res, 403, {
        ok: false,
        error: "fail_closed",
        code: "SECURITY_FAIL_CLOSED",
        ...revoked
      });
      return;
    }
    const granted = saveAccessState({
      full_access_granted: true,
      status: "granted",
      source: "entry_local_grant",
      updated_at: nowIso()
    });
    writeJson(res, 200, { ok: true, ...granted });
    return;
  }
  if (pathname.endsWith("/recheck")) {
    const checked = failClosed()
      ? {
          full_access_granted: false,
          status: "revoked",
          source: "security_fail_closed",
          updated_at: nowIso()
        }
      : {
          ...current,
          updated_at: nowIso(),
          source: current.source || "entry_local_recheck"
        };
    writeJson(res, 200, { ok: true, ...saveAccessState(checked) });
    return;
  }
  writeJson(res, 404, { ok: false, error: "not_found" });
}

function normalizeSessionRow(row) {
  if (!row || typeof row !== "object") {
    return null;
  }
  return {
    id: row.id || null,
    workspace_id: row.workspace_id || null,
    run_id: row.run_id || null,
    status: row.status || "active",
    title: row.title || "Untitled Session",
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    last_active_at: row.last_active_at || row.updated_at || null
  };
}

async function handlePreflight(req, res) {
  const versions = contractVersions();
  const access = loadAccessState();
  const securityClosed = failClosed();
  const host = await ensureHostAvailable();
  if (!host.connected) {
    writeJson(res, 200, {
      ok: true,
      contract_version: versions.preflight,
      host_connected: false,
      host_reason: host.reason || "host_unavailable",
      full_access_granted: false,
      openai_byo_bound: false,
      workspace_available: false,
      selected_workspace: null,
      last_session_available: false,
      last_session: null,
      contracts: versions,
      provider_access: { authorized: false, loaded_count: 0 },
      security: {
        fail_closed: securityClosed,
        reason: securityClosed ? "entry_security_fail_closed" : null
      }
    });
    return;
  }
  try {
    const upstream = await proxyToHost({ method: "GET", pathWithQuery: "/entry/preflight", headers: req.headers, bodyBuffer: null });
    const hostPayload = upstream.json || {};
    const session = normalizeSessionRow(hostPayload.last_session || null);
    writeJson(res, 200, {
      ok: true,
      contract_version: versions.preflight,
      host_connected: true,
      full_access_granted: !securityClosed && access.full_access_granted === true,
      openai_byo_bound: hostPayload.openai_byo_bound === true,
      workspace_available: hostPayload.workspace_available === true,
      selected_workspace: hostPayload.selected_workspace || null,
      last_session_available: Boolean(session),
      last_session: session,
      contracts: versions,
      provider_access: hostPayload.provider_access
        ? {
            authorized: hostPayload.provider_access.authorized === true,
            loaded_count: Array.isArray(hostPayload.provider_access.loaded)
              ? hostPayload.provider_access.loaded.filter((x) => x && x.loaded === true).length
              : 0
          }
        : { authorized: false, loaded_count: 0 },
      security: {
        fail_closed: securityClosed,
        reason: securityClosed ? "entry_security_fail_closed" : null
      }
    });
  } catch (error) {
    writeJson(res, 200, {
      ok: true,
      contract_version: versions.preflight,
      host_connected: false,
      host_reason: String(error?.message || error),
      full_access_granted: false,
      openai_byo_bound: false,
      workspace_available: false,
      selected_workspace: null,
      last_session_available: false,
      last_session: null,
      contracts: versions,
      provider_access: { authorized: false, loaded_count: 0 },
      security: {
        fail_closed: securityClosed,
        reason: securityClosed ? "entry_security_fail_closed" : null
      }
    });
  }
}

async function handleContracts(req, res) {
  const versions = contractVersions();
  const host = await ensureHostAvailable();
  if (!host.connected) {
    writeJson(res, 200, {
      contracts: {
        preflight: { version: versions.preflight },
        workspace: { version: versions.workspace },
        session: { version: versions.session },
        attachment: { version: versions.attachment },
        access: { version: versions.access },
        byo_openai: { version: versions.byo_openai }
      }
    });
    return;
  }
  try {
    const upstream = await proxyToHost({ method: "GET", pathWithQuery: "/entry/contracts", headers: req.headers, bodyBuffer: null });
    if (upstream.statusCode >= 200 && upstream.statusCode < 300 && upstream.json?.contracts) {
      writeJson(res, 200, upstream.json);
      return;
    }
  } catch {
    // fall back below
  }
  writeJson(res, 200, {
    contracts: {
      preflight: { version: versions.preflight },
      workspace: { version: versions.workspace },
      session: { version: versions.session },
      attachment: { version: versions.attachment },
      access: { version: versions.access },
      byo_openai: { version: versions.byo_openai }
    }
  });
}

function finalAnswerText(prompt, mode) {
  const text = String(prompt || "").trim().slice(0, 120);
  return mode === "enhanced"
    ? `Enhanced lane finished for: ${text || "(no prompt)"}`
    : `Community lane finished for: ${text || "(no prompt)"}`;
}

async function handleTaskExecute(req, res, bodyBuffer) {
  const host = await ensureHostAvailable();
  if (!host.connected) {
    writeJson(res, 503, {
      ok: false,
      error: "host_unavailable",
      message: host.reason || "host_unavailable"
    });
    return;
  }
  const payload = parseBodyJson(bodyBuffer);
  const prompt = String(payload.prompt || "").trim();
  if (!prompt) {
    writeJson(res, 400, { ok: false, error: "prompt_required" });
    return;
  }
  const intent = String(payload.intent || "").trim() || (/\b(deploy|release|ship|publish)\b/i.test(prompt) ? "deploy" : "general");
  let providerAuthorized = false;
  try {
    const pf = await proxyToHost({ method: "GET", pathWithQuery: "/entry/preflight", headers: req.headers, bodyBuffer: null });
    providerAuthorized = pf.json?.provider_access?.authorized === true;
  } catch {
    providerAuthorized = false;
  }

  if (intent === "deploy") {
    if (!providerAuthorized) {
      writeJson(res, 403, {
        ok: false,
        error: "community_edition_restricted",
        code: "COMMUNITY_EDITION_RESTRICTED",
        required_feature: "official_advanced",
        capability: "internal_or_official_workflow",
        reason: "enhanced_deploy_requires_authorized_private_provider"
      });
      return;
    }
    const deploy = await proxyToHost({
      method: "POST",
      pathWithQuery: "/runs/workspace-root-deploy-closeout",
      headers: { "content-type": "application/json" },
      bodyBuffer: Buffer.from(JSON.stringify({ title: `Deploy: ${prompt.slice(0, 72)}` }), "utf8")
    });
    if (deploy.statusCode >= 400) {
      writeJson(res, deploy.statusCode, deploy.json || { ok: false, error: "deploy_failed", message: deploy.text });
      return;
    }
    const run = deploy.json?.run || null;
    writeJson(res, 200, {
      ok: true,
      mode: "enhanced",
      intent,
      run,
      cards: [
        { type: "Execution Step", title: "Enhanced Execution", content: "Authorized provider executed deploy workflow." },
        { type: "Deploy Result", title: "Deploy Completed", content: run?.status === "completed" ? "Deployment completed." : "Deployment finished with non-terminal state." },
        { type: "Final Answer", title: "Final Answer", content: finalAnswerText(prompt, "enhanced") }
      ]
    });
    return;
  }

  const created = await proxyToHost({
    method: "POST",
    pathWithQuery: "/runs",
    headers: { "content-type": "application/json" },
    bodyBuffer: Buffer.from(JSON.stringify({ title: prompt.slice(0, 120) }), "utf8")
  });
  if (created.statusCode >= 400 || !created.json?.run?.id) {
    writeJson(res, created.statusCode || 500, created.json || { ok: false, error: "run_create_failed", message: created.text });
    return;
  }
  const run = created.json.run;
  let verify = null;
  try {
    const compact = await proxyToHost({
      method: "POST",
      pathWithQuery: `/runs/${encodeURIComponent(run.id)}/compact`,
      headers: { "content-type": "application/json" },
      bodyBuffer: Buffer.from(JSON.stringify({ mode: "manual" }), "utf8")
    });
    verify = compact.json || null;
  } catch {
    verify = null;
  }
  writeJson(res, 200, {
    ok: true,
    mode: "community",
    intent,
    run,
    verify,
    cards: [
      { type: "Execution Step", title: "Community Execution", content: "Community kernel created run and baseline execution trace." },
      { type: "Verify Result", title: "Verify Completed", content: verify?.ok === true ? "Verify/compact completed." : "Verify returned no artifact." },
      { type: "Final Answer", title: "Final Answer", content: finalAnswerText(prompt, "community") }
    ]
  });
}

function normalizeContinuePath(pathname) {
  if (pathname === "/entry/sessions/continue-last") {
    return "/entry/sessions/continue";
  }
  return pathname;
}

function allowedProxyRoute(method, pathname) {
  const m = String(method || "GET").toUpperCase();
  if (m === "GET" && pathname === "/entry/contracts") return true;
  if ((m === "GET" || m === "POST") && /^\/entry\/workspaces(?:\/select|\/current)?$/.test(pathname)) return true;
  if ((m === "GET" || m === "POST") && pathname === "/entry/sessions") return true;
  if (m === "POST" && (pathname === "/entry/sessions/continue" || pathname === "/entry/sessions/continue-last")) return true;
  if ((m === "GET" || m === "POST") && /^\/entry\/sessions\/[^/]+\/attachments(?:\/(upload|paste|screenshot))?$/.test(pathname)) return true;
  if ((m === "GET" || m === "POST") && /^\/entry\/byo\/openai\/(status|bind|clear)$/.test(pathname)) return true;
  if ((m === "GET" || m === "POST") && /^\/byo\/openai\/(status|bind|clear)$/.test(pathname)) return true;
  if (m === "POST" && pathname === "/session/byo-key") return true;
  if ((m === "GET" || m === "POST") && pathname === "/runs") return true;
  if (m === "GET" && /^\/runs\/[^/]+$/.test(pathname)) return true;
  if (m === "GET" && /^\/runs\/[^/]+\/hydrate$/.test(pathname)) return true;
  if (m === "POST" && /^\/runs\/[^/]+\/compact$/.test(pathname)) return true;
  if (m === "POST" && /^\/auth\/sessions\/[^/]+\/submit$/.test(pathname)) return true;
  return false;
}

async function proxyJson(req, res, pathname, search) {
  const bodyBuffer = req.method === "POST" || req.method === "DELETE" ? await readRequestBody(req) : null;
  const upstream = await proxyToHost({
    method: req.method || "GET",
    pathWithQuery: `${normalizeContinuePath(pathname)}${search}`,
    headers: req.headers,
    bodyBuffer,
    timeoutMs: 10000
  });
  res.writeHead(upstream.statusCode || 200, {
    "content-type": upstream.headers["content-type"] || "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(upstream.body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${LISTEN}`);
  const pathname = url.pathname;
  const method = String(req.method || "GET").toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET,POST,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type,authorization"
    });
    res.end();
    return;
  }

  try {
    if (method === "GET" && pathname === "/health") {
      refreshHealth();
      writeJson(res, 200, {
        ok: true,
        service: state.service,
        listen: state.listen
      });
      return;
    }

    if (method === "GET" && pathname === "/status") {
      refreshHealth();
      writeJson(res, 200, {
        ...state,
        status: state.degraded ? "degraded" : "online"
      });
      return;
    }

    if (method === "GET" && pathname === "/entry/contracts") {
      refreshHealth();
      await handleContracts(req, res);
      return;
    }

    if (method === "GET" && pathname === "/entry/preflight") {
      refreshHealth();
      await handlePreflight(req, res);
      return;
    }

    if (["/access/status", "/access/grant", "/access/recheck", "/entry/access/status", "/entry/access/grant", "/entry/access/recheck"].includes(pathname)) {
      refreshHealth();
      await handleAccess(req, res, pathname);
      return;
    }

    if (method === "POST" && pathname === "/entry/task/execute") {
      refreshHealth();
      const body = await readRequestBody(req);
      await handleTaskExecute(req, res, body);
      return;
    }

    if (method === "GET" && pathname === "/events") {
      refreshHealth();
      const host = await ensureHostAvailable();
      if (!host.connected) {
        writeJson(res, 503, { ok: false, error: "host_unavailable", reason: host.reason || "host_unavailable" });
        return;
      }
      pipeEvents(req, res, `${pathname}${url.search}`);
      return;
    }

    if (allowedProxyRoute(method, pathname)) {
      refreshHealth();
      const host = await ensureHostAvailable();
      if (!host.connected) {
        writeJson(res, 503, { ok: false, error: "host_unavailable", reason: host.reason || "host_unavailable" });
        return;
      }
      await proxyJson(req, res, pathname, url.search);
      return;
    }

    if (method === "GET" && serveUi(pathname, res)) {
      refreshHealth();
      return;
    }

    if (method === "GET" && ["/", "/settings", "/sessions"].includes(pathname)) {
      refreshHealth();
      if (serveUi(pathname, res)) {
        return;
      }
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
      path: pathname
    });
  } catch (error) {
    writeJson(res, 500, {
      error: "internal_error",
      message: String(error?.message || error)
    });
  }
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    sendMessage({
      type: "fatal",
      code: "PORT_CONFLICT",
      message: `Port ${LISTEN} is already in use`
    });
    process.exit(98);
    return;
  }
  sendMessage({
    type: "fatal",
    code: "SERVER_ERROR",
    message: String(error?.stack || error?.message || error)
  });
  process.exit(1);
});

process.on("message", (message) => {
  if (!message || typeof message !== "object") return;
  if (message.type !== "state" || !message.state || typeof message.state !== "object") return;
  if (Object.hasOwn(message.state, "service")) state.service = message.state.service;
  if (Object.hasOwn(message.state, "listen")) state.listen = message.state.listen;
  if (Object.hasOwn(message.state, "edition")) state.edition = message.state.edition;
  if (Object.hasOwn(message.state, "pid")) state.pid = message.state.pid;
  if (Object.hasOwn(message.state, "startedAt")) state.startedAt = message.state.startedAt;
  if (Object.hasOwn(message.state, "lastHealthCheck")) state.lastHealthCheck = message.state.lastHealthCheck;
  if (Object.hasOwn(message.state, "restartCount") && Number.isFinite(message.state.restartCount)) {
    state.restartCount = message.state.restartCount;
  }
  if (Object.hasOwn(message.state, "degraded")) state.degraded = Boolean(message.state.degraded);
  if (Object.hasOwn(message.state, "lastError")) state.lastError = message.state.lastError;
  if (Object.hasOwn(message.state, "mode")) state.mode = message.state.mode;
  if (Object.hasOwn(message.state, "status")) {
    state.status = message.state.status;
  } else {
    state.status = state.degraded ? "degraded" : "online";
  }
  if (Object.hasOwn(message.state, "security")) state.security = message.state.security;
  state.serverPid = process.pid;
});

function shutdown() {
  const finalize = () => {
    if (managedAgentHost) {
      try {
        managedAgentHost.kill("SIGTERM");
      } catch {
        // no-op
      }
    }
    process.exit(0);
  };
  server.close(() => finalize());
  setTimeout(() => finalize(), 2000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (error) => {
  sendMessage({
    type: "fatal",
    code: "UNCAUGHT_EXCEPTION",
    message: String(error?.stack || error?.message || error)
  });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  sendMessage({
    type: "fatal",
    code: "UNHANDLED_REJECTION",
    message: String(reason?.stack || reason?.message || reason)
  });
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  refreshHealth();
  sendMessage({ type: "ready", at: nowIso(), serverPid: process.pid });
});

setInterval(() => {
  refreshHealth();
}, 15000).unref();
