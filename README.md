# Lite Codex Community Edition

Lite Codex Community Edition (CE) is a source-available release with a strict public/private boundary.

## Quick Start (Windows)
Use a normal shell (PowerShell/CMD/Windows Terminal), not Node.js REPL (`>` prompt).

```powershell
git clone https://github.com/agnocore/litecodex-public.git
cd litecodex-public
npm run entry:onekey
```

Health check:
```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:43985/health | Select-Object -ExpandProperty Content
```

- Expected listen: `127.0.0.1:43985`
- Host bridge expected: `127.0.0.1:4317`
- Full steps: [INSTALL.md](./INSTALL.md)

## Local Entry
- Local entry URL: `http://127.0.0.1:43985`
- Service name: `litecodex-entry`
- This endpoint is the only local user-facing entry for CE runtime.

## Install and Start
- See [INSTALL.md](./INSTALL.md)
- Recommended commands:
  - `npm run entry:onekey`
  - `npm run frontend:verify`
  - `npm run ledger:status`
  - `npm run entry:install`
  - `npm run entry:status`
  - `npm run entry:open`

Frontend runtime artifact contract:
- `entry/service/public/app.js`
- `entry/service/public/styles.css`
- `entry/service/public/frontend-runtime.manifest.v1.json`

## Edition Boundary
- CE public scope and private control plane boundary:
  - [docs/PRODUCT_BOUNDARY.md](./docs/PRODUCT_BOUNDARY.md)
  - [docs/COMMUNITY_FEATURE_MATRIX.md](./docs/COMMUNITY_FEATURE_MATRIX.md)

## License and Trademark
- License: [COMMUNITY_LICENSE.txt](./COMMUNITY_LICENSE.txt)
- Notice: [NOTICE.md](./NOTICE.md)
- Trademark: [TRADEMARK_POLICY.md](./TRADEMARK_POLICY.md)

## Security Controls
- Entitlement verify path (CE-side verifier only): [docs/ENTITLEMENT_SPEC.md](./docs/ENTITLEMENT_SPEC.md)
- Update signing verify path (CE-side verifier only): [docs/UPDATE_SIGNING_SPEC.md](./docs/UPDATE_SIGNING_SPEC.md)
