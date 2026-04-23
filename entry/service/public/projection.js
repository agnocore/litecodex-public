export const DISPLAY_EVENT_TYPES = Object.freeze({
  USER_MESSAGE: "user_message",
  ASSISTANT_REPLY: "assistant_reply",
  TASK_PROGRESS: "task_progress",
  AUTH_REQUIRED: "auth_required",
  ATTACHMENT_ADDED: "attachment_added",
  VERIFY_SUMMARY: "verify_summary",
  DEPLOY_SUMMARY: "deploy_summary",
  RECOVERY_SUMMARY: "recovery_summary"
});

export const DISPLAY_EVENT_LANES = Object.freeze({
  CHAT: "chat",
  TASK: "task",
  SYSTEM: "system",
  RECEIPT: "receipt"
});

const MAIN_THREAD_ALLOWED_TYPES = Object.freeze([
  DISPLAY_EVENT_TYPES.USER_MESSAGE,
  DISPLAY_EVENT_TYPES.ASSISTANT_REPLY
]);

export const DISPLAY_EVENT_CONTRACT = Object.freeze({
  version: "v1.display-event-projection-main-thread-chat-only",
  mainThreadAllowed: MAIN_THREAD_ALLOWED_TYPES,
  lanes: Object.values(DISPLAY_EVENT_LANES),
  internalRoute: Object.freeze({
    logsTab: "review.logs",
    traceTab: "review.logs"
  })
});

const DISPLAY_EVENT_META = Object.freeze({
  [DISPLAY_EVENT_TYPES.USER_MESSAGE]: { label: "User Message", className: "user-message" },
  [DISPLAY_EVENT_TYPES.ASSISTANT_REPLY]: { label: "Assistant Reply", className: "assistant-reply" },
  [DISPLAY_EVENT_TYPES.TASK_PROGRESS]: { label: "Task Progress", className: "task-progress" },
  [DISPLAY_EVENT_TYPES.AUTH_REQUIRED]: { label: "Auth Required", className: "auth-required" },
  [DISPLAY_EVENT_TYPES.ATTACHMENT_ADDED]: { label: "Attachment Added", className: "attachment-added" },
  [DISPLAY_EVENT_TYPES.VERIFY_SUMMARY]: { label: "Verify Summary", className: "verify-summary" },
  [DISPLAY_EVENT_TYPES.DEPLOY_SUMMARY]: { label: "Deploy Summary", className: "deploy-summary" },
  [DISPLAY_EVENT_TYPES.RECOVERY_SUMMARY]: { label: "Recovery Summary", className: "recovery-summary" }
});

const INTERNAL_TEXT_PATTERNS = [
  /\bmode=analysis\b/i,
  /\bexecution_mode=answer_only\b/i,
  /\brequires_tools=no\b/i,
  /\bcompact_run=/i,
  /context projection verified/i,
  /context assembled from compact\+delta/i,
  /\bworkspace_id:/i,
  /\blane_detail:/i,
  /\bcontext_mode:/i
];

const PROVISIONAL_ASSISTANT_REPLY_PATTERNS = [
  /^已收到你的(请求|问题)/,
  /^收到。/,
  /^已准备好继续。/
];

export function getDisplayEventMeta(displayType) {
  return DISPLAY_EVENT_META[displayType] || DISPLAY_EVENT_META[DISPLAY_EVENT_TYPES.TASK_PROGRESS];
}

export function isDisplayEventTypeAllowed(displayType) {
  return MAIN_THREAD_ALLOWED_TYPES.includes(displayType);
}

function normalizeDisplayLane(rawLane, displayType) {
  const lane = String(rawLane || "").trim().toLowerCase();
  if (Object.values(DISPLAY_EVENT_LANES).includes(lane)) {
    return lane;
  }
  if (displayType === DISPLAY_EVENT_TYPES.USER_MESSAGE || displayType === DISPLAY_EVENT_TYPES.ASSISTANT_REPLY) {
    return DISPLAY_EVENT_LANES.CHAT;
  }
  return DISPLAY_EVENT_LANES.TASK;
}

export function isProvisionalAssistantReply(body) {
  const text = String(body || "").trim();
  if (!text) {
    return false;
  }
  return PROVISIONAL_ASSISTANT_REPLY_PATTERNS.some((pattern) => pattern.test(text));
}

export function isMainThreadDisplayEvent(event) {
  if (!event || typeof event !== "object") {
    return false;
  }
  return isDisplayEventTypeAllowed(event.displayType) && String(event.lane || "") === DISPLAY_EVENT_LANES.CHAT;
}

export function sanitizeDisplayBody(body) {
  const text = String(body || "").trim();
  if (!text) {
    return "";
  }
  for (const pattern of INTERNAL_TEXT_PATTERNS) {
    if (pattern.test(text)) {
      return "";
    }
  }
  return text;
}

export function normalizeBackendDisplayEvent(event) {
  if (!event || typeof event !== "object") return null;
  const displayType = String(event.display_type || event.displayType || "").trim();
  if (!displayType || !DISPLAY_EVENT_META[displayType]) return null;
  const lane = normalizeDisplayLane(event.lane || event.display_lane || event.lane_hint, displayType);
  if (lane !== DISPLAY_EVENT_LANES.CHAT) return null;
  if (!isDisplayEventTypeAllowed(displayType)) return null;
  const body = sanitizeDisplayBody(event.body ?? event.message ?? event.summary ?? "");
  if (!body) return null;
  if (displayType === DISPLAY_EVENT_TYPES.ASSISTANT_REPLY && isProvisionalAssistantReply(body)) {
    return null;
  }
  const seq = Number(event.seq);
  const createdAt = String(event.created_at || event.createdAt || "").trim() || null;
  const dedupeKey = String(event.dedupe_key || event.dedupeKey || "").trim() || null;
  return {
    displayType,
    body,
    lane,
    seq: Number.isFinite(seq) ? seq : null,
    createdAt,
    dedupeKey,
    isMainThread: true,
    sourceEventType: String(event.source_event_type || event.sourceEventType || "").trim() || null
  };
}
