import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SERVICE_NAME = process.env.LITECODEX_ENTRY_SERVICE || "litecodex-entry";
const HOST = process.env.LITECODEX_ENTRY_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.LITECODEX_ENTRY_PORT || "43985", 10);
const LISTEN = process.env.LITECODEX_ENTRY_LISTEN || `${HOST}:${PORT}`;
const MODE = process.env.LITECODEX_ENTRY_MODE || "community_edition";
const HOST_API_ORIGIN = process.env.LITECODEX_HOST_API_ORIGIN || "http://127.0.0.1:4317";
const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_VALIDATION_MODEL = String(process.env.OPENAI_VALIDATION_MODEL || "gpt-5").trim();

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..", "..");
const staticRoot = resolveFrontendStaticRoot();
const SPA_FALLBACK_PATHS = new Set(["/", "/settings", "/sessions"]);
const PROXY_EXACT_PATHS = new Set([
  "/api",
  "/events",
  "/runs",
  "/entry",
  "/access",
  "/auth",
  "/byo",
  "/session",
  "/session/byo-key",
  "/runtime-profile",
  "/frontend-event-contract"
]);
const PROXY_PREFIXES = [
  "/api/",
  "/entry/",
  "/runs/",
  "/auth/",
  "/byo/",
  "/access/",
  "/session/",
  "/runtime/",
  "/integrity/",
  "/maintenance/",
  "/capability-grants/",
  "/phase4/",
  "/phase5/",
  "/phase6/"
];
const accessFallbackState = {
  granted: false,
  updated_at: nowIso(),
  source: "entry_fallback_bootstrap"
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

const mimeByExt = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

const proxyValidatedBindingIds = new Set();
const MAIN_THREAD_DISPLAY_TYPES = new Set(["user_message", "assistant_reply"]);
const DISPLAY_EVENT_LANES = new Set(["chat", "task", "system", "receipt"]);
const PROVISIONAL_ASSISTANT_REPLY_PATTERNS = [/^已收到你的(请求|问题)/, /^收到。/, /^已准备好继续。/];
const RECEIPT_EVENT_TYPE_PATTERNS = [/\.receipt\./i, /\.receipt$/i, /\.written$/i, /^writeback\./i];
const SYSTEM_EVENT_PREFIXES = ["context.", "compact.", "reconnect.", "resume.", "replay.", "retry.", "stale.running.recover", "auth.", "approval.", "fork.hydration"];

function sanitizeDisplayBody(body) {
  const text = String(body ?? "").replace(/\r/g, "").trim();
  if (!text) return "";
  if (
    /\bmode=analysis\b/i.test(text) ||
    /\bexecution_mode=answer_only\b/i.test(text) ||
    /\brequires_tools=no\b/i.test(text) ||
    /\bcompact_run=/i.test(text) ||
    /\bworkspace_id:/i.test(text) ||
    /\blane_detail:/i.test(text) ||
    /\bcontext_mode:/i.test(text)
  ) {
    return "";
  }
  return text.length > 1600 ? `${text.slice(0, 1597)}...` : text;
}

function isProvisionalAssistantReply(body) {
  const text = String(body || "").trim();
  if (!text) return false;
  return PROVISIONAL_ASSISTANT_REPLY_PATTERNS.some((pattern) => pattern.test(text));
}

function isReceiptEventType(eventType) {
  const type = String(eventType || "").trim().toLowerCase();
  if (!type) return false;
  return RECEIPT_EVENT_TYPE_PATTERNS.some((pattern) => pattern.test(type));
}

function inferDisplayLane({ displayType, eventType, lane, payload }) {
  const explicitLane = String(lane || "").trim().toLowerCase();
  if (DISPLAY_EVENT_LANES.has(explicitLane)) {
    return explicitLane;
  }

  const type = String(eventType || "").trim().toLowerCase();
  const p = payload && typeof payload === "object" ? payload : {};

  if (displayType === "user_message" || displayType === "assistant_reply") {
    return "chat";
  }
  if (
    isReceiptEventType(type) ||
    typeof p.receipt_path === "string" ||
    typeof p.approval_receipt_path === "string" ||
    typeof p.boundary_receipt_path === "string"
  ) {
    return "receipt";
  }
  if (SYSTEM_EVENT_PREFIXES.some((prefix) => type.startsWith(prefix))) {
    return "system";
  }
  return "task";
}

function buildDisplayDedupeKey({ runId, seq, displayType, eventType, lane, body }) {
  const seqNum = Number(seq);
  if (lane === "chat" && Number.isFinite(seqNum)) {
    return `${runId}:${seqNum}:${displayType}`;
  }
  return `${runId}:${lane}:${String(eventType || "").trim().toLowerCase()}:${body}`;
}

function normalizeRunDisplayEvent(event, runId) {
  if (!event || typeof event !== "object") return null;
  const displayType = String(event.display_type || event.displayType || "").trim();
  if (!MAIN_THREAD_DISPLAY_TYPES.has(displayType)) return null;
  const body = sanitizeDisplayBody(event.body ?? event.message ?? event.summary ?? "");
  if (!body) return null;
  if (displayType === "assistant_reply" && isProvisionalAssistantReply(body)) return null;
  const seq = Number(event.seq);
  const sourceEventType = String(event.source_event_type || event.sourceEventType || "").trim();
  const lane = inferDisplayLane({
    displayType,
    eventType: sourceEventType,
    lane: event.lane || event.display_lane || event.lane_hint,
    payload: event.payload
  });
  if (lane !== "chat") return null;
  return {
    display_type: displayType,
    lane: "chat",
    body,
    seq: Number.isFinite(seq) ? seq : null,
    created_at: String(event.created_at || event.createdAt || "").trim() || null,
    source_event_type: sourceEventType || null,
    dedupe_key:
      String(event.dedupe_key || event.dedupeKey || "").trim() ||
      buildDisplayDedupeKey({
        runId,
        seq,
        displayType,
        eventType: sourceEventType,
        lane: "chat",
        body
      }),
    is_main_thread: true
  };
}

function normalizeRunDisplayEvents(displayEvents, runId) {
  if (!Array.isArray(displayEvents)) return [];
  const out = [];
  const seen = new Set();
  for (const event of displayEvents) {
    const normalized = normalizeRunDisplayEvent(event, runId);
    if (!normalized) continue;
    const key = String(normalized.dedupe_key || "").trim() || `${runId}:${normalized.seq || "na"}:${normalized.display_type}:${normalized.body}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function normalizeRunDetailPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;
  const runId = String(payload?.run?.id || payload?.run_id || "").trim();
  const normalizedDisplayEvents = normalizeRunDisplayEvents(payload.display_events, runId || "run");
  return {
    ...payload,
    display_event_contract: {
      ...(payload.display_event_contract && typeof payload.display_event_contract === "object" ? payload.display_event_contract : {}),
      version: "v1.display-event-projection-main-thread-chat-only",
      main_thread_allowed: ["user_message", "assistant_reply"],
      lanes: ["chat", "task", "system", "receipt"]
    },
    display_events: normalizedDisplayEvents
  };
}

function isRunDetailPath(pathname) {
  return /^\/runs\/[^/]+$/.test(String(pathname || ""));
}

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

function writeJson(res, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

function parseFrontendRootsEnv(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    return [];
  }
  return rawValue
    .split(path.delimiter)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => path.resolve(part));
}

function isFrontendBundleRoot(rootPath) {
  if (typeof rootPath !== "string" || !rootPath) {
    return false;
  }
  const indexFile = path.join(rootPath, "index.html");
  const appFile = path.join(rootPath, "app.js");
  try {
    return fs.existsSync(indexFile) && fs.statSync(indexFile).isFile() && fs.existsSync(appFile) && fs.statSync(appFile).isFile();
  } catch {
    return false;
  }
}

function resolveFrontendStaticRoot() {
  const explicitRoots = [
    ...parseFrontendRootsEnv(process.env.LITECODEX_ENTRY_FRONTEND_ROOTS),
    ...parseFrontendRootsEnv(process.env.LITECODEX_ENTRY_FRONTEND_ROOT || "")
  ];
  const candidates = [
    ...explicitRoots,
    path.join(thisDir, "public"),
    path.join(repoRoot, "entry", "service", "public"),
    path.join(repoRoot, "entry", "ui"),
    path.join(repoRoot, "local-ui", "public")
  ];
  const seen = new Set();
  for (const candidate of candidates) {
    const abs = path.resolve(candidate);
    if (seen.has(abs)) {
      continue;
    }
    seen.add(abs);
    if (isFrontendBundleRoot(abs)) {
      return abs;
    }
  }
  return null;
}

function frontendMissingPayload(pathname) {
  return {
    error: "frontend_bundle_missing",
    service: state.service,
    path: pathname,
    listen: state.listen,
    message: "No usable frontend bundle was found for entry service.",
    expected_roots: [
      path.join(thisDir, "public"),
      path.join(repoRoot, "entry", "service", "public"),
      path.join(repoRoot, "entry", "ui"),
      path.join(repoRoot, "local-ui", "public")
    ]
  };
}

function isProxyPath(pathname) {
  const normalized = String(pathname || "");
  if (!normalized) {
    return false;
  }
  if (PROXY_EXACT_PATHS.has(normalized)) {
    return true;
  }
  return PROXY_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

async function readBodyBuffer(req, limitBytes = 8 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > limitBytes) {
      throw new Error("payload_too_large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function readBindingId(payload) {
  if (!payload || typeof payload !== "object") return null;
  if (payload.binding && typeof payload.binding === "object" && typeof payload.binding.id === "string" && payload.binding.id.trim()) {
    return payload.binding.id.trim();
  }
  if (
    payload.canonical_status &&
    typeof payload.canonical_status === "object" &&
    payload.canonical_status.binding &&
    typeof payload.canonical_status.binding === "object" &&
    typeof payload.canonical_status.binding.id === "string" &&
    payload.canonical_status.binding.id.trim()
  ) {
    return payload.canonical_status.binding.id.trim();
  }
  return null;
}

function normalizeOpenAiByoStatusPayload(payload, options = {}) {
  if (!payload || typeof payload !== "object") return payload;
  const next = { ...payload };
  const validationStatus = String(next.validation_status || "").trim();
  const bound = next.bound === true;
  const bindingId = readBindingId(next);
  const canonicalValidationStatus = String(
    next?.canonical_status?.validation?.validation_status || next?.canonical_status?.validation_status || ""
  ).trim();
  const proxyRecoverableStatuses = new Set([
    "unknown_auth_error",
    "gateway_ambiguous",
    "network_unreachable",
    "unavailable",
    "unknown",
    "validating",
    "binding"
  ]);
  if (options.acceptProxyValidated === true && bindingId) {
    proxyValidatedBindingIds.add(bindingId);
  }
  const hasProxyValidatedBinding = Boolean(bindingId && proxyValidatedBindingIds.has(bindingId));
  const effectiveStatus = validationStatus || canonicalValidationStatus || "unknown";
  const shouldPromoteWithProxy = bound && hasProxyValidatedBinding && proxyRecoverableStatuses.has(effectiveStatus);
  const shouldPromoteCanonicalValid = bound && canonicalValidationStatus === "valid";

  if (shouldPromoteWithProxy || shouldPromoteCanonicalValid) {
    next.validation_status = "valid";
    next.validation_error = null;
    if (shouldPromoteWithProxy) {
      next.proxy_validated = true;
      next.proxy_validated_at = nowIso();
    }
    if (next.validation && typeof next.validation === "object") {
      next.validation = {
        ...next.validation,
        validation_status: "valid",
        failure_reason: null
      };
    }
    if (next.canonical_status && typeof next.canonical_status === "object") {
      next.canonical_status = {
        ...next.canonical_status,
        validation_status: "valid",
        validation: {
          ...(next.canonical_status.validation && typeof next.canonical_status.validation === "object"
            ? next.canonical_status.validation
            : {}),
          validation_status: "valid",
          failure_reason: null
        }
      };
    }
  }
  return next;
}

async function verifyOpenAiApiKey(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key || !key.startsWith("sk-")) {
    return {
      ok: false,
      statusCode: 422,
      payload: {
        ok: false,
        error: "api_key_invalid",
        message: "OpenAI API key format is invalid.",
        provider: "openai",
        bound: false,
        validation_status: "invalid"
      }
    };
  }
  let probe = probeOpenAiViaPowerShell(key);
  if (!probe || !Number.isFinite(probe.status) || probe.status <= 0) {
    probe = await probeOpenAiViaFetch(key);
  }
  if ((!probe || !Number.isFinite(probe.status) || probe.status <= 0) && process.platform === "win32") {
    probe = probeOpenAiViaPowerShell(key);
  }
  if (!probe) {
    return {
      ok: false,
      statusCode: 503,
      payload: {
        ok: false,
        error: "api_key_validation_unavailable",
        message: "Unable to validate OpenAI API key right now.",
        provider: "openai",
        bound: false,
        validation_status: "unavailable"
      }
    };
  }
  if (probe.ok || probe.status === 429) {
    return { ok: true };
  }
  if (probe.status === 401 || probe.status === 403) {
    return {
      ok: false,
      statusCode: 422,
      payload: {
        ok: false,
        error: "api_key_validation_failed",
        message: "OpenAI API key validation failed.",
        provider: "openai",
        bound: false,
        validation_status: "invalid"
      }
    };
  }
  if (probe.status > 0) {
    return { ok: true };
  }
  return {
    ok: false,
    statusCode: 503,
    payload: {
      ok: false,
      error: "api_key_validation_unavailable",
      message: `Validation service returned HTTP ${probe.status || 0}.`,
      provider: "openai",
      bound: false,
      validation_status: "unavailable"
    }
  };
}

function probeOpenAiViaPowerShell(apiKey) {
  const script = [
    "$headers=@{Authorization=('Bearer '+$env:LITECODEX_OPENAI_VALIDATE_KEY);'Content-Type'='application/json'}",
    "$body=$env:LITECODEX_OPENAI_VALIDATE_BODY",
    "$uri=$env:LITECODEX_OPENAI_VALIDATE_URL",
    "$timeout=[int]$env:LITECODEX_OPENAI_VALIDATE_TIMEOUT",
    "$result=$null",
    "try{",
    "  $resp=Invoke-WebRequest -UseBasicParsing -Method POST -Uri $uri -Headers $headers -Body $body -TimeoutSec $timeout",
    "  $result=@{ok=$true;status=[int]$resp.StatusCode}",
    "}catch{",
    "  if($_.Exception.Response){",
    "    $result=@{ok=$false;status=[int]$_.Exception.Response.StatusCode}",
    "  } else {",
    "    $result=@{ok=$false;status=0;error=[string]$_.Exception.Message}",
    "  }",
    "}",
    "$result|ConvertTo-Json -Compress"
  ].join(";");
  const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 16000,
    env: {
      ...process.env,
      LITECODEX_OPENAI_VALIDATE_KEY: apiKey,
      LITECODEX_OPENAI_VALIDATE_URL: OPENAI_RESPONSES_URL,
      LITECODEX_OPENAI_VALIDATE_BODY: JSON.stringify({
        model: OPENAI_VALIDATION_MODEL || "gpt-5",
        input: "Validate Lite Codex OpenAI BYO key.",
        max_output_tokens: 1
      }),
      LITECODEX_OPENAI_VALIDATE_TIMEOUT: "12"
    }
  });
  if (!result || result.error) return null;
  const parsed = safeParseJson(String(result.stdout || "").trim());
  if (!parsed || (typeof parsed.status !== "number" && typeof parsed.ok !== "boolean")) return null;
  return {
    ok: Boolean(parsed.ok),
    status: Number(parsed.status || 0)
  };
}

async function probeOpenAiViaFetch(apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_VALIDATION_MODEL || "gpt-5",
        input: "Validate Lite Codex OpenAI BYO key.",
        max_output_tokens: 1
      }),
      signal: controller.signal
    });
    return { ok: response.ok, status: response.status };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function buildForwardHeaders(req) {
  const headers = {};
  if (typeof req.headers.accept === "string" && req.headers.accept.trim()) {
    headers.Accept = req.headers.accept;
  } else {
    headers.Accept = "application/json";
  }
  if (typeof req.headers["content-type"] === "string" && req.headers["content-type"].trim()) {
    headers["Content-Type"] = req.headers["content-type"];
  }
  return headers;
}

async function requestHost(pathnameWithSearch, method, bodyBuffer, headers = {}) {
  const target = new URL(pathnameWithSearch, HOST_API_ORIGIN);
  const response = await fetch(target, {
    method,
    headers,
    body: method === "GET" || method === "HEAD" ? undefined : bodyBuffer
  });
  const text = await response.text();
  return {
    status: response.status || 200,
    headers: response.headers,
    text,
    json: safeParseJson(text)
  };
}

function writeForwardResponse(res, upstream) {
  const responseHeaders = {};
  for (const [key, value] of upstream.headers.entries()) {
    const k = key.toLowerCase();
    if (k === "connection" || k === "transfer-encoding" || k === "content-encoding") continue;
    responseHeaders[key] = value;
  }
  res.writeHead(upstream.status, responseHeaders);
  res.end(upstream.text);
}

function buildSessionByoKeyStatusPayload(statusPayload) {
  const source = statusPayload && typeof statusPayload === "object" ? statusPayload : {};
  const canonical = source.canonical_status && typeof source.canonical_status === "object" ? source.canonical_status : source;
  const bound = source.bound === true || canonical.bound === true || canonical.status === "bound";
  const validationStatus = String(
    source.validation_status || canonical?.validation?.validation_status || canonical.validation_status || (bound ? "valid" : "not_bound")
  ).trim();
  const bindingScope = String(source.binding_scope || canonical?.binding?.binding_scope || "session_scope").trim() || "session_scope";
  const provider = String(source.provider || canonical.provider || "openai").trim() || "openai";
  const binding = source.binding && typeof source.binding === "object" ? source.binding : canonical?.binding || null;
  const validation = source.validation && typeof source.validation === "object" ? source.validation : canonical?.validation || null;

  return {
    provider,
    bound,
    binding_scope: bindingScope,
    validation_status: validationStatus,
    legacy_compatible: true,
    canonical_status: canonical,
    binding,
    validation
  };
}

function accessStatusPayload() {
  return {
    full_access_granted: accessFallbackState.granted === true,
    granted: accessFallbackState.granted === true,
    updated_at: accessFallbackState.updated_at,
    source: accessFallbackState.source
  };
}

async function proxyToHost(req, res, url) {
  let rawBody = Buffer.alloc(0);
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      rawBody = await readBodyBuffer(req);
    } catch (error) {
      if (String(error.message || "") === "payload_too_large") {
        writeJson(res, 413, { error: "payload_too_large" });
        return;
      }
      writeJson(res, 400, { error: "invalid_payload" });
      return;
    }
  }

  if (req.method === "POST" && (url.pathname === "/entry/byo/openai/clear" || url.pathname === "/session/byo-key")) {
    proxyValidatedBindingIds.clear();
  }

  if (req.method === "GET" && url.pathname === "/session/byo-key") {
    try {
      const upstream = await requestHost(`/entry/byo/openai/status${url.search || ""}`, "GET", undefined, {
        Accept: "application/json"
      });
      const normalized = buildSessionByoKeyStatusPayload(normalizeOpenAiByoStatusPayload(upstream.json || {}));
      writeJson(res, upstream.status, normalized);
      return;
    } catch (error) {
      writeJson(res, 502, { error: "host_proxy_unavailable", message: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "DELETE" && url.pathname === "/session/byo-key") {
    try {
      const upstream = await requestHost("/entry/byo/openai/clear", "POST", Buffer.from("{}", "utf8"), {
        Accept: "application/json",
        "Content-Type": "application/json"
      });
      const normalized = buildSessionByoKeyStatusPayload(normalizeOpenAiByoStatusPayload(upstream.json || {}));
      writeJson(res, upstream.status, normalized);
      return;
    } catch (error) {
      writeJson(res, 502, { error: "host_proxy_unavailable", message: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "POST" && (url.pathname === "/entry/access/grant" || url.pathname === "/access/grant")) {
    const body = safeParseJson(rawBody.toString("utf8")) || {};
    try {
      const upstream = await requestHost(url.pathname + url.search, "POST", rawBody, buildForwardHeaders(req));
      if (upstream.status !== 404) {
        writeForwardResponse(res, upstream);
        return;
      }
    } catch {
      // fallback below
    }
    accessFallbackState.granted = body.granted !== false;
    accessFallbackState.updated_at = nowIso();
    accessFallbackState.source =
      typeof body.source === "string" && body.source.trim() ? body.source.trim() : "entry_fallback_access_grant";
    writeJson(res, 200, {
      ok: true,
      grant: {
        id: `entry_access_${Date.now()}`,
        granted: accessFallbackState.granted,
        source: accessFallbackState.source,
        created_at: accessFallbackState.updated_at
      },
      ...accessStatusPayload()
    });
    return;
  }

  if (req.method === "POST" && (url.pathname === "/entry/access/recheck" || url.pathname === "/access/recheck")) {
    try {
      const upstream = await requestHost(url.pathname + url.search, "POST", rawBody, buildForwardHeaders(req));
      if (upstream.status !== 404) {
        writeForwardResponse(res, upstream);
        return;
      }
    } catch {
      // fallback below
    }
    writeJson(res, 200, {
      ok: true,
      checked_at: nowIso(),
      ...accessStatusPayload()
    });
    return;
  }

  if (req.method === "GET" && (url.pathname === "/entry/access/status" || url.pathname === "/access/status")) {
    try {
      const upstream = await requestHost(url.pathname + url.search, "GET", undefined, buildForwardHeaders(req));
      if (upstream.status !== 404) {
        writeForwardResponse(res, upstream);
        return;
      }
    } catch {
      // fallback below
    }
    writeJson(res, 200, accessStatusPayload());
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    const target = new URL(url.pathname + url.search, HOST_API_ORIGIN);
    try {
      const upstream = await fetch(target, {
        method: "GET",
        headers: buildForwardHeaders(req)
      });
      const responseHeaders = {};
      for (const [key, value] of upstream.headers.entries()) {
        const normalized = key.toLowerCase();
        if (normalized === "connection" || normalized === "transfer-encoding" || normalized === "content-encoding") {
          continue;
        }
        responseHeaders[key] = value;
      }
      res.writeHead(upstream.status || 200, responseHeaders);
      if (!upstream.body) {
        res.end();
        return;
      }
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    } catch (error) {
      writeJson(res, 502, { error: "host_proxy_unavailable", message: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/entry/byo/openai/status") {
    try {
      const upstream = await requestHost(url.pathname + url.search, "GET", undefined, { Accept: "application/json" });
      writeJson(res, upstream.status, normalizeOpenAiByoStatusPayload(upstream.json || {}));
      return;
    } catch (error) {
      writeJson(res, 502, { error: "host_proxy_unavailable", message: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/entry/byo/openai/bind") {
    const bodyJson = safeParseJson(rawBody.toString("utf8")) || {};
    const check = await verifyOpenAiApiKey(bodyJson.api_key || bodyJson.apiKey || "");
    if (!check.ok) {
      writeJson(res, check.statusCode || 422, check.payload);
      return;
    }
    const psForward = forwardBindToHostViaPowerShell(rawBody.toString("utf8"));
    if (psForward && Number.isFinite(psForward.status) && psForward.status > 0) {
      const payload = safeParseJson(psForward.bodyText);
      if (payload && typeof payload === "object") {
        writeJson(res, psForward.status, normalizeOpenAiByoStatusPayload(payload, { acceptProxyValidated: true }));
      } else {
        res.writeHead(psForward.status, {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        });
        res.end(psForward.bodyText || "{}");
      }
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/session/byo-key") {
    const bodyJson = safeParseJson(rawBody.toString("utf8")) || {};
    const upstreamPayload = {
      api_key: bodyJson.api_key || bodyJson.apiKey || bodyJson.key || "",
      validate_now: bodyJson.validate_now !== false
    };
    const encoded = Buffer.from(JSON.stringify(upstreamPayload), "utf8");
    try {
      const primary = await requestHost(url.pathname + url.search, "POST", encoded, {
        Accept: "application/json",
        "Content-Type": "application/json"
      });
      if (primary.status !== 404) {
        writeForwardResponse(res, primary);
        return;
      }
    } catch {
      // fallback below
    }
    try {
      const fallback = await requestHost("/entry/byo/openai/bind", "POST", encoded, {
        Accept: "application/json",
        "Content-Type": "application/json"
      });
      const normalized = buildSessionByoKeyStatusPayload(normalizeOpenAiByoStatusPayload(fallback.json || {}));
      writeJson(res, fallback.status, normalized);
      return;
    } catch (error) {
      writeJson(res, 502, { error: "host_proxy_unavailable", message: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "POST" && url.pathname === "/entry/sessions/continue-last") {
    try {
      const primary = await requestHost(url.pathname + url.search, "POST", rawBody, buildForwardHeaders(req));
      if (primary.status !== 404) {
        writeForwardResponse(res, primary);
        return;
      }
      const fallback = await requestHost("/entry/sessions/continue", "POST", rawBody, buildForwardHeaders(req));
      writeForwardResponse(res, fallback);
      return;
    } catch (error) {
      writeJson(res, 502, { error: "host_proxy_unavailable", message: String(error?.message || error) });
      return;
    }
  }

  if (req.method === "GET" && isRunDetailPath(url.pathname)) {
    try {
      const upstream = await requestHost(url.pathname + url.search, "GET", undefined, { Accept: "application/json" });
      if (upstream.json && typeof upstream.json === "object") {
        writeJson(res, upstream.status, normalizeRunDetailPayload(upstream.json));
        return;
      }
      res.writeHead(upstream.status, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      });
      res.end(upstream.text);
      return;
    } catch (error) {
      writeJson(res, 502, {
        error: "host_proxy_unavailable",
        message: String(error?.cause?.message || error?.message || error)
      });
      return;
    }
  }

  try {
    const upstream = await requestHost(url.pathname + url.search, req.method, rawBody, buildForwardHeaders(req));
    writeForwardResponse(res, upstream);
  } catch (error) {
    writeJson(res, 502, {
      error: "host_proxy_unavailable",
      message: String(error?.cause?.message || error?.message || error)
    });
  }
}

function forwardBindToHostViaPowerShell(bodyText) {
  const script = [
    "$uri=$env:LITECODEX_FORWARD_BIND_URL",
    "$body=$env:LITECODEX_FORWARD_BIND_BODY",
    "$headers=@{'Content-Type'='application/json'}",
    "$result=$null",
    "try{",
    "  $resp=Invoke-WebRequest -UseBasicParsing -Method POST -Uri $uri -Headers $headers -Body $body -TimeoutSec 30",
    "  $result=@{status=[int]$resp.StatusCode;body=[string]$resp.Content}",
    "}catch{",
    "  if($_.Exception.Response){",
    "    $stream=$_.Exception.Response.GetResponseStream()",
    "    $reader=New-Object System.IO.StreamReader($stream)",
    "    $txt=$reader.ReadToEnd()",
    "    $result=@{status=[int]$_.Exception.Response.StatusCode;body=[string]$txt}",
    "  } else {",
    "    $result=@{status=0;error=[string]$_.Exception.Message}",
    "  }",
    "}",
    "$result|ConvertTo-Json -Compress"
  ].join(";");
  const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 35000,
    env: {
      ...process.env,
      LITECODEX_FORWARD_BIND_URL: `${HOST_API_ORIGIN}/entry/byo/openai/bind`,
      LITECODEX_FORWARD_BIND_BODY: bodyText
    }
  });
  if (!result || result.error) return null;
  const parsed = safeParseJson(String(result.stdout || "").trim());
  if (!parsed || typeof parsed !== "object") return null;
  return {
    status: Number(parsed.status || 0),
    bodyText: String(parsed.body || "")
  };
}

function serveStaticFile(req, res, pathname) {
  if (!staticRoot) {
    return false;
  }
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const normalized = path.normalize(relative).replace(/^(\.\.(\/|\\|$))+/, "");
  const abs = path.resolve(path.join(staticRoot, normalized));
  if (!abs.startsWith(staticRoot)) {
    writeJson(res, 403, { error: "forbidden" });
    return true;
  }
  if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
    return false;
  }
  const ext = path.extname(abs).toLowerCase();
  const mime = mimeByExt[ext] || "application/octet-stream";
  res.writeHead(200, {
    "content-type": mime,
    "cache-control": "no-store"
  });
  fs.createReadStream(abs).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${LISTEN}`);
  refreshHealth();

  if (req.method === "GET" && url.pathname === "/health") {
    writeJson(res, 200, {
      ok: true,
      service: state.service,
      listen: state.listen
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    writeJson(res, 200, {
      ...state,
      status: state.degraded ? "degraded" : "online",
      frontend_root: staticRoot,
      host_api_origin: HOST_API_ORIGIN
    });
    return;
  }

  if (isProxyPath(url.pathname)) {
    await proxyToHost(req, res, url);
    return;
  }

  if (serveStaticFile(req, res, url.pathname)) {
    return;
  }

  if (req.method === "GET" && SPA_FALLBACK_PATHS.has(url.pathname)) {
    if (serveStaticFile(req, res, "/")) {
      return;
    }
    writeJson(res, 503, frontendMissingPayload(url.pathname));
    return;
  }

  writeJson(res, 404, {
    error: "not_found",
    service: state.service,
    path: url.pathname
  });
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
  if (Object.hasOwn(message.state, "status")) state.status = message.state.status;
  if (Object.hasOwn(message.state, "security")) state.security = message.state.security;
  state.serverPid = process.pid;
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
process.on("uncaughtException", (error) => {
  sendMessage({ type: "fatal", code: "UNCAUGHT_EXCEPTION", message: String(error?.stack || error?.message || error) });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  sendMessage({ type: "fatal", code: "UNHANDLED_REJECTION", message: String(reason?.stack || reason?.message || reason) });
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  refreshHealth();
  sendMessage({ type: "ready", at: nowIso(), serverPid: process.pid });
});

setInterval(() => {
  refreshHealth();
}, 15000).unref();
