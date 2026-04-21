# Mission Console Canonical Closure (2026-03-19)

## Scope
- Console: `console.oliverfr.com`
- Agent: `agent.oliverfr.com`
- Frontend file: `src/MissionConsole.jsx`
- Canonical e2e artifact: `artifacts/mission-console-canonical-e2e-latest.json`
- Session used for e2e chain: `mission-console-1773892386432`

---

## 1) Field-Level Mapping (Field -> Source -> Path -> Store -> Selector -> Component)

### 1.1 Operator Context
| Field | Source (endpoint/header/body/fallback) | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Authenticated | endpoint body | `GET /api/mission-console/auth/me -> body.auth.authenticated` | `canonicalState.operator.authenticated` | `canonicalDisplay(canonicalState.operator.authenticated)` | `authContextPanel -> SummaryRow("Authenticated")` |
| Subject | endpoint body, unauth fallback typed | `body.auth.subject` | `canonicalState.operator.subject` | `canonicalDisplay(...)` | `authContextPanel -> SummaryRow("Subject")` |
| Role | endpoint body + config fallback | `body.auth.role` / `body.config.default_role` | `canonicalState.operator.role` | `canonicalDisplay(...)` | `authContextPanel -> SummaryRow("Role")` |
| Source | endpoint body | `body.auth.source` | `canonicalState.operator.source` | `canonicalDisplay(...)` | `authContextPanel -> SummaryRow("Source")` |
| Auth Mode | endpoint body + config fallback | `body.auth.mode` / `body.config.auth_mode` | `canonicalState.operator.authMode` | `canonicalDisplay(...)` | `authContextPanel -> title + SummaryRow("Auth Mode")` |
| RBAC | endpoint body | `body.config.rbac_enabled` | `canonicalState.operator.rbac` | `canonicalDisplay(...)` | `authContextPanel -> SummaryRow("RBAC")` |
| Evidence Sign | endpoint body | `body.config.evidence_sign_mode` | `canonicalState.operator.evidenceSign` | `canonicalDisplay(...)` | `authContextPanel -> SummaryRow("Evidence Sign")` |

### 1.2 Governance Overview
| Field | Source | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Runtime | mission response body | `chat.body.autocontext_compiler.schema_version` | `canonicalState.governanceOverview.runtimeSchema` | `canonicalDisplay(...)` | `governanceOverviewPanel headline` |
| Projection | mission response body | `chat.body.mission_console_projection.compiler.context_compiler_mode` | `canonicalState.governanceOverview.projectionMode` | `canonicalDisplay(...)` | `governanceOverviewPanel headline` |

### 1.3 Governance Headers
| Field | Source | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Source | response metadata | captured header source | `canonicalState.governanceHeaders.source` | `canonicalDisplay(...)` | `executionHeadersPanel head` |
| Route Contract | response header | `x-ac-route-contract-version` | `canonicalState.governanceHeaders.routeContract` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Event Offset | response header | `x-ac-event-offset` | `canonicalState.governanceHeaders.eventOffset` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Context Plan | response header | `x-ac-context-plan-id` | `canonicalState.governanceHeaders.contextPlan` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Closure Class | response header | `x-ac-closure-class` | `canonicalState.governanceHeaders.closureClass` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow("Closure")` |
| Closure Gate | response header | `x-ac-closure-gate` | `canonicalState.governanceHeaders.closureGate` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow("Closure")` |
| Verifier | response header | `x-ac-verifier-mesh` | `canonicalState.governanceHeaders.verifier` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Checkpoint | response header | `x-ac-checkpoint-id` | `canonicalState.governanceHeaders.checkpoint` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Checkpoint Compare | response header | `x-ac-checkpoint-compare` | `canonicalState.governanceHeaders.checkpointCompare` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Checkpoint Enforce | response header | `x-ac-checkpoint-enforce` | `canonicalState.governanceHeaders.checkpointEnforce` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Recovery Cursor | response header | `x-ac-recovery-cursor` | `canonicalState.governanceHeaders.recoveryCursor` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Replay Lineage | response header | `x-ac-replay-lineage` | `canonicalState.governanceHeaders.replayLineage` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Memory Mode | response header | `x-ac-memory-mode` | `canonicalState.governanceHeaders.memoryMode` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Memory Admission | response header | `x-ac-memory-admission` | `canonicalState.governanceHeaders.memoryAdmission` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Memory Write Plan | response header | `x-ac-memory-write-plan` | `canonicalState.governanceHeaders.memoryWritePlan` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Version Gov | response header | `x-ac-version-gov` | `canonicalState.governanceHeaders.versionGov` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Replay Compat | response header | `x-ac-replay-compat` | `canonicalState.governanceHeaders.replayCompat` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |
| Compat Adapter | response header | `x-ac-compat-adapter` | `canonicalState.governanceHeaders.compatAdapter` | `canonicalDisplay(...)` | `executionHeadersPanel SummaryRow` |

