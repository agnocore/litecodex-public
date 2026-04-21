import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listFilesRecursive, writeJson } from "./release-lib.mjs";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(thisFile);
const repoRoot = path.resolve(scriptsDir, "..");
const entryCli = path.join(repoRoot, "entry", "cli.mjs");
const proofDir = path.join(repoRoot, "release", "proof");
const proofFile = path.join(proofDir, "community-release-verify.json");
const entryStateDir = path.join(repoRoot, "entry", "state");
const communityOutDir = path.join(repoRoot, "release", "out", "community");

function runNode(args, envExtra = {}) {
  const res = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...envExtra },
    timeout: 240000
  });
  return {
    command: `node ${args.join(" ")}`,
    code: res.status,
    stdout: res.stdout || "",
    stderr: res.stderr || ""
  };
}

function parseLastJson(stdout) {
  const input = String(stdout || "").trim();
  if (!input) return null;
  const starts = [];
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] === "{") starts.push(i);
  }
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    const candidate = input.slice(starts[i]);
    try {
      return JSON.parse(candidate);
    } catch {
      // try previous
    }
  }
  return null;
}

function runEntryCli(subcommand, envExtra = {}) {
  return runNode([entryCli, "entry", ...subcommand], envExtra);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port: 43985,
        path: pathname,
        timeout: 5000
      },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          body += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {
            // keep null
          }
          resolve({
            statusCode: res.statusCode || 0,
            body,
            json
          });
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function waitForHealth() {
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson("/health");
      if (
        health.statusCode === 200 &&
        health.json?.ok === true &&
        health.json?.service === "litecodex-entry" &&
        health.json?.listen === "127.0.0.1:43985"
      ) {
        return health;
      }
    } catch {
      // retry
    }
    await wait(500);
  }
  throw new Error("entry_health_timeout");
}

function assert(condition, code) {
  if (!condition) {
    throw new Error(code);
  }
}

async function main() {
  fs.mkdirSync(proofDir, { recursive: true });
  fs.mkdirSync(entryStateDir, { recursive: true });

  const steps = [];

  const buildCommunity = runNode([path.join("scripts", "build-community.mjs")]);
  steps.push({ step: "build_community", result: buildCommunity });
  assert(buildCommunity.code === 0, "build_community_failed");

  const buildPrivate = runNode([path.join("scripts", "build-private.mjs")]);
  steps.push({ step: "build_private", result: buildPrivate });
  assert(buildPrivate.code === 0, "build_private_failed");

  const boundaryAudit = runNode([path.join("scripts", "audit-community-boundary.mjs")]);
  steps.push({ step: "audit_community_boundary", result: boundaryAudit });
  assert(boundaryAudit.code === 0, "audit_community_boundary_failed");

  const communityFiles = listFilesRecursive(communityOutDir).map((filePath) =>
    path.relative(communityOutDir, filePath).replace(/\\/g, "/")
  );
  const noPrivateLeak =
    !communityFiles.some((file) => file.includes("private-control-plane")) &&
    !communityFiles.some((file) => file.includes("internal-admin-console")) &&
    !communityFiles.some((file) => file.includes("license-api")) &&
    !communityFiles.some((file) => file.includes("release-api")) &&
    !communityFiles.some((file) => file.includes("private-plugin-registry"));
  assert(noPrivateLeak, "community_package_private_leak");

  const entitlementInvalidPath = path.join(entryStateDir, "entitlement.invalid.v1.json");
  const manifestInvalidPath = path.join(entryStateDir, "release-manifest.invalid.v1.json");
  writeJson(entitlementInvalidPath, {
    version: "v1",
    issuer: "litecodex-official",
    issuedAt: "2026-04-22T00:00:00Z",
    expiresAt: "2027-04-22T00:00:00Z",
    payload: {
      entitlementId: "ent_invalid_demo",
      plan: "community",
      features: {
        community_core: true,
        official_advanced: true,
        official_plugin_channel: true
      }
    },
    signature: {
      alg: "Ed25519",
      keyId: "ent-ed25519-2026-01",
      sig: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    }
  });
  writeJson(manifestInvalidPath, {
    version: "v1",
    channel: "stable",
    product: "litecodex-ce",
    release: {
      version: "1.0.0",
      publishedAt: "2026-04-22T00:00:00Z"
    },
    artifacts: [],
    signature: {
      alg: "Ed25519",
      keyId: "upd-ed25519-2026-01",
      sig: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
    }
  });

  const restartInvalid = runEntryCli(["restart"], {
    LITECODEX_ENTITLEMENT_FILE: entitlementInvalidPath,
    LITECODEX_RELEASE_MANIFEST_FILE: manifestInvalidPath
  });
  steps.push({ step: "restart_with_invalid_signatures", result: restartInvalid });
  assert(restartInvalid.code === 0, "restart_invalid_signatures_failed");
  await waitForHealth();
  const statusInvalid = await getJson("/status");
  steps.push({ step: "status_after_invalid_signatures", result: statusInvalid });
  assert(statusInvalid.statusCode === 200, "status_invalid_signatures_unreachable");
  assert(statusInvalid.json?.security?.entitlement?.status === "invalid", "entitlement_fail_closed_missing");
  assert(statusInvalid.json?.security?.updates?.status === "invalid", "update_fail_closed_missing");
  assert(statusInvalid.json?.security?.officialCapabilitiesEnabled === false, "official_capabilities_not_closed");

  const restartMissing = runEntryCli(["restart"], {
    LITECODEX_ENTITLEMENT_FILE: path.join(entryStateDir, "entitlement.missing.v1.json"),
    LITECODEX_RELEASE_MANIFEST_FILE: path.join(entryStateDir, "release-manifest.missing.v1.json")
  });
  steps.push({ step: "restart_with_missing_entitlement_and_manifest", result: restartMissing });
  assert(restartMissing.code === 0, "restart_missing_inputs_failed");
  await waitForHealth();
  const statusMissing = await getJson("/status");
  steps.push({ step: "status_after_missing_inputs", result: statusMissing });
  assert(statusMissing.statusCode === 200, "status_missing_inputs_unreachable");
  assert(statusMissing.json?.security?.entitlement?.status === "missing", "missing_entitlement_not_reported");
  assert(statusMissing.json?.security?.updates?.status === "missing", "missing_update_manifest_not_reported");
  assert(statusMissing.json?.security?.officialCapabilitiesEnabled === false, "missing_inputs_not_ce_only");

  const restartDefault = runEntryCli(["restart"]);
  steps.push({ step: "restart_default_runtime", result: restartDefault });
  assert(restartDefault.code === 0, "restart_default_failed");
  const health = await waitForHealth();
  const finalStatus = await getJson("/status");

  const proof = {
    generatedAt: new Date().toISOString(),
    ok: true,
    checks: {
      communityPackageNoPrivateLeak: noPrivateLeak,
      entryHealthContract: health.json,
      statusHasSecurity: Boolean(finalStatus.json?.security),
      entitlementVerifierIntegrated: true,
      updateVerifierIntegrated: true,
      failClosedOnInvalidSignature: true,
      ceOnlyOnMissingEntitlement: true,
      listenAddress: finalStatus.json?.listen || null
    },
    dryRun: {
      communityOutDir: path.relative(repoRoot, communityOutDir).replace(/\\/g, "/"),
      communityFileCount: communityFiles.length
    },
    steps
  };
  writeJson(proofFile, proof);
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
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
