import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const INSTALLER_VERSION = "2026-04-26.community-ledger-installer.v1";
const STRICT = process.argv.includes("--strict");

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..");
const ledgerDir = path.join(repoRoot, "run-ledger");
const dbPath = path.join(ledgerDir, "ledger.sqlite");
const manifestPath = path.join(ledgerDir, "community-ledger.manifest.v1.json");
const bootstrapFile = path.join(ledgerDir, "init.sql");
const bundleFile = path.join(ledgerDir, "community-ledger.bundle.sql");
const migrationsDir = path.join(ledgerDir, "migrations");
const statusFile = path.join(ledgerDir, "install-status.v1.json");
const privateBundleEnv = "LITECODEX_LEDGER_PRIVATE_BUNDLE_SQL";

function nowIso() {
  return new Date().toISOString();
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function readFileUtf8(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function readJson(filePath) {
  return JSON.parse(readFileUtf8(filePath));
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function migrationDone(db, filename) {
  const row = db
    .prepare("SELECT 1 AS ok FROM schema_migrations WHERE filename = ? LIMIT 1")
    .get(String(filename));
  return Boolean(row?.ok);
}

function recordMigration(db, filename) {
  db.prepare("INSERT INTO schema_migrations (id, filename, applied_at) VALUES (?, ?, ?)").run(
    `migr_${crypto.randomUUID()}`,
    String(filename),
    nowIso()
  );
}

function applySqlScript(db, filename, sqlText, applied, skipped) {
  if (migrationDone(db, filename)) {
    skipped.push(filename);
    return;
  }
  db.exec(sqlText);
  recordMigration(db, filename);
  applied.push(filename);
}

function verifyChecksumOrThrow(label, filePath, expectedSha256) {
  if (!expectedSha256) {
    return;
  }
  const got = sha256Buffer(fs.readFileSync(filePath));
  if (got !== String(expectedSha256).toLowerCase()) {
    throw new Error(`${label}_checksum_mismatch:${got}`);
  }
}

function listSqlMigrations(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function verifyTables(db, requiredTables) {
  const existing = new Set(
    db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => String(row.name || ""))
  );
  const missing = [];
  for (const table of requiredTables) {
    const name = String(table || "").trim();
    if (!name) {
      continue;
    }
    if (!existing.has(name)) {
      missing.push(name);
    }
  }
  return { missing, existingCount: existing.size };
}

function buildSummary({ ok, contractVersion, applied, skipped, requiredTables, missingTables, privateBundleApplied }) {
  return {
    ok,
    installer_version: INSTALLER_VERSION,
    strict_mode: STRICT,
    contract_version: contractVersion,
    db_path: dbPath,
    applied,
    skipped,
    private_bundle_applied: privateBundleApplied,
    required_tables: requiredTables,
    missing_tables: missingTables,
    completed_at: nowIso()
  };
}

function install() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error("manifest_missing");
  }
  if (!fs.existsSync(bootstrapFile)) {
    throw new Error("bootstrap_sql_missing");
  }
  if (!fs.existsSync(bundleFile)) {
    throw new Error("community_bundle_missing");
  }

  const manifest = readJson(manifestPath);
  const contractVersion = String(manifest.contract_version || "community-ledger-contract-missing");
  const requiredTables = Array.isArray(manifest.required_tables) ? manifest.required_tables : [];

  verifyChecksumOrThrow("bootstrap", bootstrapFile, manifest.bootstrap_sha256);
  verifyChecksumOrThrow("community_bundle", bundleFile, manifest.bundle_sha256);

  const migrationFiles = listSqlMigrations(migrationsDir);
  const expectedMigrations = Array.isArray(manifest.migrations)
    ? manifest.migrations.map((row) => ({
        file: String(row.file || "").trim(),
        sha256: String(row.sha256 || "").trim().toLowerCase()
      }))
    : [];

  for (const expected of expectedMigrations) {
    if (!expected.file) continue;
    const abs = path.join(migrationsDir, expected.file);
    if (!fs.existsSync(abs)) {
      throw new Error(`migration_missing:${expected.file}`);
    }
    verifyChecksumOrThrow(`migration:${expected.file}`, abs, expected.sha256);
  }

  const privateBundlePathRaw = process.env[privateBundleEnv] ? String(process.env[privateBundleEnv]).trim() : "";
  const privateBundlePath = privateBundlePathRaw ? path.resolve(privateBundlePathRaw) : "";
  if (privateBundlePath && !fs.existsSync(privateBundlePath)) {
    throw new Error(`private_bundle_not_found:${privateBundlePath}`);
  }

  ensureDir(ledgerDir);
  const db = new DatabaseSync(dbPath);
  const applied = [];
  const skipped = [];

  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
    db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, applied_at TEXT NOT NULL)"
    );

    applySqlScript(db, "bootstrap:init.sql", readFileUtf8(bootstrapFile), applied, skipped);
    applySqlScript(db, "bundle:community-ledger.bundle.sql", readFileUtf8(bundleFile), applied, skipped);

    for (const file of migrationFiles) {
      const sql = readFileUtf8(path.join(migrationsDir, file));
      applySqlScript(db, `migration:${file}`, sql, applied, skipped);
    }

    let privateBundleApplied = false;
    if (privateBundlePath) {
      const privateLabel = `private_bundle:${path.basename(privateBundlePath)}`;
      applySqlScript(db, privateLabel, readFileUtf8(privateBundlePath), applied, skipped);
      privateBundleApplied = migrationDone(db, privateLabel);
    }

    const checks = verifyTables(db, requiredTables);
    if (checks.missing.length > 0) {
      throw new Error(`required_tables_missing:${checks.missing.join(",")}`);
    }

    const bundleSha = sha256Buffer(fs.readFileSync(bundleFile));
    const contractNow = nowIso();
    db.prepare(
      "INSERT INTO schema_contracts (id, contract_key, contract_version, bundle_sha256, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(contract_key) DO UPDATE SET contract_version=excluded.contract_version, bundle_sha256=excluded.bundle_sha256, updated_at=excluded.updated_at"
    ).run(
      `contract_${crypto.randomUUID()}`,
      "community_ledger_contract",
      contractVersion,
      bundleSha,
      contractNow,
      contractNow
    );

    const summary = buildSummary({
      ok: true,
      contractVersion,
      applied,
      skipped,
      requiredTables,
      missingTables: [],
      privateBundleApplied
    });

    db.prepare(
      "INSERT INTO schema_install_log (id, installer_version, contract_version, status, summary_json, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ).run(
      `install_${crypto.randomUUID()}`,
      INSTALLER_VERSION,
      contractVersion,
      "ok",
      JSON.stringify(summary),
      nowIso()
    );

    writeJson(statusFile, summary);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    return;
  } finally {
    db.close();
  }
}

try {
  install();
} catch (error) {
  const payload = {
    ok: false,
    installer_version: INSTALLER_VERSION,
    strict_mode: STRICT,
    error: String(error?.message || error),
    db_path: dbPath,
    hint:
      process.env[privateBundleEnv] && !String(process.env[privateBundleEnv]).trim()
        ? `${privateBundleEnv} is set but empty`
        : undefined
  };
  if (STRICT) {
    writeJson(statusFile, payload);
  }
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
}
