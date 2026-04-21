# lite-codex v1 Phase 0 Freeze

## Scope
- This freeze covers only Phase 0 pre-audit + minimal local shell.
- Out of scope: Auth Broker business logic, platform OAuth/login integration, reconnect/compact/resume.

## Process boundary
- `agent-host` on `127.0.0.1:4317` (execution + ledger owner).
- `local-ui` on `127.0.0.1:4318` (display + user input shell).

## Communication boundary
- Command channel: HTTP JSON requests from UI to host.
- Event channel: SSE stream (`GET /events`) from host to UI.

## Run identity and persistence boundary
- Run ID format: `run_<epochMs>_<8hex>`.
- Canonical state in SQLite: `run-ledger/ledger.sqlite`.
- File artifacts per run: `runs/<run-id>/meta.json`, `runs/<run-id>/events.ndjson`.

## Minimal schema
- Table `runs`: `id`, `title`, `status`, `created_at`, `updated_at`, `last_event_type`.
- Table `events`: `id`, `run_id`, `seq`, `type`, `payload_json`, `created_at`.

## Event types (minimum)
- `run.created`
- `step.started`
- `step.progress`
- `step.completed`

## BYO key boundary
- UI can post key to host endpoint `/session/byo-key`.
- Host stores key in process memory only.
- No key persistence to SQLite or filesystem in Phase 0.

## Start commands
- Host: `npm --prefix agent-host run start`
- UI: `npm --prefix local-ui run start`