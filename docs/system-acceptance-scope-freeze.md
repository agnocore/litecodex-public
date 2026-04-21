# lite-codex Global System Acceptance Scope Freeze

## Exercised in acceptance
- workspace root binding + task storage root
- OpenAI BYO bind + exact validation (browser-profile scope)
- retrieval decision gate (search vs no-search)
- local repo inspect/edit/shell verify loop
- real deploy closeout (existing controlled provider/path)
- online verification (post-deploy)
- final system acceptance readiness aggregation

## Not exercised in acceptance
- new provider expansion (none)
- architecture rewrite (none)
- retrieval feature expansion beyond current broker governance (none)

## Deferred but non-blocking
- approval pending + same-run continue in this specific story (not_needed_for_this_story)
- browser external readonly verification in this specific story (covered by post-deploy online verification path)
- E2B second lane + deterministic writeback in this specific story (not_needed_for_this_story)

## Acceptance statement
System acceptance is determined by a single chained story run with checkpoint receipts.  
Required checkpoints must pass. Optional checkpoints may be marked `not_needed_for_this_story` with explicit reason.
