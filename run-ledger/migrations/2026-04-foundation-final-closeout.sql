CREATE TABLE IF NOT EXISTS host_access_grants (
  id TEXT PRIMARY KEY,
  access_scope TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entry_workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  workspace_path TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS entry_workspace_selections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  workspace_path TEXT,
  source TEXT,
  selected_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES entry_workspaces (id)
);

CREATE TABLE IF NOT EXISTS entry_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  workspace_path TEXT NOT NULL,
  run_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_active_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES entry_workspaces (id),
  FOREIGN KEY (run_id) REFERENCES runs (id)
);

CREATE INDEX IF NOT EXISTS idx_host_access_grants_scope ON host_access_grants (access_scope, updated_at);
CREATE INDEX IF NOT EXISTS idx_entry_workspaces_status ON entry_workspaces (status, updated_at);
CREATE INDEX IF NOT EXISTS idx_entry_workspace_selections_time ON entry_workspace_selections (selected_at);
CREATE INDEX IF NOT EXISTS idx_entry_sessions_workspace ON entry_sessions (workspace_path, updated_at);
CREATE INDEX IF NOT EXISTS idx_entry_sessions_run ON entry_sessions (run_id, updated_at);
