import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ensureDir, nowIso, normalizeString } from "./http-helpers.mjs";

function randomId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function appendNdjson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf8");
}

function parseNdjson(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  const rows = [];
  for (const line of lines) {
    try {
      rows.push(JSON.parse(line));
    } catch {
      // ignore bad line
    }
  }
  return rows;
}

function sha256Text(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function parseBoolean(value, fallback = false) {
  if (value === true || value === false) {
    return value;
  }
  if (value === 1 || value === "1") {
    return true;
  }
  if (value === 0 || value === "0") {
    return false;
  }
  return fallback;
}

function parseInteger(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

export function createHostState({ repoRoot, runsRoot, workspacesRoot }) {
  ensureDir(repoRoot);
  ensureDir(runsRoot);
  ensureDir(workspacesRoot);

  const runs = new Map();
  const sessions = new Map();
  const workspaces = new Map();
  const attachmentsBySession = new Map();
  const turnsBySession = new Map();
  const capabilityGrants = [];
  const globalEvents = [];
  const contextSettingsBySession = new Map();
  const contextSettingsFile = path.join(repoRoot, "entry", "state", "context-settings.v1.json");
  const accessState = {
    full_access_granted: false,
    updated_at: nowIso(),
    source: "community_default"
  };
  let eventSeq = 0;

  for (const name of fs.readdirSync(runsRoot)) {
    const runDir = path.join(runsRoot, name);
    const stat = fs.statSync(runDir);
    if (!stat.isDirectory()) {
      continue;
    }
    const meta = readJson(path.join(runDir, "meta.json"));
    if (!meta || !meta.id) {
      continue;
    }
    runs.set(String(meta.id), meta);
    const events = parseNdjson(path.join(runDir, "events.ndjson"));
    for (const event of events) {
      const idMatch = String(event.id || "").match(/^ev_(\d+)$/);
      if (idMatch) {
        eventSeq = Math.max(eventSeq, Number(idMatch[1]));
      }
      globalEvents.push(event);
    }
  }

  const contextFilePayload = readJson(contextSettingsFile, {});
  const contextRows =
    contextFilePayload && typeof contextFilePayload === "object" && contextFilePayload.sessions
      ? contextFilePayload.sessions
      : {};
  for (const [sessionId, row] of Object.entries(contextRows)) {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      continue;
    }
    if (!row || typeof row !== "object") {
      continue;
    }
    contextSettingsBySession.set(sessionId, { ...row, session_id: sessionId });
  }

  function runDir(runId) {
    return path.join(runsRoot, String(runId));
  }

  function saveRunMeta(run) {
    const dir = runDir(run.id);
    ensureDir(dir);
    writeJson(path.join(dir, "meta.json"), run);
  }

  function nextEventId() {
    eventSeq += 1;
    return `ev_${eventSeq}`;
  }

  function emitEvent({ type, runId = null, payload = {} }) {
    const seq = eventSeq + 1;
    const event = {
      id: nextEventId(),
      seq,
      type: String(type || "event.unknown"),
      run_id: runId ? String(runId) : null,
      created_at: nowIso(),
      payload
    };
    globalEvents.push(event);
    if (globalEvents.length > 4000) {
      globalEvents.splice(0, globalEvents.length - 4000);
    }
    if (runId && runs.has(String(runId))) {
      appendNdjson(path.join(runDir(runId), "events.ndjson"), event);
    }
    return event;
  }

  function createRun({ title = "Community run", source = "community" } = {}) {
    const id = randomId("run");
    const run = {
      id,
      title: normalizeString(title, `Run ${id}`),
      status: "running",
      created_at: nowIso(),
      updated_at: nowIso(),
      source: String(source || "community"),
      mode: "community"
    };
    runs.set(id, run);
    saveRunMeta(run);
    emitEvent({ type: "run.created", runId: id, payload: { run_id: id, title: run.title, status: run.status } });
    return run;
  }

  function listRuns() {
    return [...runs.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  function getRun(runId) {
    return runs.get(String(runId)) || null;
  }

  function updateRun(runId, patch) {
    const existing = getRun(runId);
    if (!existing) {
      return null;
    }
    const updated = {
      ...existing,
      ...patch,
      updated_at: nowIso()
    };
    runs.set(updated.id, updated);
    saveRunMeta(updated);
    return updated;
  }

  function hydrateRun(runId, { useCompact = false } = {}) {
    const run = getRun(runId);
    if (!run) {
      return null;
    }
    const session = findSessionByRunId(run.id);
    const settings = session ? getContextSettings(session.id) : null;
    const compactFile = path.join(runDir(run.id), "compact", "latest.json");
    const compact = useCompact ? readJson(compactFile, null) : null;
    const hydratedMode = compact ? "compact_snapshot" : "raw";
    const projection = {
      run_id: run.id,
      run_status: run.status,
      final_projection_status: run.status,
      hydrate_mode: hydratedMode,
      compact_run_id: compact ? run.id : null,
      compact_snapshot_id: compact?.hash || null,
      compact_integrity_hash: compact?.hash || null
    };
    const contextProjection = {
      hydration_mode: hydratedMode,
      compact_run_id: projection.compact_run_id,
      compact_snapshot_id: projection.compact_snapshot_id,
      resume_cursor: null
    };
    return {
      run_id: run.id,
      status: run.status,
      compact,
      projection,
      context_projection: contextProjection,
      context_settings: settings,
      context: {
        title: run.title,
        source: run.source,
        updated_at: run.updated_at
      }
    };
  }

  function compactRun(runId, { mode = "manual" } = {}) {
    const run = getRun(runId);
    if (!run) {
      return null;
    }
    const artifact = {
      run_id: run.id,
      mode: String(mode || "manual"),
      created_at: nowIso(),
      snapshot: {
        title: run.title,
        status: run.status,
        source: run.source,
        updated_at: run.updated_at
      }
    };
    const hash = sha256Text(JSON.stringify(artifact));
    const compactPayload = {
      ...artifact,
      hash
    };
    const compactPath = path.join(runDir(run.id), "compact", "latest.json");
    writeJson(compactPath, compactPayload);
    emitEvent({
      type: "compact.completed",
      runId: run.id,
      payload: {
        run_id: run.id,
        mode: compactPayload.mode,
        hash: compactPayload.hash,
        artifact_path: compactPath
      }
    });
    return compactPayload;
  }

  function getEventsSince(lastEventId = null) {
    if (!lastEventId) {
      return [...globalEvents];
    }
    const index = globalEvents.findIndex((event) => String(event.id) === String(lastEventId));
    if (index < 0) {
      return [...globalEvents];
    }
    return globalEvents.slice(index + 1);
  }

  function createWorkspace({ name = "workspace" } = {}) {
    const id = randomId("ws");
    const safeName = normalizeString(name, id).toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
    const workspacePath = path.join(workspacesRoot, safeName || id);
    ensureDir(workspacePath);
    const row = {
      id,
      name: safeName || id,
      workspace_path: workspacePath,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    workspaces.set(id, row);
    return row;
  }

  function listWorkspaces() {
    return [...workspaces.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  function getWorkspace(workspaceId) {
    return workspaces.get(String(workspaceId || "")) || null;
  }

  function createSession({ workspaceId = null, runId = null } = {}) {
    const run = runId ? getRun(runId) : createRun({ title: "Entry session run", source: "entry_session" });
    if (!run) {
      return null;
    }
    const workspace = workspaceId ? workspaces.get(String(workspaceId)) || null : null;
    const id = randomId("sess");
    const row = {
      id,
      run_id: run.id,
      workspace_id: workspace ? workspace.id : workspaceId,
      workspace_path: workspace?.workspace_path || null,
      status: "active",
      created_at: nowIso(),
      updated_at: nowIso()
    };
    sessions.set(id, row);
    turnsBySession.set(id, []);
    emitEvent({
      type: "session.created",
      runId: run.id,
      payload: {
        session_id: id,
        run_id: run.id,
        workspace_id: workspaceId
      }
    });
    return row;
  }

  function listTurns(sessionId) {
    return [...(turnsBySession.get(String(sessionId)) || [])];
  }

  function listRunEvents(runId, sinceSeq = 0) {
    const id = String(runId || "").trim();
    if (!id) return [];
    const since = Number.isFinite(Number(sinceSeq)) ? Number(sinceSeq) : 0;
    return globalEvents
      .filter((event) => event.run_id === id && Number(event.seq || 0) > since)
      .map((event) => ({
        seq: Number(event.seq || 0),
        type: event.type,
        created_at: event.created_at,
        payload: event.payload || {}
      }))
      .sort((a, b) => a.seq - b.seq);
  }

  function listRunDisplayEvents(runId, sinceSeq = 0) {
    const rows = listRunEvents(runId, sinceSeq);
    return rows
      .filter((event) => event.type === "display.event")
      .map((event) => ({
        seq: event.seq,
        display_type: String(event.payload?.display_type || "").trim(),
        lane: String(event.payload?.lane || "chat").trim() || "chat",
        body: String(event.payload?.body || "").trim(),
        source_event_type: String(event.payload?.source_event_type || "display.event"),
        created_at: event.created_at,
        dedupe_key:
          typeof event.payload?.dedupe_key === "string" && event.payload.dedupe_key.trim()
            ? event.payload.dedupe_key.trim()
            : `${runId}:${event.seq}:${String(event.payload?.display_type || "event")}`
      }))
      .filter((event) => event.display_type && event.body);
  }

  function createTurn({ sessionId, prompt = "", lane = "chat", classification = null, attachments = [] } = {}) {
    const session = getSession(sessionId);
    if (!session) {
      return null;
    }
    const normalizedPrompt = normalizeString(prompt, "");
    const run = createRun({
      title: normalizedPrompt ? `Turn: ${normalizedPrompt.slice(0, 40)}` : "Turn",
      source: "entry_turn"
    });
    const turn = {
      id: randomId("turn"),
      session_id: session.id,
      run_id: run.id,
      lane: String(lane || "chat"),
      prompt: normalizedPrompt,
      classification: classification && typeof classification === "object" ? classification : null,
      attachments: Array.isArray(attachments) ? attachments : [],
      created_at: nowIso(),
      updated_at: nowIso()
    };
    const turns = turnsBySession.get(session.id) || [];
    turns.push(turn);
    turnsBySession.set(session.id, turns);

    session.run_id = run.id;
    session.updated_at = nowIso();
    sessions.set(session.id, session);

    emitEvent({
      runId: run.id,
      type: "display.event",
      payload: {
        display_type: "user_message",
        lane: "chat",
        body: normalizedPrompt || "Attachment turn",
        source_event_type: "entry.turn.user_message"
      }
    });
    const assistantBody = normalizedPrompt
      ? `社区执行已完成：${normalizedPrompt.slice(0, 320)}`
      : "社区执行已完成：附件输入已接收。";
    emitEvent({
      runId: run.id,
      type: "display.event",
      payload: {
        display_type: "assistant_reply",
        lane: "chat",
        body: assistantBody,
        source_event_type: "entry.turn.assistant_reply"
      }
    });
    emitEvent({
      runId: run.id,
      type: "run.completed",
      payload: {
        run_id: run.id,
        status: "completed",
        session_id: session.id,
        turn_id: turn.id
      }
    });
    updateRun(run.id, { status: "completed" });
    return {
      session: { ...session },
      run: getRun(run.id),
      turn
    };
  }

  function getRunDetails(runId) {
    const run = getRun(runId);
    if (!run) return null;
    return {
      run,
      events: listRunEvents(run.id, 0),
      display_events: listRunDisplayEvents(run.id, 0),
      display_event_contract: {
        version: "v1.display-event-projection-main-thread-chat-only",
        main_thread_allowed: ["user_message", "assistant_reply"],
        lanes: ["chat", "task", "system", "receipt"]
      }
    };
  }

  function listSessions() {
    return [...sessions.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  function getSession(sessionId) {
    return sessions.get(String(sessionId)) || null;
  }

  function touchSession(sessionId) {
    const row = getSession(sessionId);
    if (!row) {
      return null;
    }
    row.updated_at = nowIso();
    sessions.set(row.id, row);
    return row;
  }

  function latestSession() {
    return listSessions()[0] || null;
  }

  function latestRunIdForSession(sessionId) {
    const session = getSession(sessionId);
    if (!session) {
      return null;
    }
    return typeof session.run_id === "string" && session.run_id.trim() ? session.run_id.trim() : null;
  }

  function findSessionByRunId(runId) {
    const id = String(runId || "").trim();
    if (!id) {
      return null;
    }
    const rows = listSessions();
    return rows.find((row) => String(row.run_id || "") === id) || null;
  }

  function defaultContextSettings(sessionId = null) {
    return {
      session_id: typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null,
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

  function normalizeContextSettings(sessionId, raw = {}) {
    const defaults = defaultContextSettings(sessionId);
    const next = raw && typeof raw === "object" ? raw : {};
    return {
      session_id: defaults.session_id,
      auto_compact_after_task_lane: parseBoolean(
        next.auto_compact_after_task_lane,
        defaults.auto_compact_after_task_lane
      ),
      auto_compact_enabled: parseBoolean(next.auto_compact_enabled, defaults.auto_compact_enabled),
      event_threshold: parseInteger(next.event_threshold, defaults.event_threshold, 4, 200000),
      token_threshold: parseInteger(next.token_threshold, defaults.token_threshold, 100, 2000000),
      stdout_stderr_threshold: parseInteger(
        next.stdout_stderr_threshold,
        defaults.stdout_stderr_threshold,
        100,
        2000000
      ),
      artifacts_threshold: parseInteger(next.artifacts_threshold, defaults.artifacts_threshold, 1, 200000),
      repair_round_threshold: parseInteger(next.repair_round_threshold, defaults.repair_round_threshold, 1, 256),
      last_compact_status: normalizeString(next.last_compact_status, defaults.last_compact_status),
      last_snapshot_id: next.last_snapshot_id ? String(next.last_snapshot_id) : null,
      last_compact_reason: next.last_compact_reason ? String(next.last_compact_reason) : null,
      last_compacted_at: next.last_compacted_at ? String(next.last_compacted_at) : null
    };
  }

  function persistContextSettings() {
    const sessionsObject = {};
    for (const [sessionId, settings] of contextSettingsBySession.entries()) {
      sessionsObject[sessionId] = normalizeContextSettings(sessionId, settings);
    }
    writeJson(contextSettingsFile, {
      version: "v1",
      updated_at: nowIso(),
      sessions: sessionsObject
    });
  }

  function getContextSettings(sessionId) {
    const id = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
    if (!id) {
      return null;
    }
    const row = contextSettingsBySession.get(id) || {};
    const normalized = normalizeContextSettings(id, row);
    contextSettingsBySession.set(id, normalized);
    return normalized;
  }

  function patchContextSettings(sessionId, patch = {}, source = "community_context_settings_update") {
    const id = typeof sessionId === "string" && sessionId.trim() ? sessionId.trim() : null;
    if (!id) {
      return null;
    }
    const existing = getContextSettings(id) || defaultContextSettings(id);
    const normalizedPatch =
      patch && typeof patch === "object"
        ? Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined))
        : {};
    const merged = normalizeContextSettings(id, {
      ...existing,
      ...normalizedPatch
    });
    contextSettingsBySession.set(id, merged);
    persistContextSettings();
    const runId = latestRunIdForSession(id);
    if (runId) {
      emitEvent({
        runId,
        type: "context.settings.updated",
        payload: {
          session_id: id,
          source: normalizeString(source, "community_context_settings_update"),
          settings: merged
        }
      });
    }
    return merged;
  }

  function resumeRun(runId, { resumeReason = "manual_resume" } = {}) {
    const run = getRun(runId);
    if (!run) {
      return { ok: false, error: "run_not_found", reason: "run_not_found", resume_session: null };
    }
    const status = normalizeString(run.status, "unknown");
    if (status === "running") {
      return { ok: false, error: "run_not_resumable", reason: "already_running", resume_session: null };
    }
    if (!["failed", "failed_controlled", "paused", "interrupted", "stale_running"].includes(status)) {
      return { ok: false, error: "run_not_resumable", reason: `status_${status}_not_resumable`, resume_session: null };
    }

    const priorEvents = listRunEvents(run.id, 0);
    const resumeCursor = priorEvents.length ? Number(priorEvents[priorEvents.length - 1].seq || 0) : null;
    const resumeSession = {
      id: randomId("resume"),
      run_id: run.id,
      status_before_resume: status,
      resumable: true,
      resume_reason: normalizeString(resumeReason, "manual_resume"),
      resume_cursor: Number.isFinite(resumeCursor) ? resumeCursor : null,
      status: "completed",
      resumed_step_id: "step.community.resume",
      created_at: nowIso(),
      updated_at: nowIso()
    };
    emitEvent({
      runId: run.id,
      type: "resume.requested",
      payload: {
        run_id: run.id,
        status_before_resume: status,
        resume_reason: resumeSession.resume_reason,
        resume_session_id: resumeSession.id
      }
    });
    emitEvent({
      runId: run.id,
      type: "step.resumed",
      payload: {
        step_id: resumeSession.resumed_step_id,
        resume_reason: resumeSession.resume_reason
      }
    });
    emitEvent({
      runId: run.id,
      type: "resume.completed",
      payload: {
        run_id: run.id,
        resume_session_id: resumeSession.id,
        resumed_step_id: resumeSession.resumed_step_id
      }
    });
    updateRun(run.id, {
      status: "completed",
      resumed_at: nowIso(),
      completed_at: nowIso()
    });
    return {
      ok: true,
      run: getRun(run.id),
      resume_session: resumeSession
    };
  }

  function compactContext({
    runId,
    sessionId = null,
    triggerType = "manual_api",
    reason = "manual_api_compact",
    requestedBy = "api_context_compact"
  } = {}) {
    const run = getRun(runId);
    if (!run) {
      return { ok: false, error: "run_not_found", reason: "run_not_found" };
    }
    const artifact = compactRun(run.id, { mode: "context_compact" });
    if (!artifact) {
      return { ok: false, error: "compact_failed", reason: "compact_failed" };
    }

    const resolvedSessionId =
      typeof sessionId === "string" && sessionId.trim()
        ? sessionId.trim()
        : findSessionByRunId(run.id)?.id || null;

    let settings = null;
    if (resolvedSessionId) {
      settings = patchContextSettings(
        resolvedSessionId,
        {
          last_compact_status: "completed",
          last_snapshot_id: artifact.hash,
          last_compact_reason: normalizeString(reason, "manual_api_compact"),
          last_compacted_at: nowIso()
        },
        "api_context_compact"
      );
    }

    emitEvent({
      runId: run.id,
      type: "context.compact.completed",
      payload: {
        run_id: run.id,
        session_id: resolvedSessionId,
        trigger_type: normalizeString(triggerType, "manual_api"),
        reason: normalizeString(reason, "manual_api_compact"),
        requested_by: normalizeString(requestedBy, "api_context_compact"),
        compact_hash: artifact.hash
      }
    });

    return {
      ok: true,
      run_id: run.id,
      session_id: resolvedSessionId,
      context_compaction: {
        id: randomId("ctxcmp"),
        run_id: run.id,
        session_id: resolvedSessionId,
        status: "completed",
        reason: normalizeString(reason, "manual_api_compact"),
        trigger_type: normalizeString(triggerType, "manual_api"),
        requested_by: normalizeString(requestedBy, "api_context_compact"),
        completed_at: nowIso()
      },
      context_snapshot: {
        id: `snapshot_${artifact.hash.slice(0, 16)}`,
        compact_hash: artifact.hash,
        created_at: nowIso()
      },
      compact_run: {
        id: run.id,
        hash: artifact.hash,
        status: "completed"
      },
      settings
    };
  }

  function addAttachment({ sessionId, sourceType, fileName, mimeType, contentBase64 }) {
    const session = getSession(sessionId);
    if (!session) {
      return null;
    }
    const id = randomId("att");
    const runId = session.run_id;
    const dir = path.join(runDir(runId), "attachments");
    ensureDir(dir);
    const ext = String(fileName || "attachment.bin").split(".").pop() || "bin";
    const filePath = path.join(dir, `${id}.${ext}`);
    const buffer = Buffer.from(String(contentBase64 || ""), "base64");
    fs.writeFileSync(filePath, buffer);
    const row = {
      id,
      session_id: session.id,
      run_id: runId,
      source_type: String(sourceType || "upload"),
      file_name: normalizeString(fileName, `${id}.${ext}`),
      mime_type: normalizeString(mimeType, "application/octet-stream"),
      file_path: filePath,
      size_bytes: buffer.length,
      created_at: nowIso()
    };
    const list = attachmentsBySession.get(session.id) || [];
    list.push(row);
    attachmentsBySession.set(session.id, list);
    emitEvent({
      type: "attachment.ingested",
      runId,
      payload: {
        session_id: session.id,
        attachment_id: row.id,
        source_type: row.source_type,
        file_name: row.file_name,
        size_bytes: row.size_bytes
      }
    });
    return row;
  }

  function listAttachments(sessionId) {
    return [...(attachmentsBySession.get(String(sessionId)) || [])];
  }

  const byo = {
    provider: "openai",
    bound: false,
    api_key_masked: null,
    updated_at: null
  };

  function bindByoKey(apiKey) {
    const value = normalizeString(apiKey, "");
    byo.bound = Boolean(value);
    byo.api_key_masked = value ? `${value.slice(0, 3)}***${value.slice(-4)}` : null;
    byo.updated_at = nowIso();
    emitEvent({
      type: value ? "byo.bound" : "byo.cleared",
      payload: {
        provider: "openai",
        bound: byo.bound
      }
    });
    return { ...byo };
  }

  function getByoStatus() {
    return { ...byo };
  }

  function getAccessStatus() {
    return { ...accessState };
  }

  function setAccessStatus({ granted, source = "community_access_write" } = {}) {
    accessState.full_access_granted = granted === true;
    accessState.updated_at = nowIso();
    accessState.source = normalizeString(source, "community_access_write");
    return getAccessStatus();
  }

  function createCapabilityGrant({ capabilityKey, scopeType = "workspace", scopeValue = "default", metadata = {} }) {
    const row = {
      id: randomId("grant"),
      capability_key: String(capabilityKey || "").trim(),
      scope_type: String(scopeType || "workspace"),
      scope_value: String(scopeValue || "default"),
      status: "granted",
      metadata,
      created_at: nowIso(),
      updated_at: nowIso()
    };
    capabilityGrants.push(row);
    return row;
  }

  function listCapabilityGrants() {
    return [...capabilityGrants].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  }

  function findCapabilityGrant(grantId) {
    return capabilityGrants.find((row) => row.id === String(grantId)) || null;
  }

  function revokeCapabilityGrant(grantId, reason = "manual_revoke") {
    const row = findCapabilityGrant(grantId);
    if (!row) {
      return null;
    }
    row.status = "revoked";
    row.revoke_reason = String(reason || "manual_revoke");
    row.updated_at = nowIso();
    return row;
  }

  function checkCapabilityGrant({ capabilityKey, scopeType = "workspace", scopeValue = "default" }) {
    const key = String(capabilityKey || "").trim();
    const scopeT = String(scopeType || "workspace");
    const scopeV = String(scopeValue || "default");
    const active = capabilityGrants.find(
      (row) =>
        row.capability_key === key &&
        row.scope_type === scopeT &&
        row.scope_value === scopeV &&
        row.status === "granted"
    );
    const latest = [...capabilityGrants].reverse().find((row) => row.capability_key === key) || null;
    return {
      check: {
        capability_key: key,
        scope_type: scopeT,
        scope_value: scopeV,
        usable: Boolean(active),
        reason: active ? "granted" : latest ? latest.status : "grant_not_found"
      },
      active_grant: active || null,
      latest_grant: latest || null
    };
  }

  return {
    repoRoot,
    runsRoot,
    workspacesRoot,
    emitEvent,
    createRun,
    listRuns,
    getRun,
    updateRun,
    hydrateRun,
    compactRun,
    getEventsSince,
    createWorkspace,
    listWorkspaces,
    getWorkspace,
    createSession,
    listSessions,
    getSession,
    touchSession,
    latestSession,
    latestRunIdForSession,
    findSessionByRunId,
    createTurn,
    listTurns,
    listRunEvents,
    listRunDisplayEvents,
    getRunDetails,
    getContextSettings,
    patchContextSettings,
    resumeRun,
    compactContext,
    addAttachment,
    listAttachments,
    bindByoKey,
    getByoStatus,
    getAccessStatus,
    setAccessStatus,
    createCapabilityGrant,
    listCapabilityGrants,
    findCapabilityGrant,
    revokeCapabilityGrant,
    checkCapabilityGrant,
    paths: {
      runsRoot,
      workspacesRoot
    }
  };
}
