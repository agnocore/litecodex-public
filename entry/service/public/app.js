import { classifyLaneDetailed, normalizePrompt } from "./lane.js";
import {
  DISPLAY_EVENT_CONTRACT,
  DISPLAY_EVENT_TYPES,
  getDisplayEventMeta,
  isMainThreadDisplayEvent,
  isProvisionalAssistantReply,
  isDisplayEventTypeAllowed,
  normalizeBackendDisplayEvent,
  sanitizeDisplayBody
} from "./projection.js";

const appEl = document.getElementById("app");
const modalRoot = document.getElementById("modal-root");
const uploadInput = document.getElementById("hiddenUploadInput");
const screenshotInput = document.getElementById("hiddenScreenshotInput");

const PLACEHOLDER_API_KEY = "sk-proj-test-not-real-12345678901234567890";
const ENTRY_FRONTEND_SOURCE = "entry/service/public";
const SEND_GATE_ORDER = ["workspace", "access", "byo", "session"];

const FORCE_TASK_PATTERNS = [
  /(修复|修正|改(代码|脚本|配置)|实现|开发|写(一个|个)?(脚本|函数|模块)|重构|排查|调试|部署|发布|上线|验证|跑(测试|构建)|执行|命令行|终端|提交补丁|修 bug|fix|refactor|debug|investigate|implement|write code|patch|commit|test)/i,
  /(^|\s)(npm|pnpm|yarn|node|python|go|cargo|gradle|xcodebuild|git|docker|kubectl)\b/i,
  /```[\s\S]*```/,
  /\.(js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|kt|swift|css|scss|html|json|yaml|yml|sql)\b/i
];

const EXECUTION_SIGNAL_PATTERN =
  /(执行|运行|命令|终端|修复|修正|改代码|写代码|验证|部署|发布|上线|测试|构建|debug|fix|implement|refactor|patch|run|test|build|deploy|verify)/i;

const SOCIAL_PROMPT_PATTERNS = [
  /^(你好|您好|嗨|哈喽|嘿|在吗|早上好|中午好|下午好|晚上好|晚安|谢谢|再见|拜拜)[!！,.，。?？ ]*$/i,
  /^(hi|hello|hey|good\s*(morning|afternoon|evening|night)|thanks?|thank\s*you|bye|goodbye)[!！,.，。?？ ]*$/i
];

const EXECUTION_INTENT_SET = new Set([
  "troubleshoot",
  "implement",
  "generate",
  "modify",
  "refactor",
  "configure",
  "verify",
  "deploy",
  "migrate",
  "media_edit",
  "document_transform"
]);

const KEY_THREADS = "entry_threads_v3";
const KEY_DELETED = "entry_deleted_sessions_v3";
const KEY_CLASSIFICATIONS = "entry_classifications_v1";
const DRAFT_SESSION_PREFIX = "draft_";

const LEGACY_CARD_TYPE_TO_DISPLAY = Object.freeze({
  "User Message": DISPLAY_EVENT_TYPES.USER_MESSAGE,
  "Agent Plan": DISPLAY_EVENT_TYPES.TASK_PROGRESS,
  "Execution Step": DISPLAY_EVENT_TYPES.TASK_PROGRESS,
  "Auth Required": DISPLAY_EVENT_TYPES.AUTH_REQUIRED,
  "Attachment Added": DISPLAY_EVENT_TYPES.ATTACHMENT_ADDED,
  "Verify Result": DISPLAY_EVENT_TYPES.VERIFY_SUMMARY,
  "Deploy Result": DISPLAY_EVENT_TYPES.DEPLOY_SUMMARY,
  "Final Answer": DISPLAY_EVENT_TYPES.ASSISTANT_REPLY,
  "Error Recovery": DISPLAY_EVENT_TYPES.RECOVERY_SUMMARY
});

const state = {
  route: location.pathname === "/settings" ? "/settings" : location.pathname === "/sessions" ? "/sessions" : "/",
  loading: true,
  preflight: null,
  workspaces: [],
  sessions: [],
  currentSessionId: null,
  draftSession: null,
  deleted: loadDeleted(),
  threads: loadThreads(),
  classifications: loadClassifications(),
  currentClassification: null,
  runEventCursor: {},
  runtimeRuns: {},
  runtimeStream: {
    runId: null,
    sessionId: null,
    source: null,
    retryTimer: null,
    startedAtMs: null,
    firstRuntimeEventMs: null,
    firstRuntimeEventAt: null
  },
  runtimeStreamRenderQueued: false,
  sessionRunIds: {},
  runtimeCardCollapse: {},
  sidebarSearch: "",
  pageSearch: "",
  composer: "",
  composerCaret: null,
  composerComposing: false,
  composerTokens: [],
  composerSuggest: {
    open: false,
    kind: null,
    query: "",
    items: [],
    selected: 0,
    triggerStart: null,
    triggerEnd: null,
    loading: false
  },
  attachments: [],
  imagePreview: null,
  reviewOpen: false,
  panelsOpen: false,
  reviewTab: "changes",
  openFolderRelPath: "",
  modal: null,
  pendingSend: null,
  byo: { ui: "loading", bound: false, validation: "unknown", error: null, key: "" },
  access: { granted: false },
  context: { assembled: false, compacted: false, resumed: false, mode: "raw", hash: null },
  run: { id: null, status: "idle", lane: "idle" },
  busy: false,
  stopRequested: false,
  canResume: false,
  toast: null,
  workspaceForm: {
    label: "",
    sourceMode: "managed_workspace",
    workspacePath: "",
    sourceSummary: "managed under litecodex workspaces root",
    confirmed: true
  },
  autoCompact: true,
  contextSettingsLoading: false,
  contextSettings: null,
  threadAnchor: "bottom",
  threadScrollPinnedByUser: false,
  threadRenderKey: null,
  lastRenderedRoute: null
};

const logs = [];

const TOPBAR_TONE_CLASSES = ["ok", "warn", "bad"];

function normalizeStoredCard(card) {
  if (!card || typeof card !== "object") return null;
  const legacyType = typeof card.type === "string" ? card.type : "";
  const displayType =
    typeof card.displayType === "string" && card.displayType
      ? card.displayType
      : LEGACY_CARD_TYPE_TO_DISPLAY[legacyType] || null;
  if (!displayType || !isDisplayEventTypeAllowed(displayType)) return null;
  const laneRaw = typeof card.lane === "string" ? card.lane.trim().toLowerCase() : "";
  const lane =
    laneRaw ||
    (displayType === DISPLAY_EVENT_TYPES.USER_MESSAGE || displayType === DISPLAY_EVENT_TYPES.ASSISTANT_REPLY ? "chat" : "task");
  if (lane !== "chat") return null;
  const body = sanitizeDisplayBody(card.body);
  if (!body) return null;
  if (displayType === DISPLAY_EVENT_TYPES.ASSISTANT_REPLY && isProvisionalAssistantReply(body)) return null;
  return {
    id: typeof card.id === "string" && card.id.trim() ? card.id.trim() : `c_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    displayType,
    lane,
    body,
    at: typeof card.at === "string" && card.at.trim() ? card.at.trim() : now(),
    eventKey: typeof card.eventKey === "string" && card.eventKey.trim() ? card.eventKey.trim() : null,
    source:
      typeof card.source === "string" && card.source.trim()
        ? card.source.trim()
        : typeof card.type === "string" && card.type.trim()
          ? "legacy_thread"
          : "display"
  };
}

function loadThreads() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_THREADS) || "{}");
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const normalized = {};
    for (const [sessionId, cards] of Object.entries(raw)) {
      if (!Array.isArray(cards)) continue;
      normalized[sessionId] = cards
        .map((card) => normalizeStoredCard(card))
        .filter(Boolean);
    }
    return normalized;
  } catch {
    return {};
  }
}

function saveThreads() {
  localStorage.setItem(KEY_THREADS, JSON.stringify(state.threads));
}

function loadDeleted() {
  try {
    const x = JSON.parse(localStorage.getItem(KEY_DELETED) || "[]");
    return Array.isArray(x) ? x : [];
  } catch {
    return [];
  }
}

function saveDeleted() {
  localStorage.setItem(KEY_DELETED, JSON.stringify(state.deleted));
}

function loadClassifications() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_CLASSIFICATIONS) || "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function saveClassifications() {
  localStorage.setItem(KEY_CLASSIFICATIONS, JSON.stringify(state.classifications));
}

function now() {
  return new Date().toISOString();
}

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function t(v) {
  try {
    return new Date(v).toLocaleString();
  } catch {
    return "-";
  }
}

function safeFocusWithoutScroll(target) {
  if (!target || typeof target.focus !== "function") return;
  try {
    target.focus({ preventScroll: true });
  } catch {
    target.focus();
  }
}

function readWindowScrollTop() {
  return Number(window.scrollY || window.pageYOffset || document.documentElement?.scrollTop || document.body?.scrollTop || 0);
}

function writeWindowScrollTop(top) {
  const next = Math.max(0, Number.isFinite(Number(top)) ? Number(top) : 0);
  try {
    window.scrollTo(0, next);
  } catch {
    // no-op
  }
  if (document.documentElement) {
    document.documentElement.scrollTop = next;
  }
  if (document.body) {
    document.body.scrollTop = next;
  }
}

function captureElementScroll(el) {
  if (!(el instanceof HTMLElement)) return null;
  return {
    top: Number(el.scrollTop || 0),
    left: Number(el.scrollLeft || 0)
  };
}

function restoreElementScroll(el, snapshot) {
  if (!(el instanceof HTMLElement) || !snapshot) return;
  const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
  const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
  const nextTop = Math.max(0, Math.min(maxTop, Number(snapshot.top || 0)));
  const nextLeft = Math.max(0, Math.min(maxLeft, Number(snapshot.left || 0)));
  el.scrollTop = nextTop;
  el.scrollLeft = nextLeft;
}

function captureScrollState() {
  return {
    windowTop: readWindowScrollTop(),
    pageWrap: captureElementScroll(document.querySelector("#app > .page-wrap")),
    homeSidebar: captureElementScroll(appEl.querySelector("#layoutWorkbench .sidebar")),
    homeSessionList: captureElementScroll(appEl.querySelector("#layoutWorkbench .session-list")),
    homeThread: captureElementScroll(appEl.querySelector("#homeThread")),
    homeReview: captureElementScroll(appEl.querySelector(".review-content"))
  };
}

function restoreScrollState(snapshot) {
  if (!snapshot) return;
  const restoreNow = () => {
    writeWindowScrollTop(snapshot.windowTop);
    restoreElementScroll(document.querySelector("#app > .page-wrap"), snapshot.pageWrap);
    restoreElementScroll(appEl.querySelector("#layoutWorkbench .sidebar"), snapshot.homeSidebar);
    restoreElementScroll(appEl.querySelector("#layoutWorkbench .session-list"), snapshot.homeSessionList);
    restoreElementScroll(appEl.querySelector(".review-content"), snapshot.homeReview);
    const shouldRestoreThread = state.route === "/" && (state.threadAnchor !== "bottom" || state.threadScrollPinnedByUser);
    if (shouldRestoreThread) {
      restoreElementScroll(appEl.querySelector("#homeThread"), snapshot.homeThread);
    }
  };
  restoreNow();
  requestAnimationFrame(restoreNow);
}

function toast(msg, level = "warn") {
  state.toast = { msg, level };
  if (!state.loading) {
    render();
  }
  setTimeout(() => {
    if (state.toast?.msg === msg) {
      state.toast = null;
      render();
    }
  }, 2400);
}

function log(title, payload) {
  logs.unshift({ at: now(), title, payload });
  if (logs.length > 80) logs.pop();
}

function parseBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  return fallback;
}

function parseBoundedInt(value, fallback, min = 1, max = 2000000) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function defaultContextSettings() {
  return {
    auto_compact_after_task_lane: true,
    auto_compact_enabled: true,
    event_threshold: 120,
    token_threshold: 12000,
    stdout_stderr_threshold: 12000,
    artifacts_threshold: 24,
    repair_round_threshold: 2,
    last_compact_status: "unknown",
    last_snapshot_id: null,
    last_compact_reason: null,
    last_compacted_at: null
  };
}

function normalizeContextSettings(rawSettings = {}, sessionId = null) {
  const defaults = defaultContextSettings();
  const merged = {
    ...defaults,
    ...(rawSettings && typeof rawSettings === "object" ? rawSettings : {})
  };
  return {
    session_id:
      typeof sessionId === "string" && sessionId.trim()
        ? sessionId.trim()
        : typeof merged.session_id === "string" && merged.session_id.trim()
          ? merged.session_id.trim()
          : null,
    auto_compact_after_task_lane: parseBool(merged.auto_compact_after_task_lane, defaults.auto_compact_after_task_lane),
    auto_compact_enabled: parseBool(merged.auto_compact_enabled, defaults.auto_compact_enabled),
    event_threshold: parseBoundedInt(merged.event_threshold, defaults.event_threshold, 4, 200000),
    token_threshold: parseBoundedInt(merged.token_threshold, defaults.token_threshold, 100, 2000000),
    stdout_stderr_threshold: parseBoundedInt(merged.stdout_stderr_threshold, defaults.stdout_stderr_threshold, 100, 2000000),
    artifacts_threshold: parseBoundedInt(merged.artifacts_threshold, defaults.artifacts_threshold, 1, 200000),
    repair_round_threshold: parseBoundedInt(merged.repair_round_threshold, defaults.repair_round_threshold, 1, 256),
    last_compact_status: String(merged.last_compact_status || "unknown"),
    last_snapshot_id: merged.last_snapshot_id ? String(merged.last_snapshot_id) : null,
    last_compact_reason: merged.last_compact_reason ? String(merged.last_compact_reason) : null,
    last_compacted_at: merged.last_compacted_at ? String(merged.last_compacted_at) : null
  };
}

function hasPersistedCurrentSession() {
  const cs = currentSession();
  if (!cs?.id) return false;
  return !String(cs.id).startsWith(DRAFT_SESSION_PREFIX);
}

function currentSessionIdForContextSettings() {
  const cs = currentSession();
  if (!(cs && typeof cs.id === "string")) return null;
  if (String(cs.id).startsWith(DRAFT_SESSION_PREFIX)) return null;
  return cs.id;
}

function applyContextSettingsState(settings, sessionId = null) {
  const normalized = normalizeContextSettings(settings, sessionId);
  state.contextSettings = normalized;
  state.autoCompact = normalized.auto_compact_after_task_lane && normalized.auto_compact_enabled;
  return normalized;
}

function byoUiLabel(ui) {
  if (ui === "valid") return "Bound and valid";
  if (ui === "invalid") return "Invalid key / validation failed";
  if (ui === "binding") return "Binding";
  if (ui === "validating") return "Validating";
  if (ui === "loading") return "Loading";
  return "Unbound";
}

function applyByoStatus(byo) {
  const bound = !!byo?.bound;
  const validation = String(byo?.validation_status || "unknown");
  state.byo.bound = bound;
  state.byo.validation = validation;
  state.byo.error = byo?.validation_error || null;

  if (!bound) {
    state.byo.ui = "unbound";
    return;
  }
  if (validation === "valid") {
    state.byo.ui = "valid";
    return;
  }
  if (validation === "invalid") {
    state.byo.ui = "invalid";
    return;
  }
  if (validation === "binding") {
    state.byo.ui = "binding";
    return;
  }
  state.byo.ui = "validating";
}

async function api(path, opt = {}) {
  const res = await fetch(path, {
    method: opt.method || "GET",
    headers: {
      Accept: "application/json",
      ...(opt.body ? { "Content-Type": "application/json" } : {}),
      ...(opt.headers || {})
    },
    body: opt.body ? JSON.stringify(opt.body) : undefined
  });

  const txt = await res.text();
  let json = null;
  try {
    json = txt ? JSON.parse(txt) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const e = new Error((json && (json.message || json.error)) || `HTTP_${res.status}`);
    e.payload = json || { error: "request_failed", status: res.status, body: txt };
    throw e;
  }
  return json;
}

function currentSession() {
  if (!state.currentSessionId) return null;
  if (state.draftSession && state.currentSessionId === state.draftSession.id) {
    return draftBelongsToWorkspace() ? state.draftSession : null;
  }
  const row = state.sessions.find((s) => s.id === state.currentSessionId) || null;
  if (!row) return null;
  return sessionBelongsToWorkspace(row) ? row : null;
}

function currentWorkspace() {
  return state.preflight?.selected_workspace || null;
}

function normalizeWorkspacePathValue(input) {
  return String(input || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function sessionBelongsToWorkspace(session, workspace = currentWorkspace()) {
  if (!session || !workspace) return false;
  const workspaceId = String(workspace.id || "").trim();
  const sessionWorkspaceId = String(session.workspace_id || "").trim();
  if (workspaceId && sessionWorkspaceId && workspaceId === sessionWorkspaceId) {
    return true;
  }
  const workspacePath = normalizeWorkspacePathValue(workspace.workspace_path);
  const sessionWorkspacePath = normalizeWorkspacePathValue(session.workspace_path);
  return Boolean(workspacePath && sessionWorkspacePath && workspacePath === sessionWorkspacePath);
}

function draftBelongsToWorkspace(workspace = currentWorkspace()) {
  if (!(state.draftSession && state.currentSessionId === state.draftSession.id)) {
    return false;
  }
  const workspaceId = String(workspace?.id || "").trim();
  const draftWorkspaceId = String(state.draftSession.workspace_id || "").trim();
  if (workspaceId && draftWorkspaceId && workspaceId === draftWorkspaceId) {
    return true;
  }
  return !workspaceId && !draftWorkspaceId;
}

function currentClassification() {
  return state.currentClassification || null;
}

function hasSessionGateReady() {
  if (draftBelongsToWorkspace()) {
    return true;
  }
  return Boolean(currentSession());
}

function prettyWorkspaceLabel(workspace) {
  if (!workspace) return "Workspace not selected";
  const raw = String(workspace.name || "").trim();
  if (!raw) return "Workspace";
  if (/^frontend-ws-\d+/.test(raw)) {
    return `Project ${raw.slice(-4)}`;
  }
  return raw;
}

function workspaceSourceSummary(workspace) {
  if (!workspace?.workspace_path) return "No source path selected";
  const p = String(workspace.workspace_path);
  const parts = p.split(/[/\\]/).filter(Boolean);
  return `${parts.slice(-2).join("/") || p} (controlled workspace)`;
}

function thread(id) {
  if (!state.threads[id]) state.threads[id] = [];
  return state.threads[id];
}

function markThreadAnchorBottom(force = false) {
  if (force || !state.threadScrollPinnedByUser) {
    state.threadAnchor = "bottom";
    if (force) {
      state.threadScrollPinnedByUser = false;
    }
  }
}

function pinThreadScrollByUser(scrollTop, maxScrollTop) {
  const threshold = 56;
  const nearBottom = maxScrollTop - scrollTop <= threshold;
  state.threadScrollPinnedByUser = !nearBottom;
  if (nearBottom) {
    state.threadAnchor = "bottom";
  } else {
    state.threadAnchor = "manual";
  }
}

function appendDisplayEvent(sessionId, displayType, body, meta = {}) {
  if (!isDisplayEventTypeAllowed(displayType)) {
    return false;
  }
  const lane = typeof meta.lane === "string" ? meta.lane.trim().toLowerCase() : "chat";
  if (lane !== "chat") {
    return false;
  }
  const cleanBody = sanitizeDisplayBody(body);
  if (!cleanBody) {
    return false;
  }
  if (displayType === DISPLAY_EVENT_TYPES.ASSISTANT_REPLY && isProvisionalAssistantReply(cleanBody)) {
    return false;
  }
  const cards = thread(sessionId);
  if (meta.eventKey && cards.some((x) => x.eventKey === meta.eventKey)) {
    return false;
  }
  cards.push({
    id: `c_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    displayType,
    lane,
    body: cleanBody,
    at: typeof meta.at === "string" && meta.at.trim() ? meta.at.trim() : now(),
    eventKey: meta.eventKey || null,
    source: meta.source || "display"
  });
  markThreadAnchorBottom();
  saveThreads();
  return true;
}

function cloneAttachments(items) {
  return items.map((a) => ({
    id: a.id,
    source: a.source,
    name: a.name,
    mime: a.mime || "application/octet-stream",
    content: a.content || "",
    text: a.text || "",
    preview: a.preview || null
  }));
}

