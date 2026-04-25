import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");
const ledgerDir = path.join(repoRoot, "run-ledger");
const dbPath = path.join(ledgerDir, "ledger.sqlite");
const manifestPath = path.join(ledgerDir, "community-ledger.manifest.v1.json");
const statusFile = path.join(ledgerDir, "install-status.v1.json");

function readJson(filePath, fallback = null) {
  try {
    const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function print(payload) {
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

function main() {
  const manifest = readJson(manifestPath, {});
  const requiredTables = Array.isArray(manifest.required_tables) ? manifest.required_tables : [];
  const installStatus = readJson(statusFile, null);

  if (!fs.existsSync(dbPath)) {
    print({
      ok: false,
      status: "missing_db",
      db_path: dbPath,
      contract_version: manifest.contract_version || null,
      required_tables: requiredTables,
      install_status: installStatus
    });
    process.exit(1);
    return;
  }

  const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  try {
    const tableRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    const tableSet = new Set(tableRows.map((row) => String(row.name || "")));
    const missingTables = requiredTables.filter((name) => !tableSet.has(String(name || "")));

    let migrationCount = 0;
    if (tableSet.has("schema_migrations")) {
      migrationCount = Number(db.prepare("SELECT COUNT(*) AS c FROM schema_migrations").get()?.c || 0);
    }

    const payload = {
      ok: missingTables.length === 0,
      status: missingTables.length === 0 ? "ready" : "incomplete",
      db_path: dbPath,
      contract_version: manifest.contract_version || null,
      migration_count: migrationCount,
      required_tables: requiredTables,
      missing_tables: missingTables,
      install_status: installStatus
    };
    print(payload);
    if (!payload.ok) {
      process.exit(2);
    }
  } finally {
    db.close();
  }
}

main();
