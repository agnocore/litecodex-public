CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_event_type TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  required_capability TEXT NOT NULL,
  selected_recipe_id TEXT,
  selected_verifier_id TEXT,
  status TEXT NOT NULL,
  timeout_at TEXT,
  cancelled_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS capability_grants (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  step_id TEXT,
  capability_key TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_value TEXT NOT NULL,
  grant_mode TEXT NOT NULL DEFAULT 'manual',
  grant_recipe_id TEXT,
  verifier_id TEXT,
  status TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  verified_at TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  revoke_reason TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS byo_key_bindings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  status TEXT NOT NULL,
  binding_scope TEXT NOT NULL,
  key_ref TEXT,
  validation_status TEXT,
  masked_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entry_session_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  lane TEXT NOT NULL,
  prompt_summary TEXT,
  step_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS entry_project_recent_files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  basename TEXT NOT NULL,
  hit_count INTEGER NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  UNIQUE (workspace_id, rel_path)
);

CREATE TABLE IF NOT EXISTS entry_session_target_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  basename TEXT NOT NULL,
  hit_count INTEGER NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  UNIQUE (session_id, rel_path)
);

CREATE INDEX IF NOT EXISTS idx_events_run_seq ON events (run_id, seq);
CREATE INDEX IF NOT EXISTS idx_capability_grants_key_scope ON capability_grants (capability_key, scope_type, scope_value, updated_at);
CREATE INDEX IF NOT EXISTS idx_entry_session_turns_session ON entry_session_turns (session_id, turn_index DESC);
CREATE INDEX IF NOT EXISTS idx_entry_session_turns_run ON entry_session_turns (run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_entry_project_recent_files_workspace ON entry_project_recent_files (workspace_id, last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_entry_session_target_files_session ON entry_session_target_files (session_id, last_used_at DESC);
