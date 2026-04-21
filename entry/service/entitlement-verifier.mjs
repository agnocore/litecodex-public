import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { canonicalizeJson } from "./json-canonicalize.mjs";

const DEFAULT_ISSUER = "litecodex-official";
const DEFAULT_SCOPE = "community";

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function basePolicy(filePath) {
  return {
    enabled: false,
    status: "missing",
    failClosed: false,
    reason: "entitlement_missing",
    source: filePath,
    verifiedAt: new Date().toISOString(),
    issuer: DEFAULT_ISSUER,
    scope: DEFAULT_SCOPE,
    features: {
      community_core: true,
      official_advanced: false,
      official_plugin_channel: false
    }
  };
}

function findPublicKey(keysDoc, keyId) {
  const keys = Array.isArray(keysDoc?.keys) ? keysDoc.keys : [];
  return keys.find((key) => key?.keyId === keyId && key?.status === "active") || null;
}

function verifyEd25519Signature(publicKeyPem, payloadObject, signatureBase64Url) {
  const canonicalPayload = canonicalizeJson(payloadObject);
  const verifierInput = Buffer.from(canonicalPayload, "utf8");
  const signatureBytes = Buffer.from(String(signatureBase64Url || ""), "base64url");
  const keyObject = crypto.createPublicKey(publicKeyPem);
  return crypto.verify(null, verifierInput, keyObject, signatureBytes);
}

function isIsoTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed);
}

function assertValidEnvelope(entitlement) {
  if (entitlement?.version !== "v1") throw new Error("unsupported_version");
  if (entitlement?.issuer !== DEFAULT_ISSUER) throw new Error("issuer_mismatch");
  if (!isIsoTimestamp(entitlement?.issuedAt)) throw new Error("issuedAt_invalid");
  if (!isIsoTimestamp(entitlement?.expiresAt)) throw new Error("expiresAt_invalid");
  if (Date.now() >= Date.parse(entitlement.expiresAt)) throw new Error("entitlement_expired");
  if (Date.parse(entitlement.issuedAt) > Date.now() + 60 * 1000) throw new Error("issuedAt_in_future");
  if (!entitlement?.payload || typeof entitlement.payload !== "object") throw new Error("payload_missing");
  if (!entitlement?.signature || typeof entitlement.signature !== "object") throw new Error("signature_missing");
  if (entitlement.signature.alg !== "Ed25519") throw new Error("signature_alg_unsupported");
  if (typeof entitlement.signature.keyId !== "string" || !entitlement.signature.keyId) {
    throw new Error("signature_key_missing");
  }
  if (typeof entitlement.signature.sig !== "string" || !entitlement.signature.sig) {
    throw new Error("signature_value_missing");
  }
}

export function verifyEntitlement({
  repoRoot,
  entitlementFile = path.join(repoRoot, "entry", "state", "entitlement.v1.json"),
  keysFile = path.join(repoRoot, "shared", "entitlement-public-keys.v1.json")
}) {
  const policy = basePolicy(entitlementFile);

  if (!fs.existsSync(entitlementFile)) {
    return policy;
  }

  try {
    const entitlement = readJson(entitlementFile);
    const keysDoc = readJson(keysFile);
    assertValidEnvelope(entitlement);

    const key = findPublicKey(keysDoc, entitlement.signature.keyId);
    if (!key) throw new Error("trusted_key_not_found");

    const verified = verifyEd25519Signature(key.publicKeyPem, entitlement.payload, entitlement.signature.sig);
    if (!verified) throw new Error("signature_invalid");

    const features = {
      community_core: true,
      official_advanced: Boolean(entitlement?.payload?.features?.official_advanced),
      official_plugin_channel: Boolean(entitlement?.payload?.features?.official_plugin_channel)
    };

    return {
      ...policy,
      enabled: true,
      status: "valid",
      failClosed: false,
      reason: "ok",
      issuer: entitlement.issuer,
      scope: entitlement?.payload?.plan || DEFAULT_SCOPE,
      entitlementId: entitlement?.payload?.entitlementId || null,
      expiresAt: entitlement.expiresAt,
      keyId: entitlement.signature.keyId,
      features
    };
  } catch (error) {
    return {
      ...policy,
      enabled: false,
      status: "invalid",
      failClosed: true,
      reason: String(error?.message || error),
      features: {
        community_core: true,
        official_advanced: false,
        official_plugin_channel: false
      }
    };
  }
}

