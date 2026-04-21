import http from "node:http";

const SERVICE_NAME = process.env.LITECODEX_ENTRY_SERVICE || "litecodex-entry";
const HOST = process.env.LITECODEX_ENTRY_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.LITECODEX_ENTRY_PORT || "43985", 10);
const LISTEN = process.env.LITECODEX_ENTRY_LISTEN || `${HOST}:${PORT}`;
const MODE = process.env.LITECODEX_ENTRY_MODE || "community_edition";

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
        <dt>edition</dt><dd>${escapeHtml(state.edition || "community")}</dd>
        <dt>status</dt><dd><span class="pill">${escapeHtml(statusLabel)}</span></dd>
        <dt>mode</dt><dd>${escapeHtml(state.mode)}</dd>
        <dt>startedAt</dt><dd>${escapeHtml(state.startedAt)}</dd>
        <dt>restartCount</dt><dd>${escapeHtml(state.restartCount)}</dd>
        <dt>lastHealthCheck</dt><dd>${escapeHtml(state.lastHealthCheck)}</dd>
        <dt>entitlement</dt><dd>${escapeHtml(entitlementStatus)}</dd>
        <dt>updatePolicy</dt><dd>${escapeHtml(updatesStatus)}</dd>
        <dt>officialCapabilities</dt><dd>${escapeHtml(officialEnabled)}</dd>
      </dl>
      <p class="hint">This entry serves Community Edition only. Private control plane functions are intentionally not exposed here.</p>
    </div>
  </div>
</body>
</html>`;
}

function writeJson(res, statusCode, payload) {
  const body = `${JSON.stringify(payload, null, 2)}\n`;
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${LISTEN}`);
  if (req.method === "GET" && url.pathname === "/health") {
    refreshHealth();
    writeJson(res, 200, {
      ok: true,
      service: state.service,
      listen: state.listen
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    refreshHealth();
    writeJson(res, 200, {
      ...state,
      status: state.degraded ? "degraded" : "online"
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    refreshHealth();
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
  server.close(() => {
    process.exit(0);
  });
  setTimeout(() => {
    process.exit(0);
  }, 2000);
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
