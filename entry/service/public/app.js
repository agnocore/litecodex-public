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
  sidebarSearch: "",
  pageSearch: "",
  composer: "",
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
  autoCompact: true
  ,
  threadAnchor: "bottom",
  threadScrollPinnedByUser: false,
  threadRenderKey: null
};

const logs = [];

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
  if (!trigger) {
    if (!state.composerSuggest?.open) {
      return;
    }
    closeComposerSuggest();
    render({ keepComposerFocus: true, caret });
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
  render({ keepComposerFocus: true, caret });
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
    render({ keepComposerFocus: true, caret });
  } catch {
    if (reqSeq !== composerSuggestRequestSeq) return;
    closeComposerSuggest();
    render({ keepComposerFocus: true, caret });
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
  render({ keepComposerFocus: true, caret: Number(state.composerSuggest.triggerEnd || state.composer.length) });
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

  const cs = currentSession();
  if (cs?.run_id) {
    await refreshRun(cs.run_id);
  }
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
    const hydrateMode = String(contextProjection?.hydration_mode || projection?.hydrate_mode || "");
    const resumedCursor = contextProjection?.resume_cursor;

    state.run.id = runId;
    state.run.status = String(
      projection?.run_status || projection?.final_projection_status || hyd?.status || hyd?.hydration?.status || "running"
    );

    state.context.assembled = Boolean(contextProjection || projection || hyd?.context || hyd?.hydration);
    state.context.compacted = Boolean(compactRunId || hydrateMode.includes("compact"));
    state.context.resumed = Boolean(
      compactRunId ||
        (resumedCursor !== null && resumedCursor !== undefined) ||
        hydrateMode.includes("compact")
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

function topbar() {
  const ws = currentWorkspace();
  const sess = state.currentSessionId ? (state.draftSession && state.currentSessionId === state.draftSession.id ? "draft" : "active") : "none";
  const byo = byoUiLabel(state.byo.ui);
  const byoClass = state.byo.ui === "valid" ? "ok" : state.byo.ui === "invalid" ? "bad" : "warn";
  return `<header class="topbar"><div class="top-status"><span class="brand">lite-codex</span><span class="chip ${state.preflight?.host_connected ? "ok" : "bad"}">host:${state.preflight?.host_connected ? "connected" : "offline"}</span><span class="chip ${ws ? "ok" : "warn"}">workspace:${esc(prettyWorkspaceLabel(ws))}</span><span class="chip ${state.access.granted ? "ok" : "warn"}">access:${state.access.granted ? "granted" : "required"}</span><span class="chip ${byoClass}">OpenAI BYO:${esc(byo)}</span><span class="chip ${sess === "none" ? "warn" : "ok"}">session:${esc(sess)}</span><span class="chip ${state.run.status === "failed" ? "bad" : "ok"}">lane:${esc(state.run.lane)}</span></div><div class="top-actions"><button class="link-btn ${state.route === "/" ? "active" : ""}" data-route="/">Home</button><button class="link-btn ${state.route === "/sessions" ? "active" : ""}" data-route="/sessions">Sessions</button><button class="link-btn ${state.route === "/settings" ? "active" : ""}" data-route="/settings">Settings</button></div></header>`;
}

function settingsHtml() {
  return `<section class="page-wrap" data-proof="settings-dedup"><article class="page-card"><h2>Workspace Management</h2><div class="field"><input class="input" data-bind="workspace-label" value="${esc(state.workspaceForm.label)}" placeholder="workspace label"/></div><div class="row"><button class="primary-btn" data-action="create-workspace">Create and Select</button><button class="ghost-btn" data-action="open-modal-workspace">Open Dialog</button></div><hr/>${state.workspaces.map((w) => `<div class="row" style="justify-content:space-between; margin-bottom:6px;"><div><b>${esc(prettyWorkspaceLabel(w))}</b><div class="note">${esc(workspaceSourceSummary(w))}</div></div><button class="ghost-btn" data-action="select-workspace" data-id="${esc(w.id)}">Select</button></div>`).join("")}</article><article class="page-card"><h2>OpenAI BYO Management</h2><div class="field"><input class="input" type="password" data-bind="byo-key" value="${esc(state.byo.key)}" placeholder="sk-..."/></div><div class="row"><button class="primary-btn" data-action="bind-byo">Bind + Validate</button><button class="ghost-btn" data-action="clear-byo">Clear</button></div><div class="note">State: ${esc(byoUiLabel(state.byo.ui))}</div></article><article class="page-card"><h2>Full Access Management</h2><div class="row"><button class="primary-btn" data-action="grant-access">Grant</button><button class="ghost-btn" data-action="recheck-access">Recheck</button></div><div class="note">Current: ${state.access.granted ? "Granted" : "Not granted"}</div></article><article class="page-card"><h2>Automation</h2><label><input data-bind="auto-compact" type="checkbox" ${state.autoCompact ? "checked" : ""}/> Auto compact after task lane</label></article></section>`;
}

function sessionsHtml() {
  const active = sessionsVisible(state.sessions, state.pageSearch);
  const deleted = state.sessions.filter((s) => state.deleted.includes(s.id));
  return `<section class="page-wrap" data-proof="sessions-bridge"><article class="page-card" style="grid-column:1/-1;"><h2>Session Manager</h2><div class="row"><button class="primary-btn" data-action="new-session">New Session</button><button class="ghost-btn" data-action="continue-last">Continue Last Session</button></div><div class="field" style="margin-top:8px;"><input class="input" data-bind="page-search" value="${esc(state.pageSearch)}" placeholder="Search sessions"/></div></article><article class="page-card"><h2>Active Sessions</h2>${active.map((s) => `<div class="block" style="padding:10px;margin-bottom:8px;"><div><b>${esc((thread(s.id).find((x) => x.displayType === DISPLAY_EVENT_TYPES.USER_MESSAGE)?.body || s.title || "Session").slice(0, 36))}</b></div><div class="note">${esc(t(s.updated_at || s.created_at || now()))}</div><div class="note">${esc(state.classifications[s.id] ? `${state.classifications[s.id].lane}/${state.classifications[s.id].intent}` : "no classification yet")}</div><div class="row" style="margin-top:8px;"><button class="ghost-btn" data-action="open-home-session" data-id="${esc(s.id)}">Open in Home</button><button class="danger-btn" data-action="delete-session" data-id="${esc(s.id)}">Delete</button></div></div>`).join("") || `<div class="note">No active sessions.</div>`}</article><article class="page-card"><h2>Deleted Sessions</h2>${deleted.map((s) => `<div class="block" style="padding:10px;margin-bottom:8px;"><div><b>${esc(s.title || "Session")}</b></div><button class="ghost-btn" data-action="restore-session" data-id="${esc(s.id)}">Restore</button></div>`).join("") || `<div class="note">No deleted sessions.</div>`}</article></section>`;
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

function captureComposerSnapshot() {
  const active = document.activeElement;
  if (!(active instanceof HTMLTextAreaElement)) return null;
  if (active.getAttribute("data-bind") !== "composer") return null;
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
  try {
    composer.focus({ preventScroll: true });
  } catch {
    composer.focus();
  }
  try {
    composer.setSelectionRange(start, end);
  } catch {
    // no-op
  }
}

function render(options = null) {
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
      void refreshComposerSuggest(state.composer, e.target.selectionStart);
    });
    composer.addEventListener("input", (e) => {
      state.composer = e.target.value;
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
  if (autoCompact) autoCompact.addEventListener("change", (e) => { state.autoCompact = !!e.target.checked; });
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
  ta.focus();
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
    const s = currentSession();
    if (s?.id) {
      appendDisplayEvent(s.id, DISPLAY_EVENT_TYPES.TASK_PROGRESS, `Workspace path copied: ${p}`, {
        source: "workspace_action"
      });
    }
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

function cardsHtml() {
  const cs = currentSession();
  if (!cs) {
    return `<div class="empty-thread">No active session. Click <b>New Session</b> then send first message.</div>`;
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
  return `<section class="composer" id="composerArea">${atts ? `<div class="attachment-tray">${atts}</div>` : ""}${tokenTray}<textarea data-bind="composer" placeholder="${composePlaceholder()}" ${runLocked ? "disabled" : ""}>${esc(state.composer)}</textarea>${suggestHtml}<div class="composer-actions"><div class="left-actions"><button class="ghost-btn" data-action="attach-upload" ${runLocked ? "disabled" : ""}>${uploadButtonTitle()}</button><button class="ghost-btn" data-action="attach-paste-text" ${runLocked ? "disabled" : ""}>${pasteButtonTitle()}</button><button class="ghost-btn" data-action="attach-screenshot" ${runLocked ? "disabled" : ""}>${screenshotButtonTitle()}</button></div><div class="right-actions">${state.canResume ? `<button class="ghost-btn" data-action="resume">${resumeButtonTitle()}</button>` : ""}${showStop ? `<button class="danger-btn" data-action="stop">${stopButtonTitle()}</button>` : ""}<button class="primary-btn" data-action="send" ${runLocked ? "disabled" : ""}>${sendButtonTitle()}</button></div></div></section>`;
}

function renderHomeMain(workspace, cls, atts) {
  const threadHtml = state.panelsOpen ? `<section class="thread" id="homeThread">${renderThreadCardsHtml()}</section>` : "";
  const reviewHtml = state.panelsOpen ? renderReviewPane() : "";
  return `<section class="main-shell ${state.panelsOpen ? "panels-open" : "panels-hidden"}"><div class="main-center"><header class="main-head"><div class="main-head-row"><h1>${homeThreadHeaderTitle()}</h1><div class="row"><span class="chip ${state.context.assembled ? "ok" : "warn"}">autocontext:${state.context.assembled ? "ready" : "pending"}</span><span class="chip ${state.context.compacted ? "ok" : "warn"}">compact:${state.context.compacted ? "active" : "idle"}</span><span class="chip ${state.context.resumed ? "ok" : "warn"}">resume:${state.context.resumed ? "yes" : "no"}</span><span class="chip ${isSendLockedByRunState() ? "warn" : "ok"}">run:${esc(state.run.status || "idle")}</span>${cls ? `<span class="chip ${cls.lane === "task" ? "ok" : "warn"}">intent:${esc(cls.intent || "-")}</span><span class="chip ${cls.riskLevel === "approval_required" ? "bad" : cls.riskLevel === "guarded" ? "warn" : "ok"}">risk:${esc(cls.riskLevel || "low")}</span>` : ""}</div></div><div class="meta">${renderHomeHeaderMeta(workspace, cls)}</div><div class="row main-head-actions"><button class="ghost-btn" data-action="open-modal-workspace">${switchWorkspaceButtonTitle()}</button><button class="ghost-btn" data-action="open-folder">${openFolderButtonTitle()}</button><button class="ghost-btn" data-action="copy-workspace-path">${copyPathButtonTitle()}</button><button class="ghost-btn" data-action="toggle-panels">${togglePanelsButtonTitle()}</button></div></header>${threadHtml}${renderComposer(atts)}</div>${reviewHtml}</section>`;
}

function renderSessionListItemTitle(session) {
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
  for (const turn of turns) {
    const runId = String(turn?.run_id || "").trim();
    if (!runId) continue;
    await syncRunEventsFromBackend(sessionId, runId, { bootstrap });
  }
}

async function waitForRunTerminal(sessionId, runId, { timeoutMs = 120000 } = {}) {
  const startedAt = Date.now();
  let latestStatus = state.run.status || "running";
  while (Date.now() - startedAt < timeoutMs) {
    const details = await api(`/runs/${encodeURIComponent(runId)}`);
    latestStatus = String(details?.run?.status || latestStatus || "running");
    state.run.status = latestStatus;
    await syncRunEventsFromBackend(sessionId, runId, { bootstrap: false });
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
      appendDisplayEvent(sess.id, DISPLAY_EVENT_TYPES.USER_MESSAGE, rawText || prompt, {
        source: "composer_host_action_user",
        lane: "chat"
      });
      appendDisplayEvent(sess.id, DISPLAY_EVENT_TYPES.ASSISTANT_REPLY, `Host action accepted: ${actionSummary}`, {
        source: "composer_host_action_reply",
        lane: "chat"
      });
      toast("Host action executed", "ok");
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

    await syncRunEventsFromBackend(sess.id, runId, { bootstrap: true });
    const finalStatus = await waitForRunTerminal(sess.id, runId, { timeoutMs: 120000 });
    state.run.status = finalStatus;
    state.canResume = false;

    if (state.autoCompact && detail.lane === "task" && !isRunActiveStatus(finalStatus)) {
      const compactRes = await api(`/runs/${encodeURIComponent(runId)}/compact`, { method: "POST", body: { mode: "manual" } });
      log("compact", compactRes);
      await refreshRun(runId);
      await syncRunEventsFromBackend(sess.id, runId, { bootstrap: false });
    }
  } catch (e) {
    state.run.status = "failed_controlled";
    state.canResume = true;
    toast(String(e?.payload?.message || e?.payload?.error || e.message || e), "bad");
    log("turn_send_failed", e?.payload || { message: String(e?.message || e) });
  } finally {
    state.busy = false;
    state.stopRequested = false;
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
  const rawPrompt = normalizePrompt(state.composer || state.composerTokens.map((token) => token.label || "").join(" "));
  if (rawPrompt) {
    appendDisplayEvent(sess.id, DISPLAY_EVENT_TYPES.USER_MESSAGE, rawPrompt, {
      source: "composer_host_action_user",
      lane: "chat"
    });
  }
  const targetText = hostAction.rel_path ? ` ${hostAction.rel_path}` : "";
  appendDisplayEvent(sess.id, DISPLAY_EVENT_TYPES.ASSISTANT_REPLY, `Host action accepted: ${actionType}${targetText}`.trim(), {
    source: "composer_host_action_reply",
    lane: "chat"
  });
  state.pendingSend = null;
  state.composer = "";
  state.composerTokens = [];
  state.attachments = [];
  closeComposerSuggest();
  toast("Host action executed", "ok");
  log("composer_host_action", { action: actionType, result });
  saveThreads();
  render();
  return true;
}

async function runSendPipeline(pending) {
  restorePendingSendSnapshot();
  const tokenPrompt = state.composerTokens.map((token) => token.label || "").filter(Boolean).join(" ");
  const prompt = normalizePrompt(state.composer || tokenPrompt);
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
      state.currentSessionId = a.getAttribute("data-id");
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
      render();
      return;
    }

    if (action === "open-home-session") {
      state.currentSessionId = a.getAttribute("data-id");
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
      const s = currentSession();
      if (s?.id) {
        await syncSessionTurnsFromBackend(s.id, { bootstrap: false });
        const refreshed = currentSession();
        if (refreshed?.run_id) {
          await refreshRun(refreshed.run_id);
        }
      }
      render();
    } catch {
      // no-op
    }
  }, 12000);
})();
