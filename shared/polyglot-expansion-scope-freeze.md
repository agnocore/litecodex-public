# Polyglot Expansion Scope Freeze (Root-Cause Fix)

## In Scope (This Round)
- Rust toolchain remediation to true detect -> fulfill -> re-detect -> verify closure.
- Flutter host boundary freeze to web-first scope with explicit desktop host checks.
- Expansion readiness aggregation unification with completed/blocked/deferred semantics.
- Representative re-run for second-batch packs under the existing story chain.

## Out Of Scope (Frozen)
- New providers or platform adapters.
- Retrieval broker expansion/refactor.
- New architecture lanes.
- Flutter iOS/Android store pipeline.

## Aggregation Semantics
- `completed_packs`: packs with readiness true.
- `blocked_packs`: packs with readiness false and `blocking_if_not_ready=true`.
- `deferred_packs`: packs with readiness false and `blocking_if_not_ready=false`.
- `unique_blocker`: only emitted when `blocked_packs.length == 1`.

## Final Closeout Rule
- `polyglot_expansion_production_ready=true` iff blocked packs are empty and required matrix checks pass.