### 1.4 Mission Runtime Control
| Field | Source | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Inspect Session | mission inspect body | `mission.inspect.body.session_id` | `canonicalState.missionControl.inspectSession` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Action Session | derived session action id | `mission.runtime.action_session` | `canonicalState.missionControl.actionSession` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Control Mode | computed | materialized + mission_type | `canonicalState.missionControl.controlMode` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Mission Type | mission inspect/state body | `mission_inspection.mission_type / mission_state.mission_type` | `canonicalState.missionControl.missionType` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Mission Status | mission inspect/state/chat | `mission_inspection.status / mission_state.status / chat.mission.status` | `canonicalState.missionControl.missionStatus` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| State Materialized | mission inspect found + state id | `mission.inspect.found` + runtime state | `canonicalState.missionControl.stateMaterialized` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Blocked Step | mission inspect/state | `mission_inspection.current_blocked_step / blocked_step.step_id` | `canonicalState.missionControl.blockedStep` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Missing Fields | mission inspect/state | `missing_required_fields.length` | `canonicalState.missionControl.missingFieldCount` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Route Source | source classifier | `governance.field_source.route_contract` | `canonicalState.missionControl.routeSource` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Context Source | source classifier | `governance.field_source.context_plan` | `canonicalState.missionControl.contextSource` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Checkpoint Source | source classifier | `governance.field_source.checkpoint_compare` | `canonicalState.missionControl.checkpointSource` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |
| Verifier Source | source classifier | `governance.field_source.verifier_mesh` | `canonicalState.missionControl.verifierSource` | `canonicalDisplay(...)` | `missionControlPanel SummaryRow` |

### 1.5 Task Control
| Field | Source | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Current Task | task detail + mission inspect fallback | `task.task_id / mission.task_ref.task_id` | `canonicalState.taskControl.currentTask` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Mission Status | mission inspect/state/chat | `mission status` | `canonicalState.taskControl.missionStatus` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Skill | mission result + task detail | `mission.skill_ref / task.skill_ref` | `canonicalState.taskControl.skill` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Verifier | task detail body | `task.verifier.status` | `canonicalState.taskControl.verifier` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Recovery | task detail body | `task.recovery.status` | `canonicalState.taskControl.recovery` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Approval | task detail body | `task.approval.status` | `canonicalState.taskControl.approval` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Acceptance | task detail body | `task.acceptance.status` | `canonicalState.taskControl.acceptance` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| AutoContext | mission body + config fallback | `mission.autocontext / config.autocontext` | `canonicalState.taskControl.autocontext` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Mission Mode | UI mission form state | `missionDryRun` | `canonicalState.taskControl.missionMode` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Generated Files | task detail body | `task.result.generated_files.length` | `canonicalState.taskControl.generatedFiles` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Workspace Files | workspace state | `workspace.files.length` | `canonicalState.taskControl.workspaceFiles` | `canonicalDisplay(...)` | `Task Control SummaryRow` |
| Plan Steps | mission plan/task architect | `mission.plan_graph.step_count / task.architect.step_count` | `canonicalState.taskControl.planSteps` | `canonicalDisplay(...)` | `Task Control SummaryRow` |

### 1.6 Approval Queue
| Field | Source | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Pending Count | endpoint body | `GET /api/mission-console/approval/pending -> body.items.length` | `canonicalState.approvalQueue.pendingCount` | `canonicalDisplay(...)` | `approvalQueuePanel header` |
| LoadedAt | frontend load marker | local `approvalQueueLoadedAt` | `canonicalState.approvalQueue.loadedAt` | internal check | queue state freshness |

### 1.7 Plan And Preflight
| Field | Source | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Status | task detail architect preflight | `task.architect.preflight.status` | `canonicalState.plan.status` | `canonicalDisplay(...)` | `plan panel status pill` |
| Primary Path | task detail architect | `task.architect.selected_path_primary` | `canonicalState.plan.primaryPath` | `canonicalDisplay(...)` | `plan panel SummaryRow` |
| Nodes | task detail architect | `task.architect.node_count` | `canonicalState.plan.nodes` | `canonicalDisplay(...)` | `plan panel SummaryRow` |
| Approval Points | task detail architect | `task.architect.approval_point_count` | `canonicalState.plan.approvalPoints` | `canonicalDisplay(...)` | `plan panel SummaryRow` |
| Failure Branches | task detail architect | `task.architect.failure_branch_count` | `canonicalState.plan.failureBranches` | `canonicalDisplay(...)` | `plan panel SummaryRow` |

