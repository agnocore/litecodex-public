import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { verifyEntitlement } from "../../../entry/service/entitlement-verifier.mjs";

function listProviderEntries(providerDir) {
  if (!providerDir || !fs.existsSync(providerDir)) {
    return [];
  }
  const files = fs.readdirSync(providerDir);
  const entries = [];
  for (const name of files) {
    if (!name.toLowerCase().endsWith(".mjs")) {
      continue;
    }
    entries.push(path.join(providerDir, name));
  }
  entries.sort();
  return entries;
}

function readEntitlementGate(repoRoot) {
  const entitlementFile =
    process.env.LITECODEX_ENTITLEMENT_FILE || path.join(repoRoot, "entry", "state", "entitlement.v1.json");
  const keysFile =
    process.env.LITECODEX_ENTITLEMENT_PUBLIC_KEYS_FILE ||
    path.join(repoRoot, "shared", "entitlement-public-keys.v1.json");
  const entitlement = verifyEntitlement({
    repoRoot,
    entitlementFile,
    keysFile
  });
  const authorized =
    entitlement.status === "valid" &&
    entitlement.features &&
    entitlement.features.official_advanced === true;
  return {
    authorized,
    entitlement,
    entitlement_file: entitlementFile,
    entitlement_keys_file: keysFile
  };
}

export async function loadPrivateProviders({
  repoRoot,
  registry,
  state,
  contracts,
  helpers,
  logger = console
}) {
  const gate = readEntitlementGate(repoRoot);
  const providerEntries = [];

  if (process.env.LITECODEX_PRIVATE_PROVIDER_ENTRY) {
    providerEntries.push(path.resolve(process.env.LITECODEX_PRIVATE_PROVIDER_ENTRY));
  }
  if (process.env.LITECODEX_PRIVATE_PROVIDER_DIR) {
    providerEntries.push(...listProviderEntries(path.resolve(process.env.LITECODEX_PRIVATE_PROVIDER_DIR)));
  }

  const uniqueEntries = Array.from(new Set(providerEntries));
  const loaded = [];

  if (!gate.authorized) {
    return {
      authorized: false,
      gate,
      loaded,
      providers_requested: uniqueEntries
    };
  }

  for (const entryPath of uniqueEntries) {
    if (!fs.existsSync(entryPath)) {
      loaded.push({ entry: entryPath, loaded: false, error: "provider_not_found" });
      continue;
    }
    try {
      const mod = await import(pathToFileURL(entryPath).href);
      const providerId = String(mod.providerId || path.basename(entryPath));
      const capabilities = Array.isArray(mod.capabilities)
        ? mod.capabilities.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      if (typeof mod.registerPrivateProviderRoutes !== "function") {
        loaded.push({ entry: entryPath, loaded: false, provider_id: providerId, error: "register_function_missing" });
        continue;
      }
      await mod.registerPrivateProviderRoutes({
        addRoute(definition) {
          return registry.addRoute({
            ...definition,
            source: "private",
            meta: {
              ...(definition?.meta || {}),
              provider_id: providerId
            }
          });
        },
        state,
        contracts,
        helpers,
        gate
      });
      loaded.push({ entry: entryPath, loaded: true, provider_id: providerId, capabilities });
      logger.log(`[agent-host/private-provider] loaded ${providerId} from ${entryPath}`);
    } catch (error) {
      loaded.push({ entry: entryPath, loaded: false, error: String(error?.message || error) });
    }
  }

  return {
    authorized: true,
    gate,
    loaded,
    providers_requested: uniqueEntries
  };
}