function cloneComposerTokens(items) {
  return (Array.isArray(items) ? items : []).map((token) => ({
    id: token.id || `tok_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    kind: token.kind || "reference",
    command: token.command || null,
    rel_path: token.rel_path || null,
    symbol: token.symbol || null,
    label: token.label || ""
  }));
}

function serializeComposerTokensForPayload() {
  return cloneComposerTokens(state.composerTokens).map((token) => ({
    kind: token.kind,
    command: token.command,
    rel_path: token.rel_path,
    symbol: token.symbol,
    label: token.label
  }));
}

function currentProjectId() {
  return String(currentWorkspace()?.id || currentSession()?.workspace_id || "").trim() || null;
}

function currentThreadId() {
  const cs = currentSession();
  if (cs?.id && !String(cs.id).startsWith("draft_")) {
    return cs.id;
  }
  return null;
}

function closeComposerSuggest() {
  state.composerSuggest = {
    open: false,
    kind: null,
    query: "",
    items: [],
    selected: 0,
    triggerStart: null,
    triggerEnd: null,
    loading: false
  };
}

function detectComposerTriggerAtCaret(text, caret) {
  const value = String(text || "");
  const cursor = Number.isFinite(Number(caret)) ? Math.max(0, Math.min(value.length, Number(caret))) : value.length;
  const head = value.slice(0, cursor);
  const slashMatch = head.match(/(^|\s)(\/[a-z0-9._-]*)$/i);
  if (slashMatch) {
    const fragment = slashMatch[2] || "";
    const triggerStart = head.length - fragment.length;
    return {
      kind: "slash",
      query: fragment.slice(1),
      triggerStart,
      triggerEnd: cursor
    };
  }
  const refMatch = head.match(/(^|\s)(@[^\s@]*)$/);
  if (refMatch) {
    const fragment = refMatch[2] || "";
    const triggerStart = head.length - fragment.length;
    return {
      kind: "reference",
      query: fragment.slice(1),
      triggerStart,
      triggerEnd: cursor
    };
  }
  return null;
}

let composerSuggestRequestSeq = 0;

async function fetchComposerSuggestions(trigger) {
  const projectId = currentProjectId();
  const threadId = currentThreadId();
  if (!projectId) return [];
  if (trigger.kind === "slash") {
    const resolved = await api("/api/composer/resolve", {
      method: "POST",
      body: {
        threadId,
        projectId,
        rawText: state.composer,
        tokens: serializeComposerTokensForPayload(),
        mode: state.currentClassification?.lane || "chat"
      }
    });
    return (resolved?.suggestions?.commands || []).map((item) => ({
      kind: "command",
      id: item.id,
      label: item.label || `/${item.id}`,
      description: item.description || "",
      needs_target: !!item.needs_target
    }));
  }
  const searched = await api("/api/project/search-file", {
    method: "POST",
    body: {
      threadId,
      projectId,
      query: trigger.query || "",
      limit: 12,
      include_directories: true,
      include_symbols: true
    }
  });
  return (searched?.candidates || []).map((item) => ({
    kind: "reference",
    type: item.type || "file",
    rel_path: item.rel_path || null,
    symbol: item.symbol || null,
    label: item.type === "symbol" ? `@${item.rel_path}#${item.symbol}` : `@${item.rel_path}`,
    confidence: item.confidence
  }));
}

async function refreshComposerSuggest(text, caret) {
  const trigger = detectComposerTriggerAtCaret(text, caret);
  const liveCaret = currentComposerCaret(caret);
  if (!trigger) {
    if (!state.composerSuggest?.open) {
      return;
    }
    closeComposerSuggest();
    render({ keepComposerFocus: true, caret: liveCaret });
    return;
  }
  const reqSeq = ++composerSuggestRequestSeq;
  state.composerSuggest = {
    open: true,
    kind: trigger.kind,
    query: trigger.query,
    items: [],
    selected: 0,
    triggerStart: trigger.triggerStart,
    triggerEnd: trigger.triggerEnd,
    loading: true
  };
  render({ keepComposerFocus: true, caret: liveCaret });
  try {
    const items = await fetchComposerSuggestions(trigger);
    if (reqSeq !== composerSuggestRequestSeq) return;
    state.composerSuggest = {
      open: true,
      kind: trigger.kind,
      query: trigger.query,
      items,
      selected: 0,
      triggerStart: trigger.triggerStart,
      triggerEnd: trigger.triggerEnd,
      loading: false
    };
    render({ keepComposerFocus: true, caret: currentComposerCaret(liveCaret) });
  } catch {
    if (reqSeq !== composerSuggestRequestSeq) return;
    closeComposerSuggest();
    render({ keepComposerFocus: true, caret: currentComposerCaret(liveCaret) });
  }
}

function applyComposerSuggestion(item) {
  if (!item || typeof item !== "object") return;
  if (item.kind === "command") {
    state.composerTokens.push({
      id: `tok_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      kind: "command",
      command: item.id,
      rel_path: null,
      symbol: null,
      label: item.label || `/${item.id}`
    });
  } else if (item.kind === "reference") {
    if (!item.rel_path) return;
    state.composerTokens.push({
      id: `tok_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
      kind: item.type === "symbol" ? "symbol" : item.type === "directory" ? "directory" : "reference",
      command: null,
      rel_path: item.rel_path,
      symbol: item.symbol || null,
      label: item.label || (item.type === "symbol" ? `@${item.rel_path}#${item.symbol}` : `@${item.rel_path}`)
    });
  }
  const suggest = state.composerSuggest || {};
  const start = Number.isFinite(Number(suggest.triggerStart)) ? Number(suggest.triggerStart) : null;
  const end = Number.isFinite(Number(suggest.triggerEnd)) ? Number(suggest.triggerEnd) : null;
  if (start !== null && end !== null && start >= 0 && end >= start) {
    state.composer = `${state.composer.slice(0, start)}${state.composer.slice(end)}`.replace(/\s{2,}/g, " ");
  }
  const caret = start !== null && start >= 0 ? start : String(state.composer || "").length;
  closeComposerSuggest();
  render({ keepComposerFocus: true, caret });
}

function moveComposerSuggestSelection(delta) {
  if (!state.composerSuggest?.open) return false;
  const size = Array.isArray(state.composerSuggest.items) ? state.composerSuggest.items.length : 0;
  if (size <= 0) return false;
  const current = Number(state.composerSuggest.selected || 0);
  const next = (current + delta + size) % size;
  state.composerSuggest.selected = next;
  render({ keepComposerFocus: true, caret: currentComposerCaret(state.composerSuggest.triggerEnd || state.composer.length) });
  return true;
}

function commitComposerSuggestSelection() {
  if (!state.composerSuggest?.open) return false;
  const items = Array.isArray(state.composerSuggest.items) ? state.composerSuggest.items : [];
  if (!items.length) return false;
  const selected = items[Math.max(0, Math.min(items.length - 1, Number(state.composerSuggest.selected || 0)))];
  applyComposerSuggestion(selected);
  return true;
}

function removeComposerToken(tokenId) {
  state.composerTokens = state.composerTokens.filter((token) => token.id !== tokenId);
  render();
}

function sessionsVisible(list, search) {
  const q = String(search || "").trim().toLowerCase();
  return list
    .filter((s) => !state.deleted.includes(s.id))
    .filter((s) => !q || (s.title || s.id).toLowerCase().includes(q));
}

function compactClassification(detail = {}) {
  return {
    lane: String(detail.lane || "chat"),
    mode: String(detail.mode || "analysis"),
    intent: String(detail.intent || "generic_chat"),
    confidence: Number(detail.confidence || 0),
    executionMode: String(detail.executionMode || "answer_only"),
    riskLevel: String(detail.riskLevel || "low"),
    requiresTools: !!detail.requiresTools,
    requiresApproval: !!detail.requiresApproval,
    domains: Array.isArray(detail.domains) ? [...detail.domains] : [],
    artifacts: Array.isArray(detail.artifacts) ? [...detail.artifacts] : [],
    reasons: Array.isArray(detail.reasons) ? [...detail.reasons] : [],
    scores: detail.scores || null,
    attachmentSummary: detail.attachmentSummary || null,
    prompt: String(detail.prompt || ""),
    at: now()
  };
}

function syncCurrentClassificationFromSession() {
  const sid = state.currentSessionId;
  state.currentClassification = sid && state.classifications[sid] ? state.classifications[sid] : null;
}

function applyClassificationToSession(sessionId, detail) {
  if (!sessionId || !detail) return;
  const compact = compactClassification(detail);
  state.classifications[sessionId] = compact;
  state.currentClassification = compact;
  saveClassifications();
}

function buildSessionMessageContext(sessionId) {
  if (!sessionId) return [];
  return thread(sessionId)
    .slice(-8)
    .map((card) => ({
      role: card.displayType === DISPLAY_EVENT_TYPES.USER_MESSAGE ? "user" : "assistant",
      content: card.body
    }));
}

function buildClassificationInput(sessionId, prompt, attachments) {
  const previous = sessionId ? state.classifications[sessionId] : null;
  const contextSummary = state.context.assembled
    ? `context mode=${state.context.mode}; compact=${state.context.compacted ? "yes" : "no"}; resumed=${state.context.resumed ? "yes" : "no"}`
    : "";

  return {
    prompt,
    attachments,
    tokens: serializeComposerTokensForPayload(),
    workspaceLabel: prettyWorkspaceLabel(currentWorkspace()),
    contextSummary,
    messages: buildSessionMessageContext(sessionId),
    previousClassification: previous
      ? {
          lane: previous.lane,
          intent: previous.intent
        }
      : null
  };
}

function applyLaneOverrides(detail, prompt, attachments) {
  const next = {
    ...(detail && typeof detail === "object" ? detail : {})
  };
  const normalized = normalizePrompt(prompt);
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;

  if (FORCE_TASK_PATTERNS.some((pattern) => pattern.test(normalized))) {
    next.lane = "task";
    next.mode = "execution";
    next.intent = next.intent || "troubleshoot";
    next.executionMode = "stepwise";
    next.requiresTools = true;
    next.requiresApproval = Boolean(next.requiresApproval);
    next.reasons = [...(Array.isArray(next.reasons) ? next.reasons : []), "force_task_keyword"];
    return next;
  }

  if (!hasAttachments && SOCIAL_PROMPT_PATTERNS.some((pattern) => pattern.test(normalized))) {
    next.lane = "chat";
    next.mode = "social";
    next.intent = /晚安|再见|拜拜|bye|goodbye/i.test(normalized) ? "farewell" : "greeting";
    next.executionMode = "answer_only";
    next.requiresTools = false;
    next.requiresApproval = false;
    next.reasons = [...(Array.isArray(next.reasons) ? next.reasons : []), "force_social_prompt"];
  }

  const mode = String(next.mode || "").toLowerCase();
  const intent = String(next.intent || "").toLowerCase();
  const forcedTask =
    FORCE_TASK_PATTERNS.some((pattern) => pattern.test(normalized)) ||
    EXECUTION_SIGNAL_PATTERN.test(normalized) ||
    mode === "execution" ||
    mode === "workflow" ||
    EXECUTION_INTENT_SET.has(intent);
  if (!forcedTask) {
    next.lane = "chat";
    if (!next.mode || next.mode === "execution" || next.mode === "workflow") {
      next.mode = "qa";
    }
    next.intent = next.intent || "generic_chat";
    next.executionMode = "answer_only";
    next.requiresTools = false;
    next.requiresApproval = false;
    next.reasons = [...(Array.isArray(next.reasons) ? next.reasons : []), "enforce_chat_lane_for_non_execution"];
  }

  return next;
}

function buildTaskPlanLines(detail) {
  const lines = [];
  lines.push("1. Assemble current workspace + conversation context");

  const summary = detail?.attachmentSummary || {};
  const attachmentCount = Object.values(summary).reduce((acc, n) => acc + Number(n || 0), 0);
  if (attachmentCount > 0) {
    lines.push("2. Parse current attachments and merge them into task context");
  } else {
    lines.push("2. Build execution input from the current prompt");
  }

  if (detail?.requiresApproval || detail?.riskLevel === "approval_required") {
    lines.push("3. Guard risky operation boundary and wait for explicit approval if required");
    lines.push("4. Execute, verify, and return final answer");
    return lines;
  }

  if (detail?.executionMode === "stepwise") {
    lines.push("3. Execute in guarded stepwise mode");
    lines.push("4. Verify result and return final answer");
    return lines;
  }

  if (detail?.executionMode === "direct_action") {
    lines.push("3. Execute minimal direct-action path");
    lines.push("4. Verify result and return final answer");
    return lines;
  }

  lines.push("3. Return concise execution result");
  return lines;
}

function classificationSummaryText(detail) {
  if (!detail) return "No classification yet";
  return JSON.stringify(detail, null, 2);
}

async function refreshCore() {
  const prevWorkspaceId = state.preflight?.selected_workspace?.id || null;
  const [preflight, ws, ss, access, byo] = await Promise.all([
    api("/entry/preflight"),
    api("/entry/workspaces"),
    api("/entry/sessions"),
    api("/entry/access/status"),
    api("/entry/byo/openai/status")
  ]);

  state.preflight = preflight;
  state.workspaces = ws.workspaces || [];
  state.sessions = ss.sessions || [];
  state.access.granted = !!access.full_access_granted;
  applyByoStatus(byo || {});
  const nextWorkspaceId = preflight?.selected_workspace?.id || null;
  const selectedWorkspace = preflight?.selected_workspace || null;
  const sessionsForWorkspace = state.sessions.filter((s) => sessionBelongsToWorkspace(s, selectedWorkspace));
  const workspaceChanged = prevWorkspaceId !== nextWorkspaceId;
  const currentIsDraft = Boolean(state.draftSession && state.currentSessionId === state.draftSession.id);
  const currentSessionRow = state.currentSessionId ? state.sessions.find((s) => s.id === state.currentSessionId) : null;
  const currentExistsInWorkspace = Boolean(currentSessionRow && sessionBelongsToWorkspace(currentSessionRow, selectedWorkspace));

  if (workspaceChanged && currentIsDraft && !draftBelongsToWorkspace(selectedWorkspace)) {
    state.draftSession = null;
  }

  if (workspaceChanged || (!currentIsDraft && !currentExistsInWorkspace) || !state.currentSessionId) {
    state.currentSessionId = preflight.last_session?.id || sessionsForWorkspace[0]?.id || null;
    markThreadAnchorBottom(true);
  }
  syncCurrentClassificationFromSession();
  await refreshContextSettingsForCurrentSession();

  const cs = currentSession();
  if (cs?.run_id) {
    await refreshRun(cs.run_id);
  }
}

async function refreshContextSettings(sessionId = null) {
  const sid = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
  if (!sid) {
    applyContextSettingsState(defaultContextSettings(), null);
    return state.contextSettings;
  }
  state.contextSettingsLoading = true;
  try {
    const payload = await api(`/api/context/settings?session_id=${encodeURIComponent(sid)}`);
    const normalized = applyContextSettingsState(payload?.settings || {}, sid);
    return normalized;
  } catch (error) {
    log("context_settings_refresh_failed", {
      session_id: sid,
      message: String(error?.payload?.error || error?.payload?.message || error?.message || error)
    });
    return state.contextSettings || applyContextSettingsState(defaultContextSettings(), sid);
  } finally {
    state.contextSettingsLoading = false;
  }
}

async function refreshContextSettingsForCurrentSession() {
  const sid = currentSessionIdForContextSettings();
  return refreshContextSettings(sid);
}

async function patchContextSettingsForCurrentSession(patch = {}, source = "settings_ui") {
  const sid = currentSessionIdForContextSettings();
  if (!sid) {
    throw new Error("persisted_session_required_for_context_settings");
  }
  const payload = await api("/api/context/settings", {
    method: "POST",
    body: {
      session_id: sid,
      ...patch
    }
  });
  const normalized = applyContextSettingsState(payload?.settings || {}, sid);
  log("context_settings_updated", {
    source,
    session_id: sid,
    settings: normalized
  });
  return normalized;
}

async function refreshPreflight() {
  state.preflight = await api("/entry/preflight");
}

async function refreshAccessStatus() {
  const access = await api("/entry/access/status");
  state.access.granted = !!access.full_access_granted;
}

async function refreshByoStatus() {
  const byo = await api("/entry/byo/openai/status");
  applyByoStatus(byo || {});
}

async function refreshRun(runId) {
  try {
    const hyd = await api(`/runs/${encodeURIComponent(runId)}/hydrate?use_compact=true`);
    const projection = hyd?.projection || {};
    const contextProjection = hyd?.context_projection || projection?.context_projection || null;
    const compactRunId =
      projection?.compact_run_id ||
      contextProjection?.compact_run_id ||
      hyd?.compact_run_id ||
      hyd?.compact?.id ||
      hyd?.compact_id ||
      null;
    const compactSnapshotId =
      projection?.compact_snapshot_id ||
      contextProjection?.compact_snapshot_id ||
      hyd?.compact_snapshot_id ||
      hyd?.compact?.compact_snapshot_id ||
      null;
    const hydrateMode = String(contextProjection?.hydration_mode || projection?.hydrate_mode || "");
    const resumedCursor = contextProjection?.resume_cursor;

    state.run.id = runId;
    state.run.status = String(
      projection?.run_status || projection?.final_projection_status || hyd?.status || hyd?.hydration?.status || "running"
    );

    state.context.assembled = Boolean(contextProjection || projection || hyd?.context || hyd?.hydration);
    state.context.compacted = Boolean(compactRunId || compactSnapshotId || hydrateMode.includes("compact") || hydrateMode.includes("snapshot"));
    state.context.resumed = Boolean(
      compactRunId ||
        compactSnapshotId ||
        (resumedCursor !== null && resumedCursor !== undefined) ||
        hydrateMode.includes("compact") ||
        hydrateMode.includes("snapshot")
    );
    state.context.mode = hydrateMode || "raw";
    state.context.hash = projection?.compact_integrity_hash || hyd?.compact?.hash || null;
    log("hydrate", hyd);
  } catch {
    state.run.id = runId;
    state.run.status = "unavailable";
    state.context = { assembled: false, compacted: false, resumed: false, mode: "raw", hash: null };
  }
}

function route(path) {
  const r = path === "/settings" ? "/settings" : path === "/sessions" ? "/sessions" : "/";
  if (r !== state.route) history.pushState({}, "", r);
  state.route = r;
  if (state.route === "/") {
    markThreadAnchorBottom(true);
  }
  render();
}

function topbarStatusModel() {
  const ws = currentWorkspace();
  const sessionState = state.currentSessionId
    ? state.draftSession && state.currentSessionId === state.draftSession.id
      ? "draft"
      : "active"
    : "none";
  const byoLabel = byoUiLabel(state.byo.ui);
  const byoClass = state.byo.ui === "valid" ? "ok" : state.byo.ui === "invalid" ? "bad" : "warn";
  return {
    host: {
      text: `host:${state.preflight?.host_connected ? "connected" : "offline"}`,
      tone: state.preflight?.host_connected ? "ok" : "bad"
    },
    workspace: {
      text: `workspace:${prettyWorkspaceLabel(ws)}`,
      tone: ws ? "ok" : "warn"
    },
    access: {
      text: `access:${state.access.granted ? "granted" : "required"}`,
      tone: state.access.granted ? "ok" : "warn"
    },
    byo: {
      text: `OpenAI BYO:${byoLabel}`,
      tone: byoClass
    },
    session: {
      text: `session:${sessionState}`,
      tone: sessionState === "none" ? "warn" : "ok"
    },
    lane: {
      text: `lane:${state.run.lane || "idle"}`,
      tone: state.run.status === "failed" ? "bad" : "ok"
    }
  };
}

function updateTopbarChip(chipKey, chipState) {
  const chip = appEl.querySelector(`[data-topbar-chip='${chipKey}']`);
  if (!(chip instanceof HTMLElement) || !chipState) return;
  chip.textContent = chipState.text;
  chip.classList.remove(...TOPBAR_TONE_CLASSES);
  const tone = TOPBAR_TONE_CLASSES.includes(chipState.tone) ? chipState.tone : "warn";
  chip.classList.add(tone);
}

function refreshStatusBadgesOnly() {
  if (state.loading) return false;
  const topbarEl = appEl.querySelector(".topbar");
  if (!(topbarEl instanceof HTMLElement)) return false;
  const model = topbarStatusModel();
  updateTopbarChip("host", model.host);
  updateTopbarChip("workspace", model.workspace);
  updateTopbarChip("access", model.access);
  updateTopbarChip("byo", model.byo);
  updateTopbarChip("session", model.session);
  updateTopbarChip("lane", model.lane);
  return true;
}

function topbar() {
  const model = topbarStatusModel();
  return `<header class="topbar"><div class="top-status"><span class="brand">lite-codex</span><span class="chip ${model.host.tone}" data-topbar-chip="host">${esc(model.host.text)}</span><span class="chip ${model.workspace.tone}" data-topbar-chip="workspace">${esc(model.workspace.text)}</span><span class="chip ${model.access.tone}" data-topbar-chip="access">${esc(model.access.text)}</span><span class="chip ${model.byo.tone}" data-topbar-chip="byo">${esc(model.byo.text)}</span><span class="chip ${model.session.tone}" data-topbar-chip="session">${esc(model.session.text)}</span><span class="chip ${model.lane.tone}" data-topbar-chip="lane">${esc(model.lane.text)}</span></div><div class="top-actions"><button class="link-btn ${state.route === "/" ? "active" : ""}" data-route="/">Home</button><button class="link-btn ${state.route === "/sessions" ? "active" : ""}" data-route="/sessions">Sessions</button><button class="link-btn ${state.route === "/settings" ? "active" : ""}" data-route="/settings">Settings</button></div></header>`;
}