### 1.8 Skill Profile
| Field | Source | Path | Normalized store key | Selector | Rendered component |
|---|---|---|---|---|---|
| Force Skill Ref | UI mission form | `force_skill_ref input` | `canonicalState.skillProfile.forceSkillRef` | `canonicalDisplay(...)` | `skillProfilePanel` |
| Selected Skill Ref | UI selected skill state | `selectedSkillRef` | `canonicalState.skillProfile.selectedSkillRef` | `canonicalDisplay(...)` | `skillProfilePanel` |
| Mission Skill Ref | mission/task body | `mission.skill_ref / task.skill_ref` | `canonicalState.skillProfile.missionSkillRef` | `canonicalDisplay(...)` | `skillProfilePanel` |
| Active Skill Ref | selector resolution | selected -> mission -> task -> force | `canonicalState.skillProfile.activeSkillRef` | `canonicalDisplay(...)` | `skillProfilePanel title` |
| Ref Drift | derived compare | `selectedSkillRef !== mission.skill_ref` | `canonicalState.skillProfile.refDrift` | `canonicalDisplay(...)` | `skillProfilePanel drift notice` |
| Skill Ref | skill detail body + fallback | `skill.detail.skill.skill_ref` | `canonicalState.skillProfile.skillRef` | `canonicalDisplay(...)` | `skillProfilePanel SummaryRow` |

---

## 2) Root Cause Diagnosis For Current Inconsistencies

### 2.1 `authenticated=yes` + `subject=anonymous` + `role=admin` + `source=none` + `auth mode=none` + `RBAC=disabled`
- Root cause: This is not mutually exclusive at backend protocol level; it is a valid anonymous-admin config in `auth_mode=none`.
- Previous UI bug: fields were mixed from independent fallback chains without provenance, which made it look contradictory.
- Fix: all fields now come from canonical auth signals, each with provenance and typed missing state.

### 2.2 Governance headers have route/context/checkpoint/verifier/version but overview still `runtime n/a / projection n/a`
- Root cause: overview previously read payload compiler fields directly while headers card read header snapshot; they were not normalized into one state source.
- Fix: `governanceOverview.runtimeSchema/projectionMode` and `governanceHeaders.*` now share canonical normalization and semantic missing typing (`not_mapped` vs `not_returned`).

### 2.3 Mission Runtime Control says blocked/materialized but Task Control says none/n-a
- Root cause: Mission and Task cards previously read different raw payload branches and local defaults.
- Fix: `taskControl.currentTask` now resolves by ordered source chain and typed fallback, so no fake `none/n-a` mixed with materialized mission runtime.

### 2.4 Force Skill Ref vs Skill Profile mismatch
- Root cause: drift between `selectedSkillRef`, `mission.skill_ref`, `force skill input`, and `skill detail` fetch target.
- Fix: canonical `activeSkillRef` + `refDrift` signal added; drift banner is rendered if selected and mission diverge.

### 2.5 `plan steps=1`, `autocontext=heavy(ready)`, `mission mode=run` but Plan And Preflight = UNKNOWN
- Root cause: plan card depended on task architect payload only; when task absent or not yet hydrated it defaulted to unknown without source semantics.
- Fix: plan selectors moved to canonical with semantic missing types to distinguish not computed vs not mapped vs not applicable.

### 2.6 No current task/no pending approval but Accept/Reject/Approve still exposed
- Root cause: button visibility/enable relied on partial checks and role-only gating.
- Fix: canonical action states now gate show/enable using task presence + gateway action descriptors + mission/task state preconditions.

---

## 3) Canonical State Policy (Implemented)

- Unified state domains:
  - bootstrap state
  - auth state
  - mission inspect state
  - runtime task state
  - approval queue state
  - skill detail state
  - governance header snapshot
- Header/body values are normalized first, then projected via selectors.
- Components no longer promote local fallback as “real backend value”.
- Every fallback is rendered with provenance (`type @ provenance`).

### Semantic `n/a` typing
- `not_returned`
- `not_applicable`
- `not_computed_yet`
- `not_mapped`
- `unknown_by_server`

UI now distinguishes:
- backend not returned vs
- frontend not mapped vs
- not yet computed by runtime.

---

## 4) Button State Machine Matrix (Required Buttons)

