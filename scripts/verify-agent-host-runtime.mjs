import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");
const hostRoot = path.join(repoRoot, "agent-host");
const manifestPath = path.join(hostRoot, "runtime.manifest.v1.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function canonicalizeTextBytes(rawBuf, relPath) {
  const ext = path.extname(relPath).toLowerCase();
  const textLike = ext === ".js" || ext === ".mjs" || ext === ".json" || ext === ".css" || ext === ".html" || ext === ".sql";
  if (!textLike) return rawBuf;
  const normalized = rawBuf.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return Buffer.from(normalized, "utf8");
}

function digestForFile(absPath, relPath) {
  const canonical = canonicalizeTextBytes(fs.readFileSync(absPath), relPath);
  return {
    sha256: crypto.createHash("sha256").update(canonical).digest("hex"),
    bytes: canonical.length
  };
}

function verifyPackageDeps(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) {
    return { ok: false, reason: "agent_host_package_json_missing" };
  }
  const pkg = readJson(packageJsonPath);
  const deps = pkg?.dependencies || {};
  const hasE2b = typeof deps.e2b === "string" && deps.e2b.length > 0;
  const hasOpenai = typeof deps.openai === "string" && deps.openai.length > 0;
  return {
    ok: hasE2b && hasOpenai,
    has_e2b: hasE2b,
    has_openai: hasOpenai
  };
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`agent_host_runtime_manifest_missing:${manifestPath}`);
  }
  const manifest = readJson(manifestPath);
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  const checks = [];

  for (const row of files) {
    const rel = String(row.path || "").trim();
    if (!rel) continue;
    const abs = path.join(hostRoot, rel);
    if (!fs.existsSync(abs)) {
      checks.push({ path: rel, ok: false, reason: "missing" });
      continue;
    }
    const got = digestForFile(abs, rel);
    const wantSha = String(row.sha256 || "").toLowerCase();
    const wantBytes = Number(row.bytes || 0);
    checks.push({
      path: rel,
      ok: got.sha256 === wantSha && got.bytes === wantBytes,
      expected_sha256: wantSha,
      actual_sha256: got.sha256,
      expected_bytes: wantBytes,
      actual_bytes: got.bytes
    });
  }

  const deps = verifyPackageDeps(path.join(hostRoot, "package.json"));
  const serverExists = fs.existsSync(path.join(hostRoot, "src", "server.mjs"));
  const ok = checks.every((x) => x.ok) && deps.ok && serverExists;

  process.stdout.write(
    `${JSON.stringify(
      {
        ok,
        manifest_version: manifest.manifest_version || null,
        build_version: manifest.build_version || null,
        source_revision: manifest.source_revision || null,
        host_root: hostRoot,
        checks,
        host_entrypoint_exists: serverExists,
        package_dependencies: deps
      },
      null,
      2
    )}\n`
  );
  if (!ok) {
    process.exit(1);
  }
}

main();