function settingsHtml() {
  const cfg = contextSettingsForUi();
  const persistedSession = hasPersistedCurrentSession();
  const autoCompactEnabled = cfg.auto_compact_after_task_lane && cfg.auto_compact_enabled;
  return `<section class="page-wrap" data-proof="settings-dedup"><article class="page-card"><h2>Workspace Management</h2><div class="field"><input class="input" data-bind="workspace-label" value="${esc(state.workspaceForm.label)}" placeholder="workspace label"/></div><div class="row"><button class="primary-btn" data-action="create-workspace">Create and Select</button><button class="ghost-btn" data-action="open-modal-workspace">Open Dialog</button></div><hr/>${state.workspaces.map((w) => `<div class="row" style="justify-content:space-between; margin-bottom:6px;"><div><b>${esc(prettyWorkspaceLabel(w))}</b><div class="note">${esc(workspaceSourceSummary(w))}</div></div><button class="ghost-btn" data-action="select-workspace" data-id="${esc(w.id)}">Select</button></div>`).join("")}</article><article class="page-card"><h2>OpenAI BYO Management</h2><div class="field"><input class="input" type="password" data-bind="byo-key" value="${esc(state.byo.key)}" placeholder="sk-..."/></div><div class="row"><button class="primary-btn" data-action="bind-byo">Bind + Validate</button><button class="ghost-btn" data-action="clear-byo">Clear</button></div><div class="note">State: ${esc(byoUiLabel(state.byo.ui))}</div></article><article class="page-card"><h2>Full Access Management</h2><div class="row"><button class="primary-btn" data-action="grant-access">Grant</button><button class="ghost-btn" data-action="recheck-access">Recheck</button></div><div class="note">Current: ${state.access.granted ? "Granted" : "Not granted"}</div></article><article class="page-card"><h2>Automation</h2><label><input data-bind="auto-compact" type="checkbox" ${autoCompactEnabled ? "checked" : ""} ${persistedSession ? "" : "disabled"}/> Auto compact after task lane</label><div class="note">auto compact: ${autoCompactEnabled ? "enabled" : "disabled"}${state.contextSettingsLoading ? " (loading)" : ""}</div><div class="note">event threshold: ${esc(cfg.event_threshold)}</div><div class="note">token threshold: ${esc(cfg.token_threshold)}</div><div class="note">stdout/stderr threshold: ${esc(cfg.stdout_stderr_threshold)}</div><div class="note">artifacts threshold: ${esc(cfg.artifacts_threshold)}</div><div class="note">repair rounds threshold: ${esc(cfg.repair_round_threshold)}</div><div class="note">last compact status: ${esc(cfg.last_compact_status || "unknown")}</div><div class="note">last snapshot id: ${esc(cfg.last_snapshot_id || "-")}</div><div class="note">last compact reason: ${esc(cfg.last_compact_reason || "-")}</div><div class="note">last compacted at: ${esc(cfg.last_compacted_at ? t(cfg.last_compacted_at) : "-")}</div><div class="field"><label class="note">Event threshold</label><input class="input" data-bind="ctx-threshold-events" type="number" min="4" value="${esc(cfg.event_threshold)}" ${persistedSession ? "" : "disabled"}/></div><div class="field"><label class="note">Token threshold</label><input class="input" data-bind="ctx-threshold-tokens" type="number" min="100" value="${esc(cfg.token_threshold)}" ${persistedSession ? "" : "disabled"}/></div><div class="field"><label class="note">Stdout/Stderr threshold</label><input class="input" data-bind="ctx-threshold-stdout" type="number" min="100" value="${esc(cfg.stdout_stderr_threshold)}" ${persistedSession ? "" : "disabled"}/></div><div class="field"><label class="note">Artifacts threshold</label><input class="input" data-bind="ctx-threshold-artifacts" type="number" min="1" value="${esc(cfg.artifacts_threshold)}" ${persistedSession ? "" : "disabled"}/></div><div class="field"><label class="note">Repair rounds threshold</label><input class="input" data-bind="ctx-threshold-repair" type="number" min="1" value="${esc(cfg.repair_round_threshold)}" ${persistedSession ? "" : "disabled"}/></div><div class="row"><button class="primary-btn" data-action="save-context-settings" ${persistedSession ? "" : "disabled"}>Save Automation Settings</button><button class="ghost-btn" data-action="manual-context-compact" ${persistedSession ? "" : "disabled"}>Compact Context Now</button></div><div class="note">${persistedSession ? `session: ${esc(currentSessionIdForContextSettings() || "-")}` : "Select a persisted session to enable backend automation controls."}</div></article></section>`;
}

function sessionsHtml() {
  const active = sessionsVisible(state.sessions, state.pageSearch);
  const deleted = state.sessions.filter((s) => state.deleted.includes(s.id));
  return `<section class="page-wrap" data-proof="sessions-bridge"><article class="page-card" style="grid-column:1/-1;"><h2>Session Manager</h2><div class="row"><button class="primary-btn" data-action="new-session">New Session</button><button class="ghost-btn" data-action="continue-last">Continue Last Session</button></div><div class="field" style="margin-top:8px;"><input class="input" data-bind="page-search" value="${esc(state.pageSearch)}" placeholder="Search sessions"/></div></article><article class="page-card"><h2>Active Sessions</h2>${active.map((s) => `<div class="block" style="padding:10px;margin-bottom:8px;"><div><b>${esc(renderSessionListItemTitle(s))}</b></div><div class="note">${esc(t(s.updated_at || s.created_at || now()))}</div><div class="note">${esc(state.classifications[s.id] ? `${state.classifications[s.id].lane}/${state.classifications[s.id].intent}` : "no classification yet")}</div><div class="row" style="margin-top:8px;"><button class="ghost-btn" data-action="open-home-session" data-id="${esc(s.id)}">Open in Home</button><button class="danger-btn" data-action="delete-session" data-id="${esc(s.id)}">Delete</button></div></div>`).join("") || `<div class="note">No active sessions.</div>`}</article><article class="page-card"><h2>Deleted Sessions</h2>${deleted.map((s) => `<div class="block" style="padding:10px;margin-bottom:8px;"><div><b>${esc(s.title || "Session")}</b></div><button class="ghost-btn" data-action="restore-session" data-id="${esc(s.id)}">Restore</button></div>`).join("") || `<div class="note">No deleted sessions.</div>`}</article></section>`;
}

function reviewText() {
  if (state.reviewTab === "changes") {
    return JSON.stringify({
      display_event_contract: DISPLAY_EVENT_CONTRACT.version,
      main_thread_allowed: DISPLAY_EVENT_CONTRACT.mainThreadAllowed,
      lane: state.run.lane,
      run_status: state.run.status,
      attachments: state.attachments.map((a) => ({ name: a.name, source: a.source, mime: a.mime || null })),
      context: state.context,
      pending_send: Boolean(state.pendingSend),
      classification: currentClassification()
    }, null, 2);
  }

  if (state.reviewTab === "verify") {
    return JSON.stringify({
      host_connected: !!state.preflight?.host_connected,
      full_access_granted: !!state.access.granted,
      byo_validation: state.byo.validation,
      gate_order: SEND_GATE_ORDER,
      gate_ready: {
        workspace: !!currentWorkspace()?.workspace_path,
        access: !!state.access.granted,
        byo: !!isByoGateReady(),
        session: hasSessionGateReady()
      },
      send_locked_by_run_state: isSendLockedByRunState(),
      classification_gate: {
        requires_tools: !!currentClassification()?.requiresTools,
        requires_approval: !!currentClassification()?.requiresApproval,
        risk_level: currentClassification()?.riskLevel || "low",
        execution_mode: currentClassification()?.executionMode || "answer_only"
      }
    }, null, 2);
  }

  if (state.reviewTab === "deploy") {
    return JSON.stringify({
      provider_authorized: !!state.preflight?.provider_access?.authorized,
      restricted: state.preflight?.provider_access?.authorized === false,
      frontend_source: ENTRY_FRONTEND_SOURCE,
      classification: currentClassification()
        ? {
            lane: currentClassification().lane,
            intent: currentClassification().intent,
            domains: currentClassification().domains,
            artifacts: currentClassification().artifacts
          }
        : null
    }, null, 2);
  }

  return logs.map((x) => `[${x.at}] ${x.title}\n${JSON.stringify(x.payload, null, 2)}`).join("\n\n").slice(0, 12000);
}

function modalHtml() {
  if (!state.modal) return "";

  if (state.modal === "workspace") {
    const sourceMode = state.workspaceForm.sourceMode;
    const usingPath = sourceMode === "existing_workspace_path";
    return `<div class="modal-backdrop" data-action="close-modal-bg"><section class="modal"><header class="head"><h3>Workspace Setup</h3><button class="ghost-btn" data-action="close-modal">Close</button></header><div class="body"><div class="note">Send is blocked until workspace is selected. Source mode is constrained by litecodex workspace root policy.</div><div class="field"><label>Workspace label</label><input class="input" data-bind="workspace-label-modal" value="${esc(state.workspaceForm.label)}" placeholder="my-project"/></div><div class="field"><label>Source</label><select class="select" data-bind="workspace-source-mode"><option value="managed_workspace" ${sourceMode === "managed_workspace" ? "selected" : ""}>Create managed workspace</option><option value="existing_workspace_path" ${usingPath ? "selected" : ""}>Use existing workspace path</option></select></div>${usingPath ? `<div class="field"><label>Workspace path (must be under litecodex/workspaces)</label><input class="input" data-bind="workspace-path" value="${esc(state.workspaceForm.workspacePath)}" placeholder="C:\\node\\GPT5-codex\\litecodex\\workspaces\\my-project"/></div>` : ""}<div class="field"><label><input type="checkbox" data-bind="workspace-confirm" ${state.workspaceForm.confirmed ? "checked" : ""}/> Confirm enter controlled workspace boundary</label></div><div class="note">source summary: ${esc(state.workspaceForm.sourceSummary)}</div></div><footer class="foot"><button class="ghost-btn" data-action="pick-workspace-source">Pick Local Folder (name only)</button><button class="primary-btn" data-action="create-workspace-modal">Confirm and Continue</button></footer></section></div>`;
  }

  if (state.modal === "access") {
    return `<div class="modal-backdrop" data-action="close-modal-bg"><section class="modal"><header class="head"><h3>Grant Full Access</h3><button class="ghost-btn" data-action="close-modal">Close</button></header><div class="body"><div class="note">Send is blocked until full access is granted.</div></div><footer class="foot"><button class="ghost-btn" data-action="recheck-access">Recheck</button><button class="primary-btn" data-action="grant-access">Grant</button></footer></section></div>`;
  }

  if (state.modal === "byo") {
    return `<div class="modal-backdrop" data-action="close-modal-bg"><section class="modal"><header class="head"><h3>Bind OpenAI BYO</h3><button class="ghost-btn" data-action="close-modal">Close</button></header><div class="body"><div class="note">Local only, current browser scope, no plaintext backend persistence.</div><div class="field"><input class="input" type="password" data-bind="byo-key" value="${esc(state.byo.key)}" placeholder="sk-..."/></div><div class="note">State: ${esc(byoUiLabel(state.byo.ui))} / ${esc(state.byo.validation)} / ${esc(state.byo.error || "-")}</div></div><footer class="foot"><button class="ghost-btn" data-action="insert-invalid">Insert invalid key</button><button class="ghost-btn" data-action="clear-byo">Clear</button><button class="primary-btn" data-action="bind-byo">Bind + Validate</button></footer></section></div>`;
  }

  if (state.modal === "open-folder") {
    const workspace = currentWorkspace();
    const label = prettyWorkspaceLabel(workspace);
    return `<div class="modal-backdrop" data-action="close-modal-bg"><section class="modal"><header class="head"><h3>Open Folder</h3><button class="ghost-btn" data-action="close-modal">Close</button></header><div class="body"><div class="note">Host action only. This does not create run artifacts.</div><div class="field"><label>Project</label><div class="note">${esc(label)}</div></div><div class="field"><label>Folder path (relative to project root, leave empty for root)</label><input class="input" data-bind="open-folder-relpath" value="${esc(state.openFolderRelPath || "")}" placeholder="entry/service/public"/></div></div><footer class="foot"><button class="ghost-btn" data-action="close-modal">Cancel</button><button class="primary-btn" data-action="confirm-open-folder">Open</button></footer></section></div>`;
  }

  return `<div class="modal-backdrop" data-action="close-modal-bg"><section class="modal"><header class="head"><h3>Start Session</h3><button class="ghost-btn" data-action="close-modal">Close</button></header><div class="body"><div class="note">Send is blocked until session exists.</div></div><footer class="foot"><button class="ghost-btn" data-action="continue-last">Continue Last Session</button><button class="primary-btn" data-action="new-session">New Session</button></footer></section></div>`;
}

function previewOverlayHtml() {
  if (!state.imagePreview?.preview) return "";
  return `<div class="preview-overlay" data-action="close-image-preview-bg"><section class="preview-panel"><button class="preview-close" data-action="close-image-preview">Close</button><img src="${esc(state.imagePreview.preview)}" alt="preview"/><div class="preview-caption">${esc(state.imagePreview.name || "image")}</div></section></div>`;
}

function currentComposerCaret(defaultCaret = null) {
  const composer = appEl.querySelector("textarea[data-bind='composer']");
  if (composer instanceof HTMLTextAreaElement && document.activeElement === composer) {
    const pos = Number.isFinite(composer.selectionStart) ? Number(composer.selectionStart) : String(composer.value || "").length;
    state.composerCaret = pos;
    return pos;
  }
  if (Number.isFinite(Number(defaultCaret))) {
    return Number(defaultCaret);
  }
  if (Number.isFinite(Number(state.composerCaret))) {
    return Number(state.composerCaret);
  }
  return String(state.composer || "").length;
}

function captureComposerSnapshot() {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement)) return null;
  if (active.getAttribute("data-bind") !== "composer") return null;
  state.composerCaret = Number.isFinite(active.selectionStart) ? Number(active.selectionStart) : state.composerCaret;
  return {
    focused: true,
    start: Number.isFinite(active.selectionStart) ? active.selectionStart : null,
    end: Number.isFinite(active.selectionEnd) ? active.selectionEnd : null
  };
}

function restoreComposerSnapshot(snapshot) {
  if (!snapshot?.focused) return;
  const composer = appEl.querySelector("textarea[data-bind='composer']");
  if (!(composer instanceof HTMLTextAreaElement) || composer.disabled) return;
  const len = String(composer.value || "").length;
  const startRaw = Number.isFinite(snapshot.start) ? Number(snapshot.start) : len;
  const endRaw = Number.isFinite(snapshot.end) ? Number(snapshot.end) : startRaw;
  const start = Math.max(0, Math.min(len, startRaw));
  const end = Math.max(start, Math.min(len, endRaw));
  safeFocusWithoutScroll(composer);
  try {
    composer.setSelectionRange(start, end);
    state.composerCaret = end;
  } catch {
    // no-op
  }
}

function render(options = null) {
  const previousRoute = state.lastRenderedRoute;
  const routeChanged = typeof previousRoute === "string" && previousRoute !== state.route;
  const preserveScroll = !(options && typeof options === "object" && options.preserveScroll === false);
  const scrollState = preserveScroll ? captureScrollState() : null;
  const explicitSnapshot =
    options && typeof options === "object" && (options.keepComposerFocus || Number.isFinite(options.caret))
      ? {
          focused: true,
          start: Number.isFinite(options.caret) ? Number(options.caret) : null,
          end: Number.isFinite(options.caret) ? Number(options.caret) : null
        }
      : null;
  const composerSnapshot = explicitSnapshot || captureComposerSnapshot();
  if (state.loading) {
    appEl.innerHTML = `<div style="padding:24px;">Loading entry workbench...</div>`;
    modalRoot.innerHTML = "";
    state.lastRenderedRoute = state.route;
    return;
  }
  const page = state.route === "/settings" ? settingsHtml() : state.route === "/sessions" ? sessionsHtml() : homeHtml();
  const toastHtml = state.toast ? `<div class="toast"><span class="chip ${state.toast.level === "ok" ? "ok" : state.toast.level === "bad" ? "bad" : "warn"}">${esc(state.toast.msg)}</span></div>` : "";
  closeImagePreviewIfMissing();
  appEl.innerHTML = `${topbar()}${page}${toastHtml}`;
  modalRoot.innerHTML = `${modalHtml()}${previewOverlayHtml()}`;
  bindInputs();
  syncThreadViewport();
  restoreComposerSnapshot(composerSnapshot);
  if (scrollState && !routeChanged) {
    requestAnimationFrame(() => {
      restoreScrollState(scrollState);
    });
  }
  state.lastRenderedRoute = state.route;
}

function bindInputs() {
  const composer = appEl.querySelector("textarea[data-bind='composer']");
  if (composer) {
    composer.addEventListener("compositionstart", () => {
      state.composerComposing = true;
    });
    composer.addEventListener("compositionend", (e) => {
      state.composerComposing = false;
      state.composer = e.target.value;
      state.composerCaret = Number.isFinite(e.target.selectionStart) ? Number(e.target.selectionStart) : state.composer.length;
      void refreshComposerSuggest(state.composer, e.target.selectionStart);
    });
    composer.addEventListener("input", (e) => {
      state.composer = e.target.value;
      state.composerCaret = Number.isFinite(e.target.selectionStart) ? Number(e.target.selectionStart) : state.composer.length;
      if (state.composerComposing || e.isComposing) return;
      void refreshComposerSuggest(state.composer, e.target.selectionStart);
    });
    composer.addEventListener("keydown", (e) => {
      if (state.composerComposing || e.isComposing) {
        return;
      }
      if (state.composerSuggest?.open) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          moveComposerSuggestSelection(1);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          moveComposerSuggestSelection(-1);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          commitComposerSuggestSelection();
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          closeComposerSuggest();
          render();
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (commitComposerSuggestSelection()) {
            return;
          }
        }
      }
      if (e.key === "Backspace" && !state.composer.trim() && state.composerTokens.length > 0) {
        state.composerTokens = state.composerTokens.slice(0, -1);
        state.composerCaret = 0;
        render({ keepComposerFocus: true, caret: 0 });
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        triggerSendIntent("enter").catch((err) => toast(String(err.message || err), "bad"));
      }
    });
    composer.addEventListener("paste", async (e) => {
      const imgs = Array.from(e.clipboardData?.items || []).filter((x) => x.type.startsWith("image/"));
      if (!imgs.length) return;
      e.preventDefault();
      for (const item of imgs) {
        const file = item.getAsFile();
        if (!file) continue;
        state.attachments.push(await makeAttachment(file, "screenshot"));
      }
      toast("Screenshot pasted", "ok");
      render({ keepComposerFocus: true, caret: composer.selectionStart });
    });
  }

  const threadEl = appEl.querySelector("#homeThread");
  if (threadEl) {
    threadEl.addEventListener("scroll", () => {
      const maxScrollTop = Math.max(0, threadEl.scrollHeight - threadEl.clientHeight);
      pinThreadScrollByUser(threadEl.scrollTop, maxScrollTop);
    });
  }

  const composerArea = appEl.querySelector("#composerArea");
  if (composerArea) {
    composerArea.addEventListener("dragover", (e) => e.preventDefault());
    composerArea.addEventListener("drop", async (e) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer?.files || []);
      if (!files.length) return;
      for (const file of files) {
        state.attachments.push(await makeAttachment(file, "upload"));
      }
      toast("Files attached", "ok");
      render();
    });
  }

  const ss = appEl.querySelector("input[data-bind='sidebar-search']");
  if (ss) ss.addEventListener("input", (e) => { state.sidebarSearch = e.target.value; render(); });

  const ps = appEl.querySelector("input[data-bind='page-search']");
  if (ps) ps.addEventListener("input", (e) => { state.pageSearch = e.target.value; render(); });

  const wk = appEl.querySelector("input[data-bind='workspace-label']");
  if (wk) wk.addEventListener("input", (e) => { state.workspaceForm.label = e.target.value; });

  const wkm = modalRoot.querySelector("input[data-bind='workspace-label-modal']");
  if (wkm) wkm.addEventListener("input", (e) => { state.workspaceForm.label = e.target.value; });

  const mode = modalRoot.querySelector("select[data-bind='workspace-source-mode']");
  if (mode) {
    mode.addEventListener("change", (e) => {
      state.workspaceForm.sourceMode = e.target.value;
      if (state.workspaceForm.sourceMode === "managed_workspace") {
        state.workspaceForm.sourceSummary = "managed under litecodex workspaces root";
      } else {
        state.workspaceForm.sourceSummary = "existing workspace path under controlled root";
      }
      render();
    });
  }

  const pathInput = modalRoot.querySelector("input[data-bind='workspace-path']");
  if (pathInput) pathInput.addEventListener("input", (e) => { state.workspaceForm.workspacePath = e.target.value; });

  const openFolderInput = modalRoot.querySelector("input[data-bind='open-folder-relpath']");
  if (openFolderInput) openFolderInput.addEventListener("input", (e) => { state.openFolderRelPath = e.target.value; });

  const wkConfirm = modalRoot.querySelector("input[data-bind='workspace-confirm']");
  if (wkConfirm) wkConfirm.addEventListener("change", (e) => { state.workspaceForm.confirmed = !!e.target.checked; });

  const byoInPage = appEl.querySelector("input[data-bind='byo-key']");
  if (byoInPage) byoInPage.addEventListener("input", (e) => { state.byo.key = e.target.value; });

  const byoInModal = modalRoot.querySelector("input[data-bind='byo-key']");
  if (byoInModal) byoInModal.addEventListener("input", (e) => { state.byo.key = e.target.value; });

  const autoCompact = appEl.querySelector("input[data-bind='auto-compact']");
  if (autoCompact) {
    autoCompact.addEventListener("change", async (e) => {
      const nextChecked = !!e.target.checked;
      if (!hasPersistedCurrentSession()) {
        toast("Select a persisted session first", "warn");
        render();
        return;
      }
      state.autoCompact = nextChecked;
      if (!state.contextSettings) {
        applyContextSettingsState(defaultContextSettings(), currentSessionIdForContextSettings());
      }
      state.contextSettings.auto_compact_after_task_lane = nextChecked;
      state.contextSettings.auto_compact_enabled = nextChecked;
      render();
      try {
        await patchContextSettingsForCurrentSession(
          {
            auto_compact_after_task_lane: nextChecked,
            auto_compact_enabled: nextChecked
          },
          "settings_toggle"
        );
        toast(`Auto compact ${nextChecked ? "enabled" : "disabled"}`, "ok");
      } catch (error) {
        toast(String(error?.payload?.message || error?.payload?.error || error?.message || error), "bad");
        await refreshContextSettingsForCurrentSession();
      }
      render();
    });
  }
  const thresholdBindings = [
    ["ctx-threshold-events", "event_threshold", 4, 200000],
    ["ctx-threshold-tokens", "token_threshold", 100, 2000000],
    ["ctx-threshold-stdout", "stdout_stderr_threshold", 100, 2000000],
    ["ctx-threshold-artifacts", "artifacts_threshold", 1, 200000],
    ["ctx-threshold-repair", "repair_round_threshold", 1, 256]
  ];
  for (const [bindKey, field, min, max] of thresholdBindings) {
    const input = appEl.querySelector(`input[data-bind='${bindKey}']`);
    if (!input) continue;
    input.addEventListener("input", (e) => {
      if (!state.contextSettings) {
        applyContextSettingsState(defaultContextSettings(), currentSessionIdForContextSettings());
      }
      state.contextSettings[field] = parseBoundedInt(e.target.value, state.contextSettings[field], min, max);
    });
  }
}

