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

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyIndexReferences(indexText) {
  const hasScript = /<script\s+src=["']\/app\.js["'][^>]*type=["']module["']/i.test(indexText);
  const hasStyle = /<link\s+rel=["']stylesheet["']\s+href=["']\/styles\.css["']/i.test(indexText);
  return { hasScript, hasStyle };
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
    const gotSha = sha256(abs);
    const gotBytes = fs.statSync(abs).size;
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
