import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalizeJson } from "./json-canonicalize.mjs";

const DEFAULT_ISSUER = "litecodex-official";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function findPublicKey(keysDoc, keyId) {
  const keys = Array.isArray(keysDoc?.keys) ? keysDoc.keys : [];
  return keys.find((key) => key?.keyId === keyId && key?.status === "active") || null;
}

function verifyManifestSignature(publicKeyPem, manifest) {
  const manifestPayload = { ...manifest };
  delete manifestPayload.signature;
  const canonicalPayload = canonicalizeJson(manifestPayload);
  const signature = Buffer.from(String(manifest?.signature?.sig || ""), "base64url");
  const key = crypto.createPublicKey(publicKeyPem);
  return crypto.verify(null, Buffer.from(canonicalPayload, "utf8"), key, signature);
}

function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  const input = fs.readFileSync(filePath);
  hash.update(input);
  return hash.digest("hex");
}

function baseResult(manifestFile) {
  return {
    enabled: false,
    status: "missing",
    failClosed: false,
    reason: "manifest_missing",
    source: manifestFile,
    verifiedAt: new Date().toISOString(),
    issuer: DEFAULT_ISSUER,
    artifactsVerified: 0
  };
}

function assertManifestShape(manifest) {
  if (manifest?.version !== "v1") throw new Error("manifest_version_unsupported");
  if (manifest?.product !== "litecodex-ce") throw new Error("manifest_product_mismatch");
  if (!manifest?.signature || typeof manifest.signature !== "object") throw new Error("manifest_signature_missing");
  if (manifest.signature.alg !== "Ed25519") throw new Error("manifest_signature_alg_unsupported");
  if (typeof manifest.signature.keyId !== "string" || !manifest.signature.keyId) {
    throw new Error("manifest_signature_key_missing");
  }
  if (typeof manifest.signature.sig !== "string" || !manifest.signature.sig) {
    throw new Error("manifest_signature_value_missing");
  }
}

function verifyArtifacts(manifest, manifestDir) {
  const artifacts = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  let verifiedCount = 0;
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact !== "object") throw new Error("artifact_entry_invalid");
    const localPath = typeof artifact.localPath === "string" ? artifact.localPath : null;
    if (!localPath) continue;
    const resolved = path.resolve(manifestDir, localPath);
    if (!fs.existsSync(resolved)) throw new Error(`artifact_missing:${localPath}`);
    const actualHash = sha256File(resolved);
    if (String(actualHash) !== String(artifact.sha256 || "").toLowerCase()) {
      throw new Error(`artifact_hash_mismatch:${localPath}`);
    }
    if (Number.isFinite(artifact.size)) {
      const actualSize = fs.statSync(resolved).size;
      if (actualSize !== artifact.size) throw new Error(`artifact_size_mismatch:${localPath}`);
    }
    verifiedCount += 1;
  }
  return verifiedCount;
}

export function verifyUpdateManifest({
  repoRoot,
  manifestFile = path.join(repoRoot, "entry", "state", "release-manifest.v1.json"),
  keysFile = path.join(repoRoot, "shared", "update-public-keys.v1.json")
}) {
  const result = baseResult(manifestFile);
  if (!fs.existsSync(manifestFile)) {
    return result;
  }

  try {
    const manifest = readJson(manifestFile);
    const keys = readJson(keysFile);
    assertManifestShape(manifest);
    const key = findPublicKey(keys, manifest.signature.keyId);
    if (!key) throw new Error("manifest_trusted_key_not_found");
    const signed = verifyManifestSignature(key.publicKeyPem, manifest);
    if (!signed) throw new Error("manifest_signature_invalid");
    const artifactsVerified = verifyArtifacts(manifest, path.dirname(manifestFile));

    return {
      ...result,
      enabled: true,
      status: "valid",
      failClosed: false,
      reason: "ok",
      channel: manifest.channel || "stable",
      releaseVersion: manifest?.release?.version || null,
      keyId: manifest.signature.keyId,
      artifactsVerified
    };
  } catch (error) {
    return {
      ...result,
      enabled: false,
      status: "invalid",
      failClosed: true,
      reason: String(error?.message || error)
    };
  }
}