async function makeAttachment(file, source) {
  const buf = await file.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) bin += String.fromCharCode(b);
  return {
    id: `a_${Date.now()}_${Math.random().toString(16).slice(2, 7)}`,
    source,
    name: file.name,
    mime: file.type || "application/octet-stream",
    content: btoa(bin),
    preview: file.type?.startsWith("image/") ? URL.createObjectURL(file) : null
  };
}

async function pickWorkspaceSource() {
  if (typeof window.showDirectoryPicker !== "function") {
    toast("Directory picker not supported, use label/path fields", "warn");
    return;
  }
  try {
    const handle = await window.showDirectoryPicker();
    if (handle?.name) {
      state.workspaceForm.label = state.workspaceForm.label || handle.name;
      state.workspaceForm.sourceSummary = `picked folder name: ${handle.name} (path resolved under controlled root)`;
      state.workspaceForm.sourceMode = "managed_workspace";
      render();
    }
  } catch {
    toast("Directory picker cancelled", "warn");
  }
}

function ensureSession() {
  if (!state.currentSessionId) {
    state.modal = "session";
    return null;
  }
  if (state.draftSession && state.currentSessionId === state.draftSession.id) {
    return "draft";
  }
  return currentSession();
}

async function ensureConcreteSession(promptText) {
  let sess = ensureSession();
  if (!sess) {
    state.modal = "session";
    render();
    return null;
  }
  if (sess === "draft") {
    sess = await realizeDraft(promptText || "Session");
  }
  return sess;
}

async function realizeDraft(prompt) {
  const created = await api("/entry/sessions", {
    method: "POST",
    body: {
      title: (prompt || "Session").slice(0, 80),
      workspace_id: state.preflight?.selected_workspace?.id || null
    }
  });
  const draftId = state.draftSession.id;
  const sid = created.session.id;
  state.sessions.unshift(created.session);
  if (state.threads[draftId]) {
    state.threads[sid] = (state.threads[sid] || []).concat(state.threads[draftId]);
    delete state.threads[draftId];
    saveThreads();
  }
  if (state.classifications[draftId]) {
    state.classifications[sid] = state.classifications[draftId];
    delete state.classifications[draftId];
    saveClassifications();
  }
  state.currentSessionId = sid;
  state.draftSession = null;
  syncCurrentClassificationFromSession();
  return created.session;
}

function queuePendingSend(reason) {
  const text = String(state.composer || "").trim();
  if (!text && !state.attachments.length && state.composerTokens.length === 0) return null;
  if (state.pendingSend) return state.pendingSend;
  state.pendingSend = {
    id: `pending_${Date.now()}`,
    reason: reason || "send_intent",
    createdAt: now(),
    composer: state.composer,
    composerTokens: cloneComposerTokens(state.composerTokens),
    attachments: cloneAttachments(state.attachments),
    classification: null
  };
  return state.pendingSend;
}

function restorePendingSendSnapshot() {
  if (!state.pendingSend) return;
  state.composer = state.pendingSend.composer;
  state.composerTokens = cloneComposerTokens(state.pendingSend.composerTokens || []);
  state.attachments = cloneAttachments(state.pendingSend.attachments);
}

function isByoGateReady() {
  return state.byo.bound === true && state.byo.validation === "valid" && state.byo.ui !== "binding" && state.byo.ui !== "validating";
}

function isRunActiveStatus(status) {
  const raw = String(status || "").toLowerCase();
  return raw === "running" || raw === "pending_approval" || raw === "pausing" || raw === "resuming";
}

function isSendLockedByRunState() {
  return state.busy || state.stopRequested || state.canResume || isRunActiveStatus(state.run.status);
}

function resolveMissingGate() {
  if (!currentWorkspace()?.workspace_path) return "workspace";
  if (!state.access.granted) return "access";
  if (!isByoGateReady()) return "byo";
  if (!hasSessionGateReady()) return "session";
  return null;
}

function sortCardsByTime(cards) {
  return [...cards].sort((a, b) => {
    const ta = Date.parse(a?.at || "");
    const tb = Date.parse(b?.at || "");
    if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

function renderAttachmentSummary(attachmentNames) {
  if (!attachmentNames.length) return "";
  if (attachmentNames.length === 1) return `${attachmentNames[0]} added to current turn`;
  const preview = attachmentNames.slice(0, 3).join(", ");
  const suffix = attachmentNames.length > 3 ? ` (+${attachmentNames.length - 3} more)` : "";
  return `${attachmentNames.length} attachments added: ${preview}${suffix}`;
}

function syncThreadViewport() {
  if (state.route !== "/") return;
  const el = appEl.querySelector("#homeThread");
  if (!el) return;
  const sessionId = currentSession()?.id || "none";
  const count = sessionId === "none" ? 0 : thread(sessionId).length;
  const nextKey = `${sessionId}:${count}`;
  const changed = state.threadRenderKey !== nextKey;
  const shouldAnchor = state.threadAnchor === "bottom" || (changed && !state.threadScrollPinnedByUser);
  state.threadRenderKey = nextKey;
  if (!shouldAnchor) return;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
  state.threadAnchor = "bottom";
}

function closeImagePreviewIfMissing() {
  if (!state.imagePreview) return;
  if (!state.attachments.some((x) => x.id === state.imagePreview.id)) {
    state.imagePreview = null;
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "readonly");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  ta.style.pointerEvents = "none";
  document.body.appendChild(ta);
  safeFocusWithoutScroll(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return fallbackCopyText(text);
  }
}

async function requestOpenFolder(projectId, relPath = null) {
  const out = await api("/api/host/open-folder", {
    method: "POST",
    body: {
      projectId,
      relPath
    }
  });
  return {
    ok: out?.ok === true && out?.accepted === true,
    workspacePath: typeof out?.host_action?.target_path === "string" ? out.host_action.target_path : null
  };
}

async function openWorkspaceFolder(relPath = null) {
  const workspace = currentWorkspace();
  if (!workspace?.id) {
    toast("No workspace selected", "warn");
    return;
  }
  const normalizedRelPath = typeof relPath === "string" && relPath.trim() ? relPath.trim() : null;
  try {
    const result = await requestOpenFolder(workspace.id, normalizedRelPath);
    if (result.ok) {
      log("workspace_action", {
        action: "open_folder",
        ok: true,
        workspace_path: result.workspacePath,
        rel_path: normalizedRelPath
      });
      toast(normalizedRelPath ? `Folder opened: ${normalizedRelPath}` : "Workspace folder opened on host", "ok");
      return;
    }
  } catch (error) {
    log("workspace_action", {
      action: "open_folder",
      ok: false,
      workspace_path: workspace.workspace_path,
      rel_path: normalizedRelPath,
      error: String(error?.message || error)
    });
  }
  toast("Open folder failed in host boundary", "bad");
}

async function copyWorkspacePath() {
  const p = currentWorkspace()?.workspace_path;
  if (!p) {
    toast("No workspace path", "warn");
    return;
  }
  const ok = await copyText(p);
  if (ok) {
    log("workspace_action", { action: "copy_path", ok: true, workspace_path: p });
    toast("Workspace path copied to clipboard", "ok");
    return;
  }
  log("workspace_action", { action: "copy_path", ok: false, workspace_path: p, reason: "clipboard_unavailable" });
  toast("Clipboard unavailable", "warn");
}

async function ingestCurrentAttachments(sessionId) {
  const attachmentNames = [];
  for (const a of state.attachments) {
    const base = `/entry/sessions/${encodeURIComponent(sessionId)}/attachments`;
    const data = a.source === "upload"
      ? await api(`${base}/upload`, { method: "POST", body: { file_name: a.name, mime_type: a.mime, content_base64: a.content } })
      : a.source === "paste"
        ? await api(`${base}/paste`, { method: "POST", body: { file_name: a.name, mime_type: "text/plain", text: a.text || "" } })
        : await api(`${base}/screenshot`, { method: "POST", body: { file_name: a.name, mime_type: a.mime || "image/png", content_base64: a.content } });
    attachmentNames.push(a.name);
    log("attachment_ingested", data);
  }
  if (attachmentNames.length > 0) {
    appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.ATTACHMENT_ADDED, renderAttachmentSummary(attachmentNames), {
      source: "attachment_ingest"
    });
    appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.TASK_PROGRESS, "Image and text included in current context", {
      source: "attachment_ingest"
    });
  }
}

function openWorkspaceModal() {
  state.modal = "workspace";
  render();
}

function closeModal() {
  state.modal = null;
  render();
}

function openByoModal() {
  state.modal = "byo";
  render();
}

function openAccessModal() {
  state.modal = "access";
  render();
}

function openSessionModal() {
  state.modal = "session";
  render();
}

function openHomeSession(sessionId) {
  state.currentSessionId = sessionId;
  syncCurrentClassificationFromSession();
  markThreadAnchorBottom(true);
  route("/");
}

function closeModalAndContinuePendingSend(trigger) {
  state.modal = null;
  render();
  return continuePendingSend(trigger);
}

function appendHomeThreadSystemMessage(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.TASK_PROGRESS, body);
}

function appendHomeThreadAuthMessage(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.AUTH_REQUIRED, body);
}

function appendHomeThreadErrorMessage(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.RECOVERY_SUMMARY, body);
}

function appendHomeThreadFinalAnswer(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.ASSISTANT_REPLY, body);
}

function appendHomeThreadUserMessage(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.USER_MESSAGE, body);
}

function appendHomeThreadPlan(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.TASK_PROGRESS, body);
}

function appendHomeThreadVerify(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.VERIFY_SUMMARY, body);
}

function appendHomeThreadDeploy(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.DEPLOY_SUMMARY, body);
}

function appendHomeThreadAttachment(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.ATTACHMENT_ADDED, body);
}

function appendHomeThreadExecution(sessionId, body) {
  return appendDisplayEvent(sessionId, DISPLAY_EVENT_TYPES.TASK_PROGRESS, body);
}

function openSettingsRoute() {
  route("/settings");
}

function openSessionsRoute() {
  route("/sessions");
}

function openHomeRoute() {
  route("/");
}

function normalizeCardsForDisplay(cards) {
  return sortCardsByTime(cards)
    .map((card) => normalizeStoredCard(card))
    .filter(Boolean);
}

function currentSessionRunIds(sessionId) {
  const ids = [];
  const fromTurns = Array.isArray(state.sessionRunIds?.[sessionId]) ? state.sessionRunIds[sessionId] : [];
  for (const id of fromTurns) {
    const runId = String(id || "").trim();
    if (runId && !ids.includes(runId)) ids.push(runId);
  }
  const session = sessionId ? [...state.sessions, ...(state.draftSession ? [state.draftSession] : [])].find((x) => x.id === sessionId) : null;
  const activeRunId = String(session?.run_id || "").trim();
  if (activeRunId && !ids.includes(activeRunId)) ids.push(activeRunId);
  return ids;
}

function ensureSessionRunLink(sessionId, runId) {
  const sid = String(sessionId || "").trim();
  const rid = String(runId || "").trim();
  if (!sid || !rid) return;
  if (!Array.isArray(state.sessionRunIds[sid])) {
    state.sessionRunIds[sid] = [];
  }
  if (!state.sessionRunIds[sid].includes(rid)) {
    state.sessionRunIds[sid].push(rid);
  }
}

function ensureRuntimeRunContainer(runId) {
  const rid = String(runId || "").trim();
  if (!rid) return null;
  if (!state.runtimeRuns[rid] || typeof state.runtimeRuns[rid] !== "object") {
    state.runtimeRuns[rid] = {
      run: { id: rid, status: "running" },
      events: [],
      display_events: [],
      file_changes: []
    };
  }
  if (!Array.isArray(state.runtimeRuns[rid].events)) {
    state.runtimeRuns[rid].events = [];
  }
  return state.runtimeRuns[rid];
}

function normalizeRuntimeStreamEvent(raw) {
  if (!raw || typeof raw !== "object") return null;
  const seq = Number(raw.seq || 0);
  if (!Number.isFinite(seq) || seq <= 0) return null;
  const payload = raw.payload && typeof raw.payload === "object" ? raw.payload : {};
  const type = String(raw.type || raw.kind || "").trim();
  const timestamp = String(raw.timestamp || raw.ts || raw.created_at || now());
  return {
    ...raw,
    seq,
    type,
    kind: String(raw.kind || type),
    event_id: String(raw.event_id || raw.id || ""),
    id: String(raw.id || raw.event_id || ""),
    timestamp,
    ts: timestamp,
    created_at: String(raw.created_at || timestamp),
    payload
  };
}

function scheduleRuntimeStreamRender() {
  if (state.runtimeStreamRenderQueued) return;
  state.runtimeStreamRenderQueued = true;
  requestAnimationFrame(() => {
    state.runtimeStreamRenderQueued = false;
    render();
  });
}

function appendRuntimeStreamEvent(sessionId, runId, rawEvent) {
  const event = normalizeRuntimeStreamEvent(rawEvent);
  if (!event) return false;
  const streamRunId = String(runId || "").trim();
  const eventRunId = String(event.run_id || "").trim();
  if (streamRunId && eventRunId && streamRunId !== eventRunId) {
    log("runtime_stream_run_mismatch", {
      stream_run_id: streamRunId,
      event_run_id: eventRunId,
      seq: Number(event.seq || 0),
      type: String(event.type || event.kind || "")
    });
    return false;
  }
  const rid = String(eventRunId || streamRunId || "").trim();
  if (!rid) return false;
  const cursor = Number(state.runEventCursor[rid] || 0);
  if (event.seq <= cursor) return false;
  const runData = ensureRuntimeRunContainer(rid);
  if (!runData) return false;
  runData.events.push(event);
  runData.events.sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0));
  state.runEventCursor[rid] = event.seq;
  if (runData.run && typeof runData.run === "object") {
    runData.run.status = String(runData.run.status || state.run.status || "running");
  } else {
    runData.run = { id: rid, status: String(state.run.status || "running") };
  }
  ensureSessionRunLink(sessionId, rid);
  if (state.runtimeStream.startedAtMs && state.runtimeStream.firstRuntimeEventMs === null) {
    state.runtimeStream.firstRuntimeEventMs = Math.max(0, Date.now() - Number(state.runtimeStream.startedAtMs || Date.now()));
    state.runtimeStream.firstRuntimeEventAt = now();
    log("runtime_stream_first_event", {
      run_id: rid,
      first_runtime_event_ms: state.runtimeStream.firstRuntimeEventMs,
      first_event_seq: event.seq,
      first_event_type: event.type
    });
  }
  return true;
}

function closeRuntimeEventStream(runId = null) {
  const active = state.runtimeStream;
  if (!active || typeof active !== "object") return;
  if (runId && String(active.runId || "") !== String(runId || "")) return;
  if (active.retryTimer) {
    clearTimeout(active.retryTimer);
  }
  if (active.source && typeof active.source.close === "function") {
    try {
      active.source.close();
    } catch {
      // no-op
    }
  }
  state.runtimeStream = {
    runId: null,
    sessionId: null,
    source: null,
    retryTimer: null,
    startedAtMs: null,
    firstRuntimeEventMs: null,
    firstRuntimeEventAt: null
  };
}

function startRuntimeEventStream(sessionId, runId) {
  if (typeof EventSource !== "function") return false;
  const rid = String(runId || "").trim();
  const sid = String(sessionId || "").trim();
  if (!rid) return false;
  if (state.runtimeStream?.runId === rid && state.runtimeStream?.source) {
    return true;
  }
  closeRuntimeEventStream();
  const sinceSeq = Number(state.runEventCursor[rid] || 0);
  const source = new EventSource(`/events?run_id=${encodeURIComponent(rid)}&since_seq=${encodeURIComponent(String(sinceSeq))}`);
  state.runtimeStream = {
    runId: rid,
    sessionId: sid || null,
    source,
    retryTimer: null,
    startedAtMs: Date.now(),
    firstRuntimeEventMs: null,
    firstRuntimeEventAt: null
  };
  const consume = (data, transport = "message") => {
    if (typeof data !== "string" || !data.trim()) return;
    let parsed = null;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    const appended = appendRuntimeStreamEvent(sid, rid, parsed);
    if (appended) {
      log("runtime_stream_event", {
        run_id: rid,
        seq: Number(parsed?.seq || 0),
        type: String(parsed?.type || parsed?.kind || ""),
        transport
      });
      scheduleRuntimeStreamRender();
    }
  };
  source.addEventListener("replay", (evt) => consume(evt.data, "replay"));
  source.onmessage = (evt) => consume(evt.data, "message");
  source.addEventListener("connected", (evt) => {
    consume(evt.data, "connected");
  });
  source.onerror = () => {
    if (String(state.runtimeStream?.runId || "") !== rid) return;
    const shouldRetry = isRunActiveStatus(state.run.status);
    if (state.runtimeStream?.source && typeof state.runtimeStream.source.close === "function") {
      try {
        state.runtimeStream.source.close();
      } catch {
        // no-op
      }
    }
    state.runtimeStream.source = null;
    if (!shouldRetry) return;
    const retryTimer = setTimeout(() => {
      if (String(state.runtimeStream?.runId || "") !== rid || !isRunActiveStatus(state.run.status)) return;
      startRuntimeEventStream(sid, rid);
    }, 1000);
    state.runtimeStream.retryTimer = retryTimer;
  };
  return true;
}

function runtimeSortValue(card) {
  const seq = Number(card?.seq || 0);
  const ts = Date.parse(String(card?.at || ""));
  return {
    seq: Number.isFinite(seq) ? seq : 0,
    ts: Number.isFinite(ts) ? ts : 0
  };
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function normalizeRuntimeFieldText(value, field = "") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (lower === "-" || lower === "--" || lower === "unknown" || lower === "none" || lower === "null" || lower === "undefined") {
    return "";
  }
  if (field === "command" && (lower === "command" || lower === "cmd")) {
    return "";
  }
  if (field === "shell" && lower === "shell") {
    return "";
  }
  if (field === "cwd" && lower === "cwd") {
    return "";
  }
  return raw;
}

function firstMeaningfulRuntimeField(field, ...values) {
  for (const value of values) {
    const normalized = normalizeRuntimeFieldText(value, field);
    if (normalized) {
      return normalized;
    }
  }
  return "";
}

function normalizeRuntimeArtifactId(value) {
  const raw = firstNonEmptyString(value);
  return raw || "none";
}

function runtimeCardCollapseKey(card) {
  if (!(card && typeof card === "object")) return "";
  const runId = firstNonEmptyString(card.run_id, card.runId);
  const eventId = firstNonEmptyString(card.event_id, card.eventId, card.id);
  const artifactId = normalizeRuntimeArtifactId(card.artifact_id || card.artifact_ref);
  if (!runId || !eventId) {
    return firstNonEmptyString(card.id);
  }
  return `${runId}::${eventId}::${artifactId}`;
}

