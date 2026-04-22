
const ROUTES = new Set(["/", "/settings", "/sessions"]);
const API = {
  status: "/status",
  preflight: "/entry/preflight",
  contracts: "/entry/contracts",
  workspaces: "/entry/workspaces",
  workspaceSelect: "/entry/workspaces/select",
  sessions: "/entry/sessions",
  continueLast: "/entry/sessions/continue-last",
  accessStatus: "/entry/access/status",
  accessGrant: "/entry/access/grant",
  accessRecheck: "/entry/access/recheck",
  byoStatus: "/entry/byo/openai/status",
  byoBind: "/entry/byo/openai/bind",
  byoClear: "/entry/byo/openai/clear",
  execute: "/entry/task/execute",
  events: "/events"
};

const state = {
  route: ROUTES.has(location.pathname) ? location.pathname : "/",
  status: null,
  contracts: null,
  preflight: null,
  access: null,
  byo: null,
  workspaces: [],
  selectedWorkspace: null,
  sessions: [],
  activeSessionId: null,
  draftSession: false,
  search: "",
  composer: "",
  attachments: [],
  sending: false,
  paused: false,
  lastTask: null,
  currentRunStatus: "idle",
  reviewOpen: false,
  reviewTab: "changes",
  review: { changes: [], verify: [], deploy: [], logs: [] },
  threads: {},
  modal: null,
  banners: [],
  sse: null,
  titles: loadTitles()
};

