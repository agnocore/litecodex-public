# lite-codex Phase 2D Freeze

## Scope
- Keep local-only runtime: `local-ui + agent-host + run-ledger + runs + shared`.
- Add one real Browser OAuth platform lane: Cloudflare Wrangler login/auth verification.
- Keep lite_8gb guardrails (single active run/session, no heavy parallel lanes).

## Landed
- Added recipe: `wrangler_oauth_login` (browser_oauth mode, command-rendered `wrangler login`).
- Added verifier: `wrangler_oauth_verifier`.
- Added capability keys:
  - `cloudflare.account.authenticated`
  - `cloudflare.user.read`
  - `cloudflare.account.read`
  - `wrangler.oauth.authenticated`
  - `cloudflare.account.membership.read`
- Added auto-detect loop for Wrangler pending auth session:
  - Poll `wrangler whoami --json`.
  - Emit `auth.detected_external_completion`.
  - Verify + grant + resume + complete in same run.
- Added command selection policy:
  - prefer `wrangler login --scopes account:read user:read`
  - fallback to `wrangler login` when scopes flag unavailable.
- Added UI status panel and live state markers for Wrangler auth chain.

## Security
- Wrangler verification runs with `CLOUDFLARE_API_TOKEN` removed from child-process env to avoid token-path override during OAuth-state checks.
- Sensitive values (OAuth token/API token/cookie/session secret/2FA code/callback query secrets) remain redacted and excluded from persisted evidence.
