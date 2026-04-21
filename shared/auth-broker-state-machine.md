# Auth Broker State Machine v1 (Phase 2E)

## Core serial chain
1. `step.requested`
2. `auth.required`
3. `auth.mode.selected`
4. `auth.challenge.emitted` (or direct external detection path when pre-verified)
5. `auth.browser_opened` or `auth.command_rendered` or `auth.input_requested`
6. `auth.pending_user_action`
7. `auth.user_submitted` or `auth.detected_external_completion`
8. `auth.verifying`
9. `auth.verified` or `auth.failed`
10. `capability.granted` (can emit multiple entries for mapped capabilities)
11. `step.resumed`
12. `step.completed`

## Lifecycle extensions
- `auth.timeout`
  - Trigger: `auth_sessions.timeout_at <= now` while session status is active.
  - Result: `auth_sessions.status = timeout`, `last_error_code = auth_session_timeout`, and `step.failed`.
- `auth.cancelled`
  - Trigger: explicit `POST /auth/sessions/:id/cancel`.
  - Result: `auth_sessions.status = cancelled`, `cancelled_at` set, `last_error_code = auth_session_cancelled`, and `step.failed`.
- `capability.expired`
  - Trigger: `capability_grants.expires_at <= now` while `status = granted`.
  - Result: `capability_grants.status = expired`.
- `capability.revoked`
  - Trigger: explicit `POST /capability-grants/:id/revoke`.
  - Result: `capability_grants.status = revoked`, `revoked_at` and `revoke_reason` set.

## Verifier plug-in behavior (Phase 2E)
- Recipe + verifier remain the only extension path for platform auth.
- Example: `recipe.vercel_cli_login.real.v1` + `verifier.vercel_cli_login.real.v1`.
- Example: `wrangler_oauth_login` + `wrangler_oauth_verifier`.
- Example: `supabase_token_input` + `supabase_token_verifier`.
- External completion detection:
  - Session remains `pending_user_action` while polling.
  - On successful poll: emit `auth.detected_external_completion` -> `auth.verifying` -> `auth.verified`.
  - If polling fails and timeout not reached: keep `pending_user_action`.

## Broker orchestration contract
- `required_capability`: capability key the step needs.
- `selected_mode`: one of `browser_oauth | cli_login | token_input | device_code`.
- `selected_recipe_id`: recipe resolved from `auth-recipe-registry.v1.json`.
- `selected_verifier_id`: verifier resolved from `auth-verifier-contract.v1.json`.
- `lifecycle_state`: reflected in events and `auth_sessions.status`.

## Persistence and sensitive policy
- Persisted in SQLite and runs event files:
  - IDs, mode, recipe id, verifier id, status, timestamps, error codes.
- Memory-only (never persisted):
  - token/PAT raw values
  - device challenge secret values
- Redaction:
  - `auth.user_submitted` for token input only keeps `token_present=true`, `token_length`, `redacted=true`; no raw secrets.
  - Platform detectors must log only sanitized account hints (e.g. `o***@gmail.com`).
  - Supabase token verification uses session-only environment injection, not persistent `supabase login --token`.

## 8GB guardrail compliance
- Single active run.
- Single active auth session.
- No parallel heavy lanes.
- No trace/video/browser artifact persistence.
