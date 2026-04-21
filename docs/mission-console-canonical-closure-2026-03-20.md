# Mission Console Canonical Closure (2026-03-20)

## Scope
- Surfaces: `console.oliverfr.com` + `agent.oliverfr.com`
- Frontend file: `src/MissionConsole.jsx`
- E2E session: `mission-console-1773972329307`
- E2E artifact: `artifacts/mission-console-canonical-e2e-latest.json`
- Screenshot: `artifacts/mission-console-final-ui.png`

## 1) Field Mapping (Field -> Source -> Path -> Canonical Key -> Selector -> Component)

### 1.1 Operator Context
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Authenticated | `GET /auth/me` body | `auth.authenticated` | `canonicalState.operator.authenticated` | `canonicalDisplay(...)` | `Operator Context / SummaryRow` |
| Subject | `GET /auth/me` body | `auth.subject` | `canonicalState.operator.subject` | `canonicalDisplay(...)` | `Operator Context / SummaryRow` |
| Role | `GET /auth/me` body + config fallback | `auth.role` / `config.default_role` | `canonicalState.operator.role` | `canonicalDisplay(...)` | `Operator Context / SummaryRow` |
| Source | `GET /auth/me` body | `auth.source` | `canonicalState.operator.source` | `canonicalDisplay(...)` | `Operator Context / SummaryRow` |
| Auth Mode | `GET /auth/me` body + config fallback | `auth.mode` / `config.auth_mode` | `canonicalState.operator.authMode` | `canonicalDisplay(...)` | `Operator Context / SummaryRow` |
| RBAC | `GET /auth/me` body | `config.rbac_enabled` | `canonicalState.operator.rbac` | `canonicalDisplay(...)` | `Operator Context / SummaryRow` |
| Evidence Sign | `GET /auth/me` body | `config.evidence_sign_mode` | `canonicalState.operator.evidenceSign` | `canonicalDisplay(...)` | `Operator Context / SummaryRow` |

### 1.2 Governance Overview
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Runtime | chat response body | `autocontext_compiler.schema_version` | `canonicalState.governanceOverview.runtimeSchema` | `canonicalDisplay(...)` | `Governance Overview` |
| Projection | chat response body | `mission_console_projection.compiler.context_compiler_mode` | `canonicalState.governanceOverview.projectionMode` | `canonicalDisplay(...)` | `Governance Overview` |

### 1.3 Governance Headers
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Route Contract | response headers | `x-ac-route-contract-version` | `canonicalState.governanceHeaders.routeContract` | `canonicalDisplay(...)` | `Governance Headers` |
| Context Plan | response headers | `x-ac-context-plan-id` | `canonicalState.governanceHeaders.contextPlan` | `canonicalDisplay(...)` | `Governance Headers` |
| Verifier | response headers | `x-ac-verifier-mesh` | `canonicalState.governanceHeaders.verifier` | `canonicalDisplay(...)` | `Governance Headers` |
| Checkpoint | response headers | `x-ac-checkpoint-id` | `canonicalState.governanceHeaders.checkpoint` | `canonicalDisplay(...)` | `Governance Headers` |
| Version Gov | response headers | `x-ac-version-gov` | `canonicalState.governanceHeaders.versionGov` | `canonicalDisplay(...)` | `Governance Headers` |

### 1.4 Mission Runtime Control
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Inspect Session | mission inspect body | `session_id` | `canonicalState.missionControl.inspectSession` | `canonicalDisplay(...)` | `Mission Runtime Control` |
| Action Session | derived session id | inspect/state/session | `canonicalState.missionControl.actionSession` | `canonicalDisplay(...)` | `Mission Runtime Control` |
| Mission Type | inspect/state body | `mission_type` | `canonicalState.missionControl.missionType` | `canonicalDisplay(...)` | `Mission Runtime Control` |
| Mission Status | inspect/state/chat | `status` | `canonicalState.missionControl.missionStatus` | `canonicalDisplay(...)` | `Mission Runtime Control` |
| State Materialized | inspect flag | `found` + mission ids | `canonicalState.missionControl.stateMaterialized` | `canonicalDisplay(...)` | `Mission Runtime Control` |
| Blocked Step | inspect/state | `current_blocked_step` / `blocked_step.step_id` | `canonicalState.missionControl.blockedStep` | `canonicalDisplay(...)` | `Mission Runtime Control` |

