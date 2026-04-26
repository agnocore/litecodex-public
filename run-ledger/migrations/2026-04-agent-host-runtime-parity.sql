CREATE TABLE IF NOT EXISTS verify_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  exit_code INTEGER,
  failure_summary TEXT,
  failure_class TEXT,
  timeout_ms INTEGER,
  duration_ms INTEGER,
  stdout_artifact_path TEXT,
  stderr_artifact_path TEXT,
  replay_artifact_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS repair_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  verify_run_id TEXT,
  failure_class TEXT NOT NULL,
  selected_strategy TEXT NOT NULL,
  reason TEXT,
  planner_confidence REAL,
  candidate_files_json TEXT,
  patch_proposal_id TEXT,
  policy_status TEXT,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  status TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (verify_run_id) REFERENCES verify_runs (id)
);

CREATE TABLE IF NOT EXISTS replay_artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  verify_run_id TEXT,
  artifact_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (verify_run_id) REFERENCES verify_runs (id)
);

CREATE TABLE IF NOT EXISTS patch_proposals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  verify_run_id TEXT,
  target_files_json TEXT NOT NULL,
  reason TEXT,
  risk_level TEXT,
  policy_status TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (verify_run_id) REFERENCES verify_runs (id)
);

CREATE TABLE IF NOT EXISTS patch_applications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  files_changed INTEGER NOT NULL,
  diff_artifact_path TEXT,
  applied_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (proposal_id) REFERENCES patch_proposals (id)
);

CREATE TABLE IF NOT EXISTS rollback_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  proposal_id TEXT,
  files_json TEXT NOT NULL,
  snapshot_artifact_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  restored_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (proposal_id) REFERENCES patch_proposals (id)
);

CREATE TABLE IF NOT EXISTS command_adjustments (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  verify_run_id TEXT,
  failed_command TEXT NOT NULL,
  adjusted_command TEXT NOT NULL,
  adjusted_cwd TEXT NOT NULL,
  reason TEXT,
  confidence REAL,
  policy_status TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (verify_run_id) REFERENCES verify_runs (id)
);

CREATE TABLE IF NOT EXISTS dependency_install_proposals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  verify_run_id TEXT,
  package_manager TEXT NOT NULL,
  dependency_name TEXT NOT NULL,
  dependency_type TEXT NOT NULL,
  install_command_summary TEXT NOT NULL,
  policy_status TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (verify_run_id) REFERENCES verify_runs (id)
);

CREATE TABLE IF NOT EXISTS dependency_install_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  cwd TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  exit_code INTEGER,
  stdout_summary TEXT,
  stderr_summary TEXT,
  artifacts_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (proposal_id) REFERENCES dependency_install_proposals (id)
);

CREATE TABLE IF NOT EXISTS install_rollback_snapshots (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  proposal_id TEXT,
  affected_files_json TEXT NOT NULL,
  package_json_hash_before TEXT,
  lockfile_hash_before TEXT,
  snapshot_artifact_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (proposal_id) REFERENCES dependency_install_proposals (id)
);

CREATE TABLE IF NOT EXISTS install_rollback_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  restore_summary TEXT,
  verification_status TEXT,
  git_status_after TEXT,
  artifacts_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (snapshot_id) REFERENCES install_rollback_snapshots (id)
);

