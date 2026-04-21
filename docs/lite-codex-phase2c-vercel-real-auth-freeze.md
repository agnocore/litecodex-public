# lite-codex Phase 2C Freeze

## Scope
- Keep local-only architecture: `local-ui + agent-host + run-ledger + runs + shared`.
- Add one real platform auth path only: Vercel CLI login via recipe+verifier plug-in.
- Keep lite_8gb guardrails (single active run/session, no heavy lanes).

## Landed
- Added recipe: `recipe.vercel_cli_login.real.v1`.
- Added verifier: `verifier.vercel_cli_login.real.v1`.
- Added capability keys:
  - `vercel.account.authenticated`
  - `vercel.scope.inspect`
  - `vercel.project.read`
  - `vercel.project.link.inspect` (inspect-only, optional)
- Added event support: `auth.detected_external_completion`.
- Added auto detection loop in host:
  - Poll pending Vercel auth session.
  - Verify with Vercel CLI probes.
  - Grant capabilities.
  - Resume and complete original step.
- Added forced-auth-challenge option for testing chain continuity even with reusable grants.
- Updated local UI for Vercel auth status, recipe/verifier view, and pending/detecting/verified/completed states.

## Security
- Token/PAT/OTP/cookie/session secret remain memory-only and are not persisted.
- Evidence artifacts use sanitized CLI outputs and leak-scan checks.
