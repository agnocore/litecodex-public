# Phase 0 Boundaries (Frozen)

## Process boundary
- local-ui: serves static UI at 127.0.0.1:4318.
- agent-host: serves API/event stream at 127.0.0.1:4317 and owns execution.

## Data boundary
- SQLite is the canonical ledger: run-ledger/ledger.sqlite.
- Artifact files are append-only run traces: runs/<run-id>/meta.json and runs/<run-id>/events.ndjson.

## Secret boundary
- BYO API key can be submitted from UI to host endpoint /session/byo-key.
- Host keeps BYO key in process memory only.
- BYO key is never written to SQLite or files in Phase 0.

## Event boundary
- All runtime progress moves through event-bus events.
- Minimum event set: run.created, step.started, step.progress, step.completed.

## State placement
- Memory only: connected SSE clients, BYO key, transient timers.
- Must persist: run records + event records in SQLite, per-run meta/events file.