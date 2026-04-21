import fs from "node:fs";
import path from "node:path";
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
  return {
    ok: true,
    contract_version: String(contracts.entryPreflight.version || "v1"),
    host_connected: true,
    full_access_granted: false,
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
      const run = state.getRun(runId);
      if (!run) {
        sendJson(res, 404, { error: "run_not_found", run_id: runId });
        return;
      }
      sendJson(res, 200, { run });
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
    method: "POST",
    path: "/session/byo-key",
    source: "community",
    handler: async ({ req, res }) => handleByoBind(req, res)
  });

  const runtimeWorkspaceSelection = {
    workspace: null,
    selection: null
  };
  runtimeInfo.selection = runtimeWorkspaceSelection;

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
      sendJson(res, 200, {
        sessions: state.listSessions()
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
        entitlement_reason: String(providerGate?.gate?.entitlement?.reason || "entitlement_missing")
      });
    }
  };
}
