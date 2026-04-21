# Lite Codex Community Edition

Lite Codex Community Edition (CE) is a source-available release with a strict public/private boundary.

## Local Entry
- Local entry URL: `http://127.0.0.1:43985`
- Service name: `litecodex-entry`
- This endpoint is the only local user-facing entry for CE runtime.

## Install and Start
- See [INSTALL.md](./INSTALL.md)
- Quick commands:
  - `node entry/cli.mjs entry install`
  - `node entry/cli.mjs entry status`
  - `node entry/cli.mjs entry open`

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

