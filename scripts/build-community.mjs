import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, copyPath, resetDir, runLeakGuards, writeJson } from "./release-lib.mjs";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(thisFile);
const repoRoot = path.resolve(scriptsDir, "..");
const configFile = path.join(repoRoot, "release", "community-whitelist.json");
const outDir = path.join(repoRoot, "release", "out", "community");
const proofDir = path.join(repoRoot, "release", "proof");
const manifestFile = path.join(outDir, "community-package-manifest.json");
const proofFile = path.join(proofDir, "community-build-proof.json");

function main() {
  const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
  const include = Array.isArray(config.include) ? config.include : [];
  const deny = Array.isArray(config.denyPathContains) ? config.denyPathContains : [];

  resetDir(outDir);

  for (const rel of include) {
    copyPath(repoRoot, outDir, rel);
  }

  const guard = runLeakGuards(outDir, deny);
  const manifest = buildManifest(outDir);
  writeJson(manifestFile, manifest);

  const proof = {
    generatedAt: new Date().toISOString(),
    action: "build:community",
    ok: guard.ok,
    include,
    denyPathContains: deny,
    guard,
    manifestFile: path.relative(repoRoot, manifestFile).replace(/\\/g, "/"),
    outDir: path.relative(repoRoot, outDir).replace(/\\/g, "/")
  };
  writeJson(proofFile, proof);

  if (!guard.ok) {
    throw new Error(`community_build_guard_failed:${guard.pathViolations.length + guard.contentViolations.length}`);
  }

  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const failure = {
    generatedAt: new Date().toISOString(),
    action: "build:community",
    ok: false,
    error: String(error?.message || error)
  };
  writeJson(path.join(proofDir, "community-build-proof.json"), failure);
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
}

