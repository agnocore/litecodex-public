# lite-codex Phase 3A Freeze

## Goal
Validate local engineering execution mainchain in a safe fixture workspace:
- file adapter
- shell adapter
- git/worktree adapter
- verify loop adapter

## Scope constraints
- All execution stays inside `litecodex/workspaces/phase3a-fixture`.
- No deploy actions.
- No Docker / Playwright browser lane.
- No external platform auth expansion in this phase.

## Mainchain contract
1. `step.requested`
2. `capability.checked`
3. `capability.granted | capability.reused`
4. `adapter.selected`
5. `file.read.started`
6. `file.read.completed`
7. `file.write.started`
8. `file.write.completed`
9. `shell.command.started`
10. `shell.command.completed`
11. `git.status.completed`
12. `git.diff.completed`
13. `verify.started` (attempt 1)
14. `verify.failed`
15. `repair.started`
16. `repair.completed`
17. `verify.started` (attempt 2)
18. `verify.passed`
19. `step.completed`

## Ledger extensions
- `adapter_runs`
- `file_changes`
- `verify_runs`

Only summaries are stored in SQLite; larger outputs are written to `runs/<run-id>/artifacts/`.

## Tool discovery
- Supports env-var override path.
- Supports registry fixed path candidates.
- Supports PATH lookup.
- Emits `adapter.install.required` when a required tool is missing.