CREATE TABLE IF NOT EXISTS replay_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_run_id TEXT,
  replay_type TEXT NOT NULL,
  command_summary TEXT NOT NULL,
  cwd TEXT,
  policy_status TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  exit_code INTEGER,
  artifacts_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS project_inspections (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workspace_root TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS ledger_projections (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  projection_type TEXT NOT NULL,
  status TEXT NOT NULL,
  projection_json TEXT NOT NULL,
  artifact_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS compact_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  source_event_from_seq INTEGER NOT NULL,
  source_event_to_seq INTEGER NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  artifact_path TEXT,
  integrity_hash TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS compact_artifacts (
  id TEXT PRIMARY KEY,
  compact_run_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  source_event_range_json TEXT NOT NULL,
  included_tables_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (compact_run_id) REFERENCES compact_runs (id),
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS compact_mappings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  compact_run_id TEXT NOT NULL,
  projection_before_path TEXT,
  projection_after_path TEXT,
  delta_from_seq INTEGER NOT NULL,
  hydrate_policy TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (compact_run_id) REFERENCES compact_runs (id),
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS playwright_discoveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  discovery_source TEXT NOT NULL,
  cli_path TEXT,
  cli_status TEXT NOT NULL,
  browser_binary_status TEXT NOT NULL,
  install_required INTEGER NOT NULL,
  blocked_reason TEXT,
  install_mode TEXT,
  skip_browser_download INTEGER,
  browser_channel_used TEXT,
  final_status TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS phase5b_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  playwright_cli_ready INTEGER NOT NULL,
  browser_action_matrix_ready INTEGER NOT NULL,
  post_auth_verification_gate_ready INTEGER NOT NULL,
  phase5b_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  allowed_inputs_json TEXT NOT NULL,
  forbidden_actions_json TEXT NOT NULL,
  evidence_path TEXT,
  previous_blocker TEXT,
  blocker_resolved INTEGER,
  new_blocked_modules_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

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

CREATE TABLE IF NOT EXISTS retrieval_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  provider_selected TEXT,
  query_summary TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS retrieval_hits (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  url_redacted TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  domain TEXT,
  score REAL,
  citation_label TEXT,
  domain_trust_tier TEXT,
  stale_score REAL,
  citation_eligible INTEGER,
  citation_reject_reason TEXT,
  dedup_cluster_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS retrieval_bundles (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_chain_json TEXT,
  evidence_bundle_path TEXT NOT NULL,
  sources_count INTEGER NOT NULL,
  facts_count INTEGER NOT NULL,
  conflicts_count INTEGER NOT NULL,
  gaps_count INTEGER NOT NULL,
  final_bundle_status TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS retrieval_fetches (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  fetch_type TEXT NOT NULL,
  target_url_redacted TEXT,
  status TEXT NOT NULL,
  artifact_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS retrieval_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  retrieval_broker_ready INTEGER NOT NULL,
  tavily_ready INTEGER NOT NULL,
  exa_ready INTEGER NOT NULL,
  firecrawl_fetch_ready INTEGER NOT NULL,
  firecrawl_crawl_ready INTEGER NOT NULL,
  multi_provider_closeout_ready INTEGER NOT NULL,
  blocked_modules_json TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS retrieval_budget_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider_chain_json TEXT,
  rounds_used INTEGER NOT NULL,
  urls_used INTEGER NOT NULL,
  budget_status TEXT NOT NULL,
  degraded_mode INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS retrieval_governance_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  citation_quality_gate_ready INTEGER NOT NULL,
  conflict_resolution_ready INTEGER NOT NULL,
  canonicalization_ready INTEGER NOT NULL,
  budget_governance_ready INTEGER NOT NULL,
  provider_health_governance_ready INTEGER NOT NULL,
  retrieval_governance_closeout_ready INTEGER NOT NULL,
  blocked_modules_json TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS engineering_verify_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  stage_name TEXT NOT NULL,
  command_summary TEXT NOT NULL,
  status TEXT NOT NULL,
  exit_code INTEGER,
  stdout_summary TEXT,
  stderr_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE TABLE IF NOT EXISTS android_verify_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  build_run_id TEXT,
  verify_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  verify_summary TEXT,
  artifact_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE INDEX IF NOT EXISTS idx_verify_runs_run ON verify_runs (run_id, attempt, created_at);
CREATE INDEX IF NOT EXISTS idx_repair_decisions_run ON repair_decisions (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_replay_artifacts_run ON replay_artifacts (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_patch_proposals_run ON patch_proposals (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_patch_applications_run ON patch_applications (run_id, applied_at);
CREATE INDEX IF NOT EXISTS idx_rollback_snapshots_run ON rollback_snapshots (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_command_adjustments_run ON command_adjustments (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dependency_install_proposals_run ON dependency_install_proposals (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_dependency_install_runs_run ON dependency_install_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_install_rollback_snapshots_run ON install_rollback_snapshots (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_install_rollback_runs_run ON install_rollback_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_replay_runs_run ON replay_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_project_inspections_run ON project_inspections (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ledger_projections_run ON ledger_projections (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compact_runs_run ON compact_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_compact_artifacts_run ON compact_artifacts (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compact_mappings_run ON compact_mappings (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_playwright_discoveries_run ON playwright_discoveries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase5b_readiness_run ON phase5b_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workspace_root_bindings_run ON workspace_root_bindings (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_task_storage_roots_run ON task_storage_roots (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_path_jail_checks_run ON path_jail_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deploy_runs_run ON deploy_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deploy_retries_run ON deploy_retries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_online_verification_runs_run ON online_verification_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_final_operational_readiness_run ON final_operational_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_decisions_run ON retrieval_decisions (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_hits_run ON retrieval_hits (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_bundles_run ON retrieval_bundles (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_fetches_run ON retrieval_fetches (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_readiness_run ON retrieval_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_budget_checks_run ON retrieval_budget_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_governance_readiness_run ON retrieval_governance_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_verify_runs_run ON engineering_verify_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_android_verify_runs_run ON android_verify_runs (run_id, started_at);
