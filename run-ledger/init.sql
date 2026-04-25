PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_contracts (
  id TEXT PRIMARY KEY,
  contract_key TEXT NOT NULL UNIQUE,
  contract_version TEXT NOT NULL,
  bundle_sha256 TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_install_log (
  id TEXT PRIMARY KEY,
  installer_version TEXT NOT NULL,
  contract_version TEXT NOT NULL,
  status TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);