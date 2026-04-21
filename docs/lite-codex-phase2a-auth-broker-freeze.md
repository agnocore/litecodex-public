# lite-codex Phase 2A Freeze (Auth Broker Local Serial Loop)

## Scope
- Implemented local Auth Broker serial closure in `agent-host` + `local-ui`.
- Out of scope: real Wrangler/Vercel/Supabase auth integrations, Docker lane, Playwright lane runtime execution.

## Core Guarantees
- Missing capability no longer terminates run.
- Run enters auth sub-flow and resumes original step after verification.
- Capability grant is persisted in SQLite.
- One active run and one active auth session at a time under `lite_8gb`.

## Implemented Modes (local verifiable)
- `browser_oauth`: browser-opened event + local confirm + verifier pass.
- `cli_login`: command-rendered event + local confirm + verifier pass.
- `token_input`: local token input (memory-only) + verifier pass.
- `device_code`: command/code rendered + local confirm + verifier pass.

## SQLite Persistence
- `auth_sessions`: id/run_id/step_id/mode/required_capability/status/timestamps.
- `capability_grants`: id/capability/scope/grant_mode/status/timestamps.

## Sensitive Data Boundary
- Tokens/PAT/secret fields are process-memory only.
- No token/PAT raw value in SQLite/events/runs artifacts/logs.
- Auth events store redacted metadata only (e.g., token length).

## Required Event Chain
- step.requested
- auth.required
- auth.mode.selected
- auth.browser_opened or auth.command_rendered or auth.input_requested
- auth.pending_user_action
- auth.user_submitted
- auth.verifying
- auth.verified
- capability.granted
- step.resumed
- step.completed