### 1.5 Task Control
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Current Task | task detail + inspect fallback | `task.task_id` / `mission_inspection.task_ref.task_id` | `canonicalState.taskControl.currentTask` | `canonicalDisplay(...)` | `Task Control` |
| Mission Status | inspect/state/chat | `status` | `canonicalState.taskControl.missionStatus` | `canonicalDisplay(...)` | `Task Control` |
| Skill | chat/task | `mission.skill_ref` / `task.skill_ref` | `canonicalState.taskControl.skill` | `canonicalDisplay(...)` | `Task Control` |
| Verifier | task detail | `task.verifier.status` | `canonicalState.taskControl.verifier` | `canonicalDisplay(...)` | `Task Control` |
| Recovery | task detail | `task.recovery.status` | `canonicalState.taskControl.recovery` | `canonicalDisplay(...)` | `Task Control` |
| Approval | task detail | `task.approval.status` | `canonicalState.taskControl.approval` | `canonicalDisplay(...)` | `Task Control` |
| Acceptance | task detail | `task.acceptance.status` | `canonicalState.taskControl.acceptance` | `canonicalDisplay(...)` | `Task Control` |
| AutoContext | chat body + bootstrap fallback | `mission.autocontext` / `config.autocontext` | `canonicalState.taskControl.autocontext` | `canonicalDisplay(...)` | `Task Control` |
| Plan Steps | mission/task architect | `mission.plan_graph.step_count` / `task.architect.step_count` | `canonicalState.taskControl.planSteps` | `canonicalDisplay(...)` | `Task Control` |

### 1.6 Approval Queue
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Pending Count | `GET /approval/pending` body | `items.length` | `canonicalState.approvalQueue.pendingCount` | `canonicalDisplay(...)` | `Approval Queue` |

### 1.7 Plan & Preflight
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Status | task architect preflight | `task.architect.preflight.status` | `canonicalState.plan.status` | `canonicalDisplay(...)` | `Plan and Preflight` |
| Primary Path | task architect | `selected_path_primary` | `canonicalState.plan.primaryPath` | `canonicalDisplay(...)` | `Plan and Preflight` |
| Nodes | task architect | `node_count` | `canonicalState.plan.nodes` | `canonicalDisplay(...)` | `Plan and Preflight` |
| Approval Points | task architect | `approval_point_count` | `canonicalState.plan.approvalPoints` | `canonicalDisplay(...)` | `Plan and Preflight` |
| Failure Branches | task architect | `failure_branch_count` | `canonicalState.plan.failureBranches` | `canonicalDisplay(...)` | `Plan and Preflight` |

### 1.8 Skill Profile
| Field | Source | Path | Canonical key | Selector | Component |
|---|---|---|---|---|---|
| Force Skill Ref | form input | `skillRef` | `canonicalState.skillProfile.forceSkillRef` | `canonicalDisplay(...)` | `Skill Profile` |
| Selected Skill Ref | selected state | `selectedSkillRef` | `canonicalState.skillProfile.selectedSkillRef` | `canonicalDisplay(...)` | `Skill Profile` |
| Mission Skill Ref | chat/task body | `mission.skill_ref` / `task.skill_ref` | `canonicalState.skillProfile.missionSkillRef` | `canonicalDisplay(...)` | `Skill Profile` |
| Active Skill Ref | selector merge | selected -> mission -> task -> force | `canonicalState.skillProfile.activeSkillRef` | `canonicalDisplay(...)` | `Skill Profile` |
| Ref Drift | derived compare | selected vs mission | `canonicalState.skillProfile.refDrift` | `canonicalDisplay(...)` | `Skill Profile` |
| Skill Ref | skill detail body | `skill.skill_ref` | `canonicalState.skillProfile.skillRef` | `canonicalDisplay(...)` | `Skill Profile` |

## 2) Root Cause (Current Inconsistency)

1. Button unclickable / wrong exposure:
- Root cause A: stale/local sentinel task id (`none/null/n/a`) was treated as valid task.
- Root cause B: inspect/session switch did not force task-ref reconciliation; old task state could stay in action state machine.
- Fixed by: `normalizeTaskReference` + inspect-driven task-id sync + stale task detail cleanup + scoped mission payload.

2. `authenticated=yes` with `anonymous/admin/none/disabled`:
- This is coherent in `auth_mode=none` backend config, not protocol conflict.
- UI now keeps provenance per field so it no longer looks like mixed fallback truth.

3. Headers present but overview empty:
- fixed via canonical normalization fed by same run data; no per-card ad-hoc fallback.

4. Skill drift:
- fixed via canonical `force/selected/mission/active` chain and drift flag.

## 3) Semantic Missing Types
- `not_returned`
- `not_applicable`
- `not_computed_yet`
- `not_mapped`
- `unknown_by_server`

## 4) E2E (Same Session) Result
- Session: `mission-console-1773972329307`
- A: empty mission inspect -> `blocked`, `step_1`, missing `objective`
- B: patch objective+messages -> resume `202` -> task `task_873a931164de161cac3676b1` materialized/completed
- C: verifier `passed`; acceptance `200` -> accepted; approval `409` with `not_required`
- D: auth refresh before/after stable and coherent
- E: force skill ref = mission skill ref = skill profile ref = selector skill (`browser.workflow.task_list.inspect.v1`)

## 5) Artifacts
- `artifacts/mission-console-canonical-e2e-latest.json`
- `artifacts/mission-console-raw-interfaces-latest.json`
- `artifacts/mission-console-raw-headers-latest.json`
- `artifacts/mission-console-canonical-state-latest.json`
- `artifacts/mission-console-selectors-latest.json`
- `artifacts/mission-console-final-ui.png`