function ensureRuntimeCommandCard(runId, event, payload, commandCards) {
  const commandText = firstMeaningfulRuntimeField(
    "command",
    event?.command,
    payload?.command,
    payload?.command_summary,
    payload?.failed_command,
    payload?.adjusted_command
  );
  const stage = Number(payload?.stage_index || 0);
  const attempt = Number(payload?.attempt || 0);
  const taskId = String(payload?.task_id || payload?.taskId || "");
  const stepId = String(event?.step_id || payload?.step_id || "");
  const key = `${runId}|${stepId}|${taskId}|a${attempt}|s${stage}|${commandText}`;
  if (!commandCards.has(key)) {
    commandCards.set(key, {
      id: `cmd_${key}`,
      kind: "command",
      run_id: runId,
      event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${event?.seq || 0}`),
      artifact_id: normalizeRuntimeArtifactId(event?.artifact_ref || payload?.artifact_ref || payload?.artifact_id),
      title: commandText || "Command Event",
      status: String(event?.status || payload?.status || "running"),
      lane: String(event?.lane || "task"),
      at: String(event?.timestamp || event?.ts || event?.created_at || now()),
      seq: Number(event?.seq || 0),
      command: commandText,
      cwd: firstMeaningfulRuntimeField("cwd", event?.cwd, payload?.cwd, payload?.adjusted_cwd),
      shell: firstMeaningfulRuntimeField("shell", event?.shell, payload?.shell, payload?.shell_type),
      exit_code: Number.isFinite(Number(event?.exitCode))
        ? Number(event.exitCode)
        : Number.isFinite(Number(payload?.exit_code))
          ? Number(payload.exit_code)
          : null,
      duration_ms: Number.isFinite(Number(event?.durationMs))
        ? Number(event.durationMs)
        : Number.isFinite(Number(payload?.duration_ms))
          ? Number(payload.duration_ms)
          : null,
      stdout: firstNonEmptyString(event?.stdout, payload?.stdout, payload?.stdout_text, payload?.stdout_summary),
      stderr: firstNonEmptyString(event?.stderr, payload?.stderr, payload?.stderr_text, payload?.stderr_summary, payload?.failure_summary),
      artifact_ref: event?.artifact_ref || payload?.artifact_ref || null,
      started_at: firstNonEmptyString(event?.startedAt, payload?.started_at, payload?.startedAt),
      finished_at: firstNonEmptyString(event?.finishedAt, payload?.finished_at, payload?.finishedAt, payload?.completed_at, payload?.completedAt),
      defaultCollapsed: true
    });
  }
  return commandCards.get(key);
}

const COMMAND_EVENT_KINDS = new Set([
  "command.started",
  "command.stdout.chunk",
  "command.stderr.chunk",
  "command.completed",
  "shell.command.started",
  "shell.command.completed",
  "runtime.sandbox.command.started",
  "runtime.sandbox.command.completed",
  "deploy.command.started",
  "deploy.command.completed",
  "replay.command.started",
  "replay.command.completed",
  "node.command.started",
  "node.command.completed"
]);

function normalizeDiffHunks(hunks) {
  if (!Array.isArray(hunks)) return [];
  return hunks
    .map((hunk) => {
      const header = String(hunk?.header || "@@ @@");
      const lines = Array.isArray(hunk?.lines)
        ? hunk.lines
            .map((line) => {
              if (line && typeof line === "object" && typeof line.sign === "string") {
                return { sign: line.sign === "-" ? "-" : line.sign === "+" ? "+" : " ", text: String(line.text || "") };
              }
              const raw = String(line || "");
              const sign = raw.startsWith("-") ? "-" : raw.startsWith("+") ? "+" : " ";
              return { sign, text: raw.replace(/^[-+ ]/, "") };
            })
            .filter(Boolean)
        : [];
      return { header, lines };
    })
    .filter((hunk) => hunk.lines.length > 0);
}

function clearThinkingPending(thinkingPending, lane = "") {
  const laneText = String(lane || "").trim();
  for (const [thinkingId, card] of thinkingPending.entries()) {
    if (!laneText || !card?.lane || card.lane === laneText) {
      thinkingPending.delete(thinkingId);
    }
  }
}

function validateRuntimeCommandCard(card) {
  const missing = [];
  const command = firstMeaningfulRuntimeField("command", card?.command);
  const cwd = firstMeaningfulRuntimeField("cwd", card?.cwd);
  const shell = firstMeaningfulRuntimeField("shell", card?.shell);
  if (!command) missing.push("command");
  if (!cwd) missing.push("cwd");
  if (!shell) missing.push("shell");
  const status = String(card?.status || "").toLowerCase();
  const terminal = status === "completed" || status === "failed" || status === "blocked" || status === "cancelled";
  if (terminal) {
    if (!firstNonEmptyString(card?.started_at)) missing.push("startedAt");
    if (!firstNonEmptyString(card?.finished_at)) missing.push("finishedAt");
    if (!Number.isFinite(Number(card?.duration_ms))) missing.push("durationMs");
    if (!Number.isFinite(Number(card?.exit_code))) missing.push("exitCode");
    if (typeof card?.stdout !== "string") missing.push("stdout");
    if (typeof card?.stderr !== "string") missing.push("stderr");
  }
  return {
    valid: missing.length === 0,
    missing
  };
}

function runtimeInvalidPayloadCard(runId, seq, at, lane, sourceType, missing = []) {
  return {
    id: `invalid_payload_${runId}_${seq}_${missing.join("_")}`,
    kind: "failure",
    run_id: runId,
    event_id: `${runId}:${seq}:event_payload_invalid`,
    artifact_id: "none",
    title: "Event Payload Invalid",
    status: "failed",
    lane: lane || "system",
    at: at || now(),
    seq: Number(seq || 0),
    body: `event_payload_invalid: ${String(sourceType || "command_event")} missing ${missing.join(", ")}`,
    defaultCollapsed: false
  };
}

function buildRuntimeCardsForRun(runId, runData) {
  const events = Array.isArray(runData?.events) ? [...runData.events] : [];
  if (!events.length) return [];
  events.sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0));
  const cards = [];
  const commandCards = new Map();
  const verifyCards = new Map();
  const compactionCards = new Map();
  const thinkingPending = new Map();
  const seenDiffPaths = new Set();

  const ensureCompactionCard = (compactKey, defaults = {}) => {
    const key = String(compactKey || "").trim();
    if (!key) return null;
    if (!compactionCards.has(key)) {
      compactionCards.set(key, {
        id: `context_compaction_${runId}_${key}`,
        kind: "context-compaction",
        run_id: runId,
        event_id: `${runId}:${key}`,
        artifact_id: "none",
        title: "Automatically compacting context",
        status: "running",
        lane: "task",
        at: now(),
        seq: Number.MAX_SAFE_INTEGER - 200,
        trigger_type: "auto",
        reason: null,
        snapshot_id: null,
        context_compaction_id: key,
        receipt_id: null,
        error_code: null,
        error_message: null,
        fallback_status: null,
        source_event_range: null,
        quality_checks: null,
        manual: false,
        consumed: false,
        defaultCollapsed: false,
        ...defaults
      });
    }
    return compactionCards.get(key);
  };

  for (const event of events) {
    const kind = String(event?.kind || event?.type || "").trim();
    const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
    const seq = Number(event?.seq || 0);
    const at = String(event?.timestamp || event?.ts || event?.created_at || now());
    const lane = String(event?.lane || payload?.lane || "task");

    if (kind === "thinking.started") {
      const thinkingId = String(payload?.thinking_id || event?.event_id || `${runId}:${seq}`);
      thinkingPending.set(thinkingId, {
        id: `thinking_${thinkingId}`,
        kind: "thinking",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: "none",
        title: "Thinking",
        status: "running",
        lane,
        at,
        seq,
        phase: String(payload?.phase || lane || "task"),
        defaultCollapsed: false
      });
      continue;
    }
    if (kind === "thinking.completed") {
      const thinkingId = String(payload?.thinking_id || "");
      if (thinkingId && thinkingPending.has(thinkingId)) {
        thinkingPending.delete(thinkingId);
      } else {
        const completedPhase = String(payload?.phase || "");
        for (const [id, card] of thinkingPending.entries()) {
          if (!completedPhase || card.phase === completedPhase) {
            thinkingPending.delete(id);
          }
        }
      }
      continue;
    }

    if (kind.startsWith("context.compaction.")) {
      const manualRequested =
        payload?.manual === true ||
        /manual/i.test(String(payload?.trigger_type || "")) ||
        /manual/i.test(String(payload?.requested_by || ""));
      if (kind === "context.compaction.skipped" && !manualRequested) {
        continue;
      }
      const compactKey = String(
        payload?.context_compaction_id || payload?.snapshot_id || payload?.idempotency_key || `${runId}:${seq}`
      );
      const card = ensureCompactionCard(compactKey, {
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        at,
        seq,
        trigger_type: String(payload?.trigger_type || "auto"),
        reason: firstNonEmptyString(payload?.reason),
        manual: manualRequested
      });
      if (!card) continue;
      card.at = at;
      card.seq = Math.min(Number(card.seq || seq), seq);
      card.trigger_type = String(payload?.trigger_type || card.trigger_type || "auto");
      card.reason = firstNonEmptyString(payload?.reason, card.reason);
      card.snapshot_id = firstNonEmptyString(payload?.snapshot_id, card.snapshot_id);
      card.context_compaction_id = firstNonEmptyString(payload?.context_compaction_id, card.context_compaction_id, compactKey);
      card.source_event_range =
        payload?.source_event_range && typeof payload.source_event_range === "object"
          ? payload.source_event_range
          : card.source_event_range;
      card.quality_checks =
        payload?.quality_checks && typeof payload.quality_checks === "object" ? payload.quality_checks : card.quality_checks;
      card.error_code = firstNonEmptyString(payload?.error_code, card.error_code);
      card.error_message = firstNonEmptyString(payload?.error_message, card.error_message);
      card.fallback_status = firstNonEmptyString(payload?.fallback_status, card.fallback_status);
      card.manual = manualRequested || card.manual;

      if (kind === "context.compaction.started") {
        card.title = "Automatically compacting context";
        card.status = "running";
      } else if (kind === "context.compaction.completed") {
        card.title = "Context automatically compacted";
        card.status = "completed";
      } else if (kind === "context.compaction.failed") {
        card.title = "Context compaction failed";
        card.status = "failed";
      } else if (kind === "context.compaction.skipped") {
        card.title = "Context compaction skipped";
        card.status = "skipped";
      } else if (kind === "context.compaction.consumed") {
        card.consumed = true;
        card.status = card.status === "running" ? "completed" : card.status;
      }
      continue;
    }

    if (kind === "run.context.receipt.available") {
      const snapshotId = firstNonEmptyString(payload?.consumed_snapshot_id);
      const receiptId = firstNonEmptyString(payload?.receipt_id);
      if (snapshotId) {
        for (const card of compactionCards.values()) {
          if (String(card.snapshot_id || "") === snapshotId) {
            card.receipt_id = receiptId || card.receipt_id;
            card.consumed = true;
            if (card.status === "running") {
              card.status = "completed";
            }
          }
        }
      }
      continue;
    }

    if (kind === "entry.task.plan.available" || kind === "model.action.plan.available") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `plan_${runId}_${seq}`,
        kind: "plan",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: kind === "model.action.plan.available" ? "Model Action Plan" : "Plan",
        status: String(payload?.status || "completed"),
        lane,
        at,
        seq,
        plan:
          payload?.plan && typeof payload.plan === "object"
            ? payload.plan
            : kind === "model.action.plan.available"
              ? {
                  task_type: "model_action_contract",
                  risk_level: "guarded",
                  requires_auth: false,
                  requires_deploy: false,
                  verification_strategy: "action -> resolver -> policy -> executor",
                  affected_files: []
                }
              : {},
        actions_count: Number(payload?.actions_count || 0),
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "entry.task.file.locate.completed") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `locate_${runId}_${seq}`,
        kind: "file-locate",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "File Locate",
        status: String(payload?.status || "completed"),
        lane,
        at,
        seq,
        target_files: Array.isArray(payload?.target_files) ? payload.target_files : [],
        missing_targets: Array.isArray(payload?.missing_targets) ? payload.missing_targets : [],
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "entry.task.verify.resolver.selected") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `verify_resolver_${runId}_${seq}`,
        kind: "verify-resolver",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Verify Resolver",
        status: String(payload?.status || "completed"),
        lane,
        at,
        seq,
        language: String(payload?.language || "unknown"),
        selected_command: firstNonEmptyString(payload?.selected_command),
        fallback_used: payload?.fallback_used === true,
        tool_missing: payload?.tool_missing === true,
        dry_run_detected: payload?.dry_run_detected === true,
        coverage_summary: payload?.coverage_summary && typeof payload.coverage_summary === "object" ? payload.coverage_summary : null,
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "command.resolved") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `command_resolved_${runId}_${seq}`,
        kind: "diagnosis",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Resolved Command",
        status: String(payload?.status || "completed"),
        lane,
        at,
        seq,
        message: `action -> resolver -> policy -> executor`,
        command: firstNonEmptyString(payload?.command),
        exit_code: null,
        stdout: "",
        stderr: firstNonEmptyString(payload?.policy_reason),
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "command.proposed") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `command_proposed_${runId}_${seq}`,
        kind: "diagnosis",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Command Proposed",
        status: String(payload?.status || "proposed"),
        lane,
        at,
        seq,
        message: "command proposal waiting execution",
        command: firstMeaningfulRuntimeField("command", event?.command, payload?.command, payload?.command_summary),
        exit_code: null,
        stdout: "",
        stderr: "",
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "toolchain.missing") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `toolchain_missing_${runId}_${seq}`,
        kind: "failure",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Toolchain Missing",
        status: String(payload?.status || "failed"),
        lane,
        at,
        seq,
        body: `tool=${firstNonEmptyString(payload?.tool, "unknown")} approval_required=${payload?.requires_approval === true ? "true" : "false"}`,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "diagnosis.note" || kind === "agent.note" || kind === "repair.note") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `diagnosis_${runId}_${seq}`,
        kind: "diagnosis",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: kind === "agent.note" ? "Agent Note" : kind === "repair.note" ? "Repair Note" : "Diagnosis",
        status: String(payload?.status || (kind === "agent.note" ? "running" : "completed")),
        lane,
        at,
        seq,
        message: firstNonEmptyString(payload?.message, payload?.reason, payload?.failure_summary),
        command: firstNonEmptyString(payload?.command),
        exit_code: Number.isFinite(Number(payload?.exit_code)) ? Number(payload.exit_code) : null,
        stdout: firstNonEmptyString(payload?.stdout, payload?.stdout_summary),
        stderr: firstNonEmptyString(payload?.stderr, payload?.stderr_summary, payload?.failure_summary),
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "repair.loop.available") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `repair_loop_${runId}_${seq}`,
        kind: "repair-loop",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Repair Rounds",
        status: String(payload?.status || "completed"),
        lane,
        at,
        seq,
        rounds: Number(payload?.rounds || 0),
        attempts_used: Number(payload?.attempts_used || 0),
        repair_started_count: Number(payload?.repair_started_count || 0),
        repair_completed_count: Number(payload?.repair_completed_count || 0),
        consumed_failure_events: payload?.consumed_failure_events === true,
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "deploy.authorization.required") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `deploy_gate_${runId}_${seq}`,
        kind: "deploy-gate",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Deploy Authorization",
        status: String(payload?.status || "waiting_user"),
        lane,
        at,
        seq,
        mode: String(payload?.mode || "dry_run"),
        provider: String(payload?.provider || "generic"),
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "user.message") {
      const message = firstNonEmptyString(payload?.message, payload?.raw_text, payload?.prompt, payload?.prompt_text);
      if (!message) {
        continue;
      }
      cards.push({
        id: `user_${runId}_${seq}`,
        kind: "user",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: "none",
        title: "User",
        status: "completed",
        lane: "chat",
        at,
        seq,
        body: message,
        defaultCollapsed: false
      });
      continue;
    }

    if (
      (kind === "step.completed" || kind === "assistant.reply" || kind === "assistant.message") &&
      firstNonEmptyString(payload?.message, payload?.summary, payload?.answer, payload?.final_answer, payload?.final_summary)
    ) {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `assistant_${runId}_${seq}`,
        kind: "assistant",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(event?.artifact_ref || payload?.artifact_ref),
        title: "Assistant",
        status: "completed",
        lane,
        at,
        seq,
        body: firstNonEmptyString(payload?.message, payload?.summary, payload?.answer, payload?.final_answer, payload?.final_summary),
        defaultCollapsed: false
      });
      continue;
    }

    if (COMMAND_EVENT_KINDS.has(kind)) {
      clearThinkingPending(thinkingPending, lane);
      const card = ensureRuntimeCommandCard(runId, event, payload, commandCards);
      card.seq = Math.min(Number(card.seq || seq), seq);
      card.run_id = firstNonEmptyString(card.run_id, runId);
      card.event_id = firstNonEmptyString(card.event_id, event?.event_id, event?.id, `${runId}:${seq}`);
      card.source_type = kind;
      card.artifact_id = normalizeRuntimeArtifactId(card.artifact_id || event?.artifact_ref || payload?.artifact_ref || payload?.artifact_id);
      if (
        kind === "command.started" ||
        kind === "shell.command.started" ||
        kind === "runtime.sandbox.command.started" ||
        kind === "deploy.command.started" ||
        kind === "replay.command.started" ||
        kind === "node.command.started"
      ) {
        card.status = String(event?.status || payload?.status || "running");
        card.command = firstMeaningfulRuntimeField(
          "command",
          event?.command,
          payload?.command,
          payload?.command_summary,
          payload?.failed_command,
          payload?.adjusted_command,
          card.command
        );
        card.cwd = firstMeaningfulRuntimeField("cwd", event?.cwd, payload?.cwd, payload?.adjusted_cwd, card.cwd);
        card.shell = firstMeaningfulRuntimeField("shell", event?.shell, payload?.shell, payload?.shell_type, card.shell);
        card.started_at = firstNonEmptyString(event?.startedAt, payload?.started_at, payload?.startedAt, card.started_at);
      } else if (kind === "command.stdout.chunk" || kind === "command.stderr.chunk") {
        const streamByType = kind === "command.stderr.chunk" ? "stderr" : "stdout";
        const stream = String(payload?.stream || streamByType).toLowerCase() === "stderr" ? "stderr" : "stdout";
        const chunk = firstNonEmptyString(payload?.chunk, event?.stdout, event?.stderr);
        if (chunk) {
          card[stream] = `${card[stream] || ""}${chunk}`;
        }
      } else if (
        kind === "command.completed" ||
        kind === "shell.command.completed" ||
        kind === "runtime.sandbox.command.completed" ||
        kind === "deploy.command.completed" ||
        kind === "replay.command.completed" ||
        kind === "node.command.completed"
      ) {
        card.status = String(event?.status || payload?.status || "completed");
        card.command = firstMeaningfulRuntimeField(
          "command",
          event?.command,
          payload?.command,
          payload?.command_summary,
          payload?.failed_command,
          payload?.adjusted_command,
          card.command
        );
        card.cwd = firstMeaningfulRuntimeField("cwd", event?.cwd, payload?.cwd, payload?.adjusted_cwd, card.cwd);
        card.shell = firstMeaningfulRuntimeField("shell", event?.shell, payload?.shell, payload?.shell_type, card.shell);
        if (Number.isFinite(Number(event?.exitCode))) {
          card.exit_code = Number(event.exitCode);
        } else if (Number.isFinite(Number(payload?.exit_code))) {
          card.exit_code = Number(payload.exit_code);
        }
        if (Number.isFinite(Number(event?.durationMs))) {
          card.duration_ms = Number(event.durationMs);
        } else if (Number.isFinite(Number(payload?.duration_ms))) {
          card.duration_ms = Number(payload.duration_ms);
        }
        card.started_at = firstNonEmptyString(event?.startedAt, payload?.started_at, payload?.startedAt, card.started_at);
        card.artifact_ref = event?.artifact_ref || payload?.artifact_ref || card.artifact_ref || null;
        card.artifact_id = normalizeRuntimeArtifactId(card.artifact_ref || card.artifact_id);
        card.finished_at = firstNonEmptyString(
          event?.finishedAt,
          payload?.finished_at,
          payload?.finishedAt,
          payload?.completed_at,
          payload?.completedAt,
          card.finished_at
        );
        if (!card.stdout && typeof event?.stdout === "string") {
          card.stdout = event.stdout;
        } else if (!card.stdout && typeof payload?.stdout === "string") {
          card.stdout = payload.stdout;
        } else if (!card.stdout && typeof payload?.stdout_summary === "string") {
          card.stdout = payload.stdout_summary;
        }
        if (!card.stderr && typeof event?.stderr === "string") {
          card.stderr = event.stderr;
        } else if (!card.stderr && typeof payload?.stderr === "string") {
          card.stderr = payload.stderr;
        } else if (!card.stderr && typeof payload?.stderr_summary === "string") {
          card.stderr = payload.stderr_summary;
        }
      }
      continue;
    }

    if (
      kind === "verify.started" ||
      kind === "verify.failed" ||
      kind === "verify.passed" ||
      kind === "verify.completed" ||
      kind === "engineering.verify.started" ||
      kind === "engineering.verify.failed" ||
      kind === "engineering.verify.completed"
    ) {
      clearThinkingPending(thinkingPending, lane);
      const commandText = firstNonEmptyString(event?.command, payload?.command, payload?.command_summary);
      const stage = Number(payload?.stage_index || 0);
      const attempt = Number(payload?.attempt || 0);
      const key = `${runId}|${event?.step_id || payload?.step_id || ""}|a${attempt}|s${stage}|${commandText}`;
      if (!verifyCards.has(key)) {
        verifyCards.set(key, {
          id: `verify_${key}`,
          kind: "verify",
          run_id: runId,
          event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
          artifact_id: normalizeRuntimeArtifactId(event?.artifact_ref || payload?.artifact_ref || payload?.artifact_id),
          title: "Verify",
          status: "running",
          lane,
          at,
          seq,
          command: commandText,
          reason: "",
          cwd: firstNonEmptyString(event?.cwd, payload?.cwd),
          exit_code: Number.isFinite(Number(event?.exitCode))
            ? Number(event.exitCode)
            : Number.isFinite(Number(payload?.exit_code))
              ? Number(payload.exit_code)
              : null,
          duration_ms: Number.isFinite(Number(event?.durationMs))
            ? Number(event.durationMs)
            : Number.isFinite(Number(payload?.duration_ms))
              ? Number(payload.duration_ms)
              : null,
          stdout: firstNonEmptyString(event?.stdout, payload?.stdout, payload?.stdout_text, payload?.stdout_summary),
          stderr: firstNonEmptyString(event?.stderr, payload?.stderr, payload?.stderr_text, payload?.stderr_summary, payload?.failure_summary),
          artifact_ref: event?.artifact_ref || payload?.artifact_ref || null,
          defaultCollapsed: true
        });
      }
      const verify = verifyCards.get(key);
      verify.run_id = firstNonEmptyString(verify.run_id, runId);
      verify.event_id = firstNonEmptyString(verify.event_id, event?.event_id, event?.id, `${runId}:${seq}`);
      const payloadStatus = String(payload?.status || "").toLowerCase();
      const exitCode = Number(payload?.exit_code);
      if (kind === "verify.failed" || kind === "engineering.verify.failed") {
        verify.status = "failed";
        verify.reason = String(payload?.reason || payload?.failure_summary || "");
      } else if (kind === "verify.passed" || kind === "verify.completed") {
        verify.status = "completed";
      } else if (kind === "engineering.verify.completed") {
        verify.status = payloadStatus === "failed" || (Number.isFinite(exitCode) && exitCode !== 0) ? "failed" : "completed";
        if (verify.status === "failed" && !verify.reason) {
          verify.reason = String(payload?.failure_summary || payload?.stderr_summary || "verify_failed");
        }
      } else {
        verify.status = "running";
      }
      verify.command = firstNonEmptyString(verify.command, event?.command, payload?.command, payload?.command_summary);
      verify.cwd = firstNonEmptyString(verify.cwd, event?.cwd, payload?.cwd);
      if (Number.isFinite(Number(event?.exitCode))) {
        verify.exit_code = Number(event.exitCode);
      } else if (Number.isFinite(Number(payload?.exit_code))) {
        verify.exit_code = Number(payload.exit_code);
      }
      if (Number.isFinite(Number(event?.durationMs))) {
        verify.duration_ms = Number(event.durationMs);
      } else if (Number.isFinite(Number(payload?.duration_ms))) {
        verify.duration_ms = Number(payload.duration_ms);
      }
      if (!verify.stdout) {
        verify.stdout = firstNonEmptyString(event?.stdout, payload?.stdout, payload?.stdout_text, payload?.stdout_summary);
      }
      if (!verify.stderr) {
        verify.stderr = firstNonEmptyString(event?.stderr, payload?.stderr, payload?.stderr_text, payload?.stderr_summary, payload?.failure_summary);
      }
      verify.artifact_ref = verify.artifact_ref || event?.artifact_ref || payload?.artifact_ref || null;
      verify.artifact_id = normalizeRuntimeArtifactId(verify.artifact_ref || verify.artifact_id);
      continue;
    }

    if (kind === "diff.available") {
      clearThinkingPending(thinkingPending, lane);
      const relPath = String(payload?.path || payload?.rel_path || "");
      if (relPath) seenDiffPaths.add(relPath);
      cards.push({
        id: `diff_${runId}_${seq}`,
        kind: "diff",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Diff",
        status: String(payload?.status || "completed"),
        lane,
        at,
        seq,
        path: relPath,
        action: String(payload?.action || "update"),
        hunks: normalizeDiffHunks(payload?.hunks),
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "repair.started" || kind === "repair.completed") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `repair_${runId}_${seq}`,
        kind: "repair",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Repair Loop",
        status: String(payload?.status || (kind.endsWith(".completed") ? "completed" : "running")),
        lane,
        at,
        seq,
        attempt: payload?.attempt ?? null,
        body: kind === "repair.completed" ? "Repair attempt completed" : "Repair attempt running",
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "review.available") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `review_${runId}_${seq}`,
        kind: "review",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Review",
        status: String(payload?.status || "completed"),
        lane,
        at,
        seq,
        summary: firstNonEmptyString(payload?.summary, payload?.acceptance_summary, payload?.message),
        artifact_ref: payload?.artifact_ref || null,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "acceptance.started" || kind === "acceptance.completed" || kind === "acceptance.failed") {
      clearThinkingPending(thinkingPending, lane);
      cards.push({
        id: `acceptance_${runId}_${seq}`,
        kind: "acceptance",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Acceptance",
        status: String(payload?.status || (kind.endsWith(".failed") ? "failed" : kind.endsWith(".completed") ? "completed" : "running")),
        lane,
        at,
        seq,
        artifact_ref: payload?.artifact_ref || null,
        acceptance_artifact_ref: payload?.acceptance_artifact_ref || null,
        acceptance_status: payload?.acceptance_status || null,
        verify_coverage: payload?.verify_coverage || null,
        relaxed_by_verify_reason: payload?.relaxed_by_verify_reason || null,
        checks: Array.isArray(payload?.checks) ? payload.checks : [],
        defaultCollapsed: false
      });
      continue;
    }

    if (kind.startsWith("approval.")) {
      cards.push({
        id: `approval_${runId}_${seq}`,
        kind: "approval",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Approval",
        status: String(payload?.status || (kind.includes("failed") ? "failed" : kind.includes("waiting") ? "waiting_user" : "completed")),
        lane,
        at,
        seq,
        phase: kind,
        mode: String(payload?.mode || ""),
        provider: String(payload?.provider || ""),
        retryable: payload?.retryable === true,
        defaultCollapsed: false
      });
      continue;
    }

    if (kind === "step.failed_controlled") {
      cards.push({
        id: `failed_${runId}_${seq}`,
        kind: "failure",
        run_id: runId,
        event_id: firstNonEmptyString(event?.event_id, event?.id, `${runId}:${seq}`),
        artifact_id: normalizeRuntimeArtifactId(payload?.artifact_ref || payload?.artifact_id),
        title: "Runtime Failure",
        status: "failed",
        lane,
        at,
        seq,
        body: String(payload?.reason || "failed_controlled"),
        defaultCollapsed: false
      });
      continue;
    }
  }

  for (const command of commandCards.values()) {
    const validation = validateRuntimeCommandCard(command);
    if (!validation.valid) {
      cards.push(
        runtimeInvalidPayloadCard(
          runId,
          command.seq,
          command.at,
          command.lane,
          command.source_type || command.kind || "command",
          validation.missing
        )
      );
      continue;
    }
    cards.push(command);
  }
  for (const verify of verifyCards.values()) {
    cards.push(verify);
  }
  for (const contextCompaction of compactionCards.values()) {
    cards.push(contextCompaction);
  }
  for (const thinking of thinkingPending.values()) {
    cards.push(thinking);
  }

  if (seenDiffPaths.size === 0) {
    const fileChanges = Array.isArray(runData?.file_changes) ? runData.file_changes : [];
    for (const change of fileChanges) {
      cards.push({
        id: `filechange_${runId}_${change.id || change.path || Math.random().toString(16).slice(2)}`,
        kind: "diff",
        run_id: runId,
        event_id: firstNonEmptyString(change?.id, `${runId}:${change?.path || "filechange"}`),
        artifact_id: "none",
        title: "Diff",
        status: "completed",
        lane: "task",
        at: String(change?.created_at || now()),
        seq: Number.MAX_SAFE_INTEGER - 1000,
        path: String(change?.path || ""),
        action: String(change?.action || "update"),
        hunks: [],
        artifact_ref: null,
        defaultCollapsed: false
      });
    }
  }

  cards.sort((a, b) => {
    const sa = runtimeSortValue(a);
    const sb = runtimeSortValue(b);
    if (sa.seq !== sb.seq) return sa.seq - sb.seq;
    if (sa.ts !== sb.ts) return sa.ts - sb.ts;
    return String(a.id).localeCompare(String(b.id));
  });
  return cards;
}

function buildRuntimeCardsForSession(sessionId) {
  const cards = [];
  const runIds = currentSessionRunIds(sessionId);
  for (const runId of runIds) {
    const runData = state.runtimeRuns?.[runId];
    if (!runData) continue;
    cards.push(...buildRuntimeCardsForRun(runId, runData));
  }
  cards.sort((a, b) => {
    const sa = runtimeSortValue(a);
    const sb = runtimeSortValue(b);
    if (sa.seq !== sb.seq) return sa.seq - sb.seq;
    if (sa.ts !== sb.ts) return sa.ts - sb.ts;
    return String(a.id).localeCompare(String(b.id));
  });
  return cards;
}

function isRuntimeCardCollapsed(card) {
  const key = runtimeCardCollapseKey(card);
  if (!key) return false;
  if (Object.prototype.hasOwnProperty.call(state.runtimeCardCollapse, key)) {
    return !!state.runtimeCardCollapse[key];
  }
  const legacyKey = String(card?.id || "");
  if (legacyKey && Object.prototype.hasOwnProperty.call(state.runtimeCardCollapse, legacyKey)) {
    return !!state.runtimeCardCollapse[legacyKey];
  }
  return card?.defaultCollapsed === true;
}

function renderRuntimeDiffHunks(hunks) {
  if (!Array.isArray(hunks) || hunks.length === 0) {
    return `<div class="runtime-note">No inline hunk payload. File change recorded.</div>`;
  }
  return hunks
    .map((hunk) => {
      const linesHtml = (Array.isArray(hunk.lines) ? hunk.lines : [])
        .map((line) => `<div class="diff-line ${line.sign === "+" ? "plus" : line.sign === "-" ? "minus" : "ctx"}"><span>${esc(line.sign)}</span><code>${esc(line.text)}</code></div>`)
        .join("");
      return `<section class="diff-hunk"><div class="diff-hunk-head">${esc(hunk.header || "@@ @@")}</div>${linesHtml}</section>`;
    })
    .join("");
}

function runtimeCardBodyHtml(card) {
  if (card.kind === "thinking") {
    return `<div class="thinking-body"><span class="thinking-label">Thinking</span><span class="runtime-note">${esc(card.phase || card.lane || "task")}</span></div>`;
  }
  if (card.kind === "context-compaction") {
    const status = String(card.status || "running");
    const labelText =
      status === "completed"
        ? "Context automatically compacted"
        : status === "failed"
          ? "Context compaction failed"
          : status === "skipped"
            ? "Context compaction skipped"
            : "Automatically compacting context";
    const qualityChecks = card.quality_checks && typeof card.quality_checks === "object" ? card.quality_checks : null;
    return `<div class="compaction-body"><span class="compaction-label ${esc(status)}">${esc(labelText)}</span><div class="runtime-note"><b>trigger:</b> ${esc(card.trigger_type || "auto")} · <b>manual:</b> ${card.manual ? "yes" : "no"}${card.snapshot_id ? `<br/><b>snapshot_id:</b> <code>${esc(card.snapshot_id)}</code>` : ""}${card.context_compaction_id ? `<br/><b>context_compaction_id:</b> <code>${esc(card.context_compaction_id)}</code>` : ""}${card.reason ? `<br/><b>reason:</b> ${esc(card.reason)}` : ""}${card.source_event_range ? `<br/><b>source_event_range:</b> ${esc(card.source_event_range.from_seq ?? "-")} -> ${esc(card.source_event_range.to_seq ?? "-")}` : ""}${card.receipt_id ? `<br/><b>receipt_id:</b> <code>${esc(card.receipt_id)}</code>` : ""}${card.consumed ? `<br/><b>consumed:</b> true` : ""}${card.error_code ? `<br/><b>error_code:</b> ${esc(card.error_code)}` : ""}${card.error_message ? `<br/><b>error_message:</b> ${esc(card.error_message)}` : ""}${card.fallback_status ? `<br/><b>fallback:</b> ${esc(card.fallback_status)}` : ""}${qualityChecks ? `<br/><b>quality:</b> ${esc(JSON.stringify(qualityChecks))}` : ""}</div></div>`;
  }
  if (card.kind === "plan") {
    const plan = card.plan && typeof card.plan === "object" ? card.plan : {};
    const affectedFiles = Array.isArray(plan.affected_files) ? plan.affected_files : [];
    return `<dl class="runtime-kv"><dt>task</dt><dd>${esc(plan.task_type || "entry_targeted_patch")}</dd><dt>risk</dt><dd>${esc(plan.risk_level || "normal")}</dd><dt>requires_auth</dt><dd>${plan.requires_auth ? "yes" : "no"}</dd><dt>requires_deploy</dt><dd>${plan.requires_deploy ? "yes" : "no"}</dd><dt>verification</dt><dd>${esc(plan.verification_strategy || "-")}</dd>${card.artifact_ref ? `<dt>artifact</dt><dd><code>${esc(card.artifact_ref)}</code></dd>` : ""}</dl>${affectedFiles.length ? `<div class="runtime-note"><b>affected files:</b><br/>${affectedFiles.map((x) => `<code>${esc(x)}</code>`).join("<br/>")}</div>` : ""}`;
  }
  if (card.kind === "file-locate") {
    const targets = Array.isArray(card.target_files) ? card.target_files : [];
    const missing = Array.isArray(card.missing_targets) ? card.missing_targets : [];
    return `<div class="runtime-note"><b>targets:</b> ${targets.length ? targets.map((x) => `<code>${esc(x)}</code>`).join(", ") : "-"}</div>${missing.length ? `<div class="runtime-note"><b>missing:</b> ${missing.map((x) => `<code>${esc(x)}</code>`).join(", ")}<br/>Copy missing files into current project root, then retry.</div>` : `<div class="runtime-note">All target files resolved in current project root.</div>`}${card.artifact_ref ? `<div class="runtime-note"><b>artifact:</b> <code>${esc(card.artifact_ref)}</code></div>` : ""}`;
  }
  if (card.kind === "verify-resolver") {
    return `<dl class="runtime-kv"><dt>language</dt><dd>${esc(card.language || "unknown")}</dd><dt>selected</dt><dd><code>${esc(card.selected_command || "-")}</code></dd><dt>fallback_used</dt><dd>${card.fallback_used ? "yes" : "no"}</dd><dt>tool_missing</dt><dd>${card.tool_missing ? "yes" : "no"}</dd><dt>dry_run</dt><dd>${card.dry_run_detected ? "yes" : "no"}</dd>${card.coverage_summary ? `<dt>coverage</dt><dd>${esc(card.coverage_summary.coverage || "-")} (${esc(card.coverage_summary.reason || "-")})</dd>` : ""}${card.artifact_ref ? `<dt>artifact</dt><dd><code>${esc(card.artifact_ref)}</code></dd>` : ""}</dl>`;
  }
  if (card.kind === "diagnosis") {
    return `<div class="runtime-note">${esc(card.message || "-")}</div>${card.command ? `<div class="runtime-note"><b>command:</b> <code>${esc(card.command)}</code></div>` : ""}<dl class="runtime-kv"><dt>exit</dt><dd>${esc(card.exit_code ?? "-")}</dd>${card.artifact_ref ? `<dt>artifact</dt><dd><code>${esc(card.artifact_ref)}</code></dd>` : ""}</dl>${card.stdout || card.stderr ? `<div class="runtime-streams"><section><h4>stdout</h4><pre class="runtime-pre">${esc(card.stdout || "")}</pre></section><section><h4>stderr</h4><pre class="runtime-pre">${esc(card.stderr || "")}</pre></section></div>` : ""}`;
  }
  if (card.kind === "repair-loop") {
    return `<div class="runtime-note"><b>attempts:</b> ${esc(card.attempts_used ?? "-")} · <b>rounds:</b> ${esc(card.rounds ?? "-")} · <b>started/completed:</b> ${esc(card.repair_started_count ?? "-")}/${esc(card.repair_completed_count ?? "-")} · <b>consumed_failures:</b> ${card.consumed_failure_events ? "yes" : "no"}${card.artifact_ref ? `<br/><b>artifact:</b> <code>${esc(card.artifact_ref)}</code>` : ""}</div>`;
  }
  if (card.kind === "deploy-gate") {
    return `<div class="runtime-note"><b>mode:</b> ${esc(card.mode || "dry_run")}<br/><b>provider:</b> ${esc(card.provider || "generic")}<br/><b>status:</b> ${esc(card.status || "waiting_user")}${card.artifact_ref ? `<br/><b>artifact:</b> <code>${esc(card.artifact_ref)}</code>` : ""}</div>`;
  }
  if (card.kind === "user" || card.kind === "assistant" || card.kind === "failure" || card.kind === "repair") {
    return `<pre class="runtime-pre">${esc(card.body || "")}</pre>`;
  }
  if (card.kind === "command") {
    return `<dl class="runtime-kv"><dt>status</dt><dd>${esc(String(card.status || ""))}</dd><dt>command</dt><dd><code>${esc(String(card.command || ""))}</code></dd><dt>cwd</dt><dd><code>${esc(String(card.cwd || ""))}</code></dd><dt>shell</dt><dd>${esc(String(card.shell || ""))}</dd><dt>exit</dt><dd>${esc(String(card.exit_code))}</dd><dt>duration</dt><dd>${esc(String(card.duration_ms))} ms</dd><dt>started</dt><dd>${esc(t(card.started_at))}</dd><dt>finished</dt><dd>${esc(t(card.finished_at))}</dd>${card.artifact_ref ? `<dt>artifact</dt><dd><code>${esc(card.artifact_ref)}</code></dd>` : ""}</dl><div class="runtime-streams"><section><h4>stdout</h4><pre class="runtime-pre">${esc(String(card.stdout || ""))}</pre></section><section><h4>stderr</h4><pre class="runtime-pre">${esc(String(card.stderr || ""))}</pre></section></div>`;
  }
  if (card.kind === "verify") {
    return `<div class="runtime-note"><b>status:</b> ${esc(card.status || "running")}${card.command ? ` · <code>${esc(card.command)}</code>` : ""}${card.reason ? `<br/><b>reason:</b> ${esc(card.reason)}` : ""}</div><dl class="runtime-kv"><dt>cwd</dt><dd><code>${esc(card.cwd || "-")}</code></dd><dt>exit</dt><dd>${esc(card.exit_code ?? "-")}</dd><dt>duration</dt><dd>${esc(card.duration_ms ?? "-")} ms</dd>${card.artifact_ref ? `<dt>artifact</dt><dd><code>${esc(card.artifact_ref)}</code></dd>` : ""}</dl><div class="runtime-streams"><section><h4>stdout</h4><pre class="runtime-pre">${esc(card.stdout || "")}</pre></section><section><h4>stderr</h4><pre class="runtime-pre">${esc(card.stderr || "")}</pre></section></div>`;
  }
  if (card.kind === "diff") {
    return `<div class="runtime-note"><b>file:</b> <code>${esc(card.path || "-")}</code> · <b>action:</b> ${esc(card.action || "update")}${card.artifact_ref ? `<br/><b>artifact:</b> <code>${esc(card.artifact_ref)}</code>` : ""}</div>${renderRuntimeDiffHunks(card.hunks)}`;
  }
  if (card.kind === "review") {
    return `<div class="runtime-note"><b>summary:</b> ${esc(card.summary || "-")}${card.artifact_ref ? `<br/><b>artifact:</b> <code>${esc(card.artifact_ref)}</code>` : ""}</div>`;
  }
  if (card.kind === "acceptance") {
    const checks = Array.isArray(card.checks) ? card.checks : [];
    return `<div class="runtime-note"><b>status:</b> ${esc(card.status || "-")}${card.acceptance_status ? ` · <b>acceptance:</b> ${esc(card.acceptance_status)}` : ""}${card.verify_coverage ? ` · <b>verify_coverage:</b> ${esc(card.verify_coverage)}` : ""}${card.relaxed_by_verify_reason ? `<br/><b>relaxed_by_verify:</b> ${esc(card.relaxed_by_verify_reason)}` : ""}${card.artifact_ref ? `<br/><b>artifact:</b> <code>${esc(card.artifact_ref)}</code>` : ""}${card.acceptance_artifact_ref ? `<br/><b>acceptance_artifact:</b> <code>${esc(card.acceptance_artifact_ref)}</code>` : ""}</div>${checks.length ? `<ul class="runtime-checks">${checks.map((check) => `<li>${esc(check.check || "-")}: ${check.passed ? "passed" : "failed"}</li>`).join("")}</ul>` : ""}`;
  }
  if (card.kind === "approval") {
    return `<div class="runtime-note"><b>phase:</b> ${esc(card.phase || "-")}<br/><b>mode:</b> ${esc(card.mode || "-")}<br/><b>provider:</b> ${esc(card.provider || "-")}<br/><b>retryable:</b> ${card.retryable ? "yes" : "no"}</div>`;
  }
  return `<div class="runtime-note">No renderer</div>`;
}

function runtimeCardHtml(card) {
  const collapsed = isRuntimeCardCollapsed(card);
  const status = String(card.status || "unknown");
  const lane = String(card.lane || "task");
  const collapsible = card.kind === "command" || card.kind === "verify" || card.kind === "diff";
  const collapseKey = runtimeCardCollapseKey(card);
  const bodyHtml = runtimeCardBodyHtml(card);
  const headerMeta = `${esc(t(card.at))} · ${esc(lane)} · ${esc(status)}`;
  return `<article class="runtime-card kind-${esc(card.kind)} status-${esc(status)} ${collapsed ? "collapsed" : ""}" data-runtime-card-id="${esc(card.id || "")}" data-runtime-collapse-key="${esc(collapseKey)}"><header class="runtime-card-head"><div><div class="runtime-card-title">${esc(card.title || card.kind)}</div><div class="runtime-card-meta">${headerMeta}</div></div>${collapsible ? `<button class="ghost-btn runtime-toggle-btn" data-action="toggle-runtime-card" data-id="${esc(card.id)}" data-key="${esc(collapseKey)}" aria-expanded="${collapsed ? "false" : "true"}">${collapsed ? "Expand" : "Collapse"}</button>` : ""}</header><div class="runtime-card-body">${bodyHtml}</div></article>`;
}

function cardsHtml() {
  const cs = currentSession();
  if (!cs) {
    return `<div class="empty-thread">No active session. Click <b>New Session</b> then send first message.</div>`;
  }
  const runtimeCards = buildRuntimeCardsForSession(cs.id);
  if (runtimeCards.length) {
    return runtimeCards.map((card) => runtimeCardHtml(card)).join("");
  }
  const cards = normalizeCardsForDisplay(thread(cs.id));
  if (!cards.length) {
    return `<div class="empty-thread">Thread is empty. Enter task and press Send.</div>`;
  }
  return cards
    .map((x) => {
      const meta = getDisplayEventMeta(x.displayType);
      return `<article class="card ${meta.className || ""}"><div class="t">${esc(meta.label)}</div><div class="body">${esc(x.body)}</div><div class="session-meta">${esc(t(x.at))}</div></article>`;
    })
    .join("");
}

function homeMetaLines(workspace, classification) {
  const lines = [];
  lines.push(`<b>workspace:</b>${esc(prettyWorkspaceLabel(workspace))}`);
  lines.push(`<b>source:</b>${esc(workspaceSourceSummary(workspace))}`);
  lines.push(`<b>session:</b>${esc(state.currentSessionId ? "ready" : "not_ready")}`);
  lines.push(`<b>run_state:</b>${esc(state.run.status || "idle")}`);
  lines.push(`<b>display_event_contract:</b>${esc(DISPLAY_EVENT_CONTRACT.version)}`);
  if (classification) {
    lines.push(`<b>intent:</b>${esc(classification.intent || "generic_chat")}`);
  }
  return lines.join("<br/>");
}

function reviewToggleText() {
  return state.reviewOpen ? "Collapse" : "Open";
}

function reviewHeaderText() {
  return state.reviewOpen ? "Review" : "R";
}

function reviewCollapsedFlag() {
  return state.reviewOpen ? "false" : "true";
}

function reviewPaneClassName() {
  return state.reviewOpen ? "review-pane" : "review-pane collapsed";
}

function newSessionButtonTitle() {
  return "New Session";
}

function continueLastSessionButtonTitle() {
  return "Continue Last Session";
}

function switchWorkspaceButtonTitle() {
  return "Switch Workspace";
}

function openFolderButtonTitle() {
  return "Open Folder";
}

function togglePanelsButtonTitle() {
  return state.panelsOpen ? "Hide Main Chat + Review" : "Open Main Chat + Review";
}

function copyPathButtonTitle() {
  return "Copy Path";
}

function homeThreadHeaderTitle() {
  return "Main Chat / Task Thread";
}

function composePlaceholder() {
  return isSendLockedByRunState()
    ? "Run in progress. Use Stop or Resume."
    : "Type message (/ for commands, @ to add files) · Shift+Enter newline";
}

function sendButtonTitle() {
  return isSendLockedByRunState() ? "Send (locked while run active)" : "Send";
}

function stopButtonTitle() {
  return "Stop";
}

function resumeButtonTitle() {
  return "Resume";
}

function uploadButtonTitle() {
  return "Upload";
}

function pasteButtonTitle() {
  return "Paste Text";
}

function screenshotButtonTitle() {
  return "Screenshot";
}

function renderThreadCardsHtml() {
  return cardsHtml();
}

function renderHomeHeaderMeta(workspace, cls) {
  return homeMetaLines(workspace, cls);
}

function renderReviewPane() {
  return `<aside class="${reviewPaneClassName()}" data-collapsed="${reviewCollapsedFlag()}"><header class="panel-head"><h2>${reviewHeaderText()}</h2><button class="ghost-btn" data-action="toggle-review">${reviewToggleText()}</button></header><div class="review-tabs"><button class="link-btn ${state.reviewTab === "changes" ? "active" : ""}" data-action="review-tab" data-tab="changes">Changes</button><button class="link-btn ${state.reviewTab === "verify" ? "active" : ""}" data-action="review-tab" data-tab="verify">Verify</button><button class="link-btn ${state.reviewTab === "deploy" ? "active" : ""}" data-action="review-tab" data-tab="deploy">Deploy</button><button class="link-btn ${state.reviewTab === "logs" ? "active" : ""}" data-action="review-tab" data-tab="logs">Logs</button></div><pre class="review-content">${esc(reviewText())}</pre></aside>`;
}

function renderComposer(atts) {
  const runLocked = isSendLockedByRunState();
  const showStop = runLocked && !state.canResume;
  const openPanelsAction = !state.panelsOpen
    ? `<button class="ghost-btn" data-action="toggle-panels">${togglePanelsButtonTitle()}</button>`
    : "";
  const tokenTray = state.composerTokens.length
    ? `<div class="composer-token-tray">${state.composerTokens
        .map(
          (token) =>
            `<span class="composer-token"><span>${esc(token.label || token.command || token.rel_path || token.symbol || "token")}</span><button class="ghost-btn composer-token-remove" data-action="composer-token-remove" data-id="${esc(token.id)}" ${runLocked ? "disabled" : ""}>x</button></span>`
        )
        .join("")}</div>`
    : "";
  const suggestItems = Array.isArray(state.composerSuggest?.items) ? state.composerSuggest.items : [];
  const suggestHtml = state.composerSuggest?.open
    ? `<div class="composer-suggest">${state.composerSuggest.loading ? `<div class="composer-suggest-loading">Loading...</div>` : suggestItems.length ? suggestItems
        .map((item, idx) => `<button class="composer-suggest-item ${idx === Number(state.composerSuggest.selected || 0) ? "active" : ""}" data-action="composer-suggest-pick" data-index="${idx}" ${runLocked ? "disabled" : ""}><div class="composer-suggest-label">${esc(item.label || item.id || "")}</div><div class="composer-suggest-meta">${esc(item.description || item.type || "")}</div></button>`)
        .join("") : `<div class="composer-suggest-empty">No matches</div>`}</div>`
    : "";
  return `<section class="composer" id="composerArea">${atts ? `<div class="attachment-tray">${atts}</div>` : ""}${tokenTray}<textarea data-bind="composer" placeholder="${composePlaceholder()}" ${runLocked ? "disabled" : ""}>${esc(state.composer)}</textarea>${suggestHtml}<div class="composer-actions"><div class="left-actions"><button class="ghost-btn" data-action="attach-upload" ${runLocked ? "disabled" : ""}>${uploadButtonTitle()}</button><button class="ghost-btn" data-action="attach-paste-text" ${runLocked ? "disabled" : ""}>${pasteButtonTitle()}</button><button class="ghost-btn" data-action="attach-screenshot" ${runLocked ? "disabled" : ""}>${screenshotButtonTitle()}</button></div><div class="right-actions">${openPanelsAction}${state.canResume ? `<button class="ghost-btn" data-action="resume">${resumeButtonTitle()}</button>` : ""}${showStop ? `<button class="danger-btn" data-action="stop">${stopButtonTitle()}</button>` : ""}<button class="primary-btn" data-action="send" ${runLocked ? "disabled" : ""}>${sendButtonTitle()}</button></div></div></section>`;
}

function renderHomeMain(workspace, cls, atts) {
  const threadHtml = `<section class="thread" id="homeThread">${renderThreadCardsHtml()}</section>`;
  const reviewHtml = state.panelsOpen ? renderReviewPane() : "";
  return `<section class="main-shell ${state.panelsOpen ? "panels-open" : "panels-hidden"}"><div class="main-center"><header class="main-head"><div class="main-head-row"><h1>${homeThreadHeaderTitle()}</h1><div class="row"><span class="chip ${state.context.assembled ? "ok" : "warn"}">autocontext:${state.context.assembled ? "ready" : "pending"}</span><span class="chip ${state.context.compacted ? "ok" : "warn"}">compact:${state.context.compacted ? "active" : "idle"}</span><span class="chip ${state.context.resumed ? "ok" : "warn"}">resume:${state.context.resumed ? "yes" : "no"}</span><span class="chip ${isSendLockedByRunState() ? "warn" : "ok"}">run:${esc(state.run.status || "idle")}</span>${cls ? `<span class="chip ${cls.lane === "task" ? "ok" : "warn"}">intent:${esc(cls.intent || "-")}</span><span class="chip ${cls.riskLevel === "approval_required" ? "bad" : cls.riskLevel === "guarded" ? "warn" : "ok"}">risk:${esc(cls.riskLevel || "low")}</span>` : ""}</div></div><div class="meta">${renderHomeHeaderMeta(workspace, cls)}</div><div class="row main-head-actions"><button class="ghost-btn" data-action="open-modal-workspace">${switchWorkspaceButtonTitle()}</button><button class="ghost-btn" data-action="open-folder">${openFolderButtonTitle()}</button><button class="ghost-btn" data-action="copy-workspace-path">${copyPathButtonTitle()}</button><button class="ghost-btn" data-action="toggle-panels">${togglePanelsButtonTitle()}</button></div></header>${threadHtml}${renderComposer(atts)}</div>${reviewHtml}</section>`;
}

function renderSessionListItemTitle(session) {
  const runIds = currentSessionRunIds(session.id);
  for (let i = runIds.length - 1; i >= 0; i -= 1) {
    const runData = state.runtimeRuns?.[runIds[i]];
    const events = Array.isArray(runData?.events) ? runData.events : [];
    for (let j = events.length - 1; j >= 0; j -= 1) {
      const event = events[j];
      const kind = String(event?.kind || event?.type || "");
      if (kind !== "user.message") continue;
      const text = String(event?.payload?.message || "").trim();
      if (text) return text.slice(0, 36);
    }
  }
  return (thread(session.id).find((x) => x.displayType === DISPLAY_EVENT_TYPES.USER_MESSAGE)?.body || session.title || "Session").slice(0, 36);
}

function renderSessionList(list) {
  return list.map((s) => `<button class="session-item ${s.id === state.currentSessionId ? "active" : ""}" data-action="open-session" data-id="${esc(s.id)}"><div class="session-title">${esc(renderSessionListItemTitle(s))}</div><div class="session-meta">${esc(t(s.updated_at || s.created_at || now()))}</div></button>`).join("");
}

function renderSidebar(list) {
  return `<aside class="sidebar"><section class="block"><h2>Sessions</h2><div class="row" style="margin-top:8px;"><button class="primary-btn" data-action="new-session">${newSessionButtonTitle()}</button><button class="ghost-btn" data-action="continue-last">${continueLastSessionButtonTitle()}</button></div><div class="field" style="margin-top:8px;"><input class="input" data-bind="sidebar-search" value="${esc(state.sidebarSearch)}" placeholder="Search"/></div><div class="session-list">${renderSessionList(list)}</div></section></aside>`;
}

function homeHtml() {
  const workspace = currentWorkspace();
  const list = sessionsVisible([...(state.draftSession ? [state.draftSession] : []), ...state.sessions], state.sidebarSearch);
  const atts = state.attachments
    .map((a) => {
      const thumb = a.preview
        ? `<button class="thumb-btn" data-action="preview-attachment" data-id="${esc(a.id)}"><img class="attachment-thumb" src="${esc(a.preview)}" alt="thumb"/></button>`
        : `<span class="attachment-thumb"></span>`;
      return `<div class="attachment-pill">${thumb}<span>${esc(a.name)}</span><button class="ghost-btn" data-action="remove-attachment" data-id="${esc(a.id)}">Delete</button></div>`;
    })
    .join("");

  const cls = currentClassification();

  return `<section class="workbench" id="layoutWorkbench" data-proof="main-workbench">${renderSidebar(list)}${renderHomeMain(workspace, cls, atts)}</section>`;
}

async function syncRunEventsFromBackend(sessionId, runId, { bootstrap = false } = {}) {
  if (!sessionId || !runId) return;
  const runData = await api(`/runs/${encodeURIComponent(runId)}`);
  state.runtimeRuns[runId] = runData;
  const events = Array.isArray(runData?.events) ? runData.events : [];
  const displayEvents = Array.isArray(runData?.display_events) ? runData.display_events : [];
  const cursor = Number(state.runEventCursor[runId] || 0);
  const freshRuntime = events.filter((e) => Number(e?.seq || 0) > cursor);
  for (const e of freshRuntime) {
    log("runtime_event", {
      run_id: runId,
      seq: e.seq,
      type: e.type,
      payload: e.payload || null,
      visibility: typeof e?.visibility === "string" ? e.visibility : "internal_only"
    });
  }

  if (events.length === 0) {
    let freshDisplay = displayEvents
      .map((event) => normalizeBackendDisplayEvent(event))
      .filter((event) => event && isMainThreadDisplayEvent(event) && Number(event.seq || 0) > cursor);
    if (cursor <= 0 && bootstrap && freshDisplay.length > 40) {
      freshDisplay = freshDisplay.slice(-40);
    }
    for (const event of freshDisplay) {
      const seq = Number.isFinite(Number(event.seq)) ? Number(event.seq) : null;
      const eventKeyBase =
        typeof event.dedupeKey === "string" && event.dedupeKey.trim()
          ? event.dedupeKey.trim()
          : seq !== null
            ? `${seq}:${event.displayType}`
            : `${event.displayType}:${event.createdAt || ""}:${event.body.slice(0, 24)}`;
      const eventKey = `${runId}:${eventKeyBase}`;
      appendDisplayEvent(sessionId, event.displayType, event.body, {
        eventKey,
        source: "backend_display_projection",
        lane: event.lane || "chat",
        at: event.createdAt || now()
      });
    }
  }
  const maxRuntimeSeq = events.length > 0 ? Number(events[events.length - 1]?.seq || 0) : 0;
  const maxDisplaySeq = displayEvents.length > 0 ? Number(displayEvents[displayEvents.length - 1]?.seq || 0) : 0;
  const maxObservedSeq = Math.max(cursor, maxRuntimeSeq, maxDisplaySeq);
  if (Number.isFinite(maxObservedSeq) && maxObservedSeq > cursor) {
    state.runEventCursor[runId] = maxObservedSeq;
  }
  if (runData?.run?.status) {
    state.run.status = String(runData.run.status);
  }
}

function serializeAttachmentForTurn(attachment) {
  if (!attachment || typeof attachment !== "object") return null;
  const source = String(attachment.source || "").trim().toLowerCase();
  if (source === "paste") {
    const text = String(attachment.text || "");
    if (!text.trim()) return null;
    return {
      source: "paste",
      name: String(attachment.name || `paste-${Date.now()}.txt`),
      mime_type: "text/plain",
      text
    };
  }
  const content = String(attachment.content || "").trim();
  if (!content) return null;
  return {
    source: source === "screenshot" ? "screenshot" : "upload",
    name: String(attachment.name || `upload-${Date.now()}.bin`),
    mime_type: String(attachment.mime || attachment.type || "").trim() || null,
    content_base64: content
  };
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function patchSessionFromBackend(session) {
  if (!(session && typeof session === "object" && typeof session.id === "string")) {
    return;
  }
  const idx = state.sessions.findIndex((x) => x.id === session.id);
  if (idx >= 0) {
    state.sessions[idx] = { ...state.sessions[idx], ...session };
  }
}

async function fetchSessionTurns(sessionId, limit = 120) {
  return api(`/entry/sessions/${encodeURIComponent(sessionId)}/turns?limit=${encodeURIComponent(String(limit))}`);
}

async function syncSessionTurnsFromBackend(sessionId, { bootstrap = false } = {}) {
  if (!sessionId) return;
  const data = await fetchSessionTurns(sessionId, 180);
  if (data?.session) {
    patchSessionFromBackend(data.session);
  }
  const turns = Array.isArray(data?.turns) ? data.turns : [];
  const runIds = [];
  for (const turn of turns) {
    const runId = String(turn?.run_id || "").trim();
    if (!runId) continue;
    if (!runIds.includes(runId)) {
      runIds.push(runId);
    }
    await syncRunEventsFromBackend(sessionId, runId, { bootstrap });
  }
  state.sessionRunIds[sessionId] = runIds;
}

async function waitForRunTerminal(sessionId, runId, { timeoutMs = 120000 } = {}) {
  const startedAt = Date.now();
  let latestStatus = state.run.status || "running";
  while (Date.now() - startedAt < timeoutMs) {
    const details = await api(`/runs/${encodeURIComponent(runId)}`);
    latestStatus = String(details?.run?.status || latestStatus || "running");
    state.run.status = latestStatus;
    const streamActive =
      String(state.runtimeStream?.runId || "") === String(runId || "") &&
      Boolean(state.runtimeStream?.source);
    if (!streamActive) {
      await syncRunEventsFromBackend(sessionId, runId, { bootstrap: false });
    }
    render();
    if (!isRunActiveStatus(latestStatus)) {
      break;
    }
    if (state.stopRequested) {
      break;
    }
    await waitMs(700);
  }
  return latestStatus;
}

function contextSettingsForUi() {
  return state.contextSettings || applyContextSettingsState(defaultContextSettings(), currentSessionIdForContextSettings());
}

function parseCompactCommandInput(text) {
  const raw = String(text || "").trim();
  if (!raw.toLowerCase().startsWith("/compact")) return null;
  const args = raw.split(/\s+/).slice(1);
  const parsed = {
    reason: "manual_slash_compact",
    timeout_ms: 15000,
    simulate_timeout: false
  };
  for (const token of args) {
    const lower = String(token || "").toLowerCase();
    if (lower === "--simulate-timeout" || lower === "simulate-timeout") {
      parsed.simulate_timeout = true;
      continue;
    }
    if (lower.startsWith("--timeout=")) {
      parsed.timeout_ms = parseBoundedInt(lower.slice("--timeout=".length), 15000, 1, 120000);
      continue;
    }
    if (lower.startsWith("--reason=")) {
      const reason = token.slice("--reason=".length).trim();
      if (reason) parsed.reason = reason;
    }
  }
  return parsed;
}

function currentRunIdForCompaction(session) {
  const direct = String(session?.run_id || "").trim();
  if (direct) return direct;
  const fallback = String(state.run.id || "").trim();
  return fallback || null;
}

async function triggerManualContextCompaction({
  reason = "manual_ui_compact",
  timeoutMs = 15000,
  simulateTimeout = false,
  source = "settings_button"
} = {}) {
  const sess = currentSession();
  if (!(sess && typeof sess.id === "string") || String(sess.id).startsWith(DRAFT_SESSION_PREFIX)) {
    throw new Error("persisted_session_required_for_compaction");
  }
  const runId = currentRunIdForCompaction(sess);
  if (!runId) {
    throw new Error("run_id_required_for_compaction");
  }
  const response = await api("/api/context/compact", {
    method: "POST",
    body: {
      session_id: sess.id,
      run_id: runId,
      trigger_type: source === "slash_command" ? "manual_slash" : "manual_ui",
      reason,
      timeout_ms: parseBoundedInt(timeoutMs, 15000, 1, 120000),
      simulate_timeout: simulateTimeout === true
    }
  });
  if (response?.ok === false && String(response?.error || "") === "unsafe_boundary") {
    toast(`Compact skipped: ${response?.blocking_phase || "unsafe_boundary"}`, "warn");
  } else if (response?.ok === false) {
    throw new Error(String(response?.reason || response?.error || "context_compaction_failed"));
  } else {
    toast("Context compaction requested", "ok");
  }
  await refreshContextSettingsForCurrentSession();
  await refreshRun(runId);
  await syncRunEventsFromBackend(sess.id, runId, { bootstrap: false });
  return response;
}

async function maybeHandleSlashCompactCommand(promptText) {
  const parsed = parseCompactCommandInput(promptText);
  if (!parsed) return false;
  await triggerManualContextCompaction({
    reason: parsed.reason,
    timeoutMs: parsed.timeout_ms,
    simulateTimeout: parsed.simulate_timeout,
    source: "slash_command"
  });
  state.pendingSend = null;
  state.composer = "";
  state.composerTokens = [];
  closeComposerSuggest();
  saveThreads();
  render();
  return true;
}

async function runRuntimeLane(pending, sess, detail, resolvedComposer = null) {
  const tokenPrompt = state.composerTokens.map((token) => token.label || "").filter(Boolean).join(" ");
  const prompt = normalizePrompt(state.composer || tokenPrompt);
  const rawText = String(state.composer || "").trim();
  const tokenPayload = serializeComposerTokensForPayload();
  const projectId = currentProjectId();
  const payloadAttachments = state.attachments
    .map((a) => serializeAttachmentForTurn(a))
    .filter(Boolean);

  state.busy = true;
  state.stopRequested = false;
  state.canResume = false;
  state.run.status = "running";
  state.run.lane = detail.lane;
  render();

  try {
    applyClassificationToSession(sess.id, detail);
    const created = await api(`/entry/sessions/${encodeURIComponent(sess.id)}/turns`, {
      method: "POST",
      body: {
        prompt,
        raw_text: rawText,
        lane: detail.lane,
        mode: detail.lane,
        project_id: projectId,
        tokens: tokenPayload,
        classification: compactClassification(detail),
        attachments: payloadAttachments,
        resolver: resolvedComposer
      }
    });

    if (created?.host_action) {
      state.pendingSend = null;
      state.composer = "";
      state.composerTokens = [];
      state.attachments = [];
      closeComposerSuggest();
      const actionSummary = String(created?.host_action?.action || "host_action");
      toast(`Host action executed: ${actionSummary}`, "ok");
      return;
    }

    const runId = String(created?.run?.id || created?.session?.run_id || "").trim();
    if (!runId) {
      throw new Error("run_id_missing_from_runtime_turn");
    }

    if (created?.session) {
      patchSessionFromBackend(created.session);
    }
    if (state.draftSession && state.draftSession.id === sess.id) {
      state.draftSession = { ...state.draftSession, run_id: runId, updated_at: now() };
    }

    state.run.id = runId;
    state.run.status = String(created?.run?.status || "running");
    state.pendingSend = null;
    state.composer = "";
    state.composerTokens = [];
    state.attachments = [];
    closeComposerSuggest();
    ensureSessionRunLink(sess.id, runId);
    ensureRuntimeRunContainer(runId);
    const streamStarted = startRuntimeEventStream(sess.id, runId);
    if (!streamStarted) {
      await syncRunEventsFromBackend(sess.id, runId, { bootstrap: true });
    }
    const finalStatus = await waitForRunTerminal(sess.id, runId, { timeoutMs: 120000 });
    state.run.status = finalStatus;
    state.canResume = false;
    closeRuntimeEventStream(runId);
    await syncRunEventsFromBackend(sess.id, runId, { bootstrap: false });

    await refreshContextSettingsForCurrentSession();
  } catch (e) {
    state.run.status = "failed_controlled";
    state.canResume = true;
    closeRuntimeEventStream(state.run.id);
    toast(String(e?.payload?.message || e?.payload?.error || e.message || e), "bad");
    log("turn_send_failed", e?.payload || { message: String(e?.message || e) });
  } finally {
    state.busy = false;
    state.stopRequested = false;
    closeRuntimeEventStream(state.run.id);
    saveThreads();
    render();
  }
}

async function runChatLane(pending, sess, detail, resolvedComposer = null) {
  return runRuntimeLane(pending, sess, detail, resolvedComposer);
}

async function runTaskLane(pending, sess, detail, resolvedComposer = null) {
  return runRuntimeLane(pending, sess, detail, resolvedComposer);
}

async function resolveComposerForSend(sess, detail) {
  const payload = {
    threadId: sess?.id || null,
    projectId: currentProjectId(),
    rawText: state.composer,
    tokens: serializeComposerTokensForPayload(),
    mode: detail?.lane || "chat"
  };
  return api("/api/composer/resolve", {
    method: "POST",
    body: payload
  });
}

async function executeComposerHostAction(sess, resolvedComposer) {
  const hostAction = resolvedComposer?.hostAction;
  if (!(hostAction && typeof hostAction === "object")) return false;
  const actionType = String(hostAction.type || "").trim();
  const endpoint =
    actionType === "open-folder"
      ? "/api/host/open-folder"
      : actionType === "open-file"
        ? "/api/host/open-file"
        : actionType === "reveal-path"
          ? "/api/host/reveal-path"
          : null;
  if (!endpoint) return false;

  const body = {
    projectId: hostAction.project_id || currentProjectId()
  };
  if (hostAction.rel_path) {
    body.relPath = hostAction.rel_path;
  }
  const result = await api(endpoint, {
    method: "POST",
    body
  });
  state.pendingSend = null;
  state.composer = "";
  state.composerTokens = [];
  state.attachments = [];
  closeComposerSuggest();
  const targetText = hostAction.rel_path ? ` ${hostAction.rel_path}` : "";
  toast(`Host action executed: ${actionType}${targetText}`.trim(), "ok");
  log("composer_host_action", { action: actionType, result });
  saveThreads();
  render();
  return true;
}

async function runSendPipeline(pending) {
  restorePendingSendSnapshot();
  const tokenPrompt = state.composerTokens.map((token) => token.label || "").filter(Boolean).join(" ");
  const prompt = normalizePrompt(state.composer || tokenPrompt);
  if (await maybeHandleSlashCompactCommand(prompt || state.composer)) {
    return;
  }
  if (!prompt && !state.attachments.length && state.composerTokens.length === 0) {
    state.pendingSend = null;
    return;
  }

  const sess = await ensureConcreteSession(prompt);
  if (!sess) return;

  let detail = applyLaneOverrides(
    classifyLaneDetailed(
      buildClassificationInput(sess.id, prompt, state.attachments)
    ),
    prompt,
    state.attachments
  );

  pending.classification = compactClassification(detail);
  state.currentClassification = pending.classification;
  state.run.lane = detail.lane;
  const resolvedComposer = await resolveComposerForSend(sess, detail);

  if (resolvedComposer?.needsClarification?.required) {
    const userText = prompt || normalizePrompt(state.composer);
    if (userText) {
      appendDisplayEvent(sess.id, DISPLAY_EVENT_TYPES.USER_MESSAGE, userText, {
        source: "composer_clarify_user",
        lane: "chat"
      });
    }
    appendDisplayEvent(
      sess.id,
      DISPLAY_EVENT_TYPES.ASSISTANT_REPLY,
      resolvedComposer.needsClarification.message || "Target not found in this project. Copy the file into project root and retry.",
      {
        source: "composer_clarify_reply",
        lane: "chat"
      }
    );
    state.pendingSend = null;
    state.composer = "";
    state.composerTokens = [];
    closeComposerSuggest();
    saveThreads();
    render();
    return;
  }

  if (resolvedComposer?.taskAction && detail.lane !== "task") {
    detail = {
      ...detail,
      lane: "task",
      mode: "execution",
      intent: String(resolvedComposer.taskAction.type || detail.intent || "task")
    };
  }

  if (await executeComposerHostAction(sess, resolvedComposer)) {
    return;
  }

  log("lane_classified", {
    lane: detail.lane,
    mode: detail.mode,
    intent: detail.intent,
    execution_mode: detail.executionMode,
    risk_level: detail.riskLevel,
    requires_tools: detail.requiresTools,
    requires_approval: detail.requiresApproval,
    domains: detail.domains,
    artifacts: detail.artifacts,
    reasons: detail.reasons,
    scores: detail.scores,
    attachment_summary: detail.attachmentSummary
  });

  if (detail.lane === "chat") {
    await runChatLane(pending, sess, detail, resolvedComposer);
    return;
  }
  await runTaskLane(pending, sess, detail, resolvedComposer);
}

async function attemptSendFromPending(trigger) {
  if (isSendLockedByRunState()) return;
  if (!state.pendingSend) return;
  restorePendingSendSnapshot();
  await Promise.all([refreshPreflight(), refreshAccessStatus(), refreshByoStatus()]);
  const missing = resolveMissingGate();
  if (missing) {
    state.modal = missing;
    log("send_blocked", { trigger, missing_gate: missing, pending_send_id: state.pendingSend.id });
    render();
    return;
  }
  state.modal = null;
  await runSendPipeline(state.pendingSend);
}

async function continuePendingSend(trigger) {
  if (!state.pendingSend) return;
  if (isSendLockedByRunState()) return;
  await attemptSendFromPending(trigger || "gate_complete");
}

async function triggerSendIntent(trigger) {
  if (isSendLockedByRunState()) {
    toast("Run in progress. Use Stop or Resume first.", "warn");
    return;
  }
  const queued = queuePendingSend(trigger || "send");
  if (!queued) return;
  await attemptSendFromPending(trigger || "send");
}

async function resumeFlow() {
  const s = currentSession();
  if (!s?.id || !s.run_id) return;
  state.busy = true;
  state.run.status = "resuming";
  render();
  try {
    await api(`/runs/${encodeURIComponent(s.run_id)}/resume`, {
      method: "POST",
      body: { resume_reason: "entry_frontend_resume" }
    });
    await refreshRun(s.run_id);
    await syncSessionTurnsFromBackend(s.id, { bootstrap: false });
    if (state.classifications[s.id]) {
      state.currentClassification = state.classifications[s.id];
    }
    state.canResume = false;
    state.run.status = "completed";
  } catch (e) {
    log("resume_failed", e?.payload || { message: String(e?.message || e) });
    toast(String(e?.payload?.error || e?.payload?.message || e?.message || e), "bad");
    state.canResume = true;
    state.run.status = "failed_controlled";
  } finally {
    state.busy = false;
    render();
  }
}

function toggleRuntimeCardExpandState(buttonEl, keyHint = "") {
  const key = String(keyHint || buttonEl?.getAttribute("data-key") || "").trim();
  let cardEl = buttonEl?.closest?.(".runtime-card") || null;
  if (!cardEl && key) {
    const allRuntimeCards = Array.from(appEl.querySelectorAll(".runtime-card[data-runtime-collapse-key]"));
    cardEl = allRuntimeCards.find((node) => String(node.getAttribute("data-runtime-collapse-key") || "") === key) || null;
  }
  if (!cardEl) return;
  const collapseKey = String(key || cardEl.getAttribute("data-runtime-collapse-key") || "").trim();
  if (!collapseKey) return;
  const threadEl = appEl.querySelector("#homeThread");
  const beforeScrollTop = threadEl ? threadEl.scrollTop : 0;
  if (threadEl) {
    state.threadAnchor = "manual";
    state.threadScrollPinnedByUser = true;
  }
  const currentlyCollapsed = cardEl.classList.contains("collapsed");
  const nextCollapsed = !currentlyCollapsed;
  state.runtimeCardCollapse[collapseKey] = nextCollapsed;
  cardEl.classList.toggle("collapsed", nextCollapsed);
  if (buttonEl) {
    buttonEl.textContent = nextCollapsed ? "Expand" : "Collapse";
    buttonEl.setAttribute("aria-expanded", nextCollapsed ? "false" : "true");
  }
  if (threadEl) {
    const clampScrollTop = (value) => {
      const maxScrollTop = Math.max(0, threadEl.scrollHeight - threadEl.clientHeight);
      return Math.max(0, Math.min(maxScrollTop, value));
    };
    const restoreScrollTop = () => {
      threadEl.scrollTop = clampScrollTop(beforeScrollTop);
      const maxScrollTop = Math.max(0, threadEl.scrollHeight - threadEl.clientHeight);
      pinThreadScrollByUser(threadEl.scrollTop, maxScrollTop);
      state.threadAnchor = "manual";
      state.threadScrollPinnedByUser = true;
    };
    restoreScrollTop();
    requestAnimationFrame(() => {
      restoreScrollTop();
    });
  }
}

document.addEventListener("click", async (e) => {
  const rb = e.target.closest("[data-route]");
  if (rb) {
    route(rb.getAttribute("data-route") || "/");
    return;
  }

  const a = e.target.closest("[data-action]");
  if (!a) return;
  const action = a.getAttribute("data-action");

  try {
    if (action === "composer-token-remove") {
      removeComposerToken(a.getAttribute("data-id"));
      return;
    }
    if (action === "composer-suggest-pick") {
      const idx = Number(a.getAttribute("data-index"));
      const items = Array.isArray(state.composerSuggest?.items) ? state.composerSuggest.items : [];
      if (Number.isFinite(idx) && idx >= 0 && idx < items.length) {
        applyComposerSuggestion(items[idx]);
      }
      return;
    }
    if (action === "toggle-runtime-card") {
      e.preventDefault();
      e.stopPropagation();
      const collapseKey = String(a.getAttribute("data-key") || a.getAttribute("data-id") || "").trim();
      if (!collapseKey) return;
      toggleRuntimeCardExpandState(a, collapseKey);
      return;
    }
    if (action === "send") return await triggerSendIntent("send_button");
    if (action === "stop") {
      state.stopRequested = true;
      state.run.status = "pausing";
      if (!state.busy) {
        state.canResume = true;
      }
      render();
      return;
    }
    if (action === "resume") return await resumeFlow();
    if (action === "toggle-panels") {
      state.panelsOpen = !state.panelsOpen;
      render();
      return;
    }
    if (action === "toggle-review") {
      state.reviewOpen = !state.reviewOpen;
      render();
      return;
    }
    if (action === "review-tab") {
      state.reviewTab = a.getAttribute("data-tab") || "changes";
      render();
      return;
    }
    if (action === "attach-upload") {
      uploadInput.value = "";
      uploadInput.click();
      return;
    }
    if (action === "attach-screenshot") {
      screenshotInput.value = "";
      screenshotInput.click();
      return;
    }
    if (action === "attach-paste-text") {
      const text = prompt("Paste text to attach", "");
      if (text && text.trim()) {
        state.attachments.push({
          id: `a_${Date.now()}`,
          source: "paste",
          name: `paste-${Date.now()}.txt`,
          mime: "text/plain",
          text: text.trim(),
          preview: null
        });
        toast("Text attached", "ok");
        render();
      }
      return;
    }
    if (action === "remove-attachment") {
      state.attachments = state.attachments.filter((x) => x.id !== a.getAttribute("data-id"));
      render();
      return;
    }
    if (action === "preview-attachment") {
      const found = state.attachments.find((x) => x.id === a.getAttribute("data-id") && x.preview);
      if (found) {
        state.imagePreview = found;
        render();
      }
      return;
    }
    if (action === "close-image-preview" || (action === "close-image-preview-bg" && e.target === a)) {
      state.imagePreview = null;
      render();
      return;
    }

    if (action === "new-session") {
      const id = `draft_${Date.now()}`;
      state.draftSession = { id, title: "New Session", status: "draft", created_at: now(), updated_at: now(), workspace_id: state.preflight?.selected_workspace?.id || null };
      state.currentSessionId = id;
      thread(id);
      markThreadAnchorBottom(true);
      syncCurrentClassificationFromSession();
      await refreshContextSettingsForCurrentSession();
      state.modal = null;
      saveThreads();
      route("/");
      toast("Draft session ready", "ok");
      await continuePendingSend("session_new");
      return;
    }

    if (action === "continue-last") {
      try {
        const x = await api("/entry/sessions/continue-last", { method: "POST", body: {} });
        await refreshCore();
        state.currentSessionId = x.session?.id || state.preflight?.last_session?.id || state.sessions[0]?.id || null;
        markThreadAnchorBottom(true);
        syncCurrentClassificationFromSession();
        const cs = currentSession();
        if (cs?.id) {
          await syncSessionTurnsFromBackend(cs.id, { bootstrap: true });
          const refreshed = currentSession();
          if (refreshed?.run_id) {
            await refreshRun(refreshed.run_id);
          }
        }
      } catch {}
      state.modal = null;
      route("/");
      await continuePendingSend("session_continue_last");
      return;
    }

    if (action === "open-session") {
      closeRuntimeEventStream();
      state.currentSessionId = a.getAttribute("data-id");
      markThreadAnchorBottom(true);
      syncCurrentClassificationFromSession();
      await refreshContextSettingsForCurrentSession();
      const cs = currentSession();
      if (cs?.id) {
        await syncSessionTurnsFromBackend(cs.id, { bootstrap: true });
        const refreshed = currentSession();
        if (refreshed?.run_id) {
          await refreshRun(refreshed.run_id);
        }
      }
      render();
      return;
    }

    if (action === "open-home-session") {
      closeRuntimeEventStream();
      state.currentSessionId = a.getAttribute("data-id");
      markThreadAnchorBottom(true);
      syncCurrentClassificationFromSession();
      await refreshContextSettingsForCurrentSession();
      const cs = currentSession();
      if (cs?.id) {
        await syncSessionTurnsFromBackend(cs.id, { bootstrap: true });
        const refreshed = currentSession();
        if (refreshed?.run_id) {
          await refreshRun(refreshed.run_id);
        }
      }
      route("/");
      return;
    }

    if (action === "delete-session") {
      const id = a.getAttribute("data-id");
      if (!state.deleted.includes(id)) state.deleted.push(id);
      saveDeleted();
      if (state.currentSessionId === id) {
        state.currentSessionId = sessionsVisible(state.sessions, "")[0]?.id || null;
        syncCurrentClassificationFromSession();
      }
      render();
      return;
    }

    if (action === "restore-session") {
      const id = a.getAttribute("data-id");
      state.deleted = state.deleted.filter((x) => x !== id);
      saveDeleted();
      render();
      return;
    }

    if (action === "open-modal-workspace") {
      state.modal = "workspace";
      render();
      return;
    }
    if (action === "open-folder") {
      state.openFolderRelPath = "";
      state.modal = "open-folder";
      render();
      return;
    }
    if (action === "confirm-open-folder") {
      const relPath = String(state.openFolderRelPath || "").trim();
      await openWorkspaceFolder(relPath || null);
      state.modal = null;
      render();
      return;
    }
    if (action === "copy-workspace-path") {
      await copyWorkspacePath();
      return;
    }

    if (action === "pick-workspace-source") {
      await pickWorkspaceSource();
      return;
    }

    if (action === "create-workspace" || action === "create-workspace-modal") {
      if (!state.workspaceForm.confirmed) {
        throw new Error("workspace_boundary_confirmation_required");
      }
      const sourceMode = state.workspaceForm.sourceMode;
      const label = String(state.workspaceForm.label || "").trim() || `workspace-${Date.now()}`;
      if (sourceMode === "existing_workspace_path") {
        const workspacePath = String(state.workspaceForm.workspacePath || "").trim();
        if (!workspacePath) {
          throw new Error("workspace_path_required");
        }
        await api("/entry/workspaces/select", {
          method: "POST",
          body: { workspace_path: workspacePath }
        });
      } else {
        await api("/entry/workspaces", {
          method: "POST",
          body: { workspace_name: label, select_now: true }
        });
      }
      await refreshCore();
      state.modal = null;
      toast("Workspace selected", "ok");
      render();
      await continuePendingSend("workspace_selected");
      return;
    }

    if (action === "select-workspace") {
      await api("/entry/workspaces/select", {
        method: "POST",
        body: { workspace_id: a.getAttribute("data-id") }
      });
      await refreshCore();
      state.modal = null;
      toast("Workspace selected", "ok");
      render();
      await continuePendingSend("workspace_selected_row");
      return;
    }

    if (action === "grant-access") {
      await api("/entry/access/grant", {
        method: "POST",
        body: { granted: true, source: "entry_frontend" }
      });
      await refreshCore();
      state.modal = null;
      toast("Access granted", "ok");
      render();
      await continuePendingSend("access_granted");
      return;
    }

    if (action === "recheck-access") {
      await api("/entry/access/recheck", { method: "POST", body: {} });
      await refreshCore();
      toast("Access rechecked", "ok");
      render();
      await continuePendingSend("access_rechecked");
      return;
    }

    if (action === "save-context-settings") {
      if (!hasPersistedCurrentSession()) {
        throw new Error("persisted_session_required_for_context_settings");
      }
      const cfg = contextSettingsForUi();
      await patchContextSettingsForCurrentSession(
        {
          auto_compact_after_task_lane: cfg.auto_compact_after_task_lane,
          auto_compact_enabled: cfg.auto_compact_enabled,
          event_threshold: cfg.event_threshold,
          token_threshold: cfg.token_threshold,
          stdout_stderr_threshold: cfg.stdout_stderr_threshold,
          artifacts_threshold: cfg.artifacts_threshold,
          repair_round_threshold: cfg.repair_round_threshold
        },
        "settings_save_button"
      );
      toast("Automation settings saved", "ok");
      render();
      return;
    }

    if (action === "manual-context-compact") {
      await triggerManualContextCompaction({
        reason: "manual_settings_button_compact",
        timeoutMs: 15000,
        simulateTimeout: false,
        source: "settings_button"
      });
      render();
      return;
    }

    if (action === "insert-invalid") {
      state.byo.key = PLACEHOLDER_API_KEY;
      render();
      return;
    }

    if (action === "bind-byo") {
      state.byo.ui = "binding";
      state.byo.validation = "binding";
      state.byo.error = null;
      render();
      const out = await api("/entry/byo/openai/bind", { method: "POST", body: { api_key: String(state.byo.key || "").trim(), validate_now: true } });
      state.byo.ui = "validating";
      state.byo.validation = "validating";
      render();
      log("byo_bind", out);
      await refreshCore();
      if (!(state.byo.bound && state.byo.validation === "valid")) {
        throw new Error(out?.message || "validation_failed");
      }
      state.modal = null;
      toast("BYO bound and verified", "ok");
      render();
      await continuePendingSend("byo_bound_valid");
      return;
    }

    if (action === "clear-byo") {
      await api("/entry/byo/openai/clear", { method: "POST", body: {} });
      await refreshCore();
      toast("BYO cleared", "ok");
      render();
      return;
    }

    if (action === "close-modal") {
      state.modal = null;
      render();
      return;
    }

    if (action === "close-modal-bg" && e.target === a) {
      state.modal = null;
      render();
      return;
    }
  } catch (err) {
    toast(String(err?.payload?.message || err?.payload?.error || err.message || err), "bad");
    log("action_error", err.payload || { message: String(err.message || err) });
    render();
  }
});

uploadInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const f of files) state.attachments.push(await makeAttachment(f, "upload"));
  toast("Files queued", "ok");
  render();
});

screenshotInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  for (const f of files) state.attachments.push(await makeAttachment(f, "screenshot"));
  toast("Screenshot queued", "ok");
  render();
});

window.addEventListener("popstate", () => {
  state.route = location.pathname === "/settings" ? "/settings" : location.pathname === "/sessions" ? "/sessions" : "/";
  render();
});

(async function init() {
  try {
    await refreshCore();
    syncCurrentClassificationFromSession();
    await refreshContextSettingsForCurrentSession();
    const cs = currentSession();
    if (cs?.id) {
      await syncSessionTurnsFromBackend(cs.id, { bootstrap: true });
      const refreshed = currentSession();
      if (refreshed?.run_id) {
        await refreshRun(refreshed.run_id);
      }
    }
  } catch (e) {
    toast("Entry API unavailable", "bad");
    log("bootstrap_failed", e.payload || { message: String(e.message || e) });
  }
  state.loading = false;
  render();

  setInterval(async () => {
    try {
      await Promise.all([refreshPreflight(), refreshAccessStatus(), refreshByoStatus()]);
      await refreshContextSettingsForCurrentSession();
      const s = currentSession();
      const streamActive =
        Boolean(state.runtimeStream?.source) &&
        String(state.runtimeStream?.runId || "").trim().length > 0 &&
        isRunActiveStatus(state.run.status);
      if (s?.id && !streamActive) {
        await syncSessionTurnsFromBackend(s.id, { bootstrap: false });
        const refreshed = currentSession();
        if (refreshed?.run_id) {
          await refreshRun(refreshed.run_id);
        }
      }
      if (state.route === "/") {
        render();
      } else if (!refreshStatusBadgesOnly()) {
        render();
      }
    } catch {
      // no-op
    }
  }, 12000);
})();
