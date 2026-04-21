# lite-codex Phase 2E Freeze

## Scope
- Added real Supabase token_input path on top of existing local host + local UI + local ledger.
- Kept single-run and single-auth-session serial guardrails for `lite_8gb`.
- No Docker, no Playwright browser binaries, no Supabase local stack.

## Auth Broker contract in this phase
- Recipe id: `supabase_token_input`
- Verifier id: `supabase_token_verifier`
- Required chain:
  1. `step.requested`
  2. `auth.required`
  3. `auth.mode.selected`
  4. `auth.challenge.emitted`
  5. `auth.input_requested`
  6. `auth.pending_user_action`
  7. `auth.user_submitted`
  8. `auth.verifying`
  9. `auth.verified`
  10. `capability.granted`
  11. `step.resumed`
  12. `step.completed`

## Token safety policy
- Token/PAT accepted only from local auth submit payload.
- Token stored in host process memory only for active session.
- No token persistence to SQLite, runs events, host/ui logs, screenshot artifacts, or evidence JSON.
- `auth.user_submitted` stores only `token_present`, `token_length`, `redacted`.
- Verification uses session-only env injection:
  - `SUPABASE_ACCESS_TOKEN=<memory-token> supabase projects list --output json`

## Capability mapping
- `supabase.account.authenticated`
- `supabase.project.read`
- `supabase.org.read` (when org fields are present in project list output)

## Out of scope (still deferred)
- Supabase local stack (`supabase start/stop`)
- DB migrations / push / reset / dump
- Functions deploy
- Secrets write operations
- Docker / Playwright lanes