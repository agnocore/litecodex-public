CREATE TABLE IF NOT EXISTS workspace_root_bindings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  working_root TEXT NOT NULL,
  detected_project_root TEXT NOT NULL,
  root_config_sources_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS task_storage_roots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  working_root TEXT NOT NULL,
  artifact_root TEXT NOT NULL,
  scratch_root TEXT NOT NULL,
  task_root TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS path_jail_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  path_checked TEXT NOT NULL,
  check_type TEXT NOT NULL,
  policy_status TEXT NOT NULL,
  reject_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS deploy_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  deploy_mode TEXT NOT NULL,
  command_summary TEXT NOT NULL,
  auth_status TEXT NOT NULL,
  deploy_status TEXT NOT NULL,
  release_url_redacted TEXT,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS deploy_retries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  deploy_run_id TEXT NOT NULL,
  retry_number INTEGER NOT NULL,
  failure_class TEXT NOT NULL,
  correction_applied TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (deploy_run_id) REFERENCES deploy_runs (id)
);

CREATE TABLE IF NOT EXISTS online_verification_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  deploy_run_id TEXT NOT NULL,
  node_status TEXT NOT NULL,
  powershell_status TEXT NOT NULL,
  browser_status TEXT NOT NULL,
  final_status TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (deploy_run_id) REFERENCES deploy_runs (id)
);

CREATE TABLE IF NOT EXISTS final_operational_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workspace_root_binding_ready INTEGER NOT NULL,
  task_storage_root_ready INTEGER NOT NULL,
  real_deploy_closeout_ready INTEGER NOT NULL,
  online_verification_ready INTEGER NOT NULL,
  release_flow_ready INTEGER NOT NULL,
  litecodex_v1_operational_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

ALTER TABLE byo_key_bindings ADD COLUMN browser_profile_id_hash TEXT;
ALTER TABLE byo_key_bindings ADD COLUMN machine_scope_id_hash TEXT;
ALTER TABLE byo_key_bindings ADD COLUMN key_fingerprint_hash TEXT;
ALTER TABLE byo_key_bindings ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_workspace_root_bindings_run ON workspace_root_bindings (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_storage_roots_run ON task_storage_roots (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_path_jail_checks_run ON path_jail_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deploy_runs_run ON deploy_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deploy_retries_run ON deploy_retries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_online_verification_runs_run ON online_verification_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_final_operational_readiness_run ON final_operational_readiness (run_id, created_at);
