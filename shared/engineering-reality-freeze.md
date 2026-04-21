# Engineering Reality Freeze (Polyglot Multi-Host Productionization)

## Exercised In This Closeout
- same-host real engineering chain for frontend/backend/fullstack/worker/data/config/infra/compiled packs on current Windows host
- host-safe subchain for boundary-limited packs (swift_windows, react_native, flutter_desktop)
- external-runner prerequisite freeze for android/macos/store release lanes

## Not Exercised As Same-Host Real
- apple ios/macos release pipelines
- play/app store release pipelines
- android full release lane requiring emulator/device and store credentials

## Deferred But Non-Blocking
- `crossend.flutter_desktop` full release on non-macOS host
- `crossend.react_native` full iOS release path on non-macOS host
- `wsl_or_linux_runner` optional parity runner

## External Runner Required (Frozen)
- `mobile.android_release` -> android runner + sdk/emulator/device + store creds
- `apple.ios_release`, `apple.macos_release` -> macOS runner + Xcode
- `store.play_console_release`, `store.app_store_release` -> store credentials + release host

## Acceptance Statement
- same-host real capabilities are accepted only when end-to-end chain is executed with verify/review/repair by default.
- host-safe subchains are accepted only with explicit boundary receipts.
- external-runner-required capabilities are frozen as prerequisites, not marked as passed on current host.
