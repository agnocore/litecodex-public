# lite-codex Phase 1 Freeze (lite_8gb)

## Scope
- Only lightweight dynamic execution UI + 8GB guardrails.
- No real Auth Broker flow, no platform login integrations, no multi-adapter runtime.

## Guardrails
- Single active run at host level (`POST /runs` returns 409 when one run is active).
- UI event buffer max: 16.
- Run list max: 8.
- Heavy artifacts disabled: no trace/video/browser artifacts.
- File changes are summary placeholder only.
- Review drawer is placeholder only.
- Reconnect/compact/auth banners are status placeholders only.
- No background auto-detection/auto-launch for Docker/Playwright/WSL.
- BYO key is memory-only in host process.
- Future lanes are marked `deferred_lanes` in runtime profile.

## UI Elements (lightweight)
- Runtime profile badge (`lite_8gb`).
- Current action line.
- Step timeline.
- File change summary placeholder.
- Review drawer placeholder.
- Auth pending banner placeholder.
- Reconnect banner placeholder.
- Compact banner placeholder.