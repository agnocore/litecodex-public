# lite-codex Phase 3B: Verify Loop Hardening (Freeze)

## Scope
- Keep Phase 3A local execution chain (`file/shell/git/verify`) on local host/UI/ledger.
- Harden verify loop policy only; no new platform adapters.

## Frozen Policy
- Fixed `max_attempts` and `timeout_ms` from `shared/verify-loop.v1.json`.
- Failure classification via `shared/verify-failure-taxonomy.v1.json`.
- Repair strategy selection via `shared/repair-strategy.v1.json`.
- Replay evidence schema via `shared/replay-evidence.v1.json`.

## Lifecycle Rules
- Retry allowed only for `syntax_error` and `test_assertion_failure` with `file_patch`.
- Non-retryable classes end in `verify.controlled_failed` + `step.failed_controlled`.
- No infinite retries and no silent failure swallowing.

## Ledger Guarantees
- `verify_runs` stores summaries + artifact paths, never full unbounded output.
- `repair_decisions` records strategy decisions and status transitions.
- `replay_artifacts` stores replay artifact path per verify attempt.
