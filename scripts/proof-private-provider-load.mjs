import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { canonicalizeJson } from "../entry/service/json-canonicalize.mjs";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(thisFile);
const repoRoot = path.resolve(scriptsDir, "..");
const proofDir = path.join(repoRoot, "release", "proof");
const proofFile = path.join(proofDir, "private-provider-load-authorized.json");
const host = "127.0.0.1";
const port = Number(process.env.LITECODEX_PRIVATE_PROVIDER_PROOF_PORT || 43188);
const providerEntry = process.env.LITECODEX_PRIVATE_PROVIDER_ENTRY
  ? path.resolve(process.env.LITECODEX_PRIVATE_PROVIDER_ENTRY)
  : null;

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function assert(condition, code) {
  if (!condition) {
    throw new Error(code);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(method, route, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host,
        port,
        path: route,
        method,
        timeout: 7000,
        headers: payload
          ? {
              "content-type": "application/json; charset=utf-8",
              "content-length": Buffer.byteLength(payload)
            }
          : undefined
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            // no-op
          }
          resolve({ statusCode: res.statusCode || 0, json, raw });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request_timeout")));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function waitHealth() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const health = await requestJson("GET", "/health");
      if (health.statusCode === 200 && health.json?.ok === true) {
        return health;
      }
    } catch {
      // retry
    }
    await sleep(400);
  }
  throw new Error("health_timeout");
}

function createSignedEntitlement(entitlementFile, keysFile) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const keyId = "ent-proof-ed25519-2026-04";
  const payload = {
    entitlementId: `ent_${crypto.randomUUID()}`,
    subject: "proof-authorized-user",
    plan: "official",
    features: {
      community_core: true,
      official_advanced: true,
      official_plugin_channel: true
    }
  };
  const canonical = canonicalizeJson(payload);
  const sig = crypto.sign(null, Buffer.from(canonical, "utf8"), privateKey).toString("base64url");
  const entitlement = {
    version: "v1",
    issuer: "litecodex-official",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    payload,
    signature: {
      alg: "Ed25519",
      keyId,
      sig
    }
  };
  const keys = {
    version: "v1",
    issuer: "litecodex-official",
    keys: [
      {
        keyId,
        alg: "Ed25519",
        status: "active",
        publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString("utf8")
      }
    ]
  };
  writeJson(entitlementFile, entitlement);
  writeJson(keysFile, keys);
}

async function main() {
  assert(providerEntry, "private_provider_entry_required");
  assert(fs.existsSync(providerEntry), "private_provider_entry_not_found");

  const entitlementFile = path.join(proofDir, "authorized-proof-entitlement.v1.json");
  const keysFile = path.join(proofDir, "authorized-proof-entitlement-keys.v1.json");
  createSignedEntitlement(entitlementFile, keysFile);

  const serverProc = spawn(process.execPath, [path.join("agent-host", "src", "server.mjs")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LITE_CODEX_HOST_PORT: String(port),
      LITECODEX_ENTITLEMENT_FILE: entitlementFile,
      LITECODEX_ENTITLEMENT_PUBLIC_KEYS_FILE: keysFile,
      LITECODEX_PRIVATE_PROVIDER_ENTRY: providerEntry
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  serverProc.stdout.on("data", (buf) => {
    stdout += buf.toString("utf8");
  });
  serverProc.stderr.on("data", (buf) => {
    stderr += buf.toString("utf8");
  });

  try {
    const steps = [];
    const health = await waitHealth();
    steps.push({ step: "health", result: health });

    const advanced = await requestJson("POST", "/runs/phase4a-resume-reconnect-hydration", {
      title: "authorized advanced workflow proof"
    });
    steps.push({ step: "advanced_workflow_route", result: advanced });
    assert(advanced.statusCode === 201, "advanced_workflow_not_loaded");

    const grantsList = await requestJson("GET", "/capability-grants");
    steps.push({ step: "capability_grants_list", result: grantsList });
    assert(grantsList.statusCode === 200, "capability_grants_not_loaded");

    const grantCreate = await requestJson("POST", "/capability-grants", {
      capability_key: "official.workspace.write",
      scope_type: "workspace",
      scope_value: "proof-workspace"
    });
    steps.push({ step: "capability_grant_create", result: grantCreate });
    assert(grantCreate.statusCode === 201, "capability_grant_create_failed");

    const proof = {
      generatedAt: new Date().toISOString(),
      ok: true,
      host,
      port,
      provider_entry: providerEntry,
      checks: {
        privateProviderLoaded: true,
        advancedWorkflowRouteAvailable: true,
        capabilityGrantAdminAvailable: true
      },
      steps,
      logs: {
        stdout: stdout.trim(),
        stderr: stderr.trim()
      }
    };
    writeJson(proofFile, proof);
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  } finally {
    if (!serverProc.killed) {
      try {
        serverProc.kill("SIGTERM");
      } catch {
        // no-op
      }
    }
    await sleep(250);
    if (!serverProc.killed) {
      try {
        serverProc.kill("SIGKILL");
      } catch {
        // no-op
      }
    }
  }
}

main().catch((error) => {
  const failure = {
    generatedAt: new Date().toISOString(),
    ok: false,
    error: String(error?.message || error)
  };
  writeJson(proofFile, failure);
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
});
