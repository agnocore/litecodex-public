import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, copyPath, resetDir, writeJson } from "./release-lib.mjs";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(thisFile);
const repoRoot = path.resolve(scriptsDir, "..");
const outDir = path.join(repoRoot, "release", "out", "private");
const proofDir = path.join(repoRoot, "release", "proof");
const manifestFile = path.join(outDir, "private-package-manifest.json");
const proofFile = path.join(proofDir, "private-build-proof.json");

function resolvePrivateRoot() {
  if (process.env.LITECODEX_PRIVATE_REPO_ROOT) {
    return path.resolve(process.env.LITECODEX_PRIVATE_REPO_ROOT);
  }
  return repoRoot;
}

function main() {
  const privateRoot = resolvePrivateRoot();
  const privateControlPlaneSource = path.join(privateRoot, "private-control-plane");
  if (!fs.existsSync(privateControlPlaneSource)) {
    throw new Error("private_control_plane_source_missing");
  }

  resetDir(outDir);
  copyPath(privateRoot, outDir, "private-control-plane");
  copyPath(privateRoot, outDir, "docs/PRODUCT_BOUNDARY.md");
  copyPath(privateRoot, outDir, "docs/ENTITLEMENT_SPEC.md");
  copyPath(privateRoot, outDir, "docs/UPDATE_SIGNING_SPEC.md");

  const manifest = buildManifest(outDir);
  writeJson(manifestFile, manifest);
  const proof = {
    generatedAt: new Date().toISOString(),
    action: "build:private",
    ok: true,
    privateRoot,
    outDir: path.relative(repoRoot, outDir).replace(/\\/g, "/"),
    manifestFile: path.relative(repoRoot, manifestFile).replace(/\\/g, "/")
  };
  writeJson(proofFile, proof);
  process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  const failure = {
    generatedAt: new Date().toISOString(),
    action: "build:private",
    ok: false,
    error: String(error?.message || error)
  };
  writeJson(proofFile, failure);
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
}
