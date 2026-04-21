CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attachment_manifests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT,
  status TEXT NOT NULL,
  manifest_path TEXT NOT NULL,
  storage_root TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS run_attachments (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT,
  session_id TEXT,
  manifest_id TEXT,
  source_type TEXT NOT NULL,
  ingest_channel TEXT NOT NULL,
  mime_type TEXT,
  original_name TEXT,
  artifact_path TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (manifest_id) REFERENCES attachment_manifests (id)
);

CREATE TABLE IF NOT EXISTS autocontext_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  snapshot_path TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  compact_run_id TEXT,
  manifest_id TEXT,
  attachment_ids_json TEXT NOT NULL,
  source_tables_json TEXT NOT NULL,
  references_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (compact_run_id) REFERENCES compact_runs (id),
  FOREIGN KEY (manifest_id) REFERENCES attachment_manifests (id)
);

CREATE TABLE IF NOT EXISTS ledger_integrity_reports (
  id TEXT PRIMARY KEY,
  trigger_source TEXT NOT NULL,
  report_path TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachment_manifests_run ON attachment_manifests (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_run_attachments_run ON run_attachments (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_run_attachments_manifest ON run_attachments (manifest_id, created_at);
CREATE INDEX IF NOT EXISTS idx_autocontext_snapshots_run ON autocontext_snapshots (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_integrity_reports_source ON ledger_integrity_reports (trigger_source, created_at);