| Button | Backend dependencies | Allowed pre-state | Disabled reason rendering | Click refresh stores | Success/failure sync fanout |
|---|---|---|---|---|---|
| Send Mission | `/chat`, mission form fields | not busy | `busy_action:run-mission` | `missionResult`, `missionInspect`, `taskDetail`, `sessionHistory`, `attachments`, optional `skillDetail` | updates Governance Headers / Mission Runtime / Task Control / Plan / Skill |
| Plan Now | `/chat` with `dry_run=true` | console role, not busy | not applicable / busy | same as Send Mission | same as Send Mission |
| Retry | `/mission/{sid}/retry` + inspect retry_action | action session exists, retry allowed | typed missing on action session or retry disallowed reason | `missionInspect`, `missionResult`, maybe `taskDetail` | updates Mission Runtime + Task Control + Plan + Headers |
| Resume | `/mission/{sid}/resume` + inspect resume_action | action session exists, resume allowed | typed missing on action session or resume disallowed reason | `missionInspect`, `missionResult`, maybe `taskDetail` | updates Mission Runtime + Task Control + Plan + Headers |
| Patch Input | `/mission/{sid}/patch-input` | action session exists | typed missing on action session | `missionInspect`, merge mission state into `missionResult` | unblocks missing fields projection and updates control panels |
| Accept | `/task/{id}/acceptance` | task exists + gateway `acceptance` action | typed task-missing reason | `taskDetail`, `approvalQueue` | updates Task Control + Approval Queue + Acceptance status |
| Reject | `/task/{id}/acceptance` | task exists + gateway `acceptance` action | typed task-missing reason | `taskDetail`, `approvalQueue` | updates Task Control + Approval Queue + Acceptance status |
| Approve | `/task/{id}/approval` | task exists + gateway `approval` action | typed task-missing reason | `taskDetail`, `approvalQueue` | updates Task Control + Approval Queue + Approval status |
| Reject Approval | `/task/{id}/approval` | task exists + gateway `approval` action | typed task-missing reason | `taskDetail`, `approvalQueue` | updates Task Control + Approval Queue + Approval status |
| Load Replay | `/task/{id}/replay` | task exists + replay action | typed task-missing reason | `replayData` | updates replay/evidence panels + headers |
| Sign Evidence | `/evidence/sign` | task exists | typed task-missing reason | `evidenceSignPreview` | updates evidence attestation panel and status |
| Refresh Auth | `/auth/me` | not auth refresh busy | `busy_action:auth-snapshot` | `authSnapshot` | sync Operator Context + role chips |
| Refresh Skill | `/skills/{skill_ref}` | active skill exists, skill not busy | typed `skill.active_ref` missing | `skillDetail` | sync Skill Profile + Task Control skill projection |

---

## 5) End-to-End Consistency Validation (Single Session)

- Session ID: `mission-console-1773892386432`
- Artifact JSON:
  - `artifacts/mission-console-canonical-e2e-latest.json`
  - `artifacts/mission-console-canonical-e2e-1773892552986.json`
- UI screenshot:
  - `artifacts/mission-console-final-ui.png`

### Chain A: Empty mission -> plan -> blocked(missing objective)
- `chat_status=400`, `inspect_status=200`
- mission status `blocked`
- blocked step `step_1`
- missing fields `["objective"]`

### Chain B: patch objective -> resume -> task materialized
- `patch_status=200`
- `resume_status=202` (accepted)
- task materialized: `task_5dddb1a414d46dc8c327ed33`
- task terminal status: `completed`

### Chain C: verifier pass -> approval/acceptance change
- task verifier: `passed`
- acceptance action: `200`, task acceptance `accepted`
- approval action: `409` because current task approval state is `not_required` (semantic server state)
- queue stays `0` (no pending approvals)

### Chain D: auth refresh -> operator context sync
- before/after both from `/auth/me`
- same coherent state (no mixed fallback): `authenticated=true`, `subject=anonymous`, `role=admin`, `mode=none`

### Chain E: force skill ref change -> skill/task/planner sync
- force skill: `browser.workflow.task_list.inspect.v1`
- mission skill ref = skill profile ref = task control skill
- selector projection is aligned, `ref_drift=aligned`
- planner projection updated with step count `1`

---

## 6) Acceptance Check Against Requested Criteria

1. Same mission/session/task no longer reads from split truth in updated cards.
2. Overview cards consume canonical store selectors.
3. Missing values are typed semantically, not generic `n/a`.
4. Required action buttons in scope are canonical state-machine driven.
5. Missing input now exposes what is missing and how to continue (via patch + mission action controls).
6. Skill/mission/task/verifier/approval/acceptance chain has single-session proof in artifact.
7. Existing routes/interfaces/styles are preserved; fix is state normalization and selector gating, not visual patching.
