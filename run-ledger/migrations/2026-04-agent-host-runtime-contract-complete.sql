-- Auto-generated parity migration.
-- Source: private-init.sql
-- Scope: tables/indexes referenced by community agent-host runtime but missing in current community ledger contract.

CREATE TABLE IF NOT EXISTS adapter_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  command_or_action TEXT NOT NULL,
  cwd TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  exit_code INTEGER,
  stdout_summary TEXT,
  stderr_summary TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS file_changes (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  path TEXT NOT NULL,
  action TEXT NOT NULL,
  before_hash TEXT,
  after_hash TEXT,
  summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS workspace_trust_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workspace_root TEXT NOT NULL,
  trust_status TEXT NOT NULL,
  allowed_roots_json TEXT NOT NULL,
  forbidden_paths_json TEXT NOT NULL,
  risk_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS tool_discoveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  discovery_source TEXT NOT NULL,
  env_var_name TEXT,
  resolved_path TEXT,
  version_result TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS adapter_install_requirements (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  adapter_id TEXT NOT NULL,
  required_tool TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  install_proposal_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS tool_install_proposals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  install_mode TEXT NOT NULL,
  install_command_summary TEXT NOT NULL,
  policy_status TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS tool_install_runs (
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
  rollback_snapshot_id TEXT,
  artifacts_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (proposal_id) REFERENCES tool_install_proposals (id)
);
CREATE TABLE IF NOT EXISTS tool_install_rollback_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tool_install_run_id TEXT,
  snapshot_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  restore_summary TEXT,
  hash_verification_status TEXT,
  git_status_after TEXT,
  artifacts_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase3_smoke_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  case_name TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  evidence_path TEXT,
  failure_summary TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS consistency_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  check_type TEXT NOT NULL,
  status TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  phase TEXT NOT NULL,
  ready INTEGER NOT NULL,
  criteria_json TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS context_hydrations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  baseline_run_id TEXT,
  status TEXT NOT NULL,
  loaded_events_count INTEGER NOT NULL,
  loaded_tables_json TEXT NOT NULL,
  missing_artifacts_json TEXT NOT NULL,
  projection_artifact_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS reconnect_sessions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  last_seen_seq INTEGER NOT NULL,
  replayed_from_seq INTEGER,
  replayed_to_seq INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS resume_sessions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  status_before_resume TEXT NOT NULL,
  resumable INTEGER NOT NULL,
  resume_reason TEXT,
  resume_cursor INTEGER,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase4_baseline_bindings (
  id TEXT PRIMARY KEY,
  baseline_run_id TEXT NOT NULL,
  smoke_run_id TEXT NOT NULL,
  consistency_run_id TEXT NOT NULL,
  readiness_run_id TEXT NOT NULL,
  evidence_root TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stale_running_recoveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  marker_status TEXT NOT NULL,
  heartbeat_status TEXT NOT NULL,
  recovery_action TEXT NOT NULL,
  final_status TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS run_lineage (
  id TEXT PRIMARY KEY,
  parent_run_id TEXT NOT NULL,
  child_run_id TEXT NOT NULL,
  lineage_type TEXT NOT NULL,
  baseline_run_id TEXT,
  source_compact_run_id TEXT,
  source_event_range_json TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (parent_run_id) REFERENCES runs (id),
  FOREIGN KEY (child_run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS fork_runs (
  id TEXT PRIMARY KEY,
  source_run_id TEXT NOT NULL,
  fork_run_id TEXT NOT NULL,
  baseline_run_id TEXT,
  fork_mode TEXT NOT NULL,
  fork_reason TEXT,
  source_status TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (source_run_id) REFERENCES runs (id),
  FOREIGN KEY (fork_run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS fork_workspaces (
  id TEXT PRIMARY KEY,
  fork_run_id TEXT NOT NULL,
  source_workspace TEXT NOT NULL,
  fork_workspace TEXT NOT NULL,
  copy_mode TEXT NOT NULL,
  isolation_status TEXT NOT NULL,
  file_hashes_before_json TEXT NOT NULL,
  file_hashes_after_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (fork_run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS fork_artifact_mappings (
  id TEXT PRIMARY KEY,
  source_run_id TEXT NOT NULL,
  fork_run_id TEXT NOT NULL,
  source_artifact_path TEXT,
  fork_artifact_path TEXT,
  mapping_type TEXT NOT NULL,
  integrity_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_run_id) REFERENCES runs (id),
  FOREIGN KEY (fork_run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS fork_policy_checks (
  id TEXT PRIMARY KEY,
  source_run_id TEXT NOT NULL,
  source_workspace TEXT NOT NULL,
  target_workspace TEXT NOT NULL,
  ancestry_relation TEXT NOT NULL,
  policy_action TEXT NOT NULL,
  redirected_target TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS context_projections (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  baseline_run_id TEXT,
  compact_run_id TEXT,
  hydration_mode TEXT NOT NULL,
  reconnect_cursor INTEGER,
  resume_cursor INTEGER,
  lineage_parent_run_id TEXT,
  lineage_child_run_ids_json TEXT NOT NULL,
  artifact_refs_json TEXT NOT NULL,
  terminal_status TEXT NOT NULL,
  projection_integrity INTEGER NOT NULL,
  artifact_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase4_closeout_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  suite_name TEXT NOT NULL,
  status TEXT NOT NULL,
  verified_modules_json TEXT NOT NULL,
  failed_modules_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase5_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  phase4_ready INTEGER NOT NULL,
  phase5_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  allowed_inputs_json TEXT NOT NULL,
  forbidden_actions_json TEXT NOT NULL,
  risks_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS browser_discoveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  browser_name TEXT NOT NULL,
  discovery_source TEXT NOT NULL,
  resolved_path TEXT,
  version_result TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS browser_smoke_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_url_or_path TEXT NOT NULL,
  actions_json TEXT NOT NULL,
  status TEXT NOT NULL,
  screenshot_path TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS deploy_adapter_discoveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  adapter_name TEXT NOT NULL,
  discovery_source TEXT NOT NULL,
  resolved_path TEXT,
  auth_state TEXT,
  readonly_actions_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS deploy_policy_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  adapter_name TEXT NOT NULL,
  requested_action TEXT NOT NULL,
  policy_action TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase5a_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  browser_lane_ready INTEGER NOT NULL,
  deploy_adapter_gate_ready INTEGER NOT NULL,
  phase5a_ready INTEGER NOT NULL,
  phase5b_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  allowed_inputs_json TEXT NOT NULL,
  forbidden_actions_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS browser_action_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_path TEXT NOT NULL,
  action_name TEXT NOT NULL,
  action_input_summary TEXT,
  status TEXT NOT NULL,
  screenshot_path TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS browser_verification_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  verification_type TEXT NOT NULL,
  target_policy TEXT NOT NULL,
  required_capabilities_json TEXT NOT NULL,
  policy_status TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS playwright_runtime_profiles (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  cli_mode TEXT NOT NULL,
  browser_binary_download TEXT NOT NULL,
  browser_channel_used TEXT NOT NULL,
  workers INTEGER NOT NULL,
  fully_parallel INTEGER NOT NULL,
  trace INTEGER NOT NULL,
  video INTEGER NOT NULL,
  resource_mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS playwright_install_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  install_mode TEXT NOT NULL,
  skip_browser_download INTEGER NOT NULL,
  status TEXT NOT NULL,
  cli_path TEXT,
  stdout_summary TEXT,
  stderr_summary TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase5b_reruns (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  rerun_scope_json TEXT NOT NULL,
  status TEXT NOT NULL,
  completed_cases_json TEXT NOT NULL,
  failed_cases_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS browser_external_allowlist_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  target_url TEXT NOT NULL,
  allowlist_status TEXT NOT NULL,
  matched_rule TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS approval_escalations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  request_type TEXT NOT NULL,
  target_url TEXT NOT NULL,
  risk_level TEXT NOT NULL,
  policy_action TEXT NOT NULL,
  reason TEXT NOT NULL,
  requires_user_approval INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS browser_external_verifications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  target_url TEXT NOT NULL,
  verification_type TEXT NOT NULL,
  selector_summary TEXT,
  text_summary TEXT,
  screenshot_path TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase5c_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  readonly_external_verification_ready INTEGER NOT NULL,
  approval_escalation_ready INTEGER NOT NULL,
  phase5c_ready INTEGER NOT NULL,
  phase5d_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  allowed_external_targets_json TEXT NOT NULL,
  forbidden_actions_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  target_url_redacted TEXT NOT NULL,
  request_type TEXT NOT NULL,
  policy_action TEXT NOT NULL,
  pending_reason TEXT NOT NULL,
  status TEXT NOT NULL,
  pending_since TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS approval_decisions (
  id TEXT PRIMARY KEY,
  approval_request_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  decision_source TEXT NOT NULL,
  approver_type TEXT NOT NULL,
  continuation_status TEXT,
  receipt_path TEXT,
  FOREIGN KEY (approval_request_id) REFERENCES approval_requests (id),
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS approval_pending_restores (
  id TEXT PRIMARY KEY,
  approval_request_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  restore_source TEXT NOT NULL,
  restored_at TEXT NOT NULL,
  status TEXT NOT NULL,
  details_json TEXT,
  FOREIGN KEY (approval_request_id) REFERENCES approval_requests (id),
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase5d_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  pending_persistence_ready INTEGER NOT NULL,
  approval_decision_ready INTEGER NOT NULL,
  same_run_continue_ready INTEGER NOT NULL,
  phase5d_ready INTEGER NOT NULL,
  phase5e_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  allowed_external_targets_json TEXT NOT NULL,
  forbidden_actions_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS e2b_discoveries (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  discovery_source TEXT NOT NULL,
  sdk_or_cli_mode TEXT NOT NULL,
  credential_status TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS lane_routing_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  routing_reason TEXT NOT NULL,
  local_allowed INTEGER NOT NULL,
  e2b_required INTEGER NOT NULL,
  final_lane TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS e2b_sandbox_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sandbox_id_redacted TEXT,
  create_status TEXT NOT NULL,
  execute_status TEXT NOT NULL,
  teardown_status TEXT NOT NULL,
  timeout_ms INTEGER NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS e2b_execution_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sandbox_run_id TEXT NOT NULL,
  command_summary TEXT NOT NULL,
  cwd_summary TEXT,
  exit_code INTEGER,
  stdout_summary TEXT,
  stderr_summary TEXT,
  artifacts_path TEXT,
  final_status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (sandbox_run_id) REFERENCES e2b_sandbox_runs (id)
);
CREATE TABLE IF NOT EXISTS phase6a_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  api_key_ready INTEGER NOT NULL,
  sdk_or_cli_ready INTEGER NOT NULL,
  sandbox_create_ready INTEGER NOT NULL,
  sandbox_execute_ready INTEGER NOT NULL,
  sandbox_teardown_ready INTEGER NOT NULL,
  phase6a_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS e2b_task_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  sandbox_run_id TEXT,
  lane TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (sandbox_run_id) REFERENCES e2b_sandbox_runs (id)
);
CREATE TABLE IF NOT EXISTS e2b_failure_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sandbox_run_id TEXT,
  failure_type TEXT NOT NULL,
  failure_stage TEXT NOT NULL,
  retry_count INTEGER NOT NULL,
  recovery_action TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (sandbox_run_id) REFERENCES e2b_sandbox_runs (id)
);
CREATE TABLE IF NOT EXISTS lane_fallback_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  original_lane TEXT NOT NULL,
  fallback_lane TEXT NOT NULL,
  task_type TEXT NOT NULL,
  fallback_reason TEXT NOT NULL,
  same_run_continue INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS phase6b_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  real_task_matrix_ready INTEGER NOT NULL,
  failure_hardening_ready INTEGER NOT NULL,
  local_fallback_ready INTEGER NOT NULL,
  phase6b_ready INTEGER NOT NULL,
  phase6c_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  fallback_enabled_tasks_json TEXT NOT NULL,
  non_fallback_tasks_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS e2b_workspace_syncs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sandbox_run_id TEXT,
  task_type TEXT NOT NULL,
  patch_artifact_path TEXT,
  diff_summary_json TEXT NOT NULL,
  file_hashes_before_json TEXT NOT NULL,
  file_hashes_after_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (sandbox_run_id) REFERENCES e2b_sandbox_runs (id)
);
CREATE TABLE IF NOT EXISTS writeback_candidates (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workspace_sync_id TEXT NOT NULL,
  candidate_files_json TEXT NOT NULL,
  baseline_hash_json TEXT NOT NULL,
  current_hash_json TEXT NOT NULL,
  diff_binding_status TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (workspace_sync_id) REFERENCES e2b_workspace_syncs (id)
);
CREATE TABLE IF NOT EXISTS writeback_applications (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  apply_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  applied_files_json TEXT NOT NULL,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (candidate_id) REFERENCES writeback_candidates (id)
);
CREATE TABLE IF NOT EXISTS writeback_conflicts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  reject_reason TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id),
  FOREIGN KEY (candidate_id) REFERENCES writeback_candidates (id)
);
CREATE TABLE IF NOT EXISTS phase6c_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  workspace_sync_ready INTEGER NOT NULL,
  writeback_gate_ready INTEGER NOT NULL,
  conflict_reject_ready INTEGER NOT NULL,
  phase6c_ready INTEGER NOT NULL,
  v1_closeout_ready INTEGER NOT NULL,
  blocked_modules_json TEXT NOT NULL,
  writeback_enabled_task_types_json TEXT NOT NULL,
  rejected_writeback_conditions_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS byo_key_validations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  binding_id TEXT NOT NULL,
  validation_status TEXT NOT NULL,
  failure_reason TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (binding_id) REFERENCES byo_key_bindings (id)
);
CREATE TABLE IF NOT EXISTS credential_health_checks (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  source TEXT NOT NULL,
  source_scope TEXT NOT NULL,
  grant_state TEXT NOT NULL,
  health_status TEXT NOT NULL,
  failure_reason TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS citation_gate_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_hit_id TEXT NOT NULL,
  canonical_url TEXT,
  citation_eligible INTEGER NOT NULL,
  reject_reason TEXT,
  dedup_cluster_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS conflict_resolution_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  conflict_count INTEGER NOT NULL,
  resolved_count INTEGER NOT NULL,
  unresolved_count INTEGER NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS provider_health_governance (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  previous_health TEXT,
  new_health TEXT NOT NULL,
  fallback_decision TEXT,
  cooldown_until TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS system_acceptance_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  acceptance_chain_status TEXT NOT NULL,
  exercised_modules_json TEXT NOT NULL,
  completed_modules_json TEXT NOT NULL,
  non_blocking_issues_json TEXT NOT NULL,
  deferred_items_json TEXT NOT NULL,
  litecodex_system_acceptance_ready INTEGER NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS engineering_intents (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  original_user_ask TEXT NOT NULL,
  intent_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS stack_profiles (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  profile_json TEXT NOT NULL,
  auto_fill_confidence REAL,
  blocking_ambiguities_json TEXT,
  default_stack_profile_used INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS repo_plans (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS file_plans (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  target_files_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS verification_plans (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  commands_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS review_gate_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  checks_json TEXT NOT NULL,
  status TEXT NOT NULL,
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS repair_loops (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  trigger_type TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS code_task_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  stack_profile_id TEXT,
  selected_skills_json TEXT NOT NULL,
  file_plan_id TEXT,
  verification_plan_id TEXT,
  verify_passed INTEGER NOT NULL DEFAULT 0,
  repair_attempts INTEGER NOT NULL DEFAULT 0,
  model_usage_json TEXT,
  latency_ms INTEGER,
  cost_estimate_usd REAL,
  final_status TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS engineering_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  engineering_compiler_ready INTEGER NOT NULL,
  polyglot_skills_ready INTEGER NOT NULL,
  auto_verify_ready INTEGER NOT NULL,
  review_gate_ready INTEGER NOT NULL,
  real_model_codegen_ready INTEGER NOT NULL,
  production_code_task_ready INTEGER NOT NULL,
  blocked_modules_json TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS polyglot_skill_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  pack_status TEXT NOT NULL,
  verify_matrix_json TEXT,
  repair_policy TEXT,
  dependency_policy TEXT,
  review_gate_rules_json TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS toolchain_installs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  install_mode TEXT NOT NULL,
  policy_status TEXT NOT NULL,
  status TEXT NOT NULL,
  command_summary TEXT,
  stdout_summary TEXT,
  stderr_summary TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS engineering_review_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  check_group TEXT NOT NULL,
  status TEXT NOT NULL,
  failure_reason TEXT,
  checks_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS engineering_production_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  engineering_compiler_ready INTEGER NOT NULL,
  polyglot_skillpacks_ready INTEGER NOT NULL,
  auto_verify_ready INTEGER NOT NULL,
  review_gate_ready INTEGER NOT NULL,
  repair_loop_ready INTEGER NOT NULL,
  real_model_codegen_ready INTEGER NOT NULL,
  production_engineering_ready INTEGER NOT NULL,
  blocked_modules_json TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS polyglot_toolchain_fulfillments (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  stack_pack_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  required INTEGER NOT NULL,
  status TEXT NOT NULL,
  install_attempted INTEGER NOT NULL,
  install_method TEXT,
  version_summary TEXT,
  blocker_reason TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS stack_pack_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stack_pack_id TEXT NOT NULL,
  ready INTEGER NOT NULL,
  blocked_reason TEXT,
  representative_task_id TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS engineering_layer_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  layer_name TEXT NOT NULL,
  ready INTEGER NOT NULL,
  exercised_packs_json TEXT,
  blocked_reason TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS stack_pack_completion_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  readiness INTEGER NOT NULL,
  representative_task_id TEXT,
  representative_task_passed INTEGER NOT NULL,
  verify_matrix_complete INTEGER NOT NULL,
  review_repair_wired INTEGER NOT NULL,
  deploy_preflight_present INTEGER NOT NULL,
  unique_blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS ast_repair_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  language TEXT NOT NULL,
  parser_name TEXT NOT NULL,
  target_file TEXT NOT NULL,
  structured_diff_json TEXT NOT NULL,
  apply_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS deploy_standardization_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  stack_category TEXT NOT NULL,
  deploy_preflight_contract_status TEXT NOT NULL,
  deploy_result_receipt_status TEXT NOT NULL,
  online_verification_contract_status TEXT NOT NULL,
  standardized INTEGER NOT NULL,
  blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS engineering_hardening_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  production_engineering_hardening_ready INTEGER NOT NULL,
  unique_blocker TEXT,
  stack_pack_completion_ready INTEGER NOT NULL,
  ast_repair_ready INTEGER NOT NULL,
  deploy_standardization_ready INTEGER NOT NULL,
  crossend_pack_hardening_ready INTEGER NOT NULL,
  blocked_modules_json TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS polyglot_expansion_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  readiness INTEGER NOT NULL,
  representative_task_id TEXT,
  representative_task_passed INTEGER NOT NULL,
  verify_matrix_complete INTEGER NOT NULL,
  review_repair_wired INTEGER NOT NULL,
  deploy_preflight_present INTEGER NOT NULL,
  unique_blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS toolchain_fulfillment_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  detect_status TEXT NOT NULL,
  fulfill_status TEXT NOT NULL,
  redetect_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS semantic_repair_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  parser_name TEXT NOT NULL,
  target_file TEXT NOT NULL,
  structured_diff_json TEXT NOT NULL,
  apply_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  receipt_path TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS polyglot_expansion_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  polyglot_expansion_production_ready INTEGER NOT NULL,
  rust_ready INTEGER NOT NULL,
  terraform_ready INTEGER NOT NULL,
  yaml_ready INTEGER NOT NULL,
  sql_ready INTEGER NOT NULL,
  kotlin_ready INTEGER NOT NULL,
  swift_windows_ready INTEGER NOT NULL,
  flutter_ready INTEGER NOT NULL,
  unique_blocker TEXT,
  blocked_modules_json TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS toolchain_remediation_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  tool_name TEXT NOT NULL,
  remediation_stage TEXT NOT NULL,
  detect_status TEXT NOT NULL,
  fulfill_status TEXT NOT NULL,
  redetect_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  default_toolchain TEXT,
  host_triple TEXT,
  executable_path TEXT,
  result_status TEXT NOT NULL,
  reason TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS flutter_boundary_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  selected_scope TEXT NOT NULL,
  desktop_supported INTEGER NOT NULL,
  web_supported INTEGER NOT NULL,
  boundary_status TEXT NOT NULL,
  blocker_status TEXT NOT NULL,
  reason TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS polyglot_expansion_aggregation_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  completed_packs_json TEXT NOT NULL,
  blocked_packs_json TEXT NOT NULL,
  deferred_packs_json TEXT NOT NULL,
  unique_blocker TEXT,
  ready INTEGER NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS flutter_finalization_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  selected_scope TEXT NOT NULL,
  doctor_status TEXT NOT NULL,
  web_supported INTEGER NOT NULL,
  desktop_supported INTEGER NOT NULL,
  representative_task_id TEXT,
  representative_task_passed INTEGER NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS swift_boundary_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  boundary_scope TEXT NOT NULL,
  compile_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  host_safe INTEGER NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS compiled_ast_repair_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  language TEXT NOT NULL,
  parser_name TEXT NOT NULL,
  target_file TEXT NOT NULL,
  apply_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  failure_reason TEXT,
  receipt_path TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS second_batch_deploy_standardization_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  category TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  preflight_status TEXT NOT NULL,
  verification_mode TEXT NOT NULL,
  receipt_status TEXT NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS polyglot_final_aggregation_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  completed_packs_json TEXT NOT NULL,
  blocked_packs_json TEXT NOT NULL,
  deferred_packs_json TEXT NOT NULL,
  unique_blocker TEXT,
  production_engineering_final_ready INTEGER NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS multi_host_capability_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  capability_id TEXT NOT NULL,
  pack_id TEXT NOT NULL,
  host_class TEXT NOT NULL,
  readiness_class TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS external_runner_prerequisite_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  required_for_json TEXT NOT NULL,
  host_os TEXT NOT NULL,
  required_toolchains_json TEXT NOT NULL,
  required_credentials_json TEXT NOT NULL,
  required_devices_json TEXT NOT NULL,
  required_services_json TEXT NOT NULL,
  blocking_scope TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS release_lane_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  preflight_status TEXT NOT NULL,
  verify_status TEXT NOT NULL,
  receipt_status TEXT NOT NULL,
  boundary_freeze_status TEXT NOT NULL,
  online_verification_policy TEXT NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS engineering_reality_freeze_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  same_host_real_count INTEGER NOT NULL,
  host_safe_subchain_count INTEGER NOT NULL,
  external_runner_required_count INTEGER NOT NULL,
  same_host_completed_count INTEGER NOT NULL,
  host_safe_completed_count INTEGER NOT NULL,
  blocked_count INTEGER NOT NULL,
  deferred_count INTEGER NOT NULL,
  final_ready INTEGER NOT NULL,
  unique_blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS external_runners (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  host_class TEXT NOT NULL,
  host_os TEXT NOT NULL,
  discovery_status TEXT NOT NULL,
  capabilities_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS runner_jobs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  command_summary TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  exit_code INTEGER,
  stdout_summary TEXT,
  stderr_summary TEXT,
  artifact_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS runner_artifact_syncs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  runner_job_id TEXT NOT NULL,
  sync_direction TEXT NOT NULL,
  artifact_path TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS runner_failure_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  runner_job_id TEXT,
  failure_type TEXT NOT NULL,
  failure_stage TEXT NOT NULL,
  recovery_action TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS android_runner_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  sdk_status TEXT NOT NULL,
  adb_status TEXT NOT NULL,
  emulator_status TEXT NOT NULL,
  jdk_status TEXT NOT NULL,
  gradle_status TEXT NOT NULL,
  kotlin_status TEXT NOT NULL,
  flutter_android_status TEXT NOT NULL,
  representative_status TEXT NOT NULL,
  blocker TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS android_toolchain_fulfillments (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  sdk_root_redacted TEXT,
  cmdline_tools_status TEXT NOT NULL,
  platform_tools_status TEXT NOT NULL,
  build_tools_status TEXT NOT NULL,
  platform_api TEXT,
  adb_status TEXT NOT NULL,
  sdkmanager_status TEXT NOT NULL,
  status TEXT NOT NULL,
  artifact_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS android_prerequisite_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  check_stage TEXT NOT NULL,
  java_status TEXT NOT NULL,
  javac_status TEXT NOT NULL,
  gradle_status TEXT NOT NULL,
  sdkmanager_status TEXT NOT NULL,
  adb_status TEXT NOT NULL,
  android_sdk_root_redacted TEXT,
  build_tools_version TEXT,
  platform_api TEXT,
  status TEXT NOT NULL,
  missing_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS android_build_runs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  command_summary TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  exit_code INTEGER,
  stdout_summary TEXT,
  stderr_summary TEXT,
  artifact_path TEXT,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS android_readiness_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  android_sdk_ready INTEGER NOT NULL,
  android_fulfillment_ready INTEGER NOT NULL,
  android_build_ready INTEGER NOT NULL,
  flutter_android_status TEXT NOT NULL,
  blocker TEXT,
  external_expansion_readiness_id TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS apple_boundary_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  required_runner TEXT NOT NULL,
  required_host_os TEXT NOT NULL,
  required_credentials_json TEXT NOT NULL,
  required_services_json TEXT NOT NULL,
  current_availability TEXT NOT NULL,
  blocking_scope TEXT NOT NULL,
  non_blocking INTEGER NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS store_boundary_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  lane_id TEXT NOT NULL,
  required_runner TEXT NOT NULL,
  required_host_os TEXT NOT NULL,
  required_credentials_json TEXT NOT NULL,
  required_services_json TEXT NOT NULL,
  current_availability TEXT NOT NULL,
  blocking_scope TEXT NOT NULL,
  non_blocking INTEGER NOT NULL,
  status TEXT NOT NULL,
  blocker TEXT,
  receipt_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS external_expansion_readiness (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  same_host_real_maintained INTEGER NOT NULL,
  external_runner_plane_ready INTEGER NOT NULL,
  android_release_ready INTEGER NOT NULL,
  apple_release_ready INTEGER NOT NULL,
  store_release_ready INTEGER NOT NULL,
  final_future_expansion_ready INTEGER NOT NULL,
  blocker_group TEXT,
  blocked_modules_json TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS openai_codegen_transport_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  powershell_probe_status TEXT NOT NULL,
  node_sdk_probe_status TEXT NOT NULL,
  resolver_probe_status TEXT NOT NULL,
  task_codegen_probe_status TEXT NOT NULL,
  failure_layer TEXT,
  final_status TEXT NOT NULL,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES runs (id)
);
CREATE TABLE IF NOT EXISTS context_settings (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  auto_compact_after_task_lane INTEGER NOT NULL DEFAULT 1,
  auto_compact_enabled INTEGER NOT NULL DEFAULT 1,
  event_threshold INTEGER NOT NULL DEFAULT 120,
  token_threshold INTEGER NOT NULL DEFAULT 12000,
  stdout_stderr_threshold INTEGER NOT NULL DEFAULT 12000,
  artifacts_threshold INTEGER NOT NULL DEFAULT 24,
  repair_round_threshold INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'active',
  last_compact_status TEXT,
  last_snapshot_id TEXT,
  last_compact_reason TEXT,
  last_compacted_at TEXT,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES entry_sessions (id)
);

CREATE INDEX IF NOT EXISTS idx_adapter_runs_run ON adapter_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_file_changes_run ON file_changes (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_workspace_trust_checks_run ON workspace_trust_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_discoveries_run ON tool_discoveries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_adapter_install_requirements_run ON adapter_install_requirements (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_install_proposals_run ON tool_install_proposals (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tool_install_runs_run ON tool_install_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_tool_install_rollback_runs_run ON tool_install_rollback_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_phase3_smoke_results_run ON phase3_smoke_results (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_consistency_checks_run ON consistency_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase_readiness_run ON phase_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_context_hydrations_run ON context_hydrations (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reconnect_sessions_run ON reconnect_sessions (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_resume_sessions_run ON resume_sessions (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase4_baseline_bindings_ready ON phase4_baseline_bindings (readiness_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stale_running_recoveries_run ON stale_running_recoveries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_run_lineage_parent ON run_lineage (parent_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_run_lineage_child ON run_lineage (child_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fork_runs_source ON fork_runs (source_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fork_runs_fork ON fork_runs (fork_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fork_workspaces_run ON fork_workspaces (fork_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fork_artifact_mappings_source ON fork_artifact_mappings (source_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fork_artifact_mappings_fork ON fork_artifact_mappings (fork_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fork_policy_checks_source ON fork_policy_checks (source_run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_context_projections_run ON context_projections (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase4_closeout_results_run ON phase4_closeout_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase5_readiness_run ON phase5_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_browser_discoveries_run ON browser_discoveries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_browser_smoke_runs_run ON browser_smoke_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_deploy_adapter_discoveries_run ON deploy_adapter_discoveries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deploy_policy_checks_run ON deploy_policy_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase5a_readiness_run ON phase5a_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_browser_action_runs_run ON browser_action_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_browser_verification_checks_run ON browser_verification_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_playwright_runtime_profiles_run ON playwright_runtime_profiles (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_playwright_install_runs_run ON playwright_install_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase5b_reruns_run ON phase5b_reruns (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_browser_external_allowlist_checks_run ON browser_external_allowlist_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_escalations_run ON approval_escalations (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_browser_external_verifications_run ON browser_external_verifications (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase5c_readiness_run ON phase5c_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_run ON approval_requests (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests (status, pending_since);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_run ON approval_decisions (run_id, decided_at);
CREATE INDEX IF NOT EXISTS idx_approval_decisions_request ON approval_decisions (approval_request_id, decided_at);
CREATE INDEX IF NOT EXISTS idx_polyglot_skill_runs_run ON polyglot_skill_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_toolchain_installs_run ON toolchain_installs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_review_runs_run ON engineering_review_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_production_readiness_run ON engineering_production_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_polyglot_toolchain_fulfillments_run ON polyglot_toolchain_fulfillments (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stack_pack_readiness_run ON stack_pack_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_layer_readiness_run ON engineering_layer_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stack_pack_completion_results_run ON stack_pack_completion_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ast_repair_runs_run ON ast_repair_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_deploy_standardization_results_run ON deploy_standardization_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_hardening_readiness_run ON engineering_hardening_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_polyglot_expansion_results_run ON polyglot_expansion_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_toolchain_fulfillment_runs_run ON toolchain_fulfillment_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_semantic_repair_runs_run ON semantic_repair_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_polyglot_expansion_readiness_run ON polyglot_expansion_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_toolchain_remediation_runs_run ON toolchain_remediation_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_flutter_boundary_results_run ON flutter_boundary_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_polyglot_expansion_aggregation_results_run ON polyglot_expansion_aggregation_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_flutter_finalization_runs_run ON flutter_finalization_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_swift_boundary_results_run ON swift_boundary_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_compiled_ast_repair_runs_run ON compiled_ast_repair_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_second_batch_deploy_standardization_runs_run ON second_batch_deploy_standardization_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_polyglot_final_aggregation_results_run ON polyglot_final_aggregation_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_multi_host_capability_results_run ON multi_host_capability_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_external_runner_prerequisite_results_run ON external_runner_prerequisite_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_release_lane_results_run ON release_lane_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_reality_freeze_results_run ON engineering_reality_freeze_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_external_runners_run ON external_runners (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runner_jobs_run ON runner_jobs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_runner_artifact_syncs_run ON runner_artifact_syncs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runner_failure_events_run ON runner_failure_events (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_android_runner_results_run ON android_runner_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_android_toolchain_fulfillments_run ON android_toolchain_fulfillments (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_android_prerequisite_checks_run ON android_prerequisite_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_android_build_runs_run ON android_build_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_android_readiness_results_run ON android_readiness_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_apple_boundary_results_run ON apple_boundary_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_store_boundary_results_run ON store_boundary_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_external_expansion_readiness_run ON external_expansion_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_approval_pending_restores_run ON approval_pending_restores (run_id, restored_at);
CREATE INDEX IF NOT EXISTS idx_phase5d_readiness_run ON phase5d_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_e2b_discoveries_run ON e2b_discoveries (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lane_routing_decisions_run ON lane_routing_decisions (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_e2b_sandbox_runs_run ON e2b_sandbox_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_e2b_execution_results_run ON e2b_execution_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase6a_readiness_run ON phase6a_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_e2b_task_runs_run ON e2b_task_runs (run_id, started_at);
CREATE INDEX IF NOT EXISTS idx_e2b_failure_events_run ON e2b_failure_events (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_lane_fallback_runs_run ON lane_fallback_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase6b_readiness_run ON phase6b_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_e2b_workspace_syncs_run ON e2b_workspace_syncs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_writeback_candidates_run ON writeback_candidates (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_writeback_applications_run ON writeback_applications (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_writeback_conflicts_run ON writeback_conflicts (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_phase6c_readiness_run ON phase6c_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_byo_key_validations_binding ON byo_key_validations (binding_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credential_health_checks_provider ON credential_health_checks (provider, source_scope, created_at);
CREATE INDEX IF NOT EXISTS idx_citation_gate_checks_run ON citation_gate_checks (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conflict_resolution_runs_run ON conflict_resolution_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_provider_health_governance_run ON provider_health_governance (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_system_acceptance_results_run ON system_acceptance_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_intents_run ON engineering_intents (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stack_profiles_run ON stack_profiles (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_repo_plans_run ON repo_plans (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_file_plans_run ON file_plans (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_verification_plans_run ON verification_plans (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_review_gate_results_run ON review_gate_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_repair_loops_run ON repair_loops (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_code_task_runs_run ON code_task_runs (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_engineering_readiness_run ON engineering_readiness (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_openai_codegen_transport_results_run ON openai_codegen_transport_results (run_id, created_at);
CREATE INDEX IF NOT EXISTS idx_context_settings_session ON context_settings (session_id, updated_at);
