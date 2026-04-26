import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRouteRegistry } from "./kernel/route-registry.mjs";
import { createHostState } from "./kernel/state-store.mjs";
import { loadKernelContracts } from "./kernel/contracts.mjs";
import { registerCommunityRoutes } from "./kernel/community-routes.mjs";
import { loadPrivateProviders } from "./kernel/private-provider-loader.mjs";
import { nowIso, readJsonBody, sendJson, setCorsHeaders } from "./kernel/http-helpers.mjs";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..", "..");
const sharedDir = path.join(repoRoot, "shared");
const runsRoot = path.join(repoRoot, "runs");
const workspacesRoot = path.join(repoRoot, "workspaces");

const host = "127.0.0.1";
const port = Number(process.env.LITE_CODEX_HOST_PORT || 4317);

const contracts = loadKernelContracts(sharedDir);
const state = createHostState({ repoRoot, runsRoot, workspacesRoot });
const registry = createRouteRegistry();

const eventSubscribers = new Set();
const eventBus = {
  subscribe(res) {
    eventSubscribers.add(res);
  },
  unsubscribe(res) {
    eventSubscribers.delete(res);
  },
  publish(event) {
    const line = `event: ${event.type}\nid: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`;
    for (const res of eventSubscribers) {
      try {
        res.write(line);
      } catch {
        eventSubscribers.delete(res);
      }
    }
  }
};

const runtimeInfo = {
  host,
  port,
  selection: {
    workspace: null,
    selection: null
  },
  privateProviders: null
};

const communityBoundary = registerCommunityRoutes({
  registry,
  state,
  contracts,
  runtimeInfo,
  eventBus
});

const providerGate = await loadPrivateProviders({
  repoRoot,
  registry,
  state,
  contracts,
  helpers: {
    sendJson,
    state,
    readJsonBody,
    nowIso
  }
});
runtimeInfo.privateProviders = providerGate;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${port}`}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    const match = registry.matchRoute(req.method, pathname);
    if (!match) {
      const restricted = communityBoundary.matchRestricted(req.method, pathname);
      if (restricted) {
        communityBoundary.restrictedResponse({
          req,
          res,
          pathname,
          rule: restricted,
          providerGate
        });
        return;
      }
      sendJson(res, 404, { error: "not_found", method: req.method, path: pathname });
      return;
    }

    await match.route.handler({
      req,
      res,
      url,
      pathname,
      params: match.params || {},
      match: match.match,
      state,
      contracts,
      providerGate,
      runtimeInfo,
      eventBus
    });
  } catch (error) {
    sendJson(res, 500, {
      error: "internal_error",
      message: String(error?.message || error)
    });
  }
});

server.listen(port, host, () => {
  console.log(`[agent-host/community-kernel] listening on http://${host}:${port}`);
  console.log(
    `[agent-host/community-kernel] private providers authorized=${providerGate.authorized} loaded=${providerGate.loaded.length}`
  );
});