function loadTitles() {
  try {
    const payload = JSON.parse(localStorage.getItem("litecodex_session_titles") || "{}");
    return payload && typeof payload === "object" ? payload : {};
  } catch {
    return {};
  }
}
function saveTitles() {
  localStorage.setItem("litecodex_session_titles", JSON.stringify(state.titles));
}
function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function fmtTime(value) {
  if (!value) return "-";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleString();
}
function chip(level, text) {
  return `<span class="chip ${level}">${esc(text)}</span>`;
}
async function request(path, options = {}) {
  const res = await fetch(path, { cache: "no-store", ...options });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { ok: res.ok, status: res.status, json, text };
}
function thread(sessionId) {
  if (!sessionId) return [];
  if (!state.threads[sessionId]) state.threads[sessionId] = [];
  return state.threads[sessionId];
}
function addCard(sessionId, type, title, content) {
  thread(sessionId).push({ id: `c_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`, type, title, content, at: new Date().toISOString() });
}
function addReview(tab, line) {
  const list = state.review[tab] || [];
  list.unshift(`${new Date().toLocaleTimeString()}  ${line}`);
  if (list.length > 40) list.splice(40);
  state.review[tab] = list;
}
function activeSession() {
  return state.sessions.find((x) => x.id === state.activeSessionId) || null;
}
function sessionTitle(session, index) {
  return state.titles[session.id] || `Session ${index + 1}`;
}
function topBarHtml() {
  const host = state.preflight?.host_connected === true;
  const access = state.preflight?.full_access_granted === true;
  const byo = state.preflight?.openai_byo_bound === true;
  const cap = state.preflight?.provider_access?.authorized ? "enhanced" : "community";
  const workspace = state.selectedWorkspace?.name || state.preflight?.selected_workspace?.name || "none";
  const sess = state.activeSessionId ? (state.titles[state.activeSessionId] || "active") : (state.draftSession ? "draft" : "none");
  const nav = (route, label) => `<a href="${route}" data-nav="${route}" class="${state.route === route ? "active" : ""}">${label}</a>`;
  return `
    <header class="topbar"><div class="topbar-inner"><div>
      <div class="brand">lite-codex</div>
      <div class="status-row">
        ${chip(workspace === "none" ? "warn" : "ok", `Workspace: ${workspace}`)}
        ${chip(host ? "ok" : "err", `Host: ${host ? "connected" : "unavailable"}`)}
        ${chip(access ? "ok" : "warn", `Full Access: ${access ? "granted" : "not granted"}`)}
        ${chip(byo ? "ok" : "warn", `OpenAI BYO: ${byo ? "bound" : "unbound"}`)}
        ${chip(cap === "enhanced" ? "ok" : "warn", `Capability: ${cap}`)}
        ${chip(state.currentRunStatus === "failed" ? "err" : "ok", `Session/Run: ${sess} / ${state.currentRunStatus}`)}
      </div>
    </div><nav class="top-nav">${nav("/", "Home")}${nav("/settings", "Settings")}${nav("/sessions", "Sessions")}</nav></div></header>`;
}
function bannersHtml() {
  return state.banners.map((b) => `<div class="banner ${b.level}">${esc(b.text)}</div>`).join("");
}
function shellHtml() {
  const options = state.workspaces.map((w) => `<option value="${esc(w.id)}"${state.selectedWorkspace?.id === w.id ? " selected" : ""}>${esc(w.name)}</option>`).join("");
  return `
  <section class="entry-grid">
    <article class="block"><h3>Workspace</h3><p>Current workspace, select existing, create and switch.</p>
      <div class="field-row"><select id="workspaceSelectInput"><option value="">Select workspace</option>${options}</select><button class="btn" id="workspaceSwitchBtn">Switch</button></div>
      <div class="field-row"><input id="workspaceCreateInput" type="text" placeholder="new workspace name" /><button class="btn primary" id="workspaceCreateBtn">Create</button></div>
    </article>
    <article class="block"><h3>Full Access</h3><p>Grant and recheck access status.</p>
      <div class="field-row">${chip(state.preflight?.full_access_granted ? "ok" : "warn", state.preflight?.full_access_granted ? "Granted" : "Not Granted")}
      <button class="btn primary" id="grantAccessBtn">Grant</button><button class="btn" id="recheckAccessBtn">Recheck</button></div>
    </article>
    <article class="block"><h3>OpenAI BYO</h3><p>This key is local to this machine/browser, not shared across devices, backend does not persist plaintext key.</p>
      <div class="field-row">${chip(state.byo?.bound ? "ok" : "warn", state.byo?.bound ? "Bound" : "Unbound")}</div>
      <div class="field-row"><input id="byoKeyInput" type="password" placeholder="sk-..." /><button class="btn primary" id="bindByoBtn">Bind</button><button class="btn danger" id="clearByoBtn">Clear</button></div>
    </article>
    <article class="block"><h3>Session</h3><p>New Session or Continue Last Session.</p>
      <div class="field-row"><button class="btn primary" id="newSessionBtn">New Session</button><button class="btn" id="continueSessionBtn">Continue Last Session</button></div>
    </article>
  </section>`;
}
function sessionRows() {
  const keyword = state.search.trim().toLowerCase();
  return state.sessions
    .map((s, i) => ({ ...s, _title: sessionTitle(s, i) }))
    .filter((s) => (keyword ? s._title.toLowerCase().includes(keyword) : true));
}
function sessionListHtml() {
  return sessionRows().map((s) => `
    <div class="session-item ${s.id === state.activeSessionId ? "active" : ""}" data-open-session="${esc(s.id)}">
      <div class="session-title">${esc(s._title)}</div>
      <div class="session-meta">${esc(s.workspace_id ? `workspace ${s.workspace_id.slice(-5)}` : "no workspace")} · ${esc(fmtTime(s.updated_at))}</div>
    </div>
  `).join("");
}
function cardClass(type) {
  return `card ${String(type || "").toLowerCase().replaceAll(" ", "-")}`;
}
function threadHtml() {
  if (!state.activeSessionId) {
    if (!state.draftSession) return `<div class="card"><h4>Session Required</h4><p>Create a new session or continue last session to enter the workbench.</p></div>`;
    return `<div class="card"><h4>Draft Session</h4><p>Draft is ready. The first send creates a real session.</p></div>`;
  }
  const rows = thread(state.activeSessionId);
  if (!rows.length) return `<div class="card"><h4>Thread Ready</h4><p>Send your first message to start execution flow.</p></div>`;
  return rows.map((row) => `
    <article class="${cardClass(row.type)}">
      <h4>${esc(row.type)} · ${esc(row.title)}</h4>
      <p>${esc(row.content)}</p>
      <small>${esc(fmtTime(row.at))}</small>
    </article>
  `).join("");
}
function attachmentTrayHtml() {
  if (!state.attachments.length) return "";
  return `<div class="attachment-tray">${state.attachments.map((a, i) => `
      <span class="attachment-pill">${a.preview ? `<img src="${a.preview}" alt="attachment" />` : "file"}
        <span>${esc(a.fileName)}</span><button class="btn" data-remove-attachment="${i}">Delete</button></span>`).join("")}</div>`;
}
function reviewBodyHtml() {
  const list = state.review[state.reviewTab] || [];
  if (!list.length) return "No records yet.";
  return list.map((line) => `- ${line}`).join("\n");
}
function workbenchHtml() {
  return `
  <section class="workbench">
    <aside class="session-col">
      <button class="btn primary" id="leftNewSessionBtn">New Session</button>
      <button class="btn" id="leftContinueBtn">Continue Last Session</button>
      <input id="sessionSearchInput" type="text" value="${esc(state.search)}" placeholder="Search sessions" />
      <div class="session-list">${sessionListHtml()}</div>
    </aside>
    <section class="thread-col">
      <div class="thread-list">${threadHtml()}</div>
      <div class="composer" id="composerDropzone">
        ${attachmentTrayHtml()}
        <div class="field-row"><textarea id="composerInput" rows="3" placeholder="Send a task to Lite Codex...">${esc(state.composer)}</textarea></div>
        <div class="composer-actions">
          <div class="field-row"><input id="fileInput" type="file" multiple /><button class="btn" id="pasteImageBtn">Paste Image</button><button class="btn" id="screenshotBtn">Screenshot</button></div>
          <div class="field-row"><button class="btn primary" id="sendBtn"${state.sending ? " disabled" : ""}>Send</button>${state.sending ? `<button class="btn danger" id="stopBtn">Stop</button>` : ""}${state.paused ? `<button class="btn" id="resumeBtn">Resume</button>` : ""}<button class="btn" id="toggleReviewBtn">${state.reviewOpen ? "Hide Review" : "Show Review"}</button></div>
        </div>
        <div class="hint">Enter to send, Shift+Enter for newline. Drag-and-drop files is supported.</div>
      </div>
    </section>
    <aside class="review-col ${state.reviewOpen ? "open" : ""}">
      <div class="review-head"><strong>Review</strong><button class="btn" id="closeReviewBtn">Close</button></div>
      <div class="tabs"><button class="tab ${state.reviewTab === "changes" ? "active" : ""}" data-tab="changes">Changes</button><button class="tab ${state.reviewTab === "verify" ? "active" : ""}" data-tab="verify">Verify</button><button class="tab ${state.reviewTab === "deploy" ? "active" : ""}" data-tab="deploy">Deploy</button><button class="tab ${state.reviewTab === "logs" ? "active" : ""}" data-tab="logs">Logs</button></div>
      <div class="review-body">${esc(reviewBodyHtml())}</div>
    </aside>
  </section>`;
}
function settingsHtml() {
  return `<section class="route-card"><h3>Settings</h3><p class="hint">Minimal local settings for host, access and OpenAI BYO.</p>
    <div class="field-row">${chip(state.preflight?.host_connected ? "ok" : "err", `Host ${state.preflight?.host_connected ? "connected" : "unavailable"}`)}${chip(state.preflight?.full_access_granted ? "ok" : "warn", `Full Access ${state.preflight?.full_access_granted ? "granted" : "not granted"}`)}${chip(state.byo?.bound ? "ok" : "warn", `OpenAI BYO ${state.byo?.bound ? "bound" : "unbound"}`)}</div></section>${shellHtml()}`;
}
function sessionsHtml() {
  return `<section class="route-card"><h3>Sessions</h3><p class="hint">Manage and continue sessions. Draft session is not listed until first message is sent.</p>
    <div class="field-row"><button class="btn primary" id="newSessionBtn">New Session</button><button class="btn" id="continueSessionBtn">Continue Last Session</button><input id="sessionSearchInput" type="text" value="${esc(state.search)}" placeholder="Search sessions" /></div>
    <div class="session-list" style="margin-top:10px">${sessionListHtml()}</div></section>`;
}
function modalHtml() {
  if (!state.modal) return "";
  return `<div class="modal-mask" id="modalMask"><div class="modal"><h3>${esc(state.modal.title)}</h3><p>${esc(state.modal.message)}</p><div class="field-row"><button class="btn primary" id="modalCloseBtn">Close</button></div></div></div>`;
}
function render() {
  const app = document.getElementById("app");
  const page = state.route === "/settings" ? settingsHtml() : (state.route === "/sessions" ? sessionsHtml() : `${shellHtml()}${(state.activeSessionId || state.draftSession) ? workbenchHtml() : ""}`);
  app.innerHTML = `${topBarHtml()}<main class="shell-wrap">${bannersHtml()}${page}</main>${modalHtml()}`;
  bindHandlers(app);
}
async function refreshBundle() {
  const [status, contracts, preflight, access, byo, ws, sessions] = await Promise.allSettled([
    request(API.status), request(API.contracts), request(API.preflight), request(API.accessStatus), request(API.byoStatus), request(API.workspaces), request(API.sessions)
  ]);
  if (status.status === "fulfilled") state.status = status.value.json;
  if (contracts.status === "fulfilled") state.contracts = contracts.value.json;
  if (preflight.status === "fulfilled") state.preflight = preflight.value.json;
  if (access.status === "fulfilled") state.access = access.value.json;
  if (byo.status === "fulfilled") state.byo = byo.value.json;
  if (ws.status === "fulfilled") {
    state.workspaces = Array.isArray(ws.value.json?.workspaces) ? ws.value.json.workspaces : [];
    state.selectedWorkspace = ws.value.json?.current_workspace || state.preflight?.selected_workspace || null;
  }
  if (sessions.status === "fulfilled") {
    state.sessions = Array.isArray(sessions.value.json?.sessions) ? sessions.value.json.sessions : [];
  }
  if (!state.activeSessionId && state.preflight?.last_session?.id) state.activeSessionId = state.preflight.last_session.id;
  if (state.activeSessionId && !state.sessions.find((x) => x.id === state.activeSessionId)) state.activeSessionId = null;
  const banners = [];
  if (state.status?.degraded || state.status?.status === "degraded") banners.push({ level: "err", text: `Verifier fail-closed/degraded: ${state.status?.security?.entitlement?.reason || state.status?.security?.updates?.reason || "unknown"}` });
  if (state.preflight?.host_connected === false) banners.push({ level: "err", text: "Host unavailable. Workbench actions are disabled until host reconnects." });
  if (state.preflight && !state.preflight.selected_workspace) banners.push({ level: "warn", text: "No workspace selected yet. Select or create one before sending tasks." });
  state.banners = banners;
}
async function createWorkspace(name) {
  const res = await request(API.workspaces, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
  if (!res.ok) throw new Error(res.json?.error || "workspace_create_failed");
}
async function switchWorkspace(workspaceId) {
  const res = await request(API.workspaceSelect, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: workspaceId }) });
  if (!res.ok) throw new Error(res.json?.error || "workspace_select_failed");
}
async function ensureSession(prompt) {
  if (state.activeSessionId) return state.activeSessionId;
  const res = await request(API.sessions, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: state.selectedWorkspace?.id || null }) });
  if (!res.ok || !res.json?.session?.id) throw new Error("session_create_failed");
  const session = res.json.session;
  state.sessions.unshift(session);
  state.activeSessionId = session.id;
  state.draftSession = false;
  if (!state.titles[session.id]) {
    state.titles[session.id] = prompt.slice(0, 44) || `Session ${state.sessions.length}`;
    saveTitles();
  }
  return session.id;
}
async function ingestAttachment(sessionId, item) {
  const endpoint = `/entry/sessions/${encodeURIComponent(sessionId)}/attachments/${item.sourceType}`;
  const res = await request(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ file_name: item.fileName, mime_type: item.mimeType, content_base64: item.base64 }) });
  if (!res.ok) throw new Error(res.json?.error || "attachment_ingest_failed");
  addCard(sessionId, "Attachment Added", "Attachment Added", `${item.fileName} uploaded.`);
  addReview("changes", `Attachment added: ${item.fileName}`);
}
function intentOf(prompt) {
  return /\b(deploy|release|ship|publish)\b/i.test(prompt) ? "deploy" : "general";
}
async function executeTask(sessionId, prompt) {
  const res = await request(API.execute, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, prompt, intent: intentOf(prompt) })
  });
  if (!res.ok) {
    const err = new Error(res.json?.error || "execution_failed");
    err.status = res.status;
    err.payload = res.json || {};
    throw err;
  }
  const payload = res.json || {};
  state.currentRunStatus = payload.mode === "enhanced" ? "completed (enhanced)" : "completed";
  for (const row of (Array.isArray(payload.cards) ? payload.cards : [])) {
    addCard(sessionId, row.type || "Execution Step", row.title || "Execution", row.content || "done");
    if (row.type === "Verify Result") addReview("verify", row.content || "verify done");
    if (row.type === "Deploy Result") addReview("deploy", row.content || "deploy done");
  }
}
async function refreshPreflight() {
  const res = await request(API.preflight);
  if (res.json) state.preflight = res.json;
}
function showBlockModal(kind) {
  if (kind === "byo") state.modal = { title: "OpenAI BYO required", message: "Bind OpenAI BYO before sending tasks." };
  if (kind === "access") state.modal = { title: "Full Access required", message: "Grant Full Access before sending tasks." };
}
async function send() {
  if (state.sending) return;
  const prompt = state.composer.trim();
  if (!prompt && state.attachments.length === 0) return;
  await refreshPreflight();
  if (!state.preflight?.host_connected) {
    if (state.activeSessionId) addCard(state.activeSessionId, "Error Recovery", "Host Unavailable", "Host disconnected. Retry after host reconnect.");
    render();
    return;
  }
  if (!state.preflight?.selected_workspace) {
    if (state.activeSessionId) addCard(state.activeSessionId, "Error Recovery", "Workspace Missing", "Select or create a workspace before send.");
    render();
    return;
  }
  if (!state.preflight?.openai_byo_bound) {
    showBlockModal("byo");
    render();
    return;
  }
  if (!state.preflight?.full_access_granted) {
    showBlockModal("access");
    render();
    return;
  }
  const sessionId = await ensureSession(prompt);
  addCard(sessionId, "User Message", "User Message", prompt || "(attachment only)");
  for (const item of state.attachments) {
    await ingestAttachment(sessionId, item);
  }
  state.attachments = [];
  addCard(sessionId, "Agent Plan", "Plan", "1) Assemble context 2) Execute task 3) Return verify/deploy/final answer cards.");
  state.sending = true;
  state.paused = false;
  state.lastTask = { sessionId, prompt };
  render();
  try {
    await executeTask(sessionId, prompt);
  } catch (error) {
    if (error.status === 403 && error.payload?.code === "COMMUNITY_EDITION_RESTRICTED") {
      addCard(sessionId, "Auth Required", "Restricted Capability", "This capability requires authorized private provider. Current session remains CE mode.");
      addCard(sessionId, "Error Recovery", "Fallback Applied", "Use community-compatible task or continue after authorized provider is available.");
      state.currentRunStatus = "restricted";
    } else {
      addCard(sessionId, "Error Recovery", "Execution Failed", String(error.message || "execution_failed"));
      state.currentRunStatus = "failed";
    }
  } finally {
    state.sending = false;
    state.composer = "";
    await refreshBundle();
    render();
  }
}
function stopRun() {
  if (!state.sending || !state.activeSessionId) return;
  state.sending = false;
  state.paused = true;
  addCard(state.activeSessionId, "Error Recovery", "Execution Stopped", "Execution paused by user.");
  state.currentRunStatus = "paused";
  render();
}
async function resumeRun() {
  if (!state.paused || !state.lastTask) return;
  const { sessionId, prompt } = state.lastTask;
  state.paused = false;
  state.sending = true;
  addCard(sessionId, "Execution Step", "Resume", "Resuming previous execution.");
  render();
  try {
    await executeTask(sessionId, prompt);
  } catch (error) {
    addCard(sessionId, "Error Recovery", "Resume Failed", String(error.message || "resume_failed"));
  } finally {
    state.sending = false;
    await refreshBundle();
    render();
  }
}
async function addFile(file, sourceType = "upload") {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);
  state.attachments.push({
    fileName: file.name || `${sourceType}.bin`,
    mimeType: file.type || "application/octet-stream",
    base64,
    sourceType,
    preview: file.type.startsWith("image/") ? `data:${file.type};base64,${base64}` : null
  });
}
async function captureImage(sourceType) {
  if (!navigator.clipboard || typeof navigator.clipboard.read !== "function") throw new Error("clipboard_api_unavailable");
  const items = await navigator.clipboard.read();
  for (const item of items) {
    for (const type of item.types) {
      if (!type.startsWith("image/")) continue;
      const blob = await item.getType(type);
      const file = new File([blob], `${sourceType}-${Date.now()}.png`, { type });
      await addFile(file, sourceType);
      return true;
    }
  }
  return false;
}
function bindHandlers(root) {
  root.querySelectorAll("[data-nav]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      const route = node.getAttribute("data-nav") || "/";
      state.route = ROUTES.has(route) ? route : "/";
      history.pushState({}, "", state.route);
      render();
    });
  });

  const createBtn = root.querySelector("#workspaceCreateBtn");
  if (createBtn) createBtn.addEventListener("click", async () => {
    const input = root.querySelector("#workspaceCreateInput");
    const name = input?.value?.trim();
    if (!name) return;
    await createWorkspace(name);
    if (input) input.value = "";
    await refreshBundle();
    render();
  });

  const switchBtn = root.querySelector("#workspaceSwitchBtn");
  if (switchBtn) switchBtn.addEventListener("click", async () => {
    const select = root.querySelector("#workspaceSelectInput");
    const workspaceId = select?.value || "";
    if (!workspaceId) return;
    await switchWorkspace(workspaceId);
    await refreshBundle();
    render();
  });

  root.querySelectorAll("#grantAccessBtn").forEach((node) => node.addEventListener("click", async () => {
    await request(API.accessGrant, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await refreshBundle();
    render();
  }));

  root.querySelectorAll("#recheckAccessBtn").forEach((node) => node.addEventListener("click", async () => {
    await request(API.accessRecheck, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await refreshBundle();
    render();
  }));

  root.querySelectorAll("#bindByoBtn").forEach((node) => node.addEventListener("click", async () => {
    const input = root.querySelector("#byoKeyInput");
    const apiKey = input?.value?.trim();
    if (!apiKey) return;
    await request(API.byoBind, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ api_key: apiKey }) });
    if (input) input.value = "";
    await refreshBundle();
    render();
  }));

  root.querySelectorAll("#clearByoBtn").forEach((node) => node.addEventListener("click", async () => {
    await request(API.byoClear, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    await refreshBundle();
    render();
  }));

  root.querySelectorAll("#newSessionBtn,#leftNewSessionBtn").forEach((node) => node.addEventListener("click", () => {
    state.draftSession = true;
    state.activeSessionId = null;
    state.currentRunStatus = "draft";
    render();
  }));

  root.querySelectorAll("#continueSessionBtn,#leftContinueBtn").forEach((node) => node.addEventListener("click", async () => {
    const res = await request(API.continueLast, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (res.ok && res.json?.session?.id) {
      state.activeSessionId = res.json.session.id;
      state.draftSession = false;
      if (!state.threads[state.activeSessionId]) addCard(state.activeSessionId, "Execution Step", "Session Loaded", "Session restored and ready.");
    }
    await refreshBundle();
    render();
  }));

  root.querySelectorAll("[data-open-session]").forEach((node) => node.addEventListener("click", () => {
    const id = node.getAttribute("data-open-session");
    if (!id) return;
    state.activeSessionId = id;
    state.draftSession = false;
    state.route = "/";
    history.pushState({}, "", "/");
    if (!state.threads[id]) addCard(id, "Execution Step", "Session Loaded", "Session restored and ready.");
    render();
  }));

  const searchInput = root.querySelector("#sessionSearchInput");
  if (searchInput) searchInput.addEventListener("input", (event) => { state.search = event.target.value || ""; render(); });

  const composerInput = root.querySelector("#composerInput");
  if (composerInput) {
    composerInput.addEventListener("input", (event) => { state.composer = event.target.value || ""; });
    composerInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        send();
      }
    });
    composerInput.addEventListener("paste", async (event) => {
      const items = event.clipboardData?.items || [];
      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file) await addFile(file, "paste");
      }
      render();
    });
  }

  const fileInput = root.querySelector("#fileInput");
  if (fileInput) fileInput.addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    for (const file of files) await addFile(file, "upload");
    fileInput.value = "";
    render();
  });

  const dropzone = root.querySelector("#composerDropzone");
  if (dropzone) {
    dropzone.addEventListener("dragover", (event) => event.preventDefault());
    dropzone.addEventListener("drop", async (event) => {
      event.preventDefault();
      for (const file of Array.from(event.dataTransfer?.files || [])) await addFile(file, "upload");
      render();
    });
  }

  const pasteBtn = root.querySelector("#pasteImageBtn");
  if (pasteBtn) pasteBtn.addEventListener("click", async () => {
    try {
      const ok = await captureImage("paste");
      if (!ok) state.modal = { title: "Paste Image", message: "Clipboard has no image data." };
    } catch {
      state.modal = { title: "Paste Image", message: "Clipboard image read is not available in this browser." };
    }
    render();
  });

  const shotBtn = root.querySelector("#screenshotBtn");
  if (shotBtn) shotBtn.addEventListener("click", async () => {
    try {
      const ok = await captureImage("screenshot");
      if (!ok) state.modal = { title: "Screenshot", message: "No screenshot image found in clipboard." };
    } catch {
      state.modal = { title: "Screenshot", message: "Clipboard screenshot read is not available in this browser." };
    }
    render();
  });

  root.querySelectorAll("[data-remove-attachment]").forEach((node) => node.addEventListener("click", () => {
    const index = Number.parseInt(node.getAttribute("data-remove-attachment") || "-1", 10);
    if (!Number.isFinite(index) || index < 0) return;
    state.attachments.splice(index, 1);
    render();
  }));

  const sendBtn = root.querySelector("#sendBtn");
  if (sendBtn) sendBtn.addEventListener("click", () => send());
  const stopBtn = root.querySelector("#stopBtn");
  if (stopBtn) stopBtn.addEventListener("click", () => stopRun());
  const resumeBtn = root.querySelector("#resumeBtn");
  if (resumeBtn) resumeBtn.addEventListener("click", () => resumeRun());

  root.querySelectorAll("#toggleReviewBtn").forEach((node) => node.addEventListener("click", () => { state.reviewOpen = !state.reviewOpen; render(); }));
  const closeReviewBtn = root.querySelector("#closeReviewBtn");
  if (closeReviewBtn) closeReviewBtn.addEventListener("click", () => { state.reviewOpen = false; render(); });
  root.querySelectorAll("[data-tab]").forEach((node) => node.addEventListener("click", () => { state.reviewTab = node.getAttribute("data-tab"); render(); }));

  const modalCloseBtn = root.querySelector("#modalCloseBtn");
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", () => { state.modal = null; render(); });
}

function connectEvents() {
  if (state.sse) state.sse.close();
  const source = new EventSource(API.events);
  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data);
      const type = String(payload.type || "event");
      let text = type;
      if (type === "run.created") text = "Run created";
      if (type === "compact.completed") text = "Verify completed";
      if (type === "attachment.ingested") text = "Attachment ingested";
      if (type === "workflow.private.started") text = "Enhanced workflow started";
      if (type === "workflow.private.completed") text = "Enhanced workflow completed";
      addReview("logs", text);
      if (state.reviewTab === "logs") render();
    } catch {
      // ignore malformed events
    }
  };
  source.onerror = () => addReview("logs", "Event stream disconnected");
  state.sse = source;
}

async function init() {
  await refreshBundle();
  connectEvents();
  render();
  setInterval(async () => {
    await refreshBundle();
    render();
  }, 8000);
}

window.addEventListener("popstate", () => {
  state.route = ROUTES.has(location.pathname) ? location.pathname : "/";
  render();
});

init().catch((error) => {
  document.getElementById("app").innerHTML = `<main class="shell-wrap"><div class="banner err">${esc(String(error?.message || error))}</div></main>`;
});
