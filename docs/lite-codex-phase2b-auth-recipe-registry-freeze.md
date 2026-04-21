# lite-codex Phase 2B Freeze

## Scope
- Keep local-only axis unchanged: `local-ui + agent-host + run-ledger + runs + shared`.
- Upgrade Phase 2A auth loop to:
  - recipe-driven challenge selection
  - verifier plug-in contract
  - auth session lifecycle management
  - capability grant lifecycle management

## Recipe and verifier plug-ins
- Recipe source: `shared/auth-recipe-registry.v1.json`
  - `browser_oauth`
  - `cli_login`
  - `token_input`
  - `device_code`
- Verifier source: `shared/auth-verifier-contract.v1.json`
  - browser confirmation verifier
  - cli confirmation verifier
  - token non-empty verifier
  - device confirmation verifier

## Core chain
1. `step.requested`
2. `auth.required`
3. `auth.mode.selected`
4. `auth.challenge.emitted`
5. challenge event (`auth.browser_opened` / `auth.command_rendered` / `auth.input_requested`)
6. `auth.pending_user_action`
7. `auth.user_submitted`
8. `auth.verifying`
9. `auth.verified`
10. `capability.granted`
11. `step.resumed`
12. `step.completed`

## Lifecycle chain
- Auth timeout:
  - `auth.timeout` + `step.failed`
  - `auth_sessions.status = timeout`
- Auth cancel:
  - `auth.cancelled` + `step.failed`
  - `auth_sessions.status = cancelled`
- Grant expiry:
  - `capability.expired`
  - `capability_grants.status = expired`
- Grant revoke:
  - `capability.revoked`
  - `capability_grants.status = revoked`

## Persistence boundary
- SQLite persisted:
  - `runs`
  - `events`
  - `auth_sessions` (status/timeout/cancel/error code)
  - `capability_grants` (status/expiry/revoke lifecycle)
- Runs artifact persisted:
  - `runs/<run-id>/meta.json`
  - `runs/<run-id>/events.ndjson`

## Sensitive boundary
- Memory-only:
  - BYO API key
  - token/PAT values
  - device-code secret values
- Persisted only as redacted metadata:
  - token length
  - token redacted marker
- Forbidden in logs/events/evidence:
  - raw token
  - raw PAT
  - raw API key
