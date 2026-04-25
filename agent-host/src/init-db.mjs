import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..", "..");
const installer = path.join(repoRoot, "run-ledger", "install.mjs");

if (!fs.existsSync(installer)) {
  throw new Error(`ledger installer not found: ${installer}`);
}

const result = spawnSync(process.execPath, [installer, "--strict"], {
  cwd: repoRoot,
  encoding: "utf8"
});

if (result.status !== 0) {
  throw new Error(`ledger install failed: ${result.stderr || result.stdout || "unknown error"}`);
}

process.stdout.write(result.stdout || "");
