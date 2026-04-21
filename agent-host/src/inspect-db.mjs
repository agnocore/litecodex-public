import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(thisDir, "..", "..");
const dbPath = path.join(repoRoot, "run-ledger", "ledger.sqlite");

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
const runs = db
  .prepare("SELECT id, title, status, created_at, updated_at, last_event_type FROM runs ORDER BY created_at DESC LIMIT 10")
  .all();
const authSessions = db
  .prepare(
    "SELECT id, run_id, step_id, mode, required_capability, selected_recipe_id, selected_verifier_id, status, timeout_at, cancelled_at, last_error_code, created_at, updated_at FROM auth_sessions ORDER BY created_at DESC LIMIT 40"
  )
  .all();
const capabilityGrants = db
  .prepare(
    "SELECT id, run_id, step_id, capability_key, scope_type, scope_value, grant_mode, grant_recipe_id, verifier_id, status, granted_at, verified_at, expires_at, revoked_at, revoke_reason, updated_at FROM capability_grants ORDER BY verified_at DESC LIMIT 40"
  )
  .all();

const stmtEvents = db.prepare("SELECT seq, type, created_at FROM events WHERE run_id = ? ORDER BY seq ASC");
const result = {
  runs: runs.map((run) => ({ ...run, events: stmtEvents.all(run.id) })),
  auth_sessions: authSessions,
  capability_grants: capabilityGrants
};

console.log(JSON.stringify(result, null, 2));
db.close();
