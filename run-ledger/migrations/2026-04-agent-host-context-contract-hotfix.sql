CREATE TABLE IF NOT EXISTS autocontext_compilations (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  run_id TEXT,
  step_id TEXT,
  trigger_phase TEXT,
  created_at TEXT NOT NULL,
  context_json TEXT NOT NULL DEFAULT '{}',
  context_hash TEXT,
  artifact_path TEXT,
  redaction_json TEXT NOT NULL DEFAULT '{}',
  stale_guard_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'completed',
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_autocontext_compilations_run_status_created
  ON autocontext_compilations (run_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_autocontext_compilations_session_created
  ON autocontext_compilations (session_id, created_at);

CREATE TABLE IF NOT EXISTS context_snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  run_id TEXT,
  created_at TEXT NOT NULL,
  source_from_seq INTEGER DEFAULT 1,
  source_to_seq INTEGER DEFAULT 0,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  token_estimate_before INTEGER DEFAULT 0,
  token_estimate_after INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  reason TEXT,
  quality_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT,
  artifact_path TEXT
);

CREATE INDEX IF NOT EXISTS idx_context_snapshots_session_status_created
  ON context_snapshots (session_id, status, created_at);

CREATE INDEX IF NOT EXISTS idx_context_snapshots_run_created
  ON context_snapshots (run_id, created_at);

CREATE TABLE IF NOT EXISTS context_compactions (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  run_id TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'started',
  reason TEXT,
  snapshot_id TEXT,
  error_code TEXT,
  error_message TEXT,
  idempotency_key TEXT,
  source_from_seq INTEGER,
  source_to_seq INTEGER,
  artifact_path TEXT,
  timeout_ms INTEGER,
  trigger_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_context_compactions_session_started
  ON context_compactions (session_id, started_at);

CREATE INDEX IF NOT EXISTS idx_context_compactions_run_started
  ON context_compactions (run_id, started_at);

CREATE INDEX IF NOT EXISTS idx_context_compactions_idempotency
  ON context_compactions (idempotency_key, started_at);

CREATE TABLE IF NOT EXISTS run_context_receipts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  session_id TEXT,
  autocontext_id TEXT,
  snapshot_id TEXT,
  consumed_at TEXT NOT NULL,
  context_sources_json TEXT NOT NULL DEFAULT '[]',
  delta_events_included INTEGER DEFAULT 0,
  raw_history_pruned_from_model_input INTEGER DEFAULT 0,
  redaction_json TEXT NOT NULL DEFAULT '{}',
  stale_guard_json TEXT NOT NULL DEFAULT '{}',
  latest_user_request TEXT,
  active_task_scope TEXT,
  receipt_artifact_path TEXT,
  status TEXT NOT NULL DEFAULT 'available'
);

CREATE INDEX IF NOT EXISTS idx_run_context_receipts_run_consumed
  ON run_context_receipts (run_id, consumed_at);
