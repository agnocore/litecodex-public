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

function main() {
  resetDir(outDir);
  copyPath(repoRoot, outDir, "private-control-plane");
  copyPath(repoRoot, outDir, "docs/PRODUCT_BOUNDARY.md");
  copyPath(repoRoot, outDir, "docs/ENTITLEMENT_SPEC.md");
  copyPath(repoRoot, outDir, "docs/UPDATE_SIGNING_SPEC.md");

  const manifest = buildManifest(outDir);
  writeJson(manifestFile, manifest);
  const proof = {
    generatedAt: new Date().toISOString(),
    action: "build:private",
    ok: true,
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

