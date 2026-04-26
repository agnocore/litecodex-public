import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  nowIso,
  normalizeString,
  readJsonBody,
  sendJson,
  sendSseHeaders,
  writeSseEvent
} from "./http-helpers.mjs";

function compileBoundaryMatchers(contract) {
  const rows = Array.isArray(contract?.routes) ? contract.routes : [];
  const out = [];
  for (const row of rows) {
    const method = String(row?.method || "ANY").toUpperCase();
    const pattern = String(row?.pattern || "").trim();
    if (!pattern) {
      continue;
    }
    try {
      out.push({
        method,
        regex: new RegExp(pattern),
        capability: String(row?.capability || "official_capability"),
        reason: String(row?.reason || "community_restricted")
      });
    } catch {
      // ignore invalid regex
    }
  }
  return out;
}

function buildPreflight(state, contracts, runtimeInfo) {
  const workspaces = state.listWorkspaces();
  const sessions = state.listSessions();
  const selectedWorkspace = runtimeInfo.selection?.workspace || null;
  const access = state.getAccessStatus();
  return {
    ok: true,
    contract_version: String(contracts.entryPreflight.version || "v1"),
    host_connected: true,
    full_access_granted: access.full_access_granted === true,
    openai_byo_bound: state.getByoStatus().bound,
    workspace_available: workspaces.length > 0,
    selected_workspace: selectedWorkspace,
    last_session_available: sessions.length > 0,
    last_session: sessions[0] || null,
    provider_access: runtimeInfo.privateProviders
  };
}

