# Installation and Startup (Community Edition)

## Prerequisites
- Node.js 20+
- Windows local environment (current entry scripts are Windows-first)

## Install Local Entry Service
```powershell
node entry/cli.mjs entry install
```

## Verify Running State
```powershell
node entry/cli.mjs entry status
```

Expected listen:
- `127.0.0.1:43985`

## Open in Browser
```powershell
node entry/cli.mjs entry open
```

or open manually:
- `http://127.0.0.1:43985`

## Service Lifecycle
```powershell
node entry/cli.mjs entry start
node entry/cli.mjs entry stop
node entry/cli.mjs entry restart
node entry/cli.mjs entry uninstall
```

## Notes
- CE does not include private control plane implementation.
- Missing entitlement does not block CE core runtime; private/official capabilities remain disabled.

