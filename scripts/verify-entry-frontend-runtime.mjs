import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");
const publicRoot = path.join(repoRoot, "entry", "service", "public");
const manifestPath = path.join(publicRoot, "frontend-runtime.manifest.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function verifyIndexReferences(indexText) {
  const hasScript = /<script\s+src=["']\/app\.js["'][^>]*type=["']module["']/i.test(indexText);
  const hasStyle = /<link\s+rel=["']stylesheet["']\s+href=["']\/styles\.css["']/i.test(indexText);
  return { hasScript, hasStyle };
}

function canonicalizeTextBytes(rawBuf, relPath) {
  const ext = path.extname(relPath).toLowerCase();
  const textLike = ext === ".js" || ext === ".css" || ext === ".html" || ext === ".json" || ext === ".mjs";
  if (!textLike) return rawBuf;
  const normalized = rawBuf.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Buffer.from(normalized, "utf8");
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`frontend_manifest_missing:${manifestPath}`);
  }

  const manifest = readJson(manifestPath);
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const checks = [];

  for (const row of files) {
    const rel = String(row.path || "").trim();
    if (!rel) continue;
    const abs = path.join(publicRoot, rel);
    if (!fs.existsSync(abs)) {
      checks.push({ path: rel, ok: false, reason: "missing" });
      continue;
    }
    const canonical = canonicalizeTextBytes(fs.readFileSync(abs), rel);
    const gotSha = crypto.createHash("sha256").update(canonical).digest("hex");
    const gotBytes = canonical.length;
    const wantSha = String(row.sha256 || "").toLowerCase();
    const wantBytes = Number(row.bytes || 0);
    checks.push({
      path: rel,
      ok: gotSha === wantSha && gotBytes === wantBytes,
      expected_sha256: wantSha,
      actual_sha256: gotSha,
      expected_bytes: wantBytes,
      actual_bytes: gotBytes
    });
  }

  const indexPath = path.join(publicRoot, "index.html");
  const indexText = fs.existsSync(indexPath) ? fs.readFileSync(indexPath, "utf8") : "";
  const refs = verifyIndexReferences(indexText);

  const ok = checks.every((x) => x.ok) && refs.hasScript && refs.hasStyle;
  const payload = {
    ok,
    manifest_version: manifest.manifest_version || null,
    build_version: manifest.build_version || null,
    source_revision: manifest.source_revision || null,
    public_root: publicRoot,
    checks,
    index_references: refs
  };

  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  if (!ok) {
    process.exit(1);
  }
}

main();