export function registerCommunityRoutes({ registry, state, contracts, runtimeInfo, eventBus }) {
  const boundaryMatchers = compileBoundaryMatchers(contracts.communityBoundary);
  const restrictionCode = String(contracts.communityBoundary?.code || "COMMUNITY_EDITION_RESTRICTED");
  const requiredFeature = String(contracts.communityBoundary?.required_feature || "official_advanced");

  function matchRestricted(method, pathname) {
    const m = String(method || "GET").toUpperCase();
    const p = String(pathname || "");
    for (const rule of boundaryMatchers) {
      if (rule.method !== "ANY" && rule.method !== m) {
        continue;
      }
      if (rule.regex.test(p)) {
        return rule;
      }
    }
    return null;
  }

  function emitRunEvent(runId, type, payload) {
    const event = state.emitEvent({ runId, type, payload });
    eventBus.publish(event);
    return event;
  }

  function loadedProviders(providerGate) {
    return Array.isArray(providerGate?.loaded) ? providerGate.loaded.filter((row) => row?.loaded === true) : [];
  }

  function loadedCapabilities(providerGate) {
    if (Array.isArray(providerGate?.loaded_capabilities)) {
      return providerGate.loaded_capabilities.map((x) => String(x || "").trim()).filter(Boolean);
    }
    return Array.from(
      new Set(
        loadedProviders(providerGate)
          .flatMap((row) => (Array.isArray(row.capabilities) ? row.capabilities : []))
          .map((x) => String(x || "").trim())
          .filter(Boolean)
      )
    );
  }

  function sendProviderRequirementResponse({ req, res, pathname, capability, providerGate }) {
    const entitlementStatus = String(providerGate?.gate?.entitlement?.status || "missing");
    const entitlementReason = String(providerGate?.gate?.entitlement?.reason || "entitlement_missing");
    const method = String(req?.method || "GET").toUpperCase();
    const loaded = loadedProviders(providerGate);
    const capabilitySet = loadedCapabilities(providerGate);
    const hasEntitlement = providerGate?.authorized === true && entitlementStatus === "valid";

    if (!hasEntitlement) {
      sendJson(res, 403, {
        ok: false,
        error: "community_edition_restricted",
        code: restrictionCode,
        required_feature: requiredFeature,
        capability,
        message: "This capability requires official entitlement.",
        method,
        path: String(pathname || ""),
        entitlement_status: entitlementStatus,
        entitlement_reason: entitlementReason,
        runtime_profile: "community_kernel"
      });
      return;
    }

    if (!loaded.length) {
      sendJson(res, 403, {
        ok: false,
        error: "provider_missing",
        code: "provider_required",
        message: "This capability requires a private provider or entitlement.",
        capability,
        method,
        path: String(pathname || ""),
        entitlement_status: entitlementStatus,
        entitlement_reason: entitlementReason,
        runtime_profile: "community_kernel"
      });
      return;
    }

    if (capability && !capabilitySet.includes(String(capability || "").trim())) {
      sendJson(res, 501, {
        ok: false,
        error: "capability_not_registered",
        code: "capability_not_registered",
        message: "Private provider loaded, but capability route is not registered.",
        capability,
        method,
        path: String(pathname || ""),
        runtime_profile: "community_kernel"
      });
      return;
    }

    sendJson(res, 502, {
      ok: false,
      error: "provider_error",
      code: "provider_error",
      message: "Private provider execution failed.",
      capability,
      method,
      path: String(pathname || ""),
      runtime_profile: "community_kernel"
    });
  }

  function resolveWorkspaceContext({ projectId, threadId } = {}) {
    const projectKey = normalizeString(projectId, "");
    if (projectKey) {
      const project = state.getWorkspace(projectKey);
      if (project) {
        return {
          project,
          session: null
        };
      }
    }

    const threadKey = normalizeString(threadId, "");
    if (threadKey) {
      const session = state.getSession(threadKey);
      if (session?.workspace_id) {
        const project = state.getWorkspace(session.workspace_id);
        if (project) {
          return {
            project,
            session
          };
        }
      }
    }

    const selectedWorkspace = runtimeInfo.selection?.workspace || null;
    if (selectedWorkspace?.id) {
      const project = state.getWorkspace(selectedWorkspace.id);
      if (project) {
        return {
          project,
          session: null
        };
      }
    }

    const fallback = state.listWorkspaces()[0] || null;
    return {
      project: fallback,
      session: null
    };
  }

  function isInsideWorkspace(rootPath, targetPath) {
    const root = String(rootPath || "");
    const target = String(targetPath || "");
    if (!root || !target) {
      return false;
    }
    if (root === target) {
      return true;
    }
    const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
    return target.startsWith(prefix);
  }

  function resolveScopedTarget({ project, relPath, requireRelPath = false }) {
    if (!project?.workspace_path) {
      return {
        ok: false,
        status: 404,
        error: "project_not_found",
        message: "Project not found in workspace registry."
      };
    }

    if (!fs.existsSync(project.workspace_path)) {
      return {
        ok: false,
        status: 404,
        error: "workspace_not_found",
        message: "Workspace path is missing on disk."
      };
    }

    const workspaceRoot = fs.realpathSync(project.workspace_path);
    const normalizedRel = normalizeString(relPath, "");
    if (requireRelPath && !normalizedRel) {
      return {
        ok: false,
        status: 400,
        error: "rel_path_required",
        message: "This action requires relPath within workspace root."
      };
    }
    if (normalizedRel && path.isAbsolute(normalizedRel)) {
      return {
        ok: false,
        status: 403,
        error: "path_out_of_scope",
        message: "Absolute paths are not allowed."
      };
    }

    const candidatePath = normalizedRel ? path.resolve(workspaceRoot, normalizedRel) : workspaceRoot;
    const candidateExists = fs.existsSync(candidatePath);
    if (!candidateExists) {
      return {
        ok: false,
        status: 404,
        error: "path_not_found",
        message: "Requested path does not exist."
      };
    }
    const targetPath = fs.realpathSync(candidatePath);
    if (!isInsideWorkspace(workspaceRoot, targetPath)) {
      return {
        ok: false,
        status: 403,
        error: "path_out_of_scope",
        message: "Requested path is outside workspace root."
      };
    }

    return {
      ok: true,
      workspaceRoot,
      targetPath,
      relPath: normalizedRel || null
    };
  }

  function executeHostAction({ actionType, project, relPath = null }) {
    const scoped = resolveScopedTarget({
      project,
      relPath,
      requireRelPath: actionType === "open-file" || actionType === "reveal-path"
    });
    if (!scoped.ok) {
      return scoped;
    }
    if (process.platform !== "win32") {
      return {
        ok: false,
        status: 501,
        error: "unsupported_platform",
        message: "Host open/reveal actions currently support Windows only."
      };
    }

    try {
      const args =
        actionType === "reveal-path"
          ? [`/select,${scoped.targetPath}`]
          : [scoped.targetPath];
      const child = spawn("explorer.exe", args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true
      });
      child.unref();
      return {
        ok: true,
        accepted: true,
        action: actionType,
        target_path: scoped.targetPath,
        workspace_root: scoped.workspaceRoot,
        rel_path: scoped.relPath,
        platform: process.platform,
        created_at: nowIso()
      };
    } catch (error) {
      return {
        ok: false,
        status: 502,
        error: "provider_error",
        message: String(error?.message || error)
      };
    }
  }

  function collectProjectCandidates({
    project,
    query = "",
    limit = 12,
    includeDirectories = true
  } = {}) {
    if (!project?.workspace_path || !fs.existsSync(project.workspace_path)) {
      return {
        project_id: project?.id || null,
        query: String(query || ""),
        candidates: []
      };
    }

    const workspaceRoot = fs.realpathSync(project.workspace_path);
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const maxScan = 5000;
    const maxDepth = 10;
    const candidateLimit = Math.max(parseInt(limit, 10) || 12, 1);
    const rawCandidates = [];
    const queue = [{ dir: workspaceRoot, depth: 0 }];
    const ignoredDirNames = new Set([".git", "node_modules", ".idea", ".vscode"]);
    let scanned = 0;

    while (queue.length && scanned < maxScan) {
      const current = queue.shift();
      let entries = [];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const fullPath = path.join(current.dir, entry.name);
        const relPath = path.relative(workspaceRoot, fullPath).replace(/\\/g, "/");
        if (!relPath || relPath.startsWith("../")) {
          continue;
        }
        const isDirectory = entry.isDirectory();
        scanned += 1;
        if (isDirectory && current.depth < maxDepth && !ignoredDirNames.has(entry.name.toLowerCase())) {
          queue.push({ dir: fullPath, depth: current.depth + 1 });
        }
        const searchable = `${relPath.toLowerCase()} ${entry.name.toLowerCase()}`;
        const matched = !normalizedQuery || searchable.includes(normalizedQuery);
        if (!matched) {
          if (scanned >= maxScan) {
            break;
          }
          continue;
        }
        if (isDirectory && includeDirectories !== true) {
          continue;
        }
        const confidence = normalizedQuery
          ? relPath.toLowerCase() === normalizedQuery
            ? 1
            : entry.name.toLowerCase().includes(normalizedQuery)
              ? 0.92
              : 0.76
          : 0.7;
        rawCandidates.push({
          type: isDirectory ? "directory" : "file",
          rel_path: relPath,
          symbol: null,
          confidence
        });
        if (rawCandidates.length >= candidateLimit * 8) {
          break;
        }
      }
    }

    rawCandidates.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence;
      }
      return String(a.rel_path).localeCompare(String(b.rel_path));
    });

    return {
      intent: "project.search_file",
      project_id: project.id,
      workspace_root: workspaceRoot,
      query: String(query || ""),
      scanned,
      candidates: rawCandidates.slice(0, candidateLimit)
    };
  }

  function normalizeComposerCommand(commandId) {
    const key = normalizeString(commandId, "").toLowerCase();
    if (!key) {
      return null;
    }
    if (["task", "run-task", "execute-task", "todo"].includes(key)) {
      return "task";
    }
    if (["open", "open-folder", "folder"].includes(key)) {
      return "open-folder";
    }
    if (["open-file", "file"].includes(key)) {
      return "open-file";
    }
    if (["reveal", "reveal-path"].includes(key)) {
      return "reveal-path";
    }
    if (["compact", "context-compact"].includes(key)) {
      return "compact";
    }
    return key;
  }

  function buildComposerResolveResult({ projectId, threadId, rawText, tokens, mode }) {
    const tokenRows = Array.isArray(tokens) ? tokens : [];
    const commandToken = tokenRows.find((row) => normalizeString(row?.command, ""));
    const referenceToken = tokenRows.find((row) => normalizeString(row?.rel_path, ""));
    const rawCommandMatch = String(rawText || "").trim().match(/^\/([a-z0-9._-]+)/i);
    const command = normalizeComposerCommand(commandToken?.command || rawCommandMatch?.[1] || null);
    const projectContext = resolveWorkspaceContext({
      projectId,
      threadId
    });
    const project = projectContext.project;
    const commandCatalog = [
      {
        id: "task",
        label: "/task",
        description: "Run current input in task lane.",
        needs_target: false
      },
      {
        id: "open-folder",
        label: "/open-folder",
        description: "Open current workspace folder.",
        needs_target: false
      },
      {
        id: "open-file",
        label: "/open-file",
        description: "Open a file inside workspace.",
        needs_target: true
      },
      {
        id: "reveal-path",
        label: "/reveal-path",
        description: "Reveal a workspace file/folder in host explorer.",
        needs_target: true
      },
      {
        id: "compact",
        label: "/compact",
        description: "Run context compaction.",
        needs_target: false
      }
    ];

    const result = {
      ok: true,
      intent: "composer.resolve",
      thread_id: normalizeString(threadId, "") || null,
      project_id: project?.id || normalizeString(projectId, "") || null,
      mode: normalizeString(mode, "chat"),
      suggestions: {
        commands: commandCatalog
      },
      needsClarification: {
        required: false,
        message: null
      },
      taskAction: null,
      hostAction: null
    };

    if (command === "task") {
      result.taskAction = {
        type: "task",
        mode: "execution"
      };
    }

    if (["open-folder", "open-file", "reveal-path"].includes(String(command || ""))) {
      if (!project?.id) {
        result.needsClarification = {
          required: true,
          message: "No workspace selected. Create/select a workspace first."
        };
        return result;
      }
      const relPath = normalizeString(referenceToken?.rel_path, "") || null;
      if ((command === "open-file" || command === "reveal-path") && !relPath) {
        result.needsClarification = {
          required: true,
          message: "Target file/path is required for this command."
        };
        return result;
      }
      result.hostAction = {
        type: command,
        project_id: project.id,
        rel_path: relPath
      };
    }

    return result;
  }

  registry.addRoute({
    method: "GET",
    path: "/health",
    source: "community",
    handler: async ({ res }) => {
      sendJson(res, 200, {
        ok: true,
        service: "agent-host",
        bind: `${runtimeInfo.host}:${runtimeInfo.port}`,
        runs_root: state.paths.runsRoot,
        runtime_profile: "community_kernel",
        community_boundary: {
          contract: String(contracts.communityBoundary.version || "v1"),
          restricted_routes: boundaryMatchers.length,
          official_advanced_enabled: runtimeInfo.privateProviders?.authorized === true
        }
      });
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/status",
    source: "community",
    handler: async ({ res }) => {
      const access = state.getAccessStatus();
      sendJson(res, 200, {
        service: "agent-host",
        bind: `${runtimeInfo.host}:${runtimeInfo.port}`,
        status: "online",
        full_access_granted: access.full_access_granted === true,
        updated_at: access.updated_at,
        source: access.source
      });
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/entry/contracts",
    source: "community",
    handler: async ({ res }) => {
      sendJson(res, 200, {
        contracts: {
          preflight: contracts.entryPreflight,
          workspace: contracts.entryWorkspace,
          session: contracts.entrySession,
          attachment: contracts.entryAttachment,
          access: contracts.entryAccess,
          byo_openai: contracts.entryByo,
          path_boundary_errors: contracts.pathBoundaryErrors
        }
      });
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/entry/preflight",
    source: "community",
    handler: async ({ res }) => {
      sendJson(res, 200, buildPreflight(state, contracts, runtimeInfo));
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/events",
    source: "community",
    handler: async ({ req, res, url }) => {
      sendSseHeaders(res);
      const since = url.searchParams.get("since");
      const replay = state.getEventsSince(since);
      for (const event of replay) {
        writeSseEvent(res, event);
      }
      eventBus.subscribe(res);
      req.on("close", () => eventBus.unsubscribe(res));
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/runs",
    source: "community",
    handler: async ({ res }) => {
      sendJson(res, 200, {
        runs: state.listRuns()
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/runs",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const run = state.createRun({
        title: normalizeString(body.title, "Community run"),
        source: "community_api"
      });
      sendJson(res, 201, { run });
    }
  });

  registry.addRoute({
    method: "GET",
    pattern: /^\/runs\/([^/]+)$/,
    source: "community",
    handler: async ({ res, match }) => {
      const runId = decodeURIComponent(match[1]);
      const details = state.getRunDetails(runId);
      if (!details) {
        sendJson(res, 404, { error: "run_not_found", run_id: runId });
        return;
      }
      sendJson(res, 200, details);
    }
  });

  registry.addRoute({
    method: "GET",
    pattern: /^\/runs\/([^/]+)\/events$/,
    source: "community",
    handler: async ({ res, match, url }) => {
      const runId = decodeURIComponent(match[1]);
      const run = state.getRun(runId);
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runId });
        return;
      }
      const sinceSeqRaw = url.searchParams.get("since_seq");
      const sinceSeq = Number.isFinite(Number(sinceSeqRaw)) ? Number(sinceSeqRaw) : 0;
      const events = state.listRunEvents(runId, sinceSeq);
      sendJson(res, 200, {
        run_id: runId,
        since_seq: sinceSeq,
        events
      });
    }
  });

  registry.addRoute({
    method: "GET",
    pattern: /^\/runs\/([^/]+)\/hydrate$/,
    source: "community",
    handler: async ({ res, match, url }) => {
      const runId = decodeURIComponent(match[1]);
      const useCompact = String(url.searchParams.get("use_compact") || "false").toLowerCase() === "true";
      const payload = state.hydrateRun(runId, { useCompact });
      if (!payload) {
        sendJson(res, 404, { error: "run_not_found", run_id: runId });
        return;
      }
      sendJson(res, 200, payload);
    }
  });

  registry.addRoute({
    method: "POST",
    pattern: /^\/runs\/([^/]+)\/resume$/,
    source: "community",
    handler: async ({ req, res, match, pathname, providerGate }) => {
      const runId = decodeURIComponent(match[1]);
      const run = state.getRun(runId);
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runId });
        return;
      }
      const isPrivateRun =
        normalizeString(run.private_execution_unit, "") ||
        String(run.source || "").toLowerCase().startsWith("private_provider:");
      if (isPrivateRun) {
        sendProviderRequirementResponse({
          req,
          res,
          pathname,
          capability: "official.workflow.phase_closeout",
          providerGate
        });
        return;
      }

      const body = await readJsonBody(req);
      const resumed = state.resumeRun(runId, {
        resumeReason:
          typeof body.resume_reason === "string" && body.resume_reason.trim()
            ? body.resume_reason.trim()
            : "manual_resume"
      });
      if (!resumed.ok) {
        sendJson(res, 409, {
          ok: false,
          error: "resume_rejected",
          reason: resumed.reason || resumed.error || "run_not_resumable",
          resume_session: resumed.resume_session || null
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        resume_session: resumed.resume_session
      });
    }
  });

  registry.addRoute({
    method: "POST",
    pattern: /^\/runs\/([^/]+)\/compact$/,
    source: "community",
    handler: async ({ req, res, match }) => {
      const runId = decodeURIComponent(match[1]);
      const run = state.getRun(runId);
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runId });
        return;
      }
      const body = await readJsonBody(req);
      const artifact = state.compactRun(runId, {
        mode: normalizeString(body.mode, "manual")
      });
      emitRunEvent(runId, "verify.completed", { run_id: runId, compact_hash: artifact.hash });
      sendJson(res, 200, {
        ok: true,
        run_id: runId,
        compact: artifact
      });
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/api/context/settings",
    source: "community",
    handler: async ({ res, url }) => {
      const sessionIdRaw = url.searchParams.get("session_id");
      const sessionId =
        typeof sessionIdRaw === "string" && sessionIdRaw.trim()
          ? sessionIdRaw.trim()
          : state.latestSession()?.id || null;
      if (!sessionId) {
        sendJson(res, 404, { error: "session_id_required" });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        session_id: sessionId,
        settings: state.getContextSettings(sessionId)
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/api/context/settings",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const sessionId =
        typeof body.session_id === "string" && body.session_id.trim() ? body.session_id.trim() : state.latestSession()?.id || null;
      if (!sessionId) {
        sendJson(res, 404, { error: "session_id_required" });
        return;
      }
      const updated = state.patchContextSettings(
        sessionId,
        {
          auto_compact_after_task_lane:
            Object.prototype.hasOwnProperty.call(body, "auto_compact_after_task_lane")
              ? body.auto_compact_after_task_lane
              : undefined,
          auto_compact_enabled:
            Object.prototype.hasOwnProperty.call(body, "auto_compact_enabled")
              ? body.auto_compact_enabled
              : undefined,
          event_threshold: body.event_threshold,
          token_threshold: body.token_threshold,
          stdout_stderr_threshold: body.stdout_stderr_threshold,
          artifacts_threshold: body.artifacts_threshold,
          repair_round_threshold: body.repair_round_threshold
        },
        "api_context_settings_update"
      );
      if (!updated) {
        sendJson(res, 400, { error: "session_id_required" });
        return;
      }
      const runId = state.latestRunIdForSession(sessionId);
      if (runId) {
        emitRunEvent(runId, "context.setting.updated", {
          session_id: sessionId,
          auto_compact_after_task_lane: updated.auto_compact_after_task_lane,
          auto_compact_enabled: updated.auto_compact_enabled,
          event_threshold: updated.event_threshold,
          token_threshold: updated.token_threshold,
          stdout_stderr_threshold: updated.stdout_stderr_threshold,
          artifacts_threshold: updated.artifacts_threshold,
          repair_round_threshold: updated.repair_round_threshold
        });
      }
      sendJson(res, 200, {
        ok: true,
        session_id: sessionId,
        settings: updated
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/api/context/compact",
    source: "community",
    handler: async ({ req, res, pathname, providerGate }) => {
      const body = await readJsonBody(req);
      const sessionId =
        typeof body.session_id === "string" && body.session_id.trim() ? body.session_id.trim() : state.latestSession()?.id || null;
      let runId =
        typeof body.run_id === "string" && body.run_id.trim()
          ? body.run_id.trim()
          : sessionId
            ? state.latestRunIdForSession(sessionId)
            : null;
      if (!runId) {
        runId = state.listRuns()[0]?.id || null;
      }
      if (!runId) {
        sendJson(res, 404, { error: "run_id_required_for_compact" });
        return;
      }
      const run = state.getRun(runId);
      const isPrivateRun =
        normalizeString(run?.private_execution_unit, "") ||
        String(run?.source || "").toLowerCase().startsWith("private_provider:");
      if (isPrivateRun) {
        sendProviderRequirementResponse({
          req,
          res,
          pathname,
          capability: "context.compact",
          providerGate
        });
        return;
      }
      const result = state.compactContext({
        runId,
        sessionId,
        triggerType:
          typeof body.trigger_type === "string" && body.trigger_type.trim() ? body.trigger_type.trim() : "manual_api",
        reason: typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : "manual_api_compact",
        requestedBy: "api_context_compact"
      });
      if (!result.ok) {
        sendJson(res, 409, result);
        return;
      }
      sendJson(res, 201, {
        ok: true,
        run_id: result.run_id,
        session_id: result.session_id,
        context_compaction: result.context_compaction || null,
        context_snapshot: result.context_snapshot || null,
        compact_run: result.compact_run || null
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/api/composer/resolve",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const resolved = buildComposerResolveResult({
        threadId: typeof body.threadId === "string" ? body.threadId : body.thread_id,
        projectId: typeof body.projectId === "string" ? body.projectId : body.project_id,
        rawText: typeof body.rawText === "string" ? body.rawText : body.raw_text,
        tokens: Array.isArray(body.tokens) ? body.tokens : [],
        mode: body.mode || "chat"
      });
      sendJson(res, 200, resolved);
    }
  });

  async function handleProjectSearch({ req, res, url }) {
    const body = req.method === "POST" ? await readJsonBody(req) : {};
    const projectContext = resolveWorkspaceContext({
      projectId:
        req.method === "POST"
          ? typeof body.projectId === "string"
            ? body.projectId
            : body.project_id
          : url.searchParams.get("project_id") || url.searchParams.get("projectId"),
      threadId:
        req.method === "POST"
          ? typeof body.threadId === "string"
            ? body.threadId
            : body.thread_id
          : url.searchParams.get("thread_id") || url.searchParams.get("threadId")
    });
    if (!projectContext.project) {
      sendJson(res, 404, {
        error: "project_not_found",
        message: "Project not found in workspace registry."
      });
      return;
    }
    const query =
      req.method === "POST"
        ? typeof body.query === "string"
          ? body.query
          : typeof body.path === "string"
            ? body.path
            : ""
        : url.searchParams.get("query") || url.searchParams.get("path") || "";
    const limit =
      req.method === "POST"
        ? Number.isFinite(Number(body.limit))
          ? Number(body.limit)
          : 12
        : Number.isFinite(Number(url.searchParams.get("limit")))
          ? Number(url.searchParams.get("limit"))
          : 12;
    const includeDirectories =
      req.method === "POST"
        ? body.include_directories !== false
        : String(url.searchParams.get("include_directories") || "true").toLowerCase() !== "false";
    const lookup = collectProjectCandidates({
      project: projectContext.project,
      query,
      limit,
      includeDirectories
    });
    sendJson(res, 200, lookup);
  }

  registry.addRoute({
    method: "POST",
    path: "/api/project/search-file",
    source: "community",
    handler: async ({ req, res, url }) => {
      await handleProjectSearch({ req, res, url });
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/api/project/search-file",
    source: "community",
    handler: async ({ req, res, url }) => {
      await handleProjectSearch({ req, res, url });
    }
  });

  async function handleHostAction({ req, res, body, actionType }) {
    const projectContext = resolveWorkspaceContext({
      projectId: typeof body.projectId === "string" ? body.projectId : body.project_id,
      threadId: typeof body.threadId === "string" ? body.threadId : body.thread_id
    });
    const result = executeHostAction({
      actionType,
      project: projectContext.project,
      relPath: typeof body.relPath === "string" ? body.relPath : body.rel_path
    });
    if (!result.ok) {
      sendJson(res, Number(result.status || 409), {
        ok: false,
        error: result.error || "host_action_failed",
        message: result.message || "Host action failed.",
        project_id: projectContext.project?.id || null,
        rel_path: typeof body.relPath === "string" ? body.relPath : body.rel_path
      });
      return;
    }
    sendJson(res, 202, {
      ok: true,
      accepted: true,
      host_action: result
    });
  }

  registry.addRoute({
    method: "POST",
    path: "/api/host/open-folder",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      await handleHostAction({ req, res, body, actionType: "open-folder" });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/api/host/open-file",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      await handleHostAction({ req, res, body, actionType: "open-file" });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/api/host/reveal-path",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      await handleHostAction({ req, res, body, actionType: "reveal-path" });
    }
  });

  registry.addRoute({
    method: "POST",
    pattern: /^\/auth\/sessions\/([^/]+)\/submit$/,
    source: "community",
    handler: async ({ req, res, match }) => {
      const authSessionId = decodeURIComponent(match[1]);
      const body = await readJsonBody(req);
      const accepted = body.accepted !== false;
      sendJson(res, 200, {
        ok: true,
        auth_session_id: authSessionId,
        status: accepted ? "verified" : "cancelled",
        step_resumed: accepted,
        completed_at: nowIso()
      });
    }
  });

  function byoStatusPayload() {
    const status = state.getByoStatus();
    return {
      provider: "openai",
      bound: status.bound,
      binding_scope: "session_scope",
      validation_status: status.bound ? "valid" : "not_bound",
      legacy_compatible: true,
      canonical_status: status
    };
  }

  async function handleByoBind(req, res) {
    const body = await readJsonBody(req);
    const apiKey = normalizeString(body.api_key || body.apiKey, "");
    if (!apiKey) {
      sendJson(res, 400, { error: "api_key_required" });
      return;
    }
    const status = state.bindByoKey(apiKey);
    sendJson(res, 200, {
      ok: true,
      provider: "openai",
      bound: status.bound,
      status
    });
  }

  async function handleByoClear(res) {
    const status = state.bindByoKey("");
    sendJson(res, 200, {
      ok: true,
      provider: "openai",
      bound: false,
      status
    });
  }

  for (const routePath of ["/byo/openai/status", "/entry/byo/openai/status"]) {
    registry.addRoute({
      method: "GET",
      path: routePath,
      source: "community",
      handler: async ({ res }) => sendJson(res, 200, byoStatusPayload())
    });
  }
  for (const routePath of ["/byo/openai/bind", "/entry/byo/openai/bind"]) {
    registry.addRoute({
      method: "POST",
      path: routePath,
      source: "community",
      handler: async ({ req, res }) => handleByoBind(req, res)
    });
  }
  for (const routePath of ["/byo/openai/clear", "/entry/byo/openai/clear"]) {
    registry.addRoute({
      method: "POST",
      path: routePath,
      source: "community",
      handler: async ({ res }) => handleByoClear(res)
    });
  }

  registry.addRoute({
    method: "GET",
    path: "/session/byo-key",
    source: "community",
    handler: async ({ res }) => {
      sendJson(res, 200, byoStatusPayload());
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/session/byo-key",
    source: "community",
    handler: async ({ req, res }) => handleByoBind(req, res)
  });

  registry.addRoute({
    method: "DELETE",
    path: "/session/byo-key",
    source: "community",
    handler: async ({ res }) => handleByoClear(res)
  });

  const runtimeWorkspaceSelection = {
    workspace: null,
    selection: null
  };
  runtimeInfo.selection = runtimeWorkspaceSelection;

  function accessStatusPayload() {
    const access = state.getAccessStatus();
    return {
      full_access_granted: access.full_access_granted === true,
      granted: access.full_access_granted === true,
      updated_at: access.updated_at,
      source: access.source
    };
  }

  for (const routePath of ["/access/status", "/entry/access/status"]) {
    registry.addRoute({
      method: "GET",
      path: routePath,
      source: "community",
      handler: async ({ res }) => {
        sendJson(res, 200, accessStatusPayload());
      }
    });
  }

  for (const routePath of ["/access/grant", "/entry/access/grant"]) {
    registry.addRoute({
      method: "POST",
      path: routePath,
      source: "community",
      handler: async ({ req, res }) => {
        const body = await readJsonBody(req);
        const access = state.setAccessStatus({
          granted: body.granted !== false,
          source: normalizeString(body.source, "community_access_grant")
        });
        sendJson(res, 200, {
          ok: true,
          grant: {
            granted: access.full_access_granted,
            source: access.source,
            created_at: access.updated_at
          },
          ...accessStatusPayload()
        });
      }
    });
  }

  for (const routePath of ["/access/recheck", "/entry/access/recheck"]) {
    registry.addRoute({
      method: "POST",
      path: routePath,
      source: "community",
      handler: async ({ res }) => {
        sendJson(res, 200, {
          ok: true,
          checked_at: nowIso(),
          ...accessStatusPayload()
        });
      }
    });
  }

  registry.addRoute({
    method: "GET",
    path: "/entry/workspaces",
    source: "community",
    handler: async ({ res }) => {
      sendJson(res, 200, {
        workspaces: state.listWorkspaces(),
        current_workspace: runtimeWorkspaceSelection.workspace,
        selection: runtimeWorkspaceSelection.selection
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/entry/workspaces",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const workspace = state.createWorkspace({ name: normalizeString(body.name || body.workspace_name, "workspace") });
      runtimeWorkspaceSelection.workspace = workspace;
      runtimeWorkspaceSelection.selection = {
        workspace_id: workspace.id,
        source: "entry_workspace_create",
        selected_at: nowIso()
      };
      sendJson(res, 201, {
        ok: true,
        workspace,
        selection: runtimeWorkspaceSelection.selection
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/entry/workspaces/select",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      if (body.clear === true) {
        runtimeWorkspaceSelection.workspace = null;
        runtimeWorkspaceSelection.selection = {
          workspace_id: null,
          source: "entry_workspace_select_clear",
          selected_at: nowIso()
        };
        sendJson(res, 200, { ok: true, workspace: null, selection: runtimeWorkspaceSelection.selection });
        return;
      }
      const workspaceId = normalizeString(body.workspace_id, "");
      const workspace = state.listWorkspaces().find((row) => row.id === workspaceId) || null;
      if (!workspace) {
        sendJson(res, 404, { error: "workspace_not_found" });
        return;
      }
      runtimeWorkspaceSelection.workspace = workspace;
      runtimeWorkspaceSelection.selection = {
        workspace_id: workspace.id,
        source: "entry_workspace_select",
        selected_at: nowIso()
      };
      sendJson(res, 200, {
        ok: true,
        workspace,
        selection: runtimeWorkspaceSelection.selection
      });
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/entry/workspaces/current",
    source: "community",
    handler: async ({ res }) => {
      sendJson(res, 200, {
        workspace: runtimeWorkspaceSelection.workspace,
        selection: runtimeWorkspaceSelection.selection
      });
    }
  });

  registry.addRoute({
    method: "GET",
    path: "/entry/sessions",
    source: "community",
    handler: async ({ res }) => {
      const sessions = state.listSessions();
      sendJson(res, 200, {
        sessions,
        last_session: sessions[0] || null
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/entry/sessions",
    source: "community",
    handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const session = state.createSession({
        workspaceId: normalizeString(body.workspace_id, "") || runtimeWorkspaceSelection.workspace?.id || null
      });
      if (!session) {
        sendJson(res, 500, { error: "session_create_failed" });
        return;
      }
      sendJson(res, 201, {
        ok: true,
        session
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/entry/sessions/continue",
    source: "community",
    handler: async ({ res }) => {
      const last = state.listSessions()[0] || null;
      if (!last) {
        sendJson(res, 404, { error: "last_session_not_found" });
        return;
      }
      state.touchSession(last.id);
      sendJson(res, 200, {
        ok: true,
        session: state.getSession(last.id)
      });
    }
  });

  registry.addRoute({
    method: "POST",
    path: "/entry/sessions/continue-last",
    source: "community",
    handler: async ({ res }) => {
      const last = state.listSessions()[0] || null;
      if (!last) {
        sendJson(res, 404, { error: "last_session_not_found" });
        return;
      }
      state.touchSession(last.id);
      sendJson(res, 200, {
        ok: true,
        session: state.getSession(last.id)
      });
    }
  });

  registry.addRoute({
    method: "GET",
    pattern: /^\/entry\/sessions\/([^/]+)\/turns$/,
    source: "community",
    handler: async ({ res, match }) => {
      const sessionId = decodeURIComponent(match[1]);
      const session = state.getSession(sessionId);
      if (!session) {
        sendJson(res, 404, { error: "entry_session_not_found", session_id: sessionId });
        return;
      }
      sendJson(res, 200, {
        session,
        turns: state.listTurns(sessionId)
      });
    }
  });

  registry.addRoute({
    method: "POST",
    pattern: /^\/entry\/sessions\/([^/]+)\/turns$/,
    source: "community",
    handler: async ({ req, res, match }) => {
      const sessionId = decodeURIComponent(match[1]);
      const body = await readJsonBody(req);
      const created = state.createTurn({
        sessionId,
        prompt: typeof body.prompt === "string" ? body.prompt : typeof body.message === "string" ? body.message : "",
        lane: normalizeString(body.lane, "chat"),
        classification: body.classification && typeof body.classification === "object" ? body.classification : null,
        attachments: Array.isArray(body.attachments) ? body.attachments : []
      });
      if (!created) {
        sendJson(res, 404, { error: "entry_session_not_found", session_id: sessionId });
        return;
      }
      sendJson(res, 201, {
        ok: true,
        session: created.session,
        run: created.run,
        turn: created.turn,
        step_id: "step.entry.turn"
      });
    }
  });

  async function ingestAttachment(req, res, sessionId, sourceType) {
    const session = state.getSession(sessionId);
    if (!session) {
      sendJson(res, 404, { error: "session_not_found", session_id: sessionId });
      return;
    }
    const body = await readJsonBody(req);
    const fileName = normalizeString(body.file_name || body.name, `${sourceType}.bin`);
    const mimeType = normalizeString(body.mime_type, "application/octet-stream");
    const contentBase64 = normalizeString(body.content_base64 || body.base64, "");
    if (!contentBase64) {
      sendJson(res, 400, { error: "content_base64_required" });
      return;
    }
    const attachment = state.addAttachment({
      sessionId,
      sourceType,
      fileName,
      mimeType,
      contentBase64
    });
    sendJson(res, 201, {
      ok: true,
      session_id: sessionId,
      attachment
    });
  }

  registry.addRoute({
    method: "GET",
    pattern: /^\/entry\/sessions\/([^/]+)\/attachments$/,
    source: "community",
    handler: async ({ res, match }) => {
      const sessionId = decodeURIComponent(match[1]);
      sendJson(res, 200, {
        attachments: state.listAttachments(sessionId)
      });
    }
  });

  registry.addRoute({
    method: "POST",
    pattern: /^\/entry\/sessions\/([^/]+)\/attachments\/(upload|paste|screenshot)$/,
    source: "community",
    handler: async ({ req, res, match }) => {
      const sessionId = decodeURIComponent(match[1]);
      const sourceType = String(match[2] || "upload");
      await ingestAttachment(req, res, sessionId, sourceType);
    }
  });

  return {
    matchRestricted,
    restrictedResponse({ req, res, pathname, rule, providerGate }) {
      if (providerGate?.authorized === true) {
        sendProviderRequirementResponse({
          req,
          res,
          pathname,
          capability: rule.capability,
          providerGate
        });
        return;
      }
      sendJson(res, 403, {
        ok: false,
        error: "community_edition_restricted",
        code: restrictionCode,
        required_feature: requiredFeature,
        capability: rule.capability,
        reason: rule.reason,
        method: String(req?.method || "GET").toUpperCase(),
        path: String(pathname || ""),
        entitlement_status: String(providerGate?.gate?.entitlement?.status || "missing"),
        entitlement_reason: String(providerGate?.gate?.entitlement?.reason || "entitlement_missing"),
        runtime_profile: "community_kernel"
      });
    }
  };
}
