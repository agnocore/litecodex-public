const hostBase = "http://127.0.0.1:4317";

const fallbackLimits = {
  uiEventBufferMax: 16,
  runListMax: 8,
  stepTimelineMax: 16
};

const modeDefaultCapabilityBase = {
  browser_oauth: "cloudflare.account.authenticated",
  cli_login: "vercel.account.authenticated",
  token_input: "supabase.project.read",
  device_code: "ssh.host.x"
};

const preferredRecipeByMode = {
  browser_oauth: "wrangler_oauth_login",
  cli_login: "recipe.vercel_cli_login.real.v1",
  token_input: "supabase_token_input",
  device_code: "recipe.device_code.local.v1"
};

let runtimeProfile = { id: "lite_8gb", limits: { ...fallbackLimits }, deferred_lanes: [] };
let eventBufferLimit = fallbackLimits.uiEventBufferMax;
let runListLimit = fallbackLimits.runListMax;
let stepTimelineLimit = fallbackLimits.stepTimelineMax;

let visibleRuns = [];
let activeAuthSessionId = null;
let latestGrantId = null;

const eventBuffer = [];
const timelineBuffer = [];
const grantBuffer = [];
const resumedBuffer = [];
const smokeCaseStatusMap = {};
let pendingApprovalRows = [];

const runtimeProfileBadge = document.getElementById("runtimeProfileBadge");
const hostStatus = document.getElementById("hostStatus");
const activeRunStatus = document.getElementById("activeRunStatus");
const guardrailStatus = document.getElementById("guardrailStatus");
const keyState = document.getElementById("keyState");

const currentActionLine = document.getElementById("currentActionLine");
const timelinePanel = document.getElementById("timelinePanel");
const runsPanel = document.getElementById("runsPanel");
const runListMeta = document.getElementById("runListMeta");
const eventsPanel = document.getElementById("eventsPanel");
const eventMeta = document.getElementById("eventMeta");

const recipeVerifierPanel = document.getElementById("recipeVerifierPanel");
const adapterStatePanel = document.getElementById("adapterStatePanel");
const projectInspectSummaryPanel = document.getElementById("projectInspectSummaryPanel");
const workspaceTrustStatusPanel = document.getElementById("workspaceTrustStatusPanel");
const detectedToolsPanel = document.getElementById("detectedToolsPanel");
const toolDiscoveryStatusPanel = document.getElementById("toolDiscoveryStatusPanel");
const missingToolPanel = document.getElementById("missingToolPanel");
const adapterInstallRequiredPanel = document.getElementById("adapterInstallRequiredPanel");
const toolInstallProposalPanel = document.getElementById("toolInstallProposalPanel");
const toolInstallPolicyPanel = document.getElementById("toolInstallPolicyPanel");
const toolInstallRunPanel = document.getElementById("toolInstallRunPanel");
const toolInstallRollbackSnapshotPanel = document.getElementById("toolInstallRollbackSnapshotPanel");
const phase3CloseoutStatusPanel = document.getElementById("phase3CloseoutStatusPanel");
const toolInstallRollbackStatusPanel = document.getElementById("toolInstallRollbackStatusPanel");
const hashVerificationStatusPanel = document.getElementById("hashVerificationStatusPanel");
const gitVerificationStatusPanel = document.getElementById("gitVerificationStatusPanel");
const smokeSuiteCaseListPanel = document.getElementById("smokeSuiteCaseListPanel");
const smokeSuiteResultPanel = document.getElementById("smokeSuiteResultPanel");
const consistencyCheckResultPanel = document.getElementById("consistencyCheckResultPanel");
const phase4ReadinessStatusPanel = document.getElementById("phase4ReadinessStatusPanel");
const readinessBlockedReasonsPanel = document.getElementById("readinessBlockedReasonsPanel");
const hydrationStatusPanel = document.getElementById("hydrationStatusPanel");
const loadedEventsCountPanel = document.getElementById("loadedEventsCountPanel");
const loadedTablesPanel = document.getElementById("loadedTablesPanel");
const reconnectStatusPanel = document.getElementById("reconnectStatusPanel");
const cursorStatusPanel = document.getElementById("cursorStatusPanel");
const missedEventsPanel = document.getElementById("missedEventsPanel");
const resumeStatusPanel = document.getElementById("resumeStatusPanel");
const resumableReasonPanel = document.getElementById("resumableReasonPanel");
const baselineBindingStatusPanel = document.getElementById("baselineBindingStatusPanel");
const baselineBindingIdsPanel = document.getElementById("baselineBindingIdsPanel");
const finalProjectionStatusPanel = document.getElementById("finalProjectionStatusPanel");
const hydrateModePanel = document.getElementById("hydrateModePanel");
const deltaFromSeqPanel = document.getElementById("deltaFromSeqPanel");
const compactStatusPanel = document.getElementById("compactStatusPanel");
const compactTriggerTypePanel = document.getElementById("compactTriggerTypePanel");
const compactSourceRangePanel = document.getElementById("compactSourceRangePanel");
const compactArtifactPathPanel = document.getElementById("compactArtifactPathPanel");
const compactIntegrityHashPanel = document.getElementById("compactIntegrityHashPanel");
const compactFallbackReasonPanel = document.getElementById("compactFallbackReasonPanel");
const staleRecoveryStatusPanel = document.getElementById("staleRecoveryStatusPanel");
const forkStatusPanel = document.getElementById("forkStatusPanel");
const forkPolicyStatusPanel = document.getElementById("forkPolicyStatusPanel");
const ancestryRelationPanel = document.getElementById("ancestryRelationPanel");
const policyActionForkPanel = document.getElementById("policyActionForkPanel");
const redirectedTargetPanel = document.getElementById("redirectedTargetPanel");
const sourceRunIdPanel = document.getElementById("sourceRunIdPanel");
const forkRunIdPanel = document.getElementById("forkRunIdPanel");
const forkBaselinePanel = document.getElementById("forkBaselinePanel");
const lineageTypePanel = document.getElementById("lineageTypePanel");
const forkWorkspacePanel = document.getElementById("forkWorkspacePanel");
const artifactMappingStatusPanel = document.getElementById("artifactMappingStatusPanel");
const sourceStatusPanel = document.getElementById("sourceStatusPanel");
const forkRunStatusPanel = document.getElementById("forkRunStatusPanel");
const lineageListPanel = document.getElementById("lineageListPanel");
const forkLifecyclePanel = document.getElementById("forkLifecyclePanel");
const contextProjectionStatusPanel = document.getElementById("contextProjectionStatusPanel");
const projectionIntegrityPanel = document.getElementById("projectionIntegrityPanel");
const phase4CloseoutStatusPanel = document.getElementById("phase4CloseoutStatusPanel");
const phase5ReadinessStatusPanel = document.getElementById("phase5ReadinessStatusPanel");
const phase5AllowedInputsPanel = document.getElementById("phase5AllowedInputsPanel");
const phase5ForbiddenActionsPanel = document.getElementById("phase5ForbiddenActionsPanel");
const browserDiscoveryStatusPanel = document.getElementById("browserDiscoveryStatusPanel");
const localBrowserPathPanel = document.getElementById("localBrowserPathPanel");
const browserPolicyStatusPanel = document.getElementById("browserPolicyStatusPanel");
const browserSmokeStatusPanel = document.getElementById("browserSmokeStatusPanel");
const deployAdapterDiscoveryStatusPanel = document.getElementById("deployAdapterDiscoveryStatusPanel");
const deployAdapterReadonlyStatePanel = document.getElementById("deployAdapterReadonlyStatePanel");
const deployPolicyStatusPanel = document.getElementById("deployPolicyStatusPanel");
const deployRejectedReasonPanel = document.getElementById("deployRejectedReasonPanel");
const phase5aReadinessPanel = document.getElementById("phase5aReadinessPanel");
const phase5bReadinessPanel = document.getElementById("phase5bReadinessPanel");
const phase5cReadinessPanel = document.getElementById("phase5cReadinessPanel");
const playwrightDiscoveryStatusPanel = document.getElementById("playwrightDiscoveryStatusPanel");
const playwrightCliStatusPanel = document.getElementById("playwrightCliStatusPanel");
const playwrightBrowserBinaryStatusPanel = document.getElementById("playwrightBrowserBinaryStatusPanel");
const playwrightInstallRequiredPanel = document.getElementById("playwrightInstallRequiredPanel");
const playwrightInstallStatusPanel = document.getElementById("playwrightInstallStatusPanel");
const playwrightRuntimeProfilePanel = document.getElementById("playwrightRuntimeProfilePanel");
const playwrightChannelPanel = document.getElementById("playwrightChannelPanel");
const browserMatrixStatusPanel = document.getElementById("browserMatrixStatusPanel");
const browserMatrixRerunScopePanel = document.getElementById("browserMatrixRerunScopePanel");
const browserMatrixRerunCasePanel = document.getElementById("browserMatrixRerunCasePanel");
const browserMatrixCurrentActionPanel = document.getElementById("browserMatrixCurrentActionPanel");
const browserMatrixBlockedReasonPanel = document.getElementById("browserMatrixBlockedReasonPanel");
const browserVerificationGatePanel = document.getElementById("browserVerificationGatePanel");
const phase5aBlockedReasonsPanel = document.getElementById("phase5aBlockedReasonsPanel");
const phase5aAllowedInputsPanel = document.getElementById("phase5aAllowedInputsPanel");
const phase5aForbiddenActionsPanel = document.getElementById("phase5aForbiddenActionsPanel");
const phase5bBlockedReasonsPanel = document.getElementById("phase5bBlockedReasonsPanel");
const phase5bPreviousBlockerPanel = document.getElementById("phase5bPreviousBlockerPanel");
const phase5bBlockerResolvedPanel = document.getElementById("phase5bBlockerResolvedPanel");
const phase5bNewBlockedPanel = document.getElementById("phase5bNewBlockedPanel");
const phase5bAllowedInputsPanel = document.getElementById("phase5bAllowedInputsPanel");
const phase5bForbiddenActionsPanel = document.getElementById("phase5bForbiddenActionsPanel");
const phase5cBlockedPanel = document.getElementById("phase5cBlockedPanel");
const phase5cAllowedTargetsPanel = document.getElementById("phase5cAllowedTargetsPanel");
const phase5cForbiddenActionsPanel = document.getElementById("phase5cForbiddenActionsPanel");
const approvalPendingListPanel = document.getElementById("approvalPendingListPanel");
const approvalPendingDetailPanel = document.getElementById("approvalPendingDetailPanel");
const approvalDecisionStatusPanel = document.getElementById("approvalDecisionStatusPanel");
const approvalContinuationStatusPanel = document.getElementById("approvalContinuationStatusPanel");
const phase5dReadinessPanel = document.getElementById("phase5dReadinessPanel");
const phase5dBlockedPanel = document.getElementById("phase5dBlockedPanel");
const phase5dAllowedTargetsPanel = document.getElementById("phase5dAllowedTargetsPanel");
const phase5dForbiddenActionsPanel = document.getElementById("phase5dForbiddenActionsPanel");
const e2bRoutingDecisionPanel = document.getElementById("e2bRoutingDecisionPanel");
const e2bFinalLanePanel = document.getElementById("e2bFinalLanePanel");
const e2bDiscoveryPanel = document.getElementById("e2bDiscoveryPanel");
const e2bSandboxCreatePanel = document.getElementById("e2bSandboxCreatePanel");
const e2bExecutionPanel = document.getElementById("e2bExecutionPanel");
const e2bArtifactPanel = document.getElementById("e2bArtifactPanel");
const e2bTeardownPanel = document.getElementById("e2bTeardownPanel");
const phase6aReadinessPanel = document.getElementById("phase6aReadinessPanel");
const phase6aBlockedPanel = document.getElementById("phase6aBlockedPanel");
const phase6bTaskPanel = document.getElementById("phase6bTaskPanel");
const phase6bFailurePanel = document.getElementById("phase6bFailurePanel");
const phase6bFallbackPanel = document.getElementById("phase6bFallbackPanel");
const phase6bSameRunPanel = document.getElementById("phase6bSameRunPanel");
const phase6bReadinessPanel = document.getElementById("phase6bReadinessPanel");
const phase6bBlockedPanel = document.getElementById("phase6bBlockedPanel");
const phase6bFallbackEnabledPanel = document.getElementById("phase6bFallbackEnabledPanel");
const phase6bNonFallbackPanel = document.getElementById("phase6bNonFallbackPanel");
const phase6cTaskTypePanel = document.getElementById("phase6cTaskTypePanel");
const phase6cDiffSummaryPanel = document.getElementById("phase6cDiffSummaryPanel");
const phase6cHashStatusPanel = document.getElementById("phase6cHashStatusPanel");
const phase6cGateStatusPanel = document.getElementById("phase6cGateStatusPanel");
const phase6cApplyRejectPanel = document.getElementById("phase6cApplyRejectPanel");
const phase6cRejectReasonPanel = document.getElementById("phase6cRejectReasonPanel");
const phase6cVerifyPanel = document.getElementById("phase6cVerifyPanel");
const phase6cReadinessPanel = document.getElementById("phase6cReadinessPanel");
const phase6cV1CloseoutPanel = document.getElementById("phase6cV1CloseoutPanel");
const phase6cListsPanel = document.getElementById("phase6cListsPanel");
const workspaceWorkingRootPanel = document.getElementById("workspaceWorkingRootPanel");
const workspaceStorageRootsPanel = document.getElementById("workspaceStorageRootsPanel");
const workspacePathJailPanel = document.getElementById("workspacePathJailPanel");
const deployCloseoutPanel = document.getElementById("deployCloseoutPanel");
const deployRetryStatusPanel = document.getElementById("deployRetryStatusPanel");
const releaseReceiptPanel = document.getElementById("releaseReceiptPanel");
const onlineVerificationPanel = document.getElementById("onlineVerificationPanel");
const finalOperationalReadinessPanel = document.getElementById("finalOperationalReadinessPanel");
const operationalBlockedPanel = document.getElementById("operationalBlockedPanel");
const externalProviderPanel = document.getElementById("externalProviderPanel");
const externalTargetPanel = document.getElementById("externalTargetPanel");
const externalAllowlistPanel = document.getElementById("externalAllowlistPanel");
const approvalEscalationPanel = document.getElementById("approvalEscalationPanel");
const externalVerificationPanel = document.getElementById("externalVerificationPanel");
const externalSelectorTextPanel = document.getElementById("externalSelectorTextPanel");
const externalScreenshotPanel = document.getElementById("externalScreenshotPanel");
const isolationResultPanel = document.getElementById("isolationResultPanel");
const commandCwdPanel = document.getElementById("commandCwdPanel");
const failedCommandPanel = document.getElementById("failedCommandPanel");
const adjustedCommandPanel = document.getElementById("adjustedCommandPanel");
const adjustedCwdPanel = document.getElementById("adjustedCwdPanel");
const commandPolicyPanel = document.getElementById("commandPolicyPanel");
const authSessionStatusPanel = document.getElementById("authSessionStatusPanel");
const authCommandPanel = document.getElementById("authCommandPanel");
const tokenState = document.getElementById("tokenState");
const verificationStatus = document.getElementById("verificationStatus");
const gitStatusSummaryPanel = document.getElementById("gitStatusSummaryPanel");
const gitDiffSummaryPanel = document.getElementById("gitDiffSummaryPanel");
const verifyStatusPanel = document.getElementById("verifyStatusPanel");
const verifyAttemptPanel = document.getElementById("verifyAttemptPanel");
const attemptBudgetPanel = document.getElementById("attemptBudgetPanel");
const timeoutMsPanel = document.getElementById("timeoutMsPanel");
const verifyFailurePanel = document.getElementById("verifyFailurePanel");
const failureClassPanel = document.getElementById("failureClassPanel");
const missingDependencyPanel = document.getElementById("missingDependencyPanel");
const dependencyInstallProposalPanel = document.getElementById("dependencyInstallProposalPanel");
const installPolicyStatusPanel = document.getElementById("installPolicyStatusPanel");
const installStatusPanel = document.getElementById("installStatusPanel");
const ioSummaryPanel = document.getElementById("ioSummaryPanel");
const repairActionPanel = document.getElementById("repairActionPanel");
const repairStrategyPanel = document.getElementById("repairStrategyPanel");
const candidateFilesPanel = document.getElementById("candidateFilesPanel");
const patchProposalPanel = document.getElementById("patchProposalPanel");
const policyStatusPanel = document.getElementById("policyStatusPanel");
const filesChangedPanel = document.getElementById("filesChangedPanel");
const diffArtifactPanel = document.getElementById("diffArtifactPanel");
const rollbackSnapshotPanel = document.getElementById("rollbackSnapshotPanel");
const installRollbackSnapshotIdPanel = document.getElementById("installRollbackSnapshotIdPanel");
const installRollbackAffectedFilesPanel = document.getElementById("installRollbackAffectedFilesPanel");
const installRollbackStatusPanel = document.getElementById("installRollbackStatusPanel");
const installRollbackVerificationPanel = document.getElementById("installRollbackVerificationPanel");
const replayTypePanel = document.getElementById("replayTypePanel");
const replaySourcePanel = document.getElementById("replaySourcePanel");
const replayPolicyStatusPanel = document.getElementById("replayPolicyStatusPanel");
const replayCommandSummaryPanel = document.getElementById("replayCommandSummaryPanel");
const replayFinalStatusPanel = document.getElementById("replayFinalStatusPanel");
const verifyRetryPanel = document.getElementById("verifyRetryPanel");
const replayEvidencePanel = document.getElementById("replayEvidencePanel");
const finalStatusPanel = document.getElementById("finalStatusPanel");
const controlledFailedPanel = document.getElementById("controlledFailedPanel");
const grantsPanel = document.getElementById("grantsPanel");
const stepResumedPanel = document.getElementById("stepResumedPanel");

const authPendingBanner = document.getElementById("authPendingBanner");
const reconnectBanner = document.getElementById("reconnectBanner");
const compactBanner = document.getElementById("compactBanner");
const reviewPanel = document.getElementById("reviewPanel");
const fileSummaryPanel = document.getElementById("fileSummaryPanel");
const vercelAuthStatusPanel = document.getElementById("vercelAuthStatusPanel");
const wranglerAuthStatusPanel = document.getElementById("wranglerAuthStatusPanel");
const supabaseAuthStatusPanel = document.getElementById("supabaseAuthStatusPanel");

const authModeSelect = document.getElementById("authModeSelect");
const phase3eCaseSelect = document.getElementById("phase3eCaseSelect");
const phase3fCaseSelect = document.getElementById("phase3fCaseSelect");
const phase3gCaseSelect = document.getElementById("phase3gCaseSelect");
const phase4aCaseSelect = document.getElementById("phase4aCaseSelect");
const phase4bCaseSelect = document.getElementById("phase4bCaseSelect");
const phase4cSourceCaseSelect = document.getElementById("phase4cSourceCaseSelect");
const phase5aCaseSelect = document.getElementById("phase5aCaseSelect");
const phase5bCaseSelect = document.getElementById("phase5bCaseSelect");
const phase5cCaseSelect = document.getElementById("phase5cCaseSelect");
const phase5dCaseSelect = document.getElementById("phase5dCaseSelect");
const phase6aCaseSelect = document.getElementById("phase6aCaseSelect");
const phase6bCaseSelect = document.getElementById("phase6bCaseSelect");
const phase6cCaseSelect = document.getElementById("phase6cCaseSelect");
const workspaceDeployCaseSelect = document.getElementById("workspaceDeployCaseSelect");
const capabilityInput = document.getElementById("capabilityInput");
const forceAuthChallenge = document.getElementById("forceAuthChallenge");
const createRunBtn = document.getElementById("createRunBtn");
const createPhase3eRunBtn = document.getElementById("createPhase3eRunBtn");
const createPhase3fRunBtn = document.getElementById("createPhase3fRunBtn");
const createPhase3gRunBtn = document.getElementById("createPhase3gRunBtn");
const createPhase4aRunBtn = document.getElementById("createPhase4aRunBtn");
const createPhase4bRunBtn = document.getElementById("createPhase4bRunBtn");
const createPhase4cSourceRunBtn = document.getElementById("createPhase4cSourceRunBtn");
const createPhase5aRunBtn = document.getElementById("createPhase5aRunBtn");
const createPhase5bRunBtn = document.getElementById("createPhase5bRunBtn");
const createPhase5cRunBtn = document.getElementById("createPhase5cRunBtn");
const createPhase5dRunBtn = document.getElementById("createPhase5dRunBtn");
const createPhase6aRunBtn = document.getElementById("createPhase6aRunBtn");
const createPhase6bRunBtn = document.getElementById("createPhase6bRunBtn");
const createPhase6cRunBtn = document.getElementById("createPhase6cRunBtn");
const createWorkspaceDeployRunBtn = document.getElementById("createWorkspaceDeployRunBtn");
const reloadRunsBtn = document.getElementById("reloadRunsBtn");
const saveKeyBtn = document.getElementById("saveKeyBtn");
const clearKeyBtn = document.getElementById("clearKeyBtn");
const byoKeyInput = document.getElementById("byoKey");
const byoProfileIdInput = document.getElementById("byoProfileId");
const byoScopeSelect = document.getElementById("byoScopeSelect");
const bindByoBtn = document.getElementById("bindByoBtn");
const validateByoBtn = document.getElementById("validateByoBtn");
const revalidateByoBtn = document.getElementById("revalidateByoBtn");
const unbindByoBtn = document.getElementById("unbindByoBtn");
const deleteByoBtn = document.getElementById("deleteByoBtn");
const freezeRetrievalDesignBtn = document.getElementById("freezeRetrievalDesignBtn");
const byoExactCaseSelect = document.getElementById("byoExactCaseSelect");
const createByoExactRunBtn = document.getElementById("createByoExactRunBtn");
const retrievalMultiCaseSelect = document.getElementById("retrievalMultiCaseSelect");
const createRetrievalMultiRunBtn = document.getElementById("createRetrievalMultiRunBtn");
const retrievalGovernanceCaseSelect = document.getElementById("retrievalGovernanceCaseSelect");
const createRetrievalGovernanceRunBtn = document.getElementById("createRetrievalGovernanceRunBtn");
const systemAcceptanceStorySelect = document.getElementById("systemAcceptanceStorySelect");
const createSystemAcceptanceRunBtn = document.getElementById("createSystemAcceptanceRunBtn");
const engineeringStorySelect = document.getElementById("engineeringStorySelect");
const createTaskEngineeringRunBtn = document.getElementById("createTaskEngineeringRunBtn");
const transportCaseSelect = document.getElementById("transportCaseSelect");
const createOpenAiTransportRunBtn = document.getElementById("createOpenAiTransportRunBtn");
const byoBindingStatusPanel = document.getElementById("byoBindingStatusPanel");
const byoValidationStatusPanel = document.getElementById("byoValidationStatusPanel");
const byoScopeVerifiedPanel = document.getElementById("byoScopeVerifiedPanel");
const byoChallengePanel = document.getElementById("byoChallengePanel");
const retrievalStatusPanel = document.getElementById("retrievalStatusPanel");
const retrievalDecisionPanel = document.getElementById("retrievalDecisionPanel");
const retrievalHitsPanel = document.getElementById("retrievalHitsPanel");
const retrievalDesignFrozenPanel = document.getElementById("retrievalDesignFrozenPanel");
const retrievalProviderChainPanel = document.getElementById("retrievalProviderChainPanel");
const retrievalFetchTargetsPanel = document.getElementById("retrievalFetchTargetsPanel");
const retrievalHealthPanel = document.getElementById("retrievalHealthPanel");
const retrievalReadinessPanel = document.getElementById("retrievalReadinessPanel");
const retrievalBlockedPanel = document.getElementById("retrievalBlockedPanel");
const retrievalCrawlDisabledPanel = document.getElementById("retrievalCrawlDisabledPanel");
const retrievalCitationGatePanel = document.getElementById("retrievalCitationGatePanel");
const retrievalConflictPanel = document.getElementById("retrievalConflictPanel");
const retrievalBudgetPanel = document.getElementById("retrievalBudgetPanel");
const retrievalBundleStatusPanel = document.getElementById("retrievalBundleStatusPanel");
const acceptanceChainStatusPanel = document.getElementById("acceptanceChainStatusPanel");
const acceptanceCheckpointSummaryPanel = document.getElementById("acceptanceCheckpointSummaryPanel");
const acceptanceExercisedModulesPanel = document.getElementById("acceptanceExercisedModulesPanel");
const acceptanceNonBlockingPanel = document.getElementById("acceptanceNonBlockingPanel");
const acceptanceDeferredPanel = document.getElementById("acceptanceDeferredPanel");
const acceptanceFinalReadinessPanel = document.getElementById("acceptanceFinalReadinessPanel");
const engineeringIntentPanel = document.getElementById("engineeringIntentPanel");
const engineeringStackProfilePanel = document.getElementById("engineeringStackProfilePanel");
const engineeringSkillsPanel = document.getElementById("engineeringSkillsPanel");
const engineeringVerifyPlanPanel = document.getElementById("engineeringVerifyPlanPanel");
const engineeringReviewGatePanel = document.getElementById("engineeringReviewGatePanel");
const engineeringRepairPanel = document.getElementById("engineeringRepairPanel");
const engineeringTaskStatusPanel = document.getElementById("engineeringTaskStatusPanel");
const engineeringReadinessPanel = document.getElementById("engineeringReadinessPanel");
const openaiTransportRoutePanel = document.getElementById("openaiTransportRoutePanel");
const openaiTransportProbePanel = document.getElementById("openaiTransportProbePanel");
const openaiTransportFinalPanel = document.getElementById("openaiTransportFinalPanel");
const externalRunnerRegistryStatusPanel = document.getElementById("externalRunnerRegistryStatusPanel");
const externalRunnerJobStatusPanel = document.getElementById("externalRunnerJobStatusPanel");
const externalRunnerArtifactSyncStatusPanel = document.getElementById("externalRunnerArtifactSyncStatusPanel");
const externalAndroidLaneStatusPanel = document.getElementById("externalAndroidLaneStatusPanel");
const androidSdkStatusPanel = document.getElementById("androidSdkStatusPanel");
const androidFulfillmentStatusPanel = document.getElementById("androidFulfillmentStatusPanel");
const androidBuildVerifyStatusPanel = document.getElementById("androidBuildVerifyStatusPanel");
const flutterAndroidStatusPanel = document.getElementById("flutterAndroidStatusPanel");
const externalAppleStoreBoundaryStatusPanel = document.getElementById("externalAppleStoreBoundaryStatusPanel");
const externalExpansionReadinessPanel = document.getElementById("externalExpansionReadinessPanel");

const tokenInput = document.getElementById("tokenInput");
const submitTokenBtn = document.getElementById("submitTokenBtn");
const confirmActionBtn = document.getElementById("confirmActionBtn");
const cancelAuthBtn = document.getElementById("cancelAuthBtn");
const revokeGrantBtn = document.getElementById("revokeGrantBtn");
const phase4aRunIdInput = document.getElementById("phase4aRunIdInput");
const sinceSeqInput = document.getElementById("sinceSeqInput");
const clientIdInput = document.getElementById("clientIdInput");
const hydrateRunBtn = document.getElementById("hydrateRunBtn");
const hydrateCompactRunBtn = document.getElementById("hydrateCompactRunBtn");
const reconnectRunBtn = document.getElementById("reconnectRunBtn");
const resumeRunBtn = document.getElementById("resumeRunBtn");
const compactRunBtn = document.getElementById("compactRunBtn");
const loadCompactBtn = document.getElementById("loadCompactBtn");
const loadProjectionBtn = document.getElementById("loadProjectionBtn");
const staleRecoverBtn = document.getElementById("staleRecoverBtn");
const baselineRunIdInput = document.getElementById("baselineRunIdInput");
const smokeRunIdInput = document.getElementById("smokeRunIdInput");
const consistencyRunIdInput = document.getElementById("consistencyRunIdInput");
const readinessRunIdInput = document.getElementById("readinessRunIdInput");
const evidenceRootInput = document.getElementById("evidenceRootInput");
const bindBaselineBtn = document.getElementById("bindBaselineBtn");
const forkReasonInput = document.getElementById("forkReasonInput");
const forkModeSelect = document.getElementById("forkModeSelect");
const forkTargetWorkspaceInput = document.getElementById("forkTargetWorkspaceInput");
const forkAutoRedirectInput = document.getElementById("forkAutoRedirectInput");
const createForkBtn = document.getElementById("createForkBtn");
const loadLineageBtn = document.getElementById("loadLineageBtn");
const loadForksBtn = document.getElementById("loadForksBtn");
const phase4CloseoutRunIdInput = document.getElementById("phase4CloseoutRunIdInput");
const phase4ModuleRunIdsInput = document.getElementById("phase4ModuleRunIdsInput");
const phase4ProjectionRunIdsInput = document.getElementById("phase4ProjectionRunIdsInput");
const runPhase4CloseoutBtn = document.getElementById("runPhase4CloseoutBtn");
const phase5ReadinessRunIdInput = document.getElementById("phase5ReadinessRunIdInput");
const phase5CloseoutRunIdInput = document.getElementById("phase5CloseoutRunIdInput");
const phase5ProjectionRunIdsInput = document.getElementById("phase5ProjectionRunIdsInput");
const runPhase5ReadinessBtn = document.getElementById("runPhase5ReadinessBtn");
const pendingApprovalSelect = document.getElementById("pendingApprovalSelect");
const refreshPendingApprovalsBtn = document.getElementById("refreshPendingApprovalsBtn");
const approvePendingBtn = document.getElementById("approvePendingBtn");
const rejectPendingBtn = document.getElementById("rejectPendingBtn");

function trimBuffer(buffer, max) {
  while (buffer.length > max) {
    buffer.pop();
  }
}

function modeCapabilityTemplate(mode) {
  const base = modeDefaultCapabilityBase[mode] || "capability.unknown";
  if (mode === "cli_login" || mode === "browser_oauth" || mode === "token_input") {
    return base;
  }
  return `${base}.demo.${Date.now()}`;
}

function isVercelEvent(evt) {
  const p = evt?.payload || {};
  return (
    String(p.required_capability || "").startsWith("vercel.") ||
    String(p.selected_recipe_id || "").includes("vercel") ||
    String(p.selected_verifier_id || "").includes("vercel") ||
    String(p.platform || "").includes("vercel")
  );
}

function isWranglerEvent(evt) {
  const p = evt?.payload || {};
  return (
    String(p.required_capability || "").startsWith("cloudflare.") ||
    String(p.required_capability || "").startsWith("wrangler.") ||
    String(p.selected_recipe_id || "").includes("wrangler") ||
    String(p.selected_verifier_id || "").includes("wrangler") ||
    String(p.platform || "").includes("cloudflare_wrangler")
  );
}

function isSupabaseEvent(evt) {
  const p = evt?.payload || {};
  return (
    String(p.required_capability || "").startsWith("supabase.") ||
    String(p.selected_recipe_id || "").includes("supabase") ||
    String(p.selected_verifier_id || "").includes("supabase") ||
    String(p.platform || "").includes("supabase")
  );
}

function renderBanners() {
  authPendingBanner.textContent = `auth pending banner: ${activeAuthSessionId ? "active" : "idle"} (${runtimeProfile.id})`;
  reconnectBanner.textContent = "reconnect banner: placeholder only (no full history rebuild)";
  compactBanner.textContent = "compact banner: deterministic compact enabled (phase4c)";
  reviewPanel.textContent = "review drawer placeholder; heavy review payload loading disabled";
  fileSummaryPanel.textContent = "summary-only placeholder; heavy diff rendering disabled";
}

function renderBuffers() {
  eventMeta.textContent = `(${eventBuffer.length}/${eventBufferLimit})`;
  runListMeta.textContent = `(${visibleRuns.length}/${runListLimit})`;
  eventsPanel.textContent = eventBuffer.map((x) => JSON.stringify(x)).join("\n");
  timelinePanel.textContent = timelineBuffer.map((x) => JSON.stringify(x)).join("\n");
  runsPanel.textContent = JSON.stringify(visibleRuns, null, 2);
  grantsPanel.textContent = JSON.stringify(grantBuffer, null, 2);
  stepResumedPanel.textContent = JSON.stringify(resumedBuffer, null, 2);
}

async function getJson(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data.message || `${res.status} ${res.statusText}`);
    err.payload = data;
    throw err;
  }
  return data;
}

function currentRunId() {
  return (phase4aRunIdInput.value || "").trim() || visibleRuns[0]?.id || "";
}

function parseCsvIds(raw) {
  return String(raw || "")
    .split(",")
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function parseJsonObjectSafe(raw, fallback = {}) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

function ensureBrowserProfileId() {
  const key = "litecodex_browser_profile_id";
  const existing = localStorage.getItem(key);
  if (existing && existing.trim()) {
    return existing.trim();
  }
  const generated = `profile_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
  localStorage.setItem(key, generated);
  return generated;
}

const browserProfileId = ensureBrowserProfileId();
const BYO_KEY_DB = "litecodex_byo_profile_crypto_v1";
const BYO_KEY_STORE = "keypairs";
const BYO_KEY_RECORD = `profile:${browserProfileId}`;
let byoProfileSignerCache = null;
let byoKeyStorageMode = "indexeddb_profile_local";

function bytesToBase64Url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (let i = 0; i < arr.length; i += 1) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function openByoKeyDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const req = indexedDB.open(BYO_KEY_DB, 1);
    req.onerror = () => reject(req.error || new Error("indexeddb_open_failed"));
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(BYO_KEY_STORE)) {
        db.createObjectStore(BYO_KEY_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
}

async function idbGetSignerRecord() {
  const db = await openByoKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BYO_KEY_STORE, "readonly");
    const store = tx.objectStore(BYO_KEY_STORE);
    const req = store.get(BYO_KEY_RECORD);
    req.onerror = () => reject(req.error || new Error("indexeddb_get_failed"));
    req.onsuccess = () => resolve(req.result || null);
  });
}

async function idbPutSignerRecord(record) {
  const db = await openByoKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BYO_KEY_STORE, "readwrite");
    const store = tx.objectStore(BYO_KEY_STORE);
    const req = store.put(record);
    req.onerror = () => reject(req.error || new Error("indexeddb_put_failed"));
    req.onsuccess = () => resolve(true);
  });
}

async function ensureByoProfileSigner() {
  if (byoProfileSignerCache?.privateKey && byoProfileSignerCache?.publicKeyJwk) {
    return byoProfileSignerCache;
  }

  try {
    const stored = await idbGetSignerRecord();
    if (stored?.privateKey && stored?.publicKey && stored?.publicKeyJwk) {
      byoProfileSignerCache = {
        privateKey: stored.privateKey,
        publicKey: stored.publicKey,
        publicKeyJwk: stored.publicKeyJwk,
        createdAt: stored.createdAt || null
      };
      byoKeyStorageMode = "indexeddb_profile_local";
      return byoProfileSignerCache;
    }
  } catch {
    // fall through to generation
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign", "verify"]
  );
  const publicKeyJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const signer = {
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    publicKeyJwk,
    createdAt: new Date().toISOString()
  };
  byoProfileSignerCache = signer;
  try {
    await idbPutSignerRecord({
      id: BYO_KEY_RECORD,
      privateKey: keyPair.privateKey,
      publicKey: keyPair.publicKey,
      publicKeyJwk,
      createdAt: signer.createdAt
    });
    byoKeyStorageMode = "indexeddb_profile_local";
  } catch {
    byoKeyStorageMode = "memory_fallback";
  }
  return signer;
}

function buildByoChallengeSigningMessage({ action, challengeId, nonce, profileHash, scope }) {
  return `litecodex.byo.v1|${action}|${challengeId}|${nonce}|${profileHash}|${scope}`;
}

async function getByoChallengeProof(action, opts = {}) {
  const challengeReq = await getJson(`${hostBase}/byo/openai/challenge`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify({
      action,
      binding_scope: opts.bindingScope || (byoScopeSelect?.value || "browser_profile_scope"),
      binding_id: opts.bindingId || null
    })
  });
  const signer = await ensureByoProfileSigner();
  const message = buildByoChallengeSigningMessage({
    action,
    challengeId: challengeReq.challenge_id,
    nonce: challengeReq.nonce,
    profileHash: challengeReq.browser_profile_id_hash,
    scope: challengeReq.binding_scope
  });
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    signer.privateKey,
    new TextEncoder().encode(message)
  );
  const proof = {
    challenge_id: challengeReq.challenge_id,
    challenge_signature: bytesToBase64Url(new Uint8Array(signature)),
    public_key_jwk: signer.publicKeyJwk
  };
  if (byoChallengePanel) {
    byoChallengePanel.textContent = JSON.stringify(
      {
        action,
        challenge_id: challengeReq.challenge_id,
        challenge_expires_at: challengeReq.expires_at,
        binding_scope: challengeReq.binding_scope,
        browser_profile_id_hash: challengeReq.browser_profile_id_hash,
        keypair_mode: "non_exportable",
        profile_storage_mode: byoKeyStorageMode,
        challenge_response_required: true,
        cross_browser_share: false
      },
      null,
      2
    );
  }
  return proof;
}

function byoHeaders(extra = {}) {
  return {
    "Content-Type": "application/json",
    "X-Browser-Profile-Id": browserProfileId,
    ...extra
  };
}

function selectedPendingApprovalId() {
  return String(pendingApprovalSelect?.value || "").trim();
}

function selectedPendingApprovalRow() {
  const id = selectedPendingApprovalId();
  if (!id) return null;
  return pendingApprovalRows.find((x) => String(x.id || "") === id) || null;
}

function renderPendingApprovalSelect() {
  if (!pendingApprovalSelect) return;
  const previous = selectedPendingApprovalId();
  pendingApprovalSelect.innerHTML = "";
  if (!Array.isArray(pendingApprovalRows) || pendingApprovalRows.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "none";
    pendingApprovalSelect.appendChild(opt);
    approvalPendingListPanel.textContent = "[]";
    approvalPendingDetailPanel.textContent = "none";
    return;
  }
  for (const row of pendingApprovalRows) {
    const opt = document.createElement("option");
    opt.value = String(row.id || "");
    opt.textContent = `${row.id} | ${row.provider} | ${row.status}`;
    pendingApprovalSelect.appendChild(opt);
  }
  if (previous && pendingApprovalRows.some((x) => String(x.id || "") === previous)) {
    pendingApprovalSelect.value = previous;
  }
  const selected = selectedPendingApprovalRow() || pendingApprovalRows[0];
  if (selected && pendingApprovalSelect.value !== String(selected.id || "")) {
    pendingApprovalSelect.value = String(selected.id || "");
  }
  approvalPendingListPanel.textContent = JSON.stringify(pendingApprovalRows, null, 2);
  approvalPendingDetailPanel.textContent = JSON.stringify(selected || {}, null, 2);
}

async function refreshPendingApprovals() {
  const runId = currentRunId();
  const qs = runId
    ? `?run_id=${encodeURIComponent(runId)}&status=pending`
    : "?status=pending";
  const data = await getJson(`${hostBase}/approval-requests${qs}`);
  pendingApprovalRows = Array.isArray(data.approval_requests) ? data.approval_requests : [];
  renderPendingApprovalSelect();
  return pendingApprovalRows;
}

async function refreshRuns() {
  const data = await getJson(`${hostBase}/runs`);
  visibleRuns = data.runs.slice(0, runListLimit);
  renderBuffers();
}

async function refreshGrants() {
  const data = await getJson(`${hostBase}/capability-grants`);
  grantBuffer.length = 0;
  for (const row of data.capability_grants.slice(0, 20)) {
    grantBuffer.push({
      id: row.id,
      capability_key: row.capability_key,
      status: row.status,
      expires_at: row.expires_at,
      revoked_at: row.revoked_at,
      revoke_reason: row.revoke_reason,
      recipe: row.grant_recipe_id,
      verifier: row.verifier_id
    });
  }
  latestGrantId = grantBuffer.length > 0 ? grantBuffer[0].id : null;
  renderBuffers();
}

async function refreshByoBindingStatus() {
  if (byoProfileIdInput) {
    byoProfileIdInput.value = browserProfileId;
  }
  try {
    const status = await getJson(`${hostBase}/byo/openai/status`, {
      headers: byoHeaders()
    });
    const binding = status.binding || null;
    const validation = status.validation || null;
    if (byoBindingStatusPanel) {
      byoBindingStatusPanel.textContent = JSON.stringify(
        {
          provider: status.provider,
          binding_id: binding?.id || null,
          status: binding?.status || "unbound",
          binding_scope: binding?.binding_scope || null,
          browser_profile_id_hash: status.browser_profile_id_hash || null,
          machine_scope_id_hash: status.machine_scope_id_hash || null,
          public_key_fingerprint: binding?.public_key_fingerprint || null,
          host_memory_only: status.host_memory_only,
          browser_local_persistence: status.browser_local_persistence,
          cross_browser_share: status.cross_browser_share
        },
        null,
        2
      );
    }
    if (byoValidationStatusPanel) {
      byoValidationStatusPanel.textContent = JSON.stringify(
        {
          validation_status: validation?.validation_status || "unverified",
          failure_reason: validation?.failure_reason || null,
          last_verified_at: validation?.last_verified_at || null
        },
        null,
        2
      );
    }
    if (byoScopeVerifiedPanel) {
      byoScopeVerifiedPanel.textContent = JSON.stringify(
        {
          binding_scope: binding?.binding_scope || null,
          last_verified_at: validation?.last_verified_at || null,
          deleted_at: binding?.deleted_at || null,
          challenge_response_required: true,
          keypair_mode: "non_exportable",
          profile_storage_mode: byoKeyStorageMode,
          cross_browser_share: false
        },
        null,
        2
      );
    }
  } catch (error) {
    if (byoBindingStatusPanel) {
      byoBindingStatusPanel.textContent = JSON.stringify(
        { error: error?.payload?.error || error?.message || "byo_status_unavailable" },
        null,
        2
      );
    }
    if (byoValidationStatusPanel) {
      byoValidationStatusPanel.textContent = "byo validation status unavailable";
    }
    if (byoScopeVerifiedPanel) {
      byoScopeVerifiedPanel.textContent = "byo scope status unavailable";
    }
  }
}

async function fetchCurrentByoBinding() {
  const status = await getJson(`${hostBase}/byo/openai/status`, {
    headers: byoHeaders()
  });
  return status?.binding || null;
}

async function refreshState() {
  try {
    const [health, keyStatus, state] = await Promise.all([
      getJson(`${hostBase}/health`),
      getJson(`${hostBase}/session/byo-key`),
      getJson(`${hostBase}/state`)
    ]);

    hostStatus.textContent = `host: online @ ${health.bind}`;
    activeRunStatus.textContent = `active run: ${state.active_run_id || "none"}`;
    keyState.textContent = keyStatus.configured ? "key configured" : "key not configured";
    guardrailStatus.textContent =
      `guardrails: single_active_run=${state.guardrails.single_active_run}, ` +
      `single_active_auth_session=${state.guardrails.single_active_auth_session}, ` +
      `run_list_max=${state.guardrails.run_list_max}, ` +
      `heavy_artifacts_disabled=${state.guardrails.heavy_artifacts_disabled}`;
    await refreshByoBindingStatus();
    if (openaiTransportRoutePanel) {
      openaiTransportRoutePanel.textContent = JSON.stringify(
        {
          provider_id: "openai_official",
          base_url: "https://api.openai.com/v1",
          endpoint: "POST /responses",
          model: "gpt-5.4",
          contract_version: state?.contracts?.openai_codegen_transport || null,
          diagnostics_contract_version: state?.contracts?.transport_diagnostics || null
        },
        null,
        2
      );
    }
  } catch {
    hostStatus.textContent = "host: offline";
    activeRunStatus.textContent = "active run: unavailable";
    guardrailStatus.textContent = "guardrails: unavailable";
    keyState.textContent = "key state unavailable";
    if (byoBindingStatusPanel) byoBindingStatusPanel.textContent = "byo status unavailable";
    if (byoValidationStatusPanel) byoValidationStatusPanel.textContent = "byo validation unavailable";
    if (byoScopeVerifiedPanel) byoScopeVerifiedPanel.textContent = "byo scope unavailable";
    if (openaiTransportRoutePanel) openaiTransportRoutePanel.textContent = "openai transport route unavailable";
  }
}
function consumeEvent(evt) {
  eventBuffer.unshift(evt);
  trimBuffer(eventBuffer, eventBufferLimit);

  timelineBuffer.unshift({
    run_id: evt.run_id,
    seq: evt.seq,
    type: evt.type,
    ts: evt.ts,
    message: evt?.payload?.message || ""
  });
  trimBuffer(timelineBuffer, stepTimelineLimit);

  currentActionLine.textContent = `${evt.type} | ${evt?.payload?.message || evt.type}`;

  if (String(evt.type || "").startsWith("byo.")) {
    if (byoBindingStatusPanel) {
      byoBindingStatusPanel.textContent = JSON.stringify(
        {
          event_type: evt.type,
          binding_id: evt.payload?.binding_id || null,
          provider: evt.payload?.provider || "openai",
          status: evt.payload?.status || evt.payload?.validation_status || null,
          binding_scope: evt.payload?.binding_scope || null,
          browser_profile_id_hash: evt.payload?.browser_profile_id_hash || null,
          public_key_fingerprint: evt.payload?.public_key_fingerprint || null,
          challenge_response_verified: evt.payload?.challenge_response_verified || false
        },
        null,
        2
      );
    }
    if (byoValidationStatusPanel) {
      byoValidationStatusPanel.textContent = JSON.stringify(
        {
          event_type: evt.type,
          validation_status: evt.payload?.validation_status || null,
          failure_reason: evt.payload?.failure_reason || null,
          last_verified_at: evt.payload?.last_verified_at || null,
          challenge_id: evt.payload?.challenge_id || null
        },
        null,
        2
      );
    }
    if (byoScopeVerifiedPanel) {
      byoScopeVerifiedPanel.textContent = JSON.stringify(
        {
          binding_scope: evt.payload?.binding_scope || null,
          last_verified_at: evt.payload?.last_verified_at || null,
          deleted_at: evt.payload?.deleted_at || null,
          challenge_response_verified: evt.payload?.challenge_response_verified || false
        },
        null,
        2
      );
    }
  }

  if (evt.type === "retrieval.decision") {
    if (retrievalStatusPanel) {
      retrievalStatusPanel.textContent = JSON.stringify(
        {
          triggered: Boolean(evt.payload?.search_needed),
          reason_code: evt.payload?.reason_code || null,
          status: evt.payload?.search_needed ? "search_planned" : "no_search"
        },
        null,
        2
      );
    }
    if (retrievalDecisionPanel) {
      retrievalDecisionPanel.textContent = JSON.stringify(evt.payload || {}, null, 2);
    }
    if (retrievalProviderChainPanel) {
      retrievalProviderChainPanel.textContent = JSON.stringify(
        {
          provider_chain: evt.payload?.provider_chain || [],
          provider_selected: evt.payload?.provider || evt.payload?.provider_selected || null
        },
        null,
        2
      );
    }
  }

  if (evt.type === "retrieval.query_planned" || evt.type === "retrieval.provider_selected") {
    if (retrievalDecisionPanel) {
      retrievalDecisionPanel.textContent = JSON.stringify(evt.payload || {}, null, 2);
    }
    if (retrievalProviderChainPanel) {
      retrievalProviderChainPanel.textContent = JSON.stringify(
        {
          event_type: evt.type,
          provider_chain: evt.payload?.provider_chain || [],
          provider_selected: evt.payload?.provider || null
        },
        null,
        2
      );
    }
    if (retrievalFetchTargetsPanel && evt.type === "retrieval.query_planned") {
      retrievalFetchTargetsPanel.textContent = JSON.stringify(
        {
          fetch_targets: evt.payload?.fetch_targets || [],
          query_summary: evt.payload?.query_summary || null
        },
        null,
        2
      );
    }
  }

  if (
    evt.type === "retrieval.search_started" ||
    evt.type === "retrieval.search_completed" ||
    evt.type === "retrieval.fetch_started" ||
    evt.type === "retrieval.fetch_completed" ||
    evt.type === "retrieval.bundle_ready"
  ) {
    if (retrievalStatusPanel) {
      retrievalStatusPanel.textContent = JSON.stringify(
        {
          event_type: evt.type,
          provider: evt.payload?.provider || null,
          hits_count: evt.payload?.hits_count || 0,
          evidence_bundle_path: evt.payload?.evidence_bundle_path || null,
          final_bundle_status: evt.payload?.final_bundle_status || null
        },
        null,
        2
      );
    }
    if (retrievalHitsPanel) {
      retrievalHitsPanel.textContent = JSON.stringify(evt.payload || {}, null, 2);
    }
    if (retrievalProviderChainPanel && (evt.type === "retrieval.bundle_ready" || evt.type === "retrieval.search_completed")) {
      retrievalProviderChainPanel.textContent = JSON.stringify(
        {
          provider_chain: evt.payload?.provider_chain || [],
          provider: evt.payload?.provider || null
        },
        null,
        2
      );
    }
    if (retrievalFetchTargetsPanel && (evt.type === "retrieval.fetch_started" || evt.type === "retrieval.fetch_completed")) {
      retrievalFetchTargetsPanel.textContent = JSON.stringify(
        {
          event_type: evt.type,
          fetch_type: evt.payload?.fetch_type || null,
          target_url: evt.payload?.target_url || null,
          target_urls: evt.payload?.target_urls || [],
          status: evt.payload?.status || null
        },
        null,
        2
      );
    }
    if (retrievalHealthPanel && evt.type === "retrieval.bundle_ready") {
      retrievalHealthPanel.textContent = JSON.stringify(
        {
          provider_status: evt.payload?.provider_status || [],
          evidence_bundle_path: evt.payload?.evidence_bundle_path || null,
          degraded_mode: evt.payload?.degraded_mode || false
        },
        null,
        2
      );
    }
    if (retrievalBundleStatusPanel && evt.type === "retrieval.bundle_ready") {
      retrievalBundleStatusPanel.textContent = JSON.stringify(
        {
          final_bundle_status: evt.payload?.final_bundle_status || null,
          citation_eligible_count: evt.payload?.citation_eligible_count || 0,
          citation_rejected_count: evt.payload?.citation_rejected_count || 0,
          conflicts_count: evt.payload?.conflicts_count || 0,
          gaps_count: evt.payload?.gaps_count || 0
        },
        null,
        2
      );
    }
  }

  if (evt.type === "retrieval.design.frozen" && retrievalDesignFrozenPanel) {
    retrievalDesignFrozenPanel.textContent = JSON.stringify(evt.payload, null, 2);
    if (retrievalCrawlDisabledPanel) {
      retrievalCrawlDisabledPanel.textContent = JSON.stringify(
        {
          firecrawl_search: "disabled",
          firecrawl_crawl: "disabled",
          enabled_providers: evt.payload?.enabled_providers || [],
          disabled_providers: evt.payload?.disabled_providers || []
        },
        null,
        2
      );
    }
  }

  if (evt.type === "retrieval.readiness.checked") {
    if (retrievalReadinessPanel) {
      retrievalReadinessPanel.textContent = JSON.stringify(
        {
          retrieval_broker_ready: evt.payload?.retrieval_broker_ready === true,
          tavily_ready: evt.payload?.tavily_ready === true,
          exa_ready: evt.payload?.exa_ready === true,
          firecrawl_fetch_ready: evt.payload?.firecrawl_fetch_ready === true,
          firecrawl_crawl_ready: evt.payload?.firecrawl_crawl_ready === true,
          multi_provider_closeout_ready: evt.payload?.multi_provider_closeout_ready === true
        },
        null,
        2
      );
    }
    if (retrievalBlockedPanel) {
      retrievalBlockedPanel.textContent = JSON.stringify(evt.payload?.blocked_modules || [], null, 2);
    }
  }

  if (evt.type === "retrieval.citation.gate.checked" && retrievalCitationGatePanel) {
    retrievalCitationGatePanel.textContent = JSON.stringify(evt.payload || {}, null, 2);
  }

  if (
    (evt.type === "retrieval.conflict.detected" ||
      evt.type === "retrieval.conflict.resolved" ||
      evt.type === "retrieval.conflict.unresolved") &&
    retrievalConflictPanel
  ) {
    retrievalConflictPanel.textContent = JSON.stringify(
      {
        event_type: evt.type,
        ...(evt.payload || {})
      },
      null,
      2
    );
  }

  if (
    (evt.type === "retrieval.budget.checked" || evt.type === "retrieval.degraded.mode.entered") &&
    retrievalBudgetPanel
  ) {
    retrievalBudgetPanel.textContent = JSON.stringify(
      {
        event_type: evt.type,
        ...(evt.payload || {})
      },
      null,
      2
    );
  }

  if (evt.type === "retrieval.health.updated" && retrievalHealthPanel) {
    retrievalHealthPanel.textContent = JSON.stringify(
      {
        event_type: evt.type,
        ...(evt.payload || {})
      },
      null,
      2
    );
  }

  if (evt.type === "retrieval.governance.readiness.checked") {
    if (retrievalReadinessPanel) {
      retrievalReadinessPanel.textContent = JSON.stringify(evt.payload || {}, null, 2);
    }
    if (retrievalBlockedPanel) {
      retrievalBlockedPanel.textContent = JSON.stringify(evt.payload?.blocked_modules || [], null, 2);
    }
  }

  if (evt.type === "acceptance.chain.started") {
    acceptanceChainStatusPanel.textContent = JSON.stringify(
      {
        story_id: evt.payload?.story_id || null,
        chain_started: true,
        acceptance_chain: evt.payload?.acceptance_chain || [],
        required_checkpoints: evt.payload?.required_checkpoints || [],
        optional_checkpoints: evt.payload?.optional_checkpoints || []
      },
      null,
      2
    );
    acceptanceCheckpointSummaryPanel.textContent = JSON.stringify(
      {
        last_checkpoint: null,
        status: "running"
      },
      null,
      2
    );
  }

  if (evt.type === "acceptance.chain.checkpoint.completed") {
    acceptanceCheckpointSummaryPanel.textContent = JSON.stringify(
      {
        checkpoint_id: evt.payload?.checkpoint_id || null,
        status: evt.payload?.status || null,
        required: evt.payload?.required || false,
        optional: evt.payload?.optional || false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "acceptance.readiness.checked") {
    acceptanceFinalReadinessPanel.textContent = JSON.stringify(
      {
        system_acceptance_result_id: evt.payload?.system_acceptance_result_id || null,
        litecodex_system_acceptance_ready: evt.payload?.litecodex_system_acceptance_ready || false,
        unique_blocker: evt.payload?.unique_blocker || null,
        evidence_path: evt.payload?.evidence_path || null
      },
      null,
      2
    );
    acceptanceExercisedModulesPanel.textContent = JSON.stringify(
      {
        exercised_modules: evt.payload?.exercised_modules || [],
        completed_modules: evt.payload?.completed_modules || []
      },
      null,
      2
    );
    acceptanceNonBlockingPanel.textContent = JSON.stringify(
      {
        non_blocking_issues: evt.payload?.non_blocking_issues || []
      },
      null,
      2
    );
    acceptanceDeferredPanel.textContent = JSON.stringify(
      {
        deferred_items: evt.payload?.deferred_items || []
      },
      null,
      2
    );
  }

  if (evt.type === "acceptance.chain.completed") {
    acceptanceChainStatusPanel.textContent = JSON.stringify(
      {
        acceptance_chain_status: evt.payload?.acceptance_chain_status || null,
        litecodex_system_acceptance_ready: evt.payload?.litecodex_system_acceptance_ready || false,
        unique_blocker: evt.payload?.unique_blocker || null
      },
      null,
      2
    );
  }

  if (evt.type === "engineering.intent.compiled" && engineeringIntentPanel) {
    engineeringIntentPanel.textContent = JSON.stringify(
      {
        task_id: evt.payload?.task_id || null,
        intent_id: evt.payload?.intent_id || null,
        model_compiler_ok: evt.payload?.model_compiler_ok === true,
        compile_error: evt.payload?.compile_error || null
      },
      null,
      2
    );
  }

  if (evt.type === "engineering.stack_profile.selected" && engineeringStackProfilePanel) {
    engineeringStackProfilePanel.textContent = JSON.stringify(evt.payload || {}, null, 2);
  }

  if (evt.type === "engineering.skill_pack.selected" && engineeringSkillsPanel) {
    engineeringSkillsPanel.textContent = JSON.stringify(
      {
        task_id: evt.payload?.task_id || null,
        selected_skills: evt.payload?.selected_skills || []
      },
      null,
      2
    );
  }

  if (evt.type === "engineering.verification_plan.generated" && engineeringVerifyPlanPanel) {
    engineeringVerifyPlanPanel.textContent = JSON.stringify(
      {
        task_id: evt.payload?.task_id || null,
        verification_plan_id: evt.payload?.verification_plan_id || null,
        commands: evt.payload?.commands || []
      },
      null,
      2
    );
  }

  if (evt.type === "engineering.review_gate.checked" && engineeringReviewGatePanel) {
    engineeringReviewGatePanel.textContent = JSON.stringify(
      {
        task_id: evt.payload?.task_id || null,
        passed: evt.payload?.passed === true,
        failure_reason: evt.payload?.failure_reason || null,
        checks: evt.payload?.checks || []
      },
      null,
      2
    );
  }

  if (
    (evt.type === "engineering.repair.started" || evt.type === "engineering.repair.completed") &&
    engineeringRepairPanel
  ) {
    engineeringRepairPanel.textContent = JSON.stringify(
      {
        event_type: evt.type,
        task_id: evt.payload?.task_id || null,
        attempt: evt.payload?.attempt || 0,
        status: evt.payload?.status || null,
        reason: evt.payload?.reason || evt.payload?.failure_reason || null
      },
      null,
      2
    );
  }

  if (
    (evt.type === "step.completed" || evt.type === "step.failed_controlled") &&
    engineeringTaskStatusPanel &&
    String(evt.payload?.parent_step_id || "").startsWith("step.task_to_engineering.closeout")
  ) {
    engineeringTaskStatusPanel.textContent = JSON.stringify(
      {
        task_id: evt.payload?.task_id || null,
        status: evt.type === "step.completed" ? "completed" : "failed_controlled",
        verify_passed: evt.payload?.verify_passed === true,
        repair_attempts: evt.payload?.repair_attempts || 0,
        final_status: evt.payload?.final_status || null,
        reason: evt.payload?.failure_reason || evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "engineering.readiness.checked" && engineeringReadinessPanel) {
    engineeringReadinessPanel.textContent = JSON.stringify(
      {
        engineering_compiler_ready: evt.payload?.engineering_compiler_ready === true,
        polyglot_skills_ready: evt.payload?.polyglot_skills_ready === true,
        auto_verify_ready: evt.payload?.auto_verify_ready === true,
        review_gate_ready: evt.payload?.review_gate_ready === true,
        real_model_codegen_ready: evt.payload?.real_model_codegen_ready === true,
        production_code_task_ready: evt.payload?.production_code_task_ready === true,
        production_engineering_hardening_ready: evt.payload?.production_engineering_hardening_ready === true,
        engineering_hardening_unique_blocker: evt.payload?.engineering_hardening_unique_blocker || null,
        polyglot_expansion_production_ready: evt.payload?.polyglot_expansion_production_ready === true,
        production_engineering_final_ready: evt.payload?.production_engineering_final_ready === true,
        polyglot_expansion_unique_blocker: evt.payload?.polyglot_expansion_unique_blocker || null,
        multi_host_reality_ready: evt.payload?.multi_host_reality_ready === true,
        same_host_real_count: Number(evt.payload?.same_host_real_count || 0),
        host_safe_subchain_count: Number(evt.payload?.host_safe_subchain_count || 0),
        external_runner_required_count: Number(evt.payload?.external_runner_required_count || 0),
        same_host_completed_count: Number(evt.payload?.same_host_completed_count || 0),
        host_safe_completed_count: Number(evt.payload?.host_safe_completed_count || 0),
        current_host_boundary: evt.payload?.current_host_boundary || null,
        engineering_reality_unique_blocker: evt.payload?.engineering_reality_unique_blocker || null,
        polyglot_expansion_completion_count: Array.isArray(evt.payload?.polyglot_expansion_completion)
          ? evt.payload.polyglot_expansion_completion.length
          : 0,
        semantic_repair_runs: Array.isArray(evt.payload?.semantic_repair_runs)
          ? evt.payload.semantic_repair_runs.map((x) => ({
              domain: x.domain || null,
              verify_status: x.verify_status || null
            }))
          : [],
        sql_semantic_verify: evt.payload?.sql_semantic_verify || null,
        terraform_preflight: evt.payload?.terraform_preflight || null,
        flutter_pack_hardening: evt.payload?.flutter_pack_hardening || null,
        flutter_boundary_result: evt.payload?.flutter_boundary_result || null,
        flutter_finalization_run: evt.payload?.flutter_finalization_run || null,
        swift_boundary_result: evt.payload?.swift_boundary_result || null,
        compiled_ast_repair_runs: Array.isArray(evt.payload?.compiled_ast_repair_runs)
          ? evt.payload.compiled_ast_repair_runs.map((x) => ({
              language: x.language || null,
              verify_status: x.verify_status || null,
              failure_reason: x.failure_reason || null
            }))
          : [],
        second_batch_deploy_standardization_runs: Array.isArray(evt.payload?.second_batch_deploy_standardization_runs)
          ? evt.payload.second_batch_deploy_standardization_runs.map((x) => ({
              category: x.category || null,
              pack_id: x.pack_id || null,
              status: x.status || null,
              blocker: x.blocker || null
            }))
          : [],
        polyglot_expansion_aggregation: evt.payload?.polyglot_expansion_aggregation || null,
        polyglot_final_aggregation: evt.payload?.polyglot_final_aggregation || null,
        multi_host_capability_partition: evt.payload?.multi_host_capability_partition || null,
        polyglot_expansion_completed_count: Array.isArray(evt.payload?.polyglot_expansion_aggregation?.completed_packs)
          ? evt.payload.polyglot_expansion_aggregation.completed_packs.length
          : 0,
        polyglot_expansion_blocked_count: Array.isArray(evt.payload?.polyglot_expansion_aggregation?.blocked_packs)
          ? evt.payload.polyglot_expansion_aggregation.blocked_packs.length
          : 0,
        polyglot_expansion_deferred_count: Array.isArray(evt.payload?.polyglot_expansion_aggregation?.deferred_packs)
          ? evt.payload.polyglot_expansion_aggregation.deferred_packs.length
          : 0,
        stack_pack_completion_count: Array.isArray(evt.payload?.stack_pack_completion)
          ? evt.payload.stack_pack_completion.length
          : 0,
        ast_structured_repair_runs: Array.isArray(evt.payload?.ast_structured_repair_runs)
          ? evt.payload.ast_structured_repair_runs.map((x) => ({
              language: x.language || null,
              verify_status: x.verify_status || null
            }))
          : [],
        deploy_standardization: Array.isArray(evt.payload?.deploy_standardization)
          ? evt.payload.deploy_standardization.map((x) => ({
              stack_category: x.stack_category || null,
              standardized: x.standardized === true
            }))
          : [],
        crossend_pack_hardening: evt.payload?.crossend_pack_hardening || null,
        deferred_items: evt.payload?.deferred_items || [],
        blocked_modules: evt.payload?.blocked_modules || [],
        engineering_readiness_id: evt.payload?.engineering_readiness_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "openai.codegen.route.bound" && openaiTransportRoutePanel) {
    openaiTransportRoutePanel.textContent = JSON.stringify(
      {
        provider_id: evt.payload?.provider_id || null,
        base_url: evt.payload?.base_url || null,
        endpoint: evt.payload?.endpoint || null,
        model: evt.payload?.model || null,
        env_key: evt.payload?.env_key || null,
        validation_route: evt.payload?.validation_route || null,
        codegen_route: evt.payload?.codegen_route || null
      },
      null,
      2
    );
  }

  if (
    (evt.type === "openai.transport.probe.started" || evt.type === "openai.transport.probe.completed") &&
    openaiTransportProbePanel
  ) {
    openaiTransportProbePanel.textContent = JSON.stringify(
      {
        event_type: evt.type,
        probe: evt.payload?.probe || null,
        status: evt.payload?.status || (evt.type.endsWith(".started") ? "running" : null),
        validation_status: evt.payload?.validation_status || null,
        failure_layer: evt.payload?.failure_layer || null,
        failure_reason: evt.payload?.failure_reason || null,
        http_status: evt.payload?.http_status || null,
        latency_ms: evt.payload?.latency_ms || null
      },
      null,
      2
    );
  }

  if (
    (evt.type === "openai.codegen.route.failed" || evt.type === "openai.codegen.route.ready") &&
    openaiTransportFinalPanel
  ) {
    openaiTransportFinalPanel.textContent = JSON.stringify(
      {
        event_type: evt.type,
        status: evt.type === "openai.codegen.route.ready" ? "completed" : "failed_controlled",
        provider_id: evt.payload?.provider_id || null,
        failure_layer: evt.payload?.failure_layer || null,
        failure_reason: evt.payload?.failure_reason || null,
        result_id: evt.payload?.openai_codegen_transport_result_id || null,
        diagnostics_path: evt.payload?.diagnostics_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "runner.registered" || evt.type === "runner.capability.detected") {
    externalRunnerRegistryStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        external_runner_id: evt.payload?.external_runner_id || null,
        runner_id: evt.payload?.runner_id || null,
        host_class: evt.payload?.host_class || evt.payload?.capabilities?.host_class || null,
        host_os: evt.payload?.host_os || null,
        discovery_status: evt.payload?.discovery_status || null,
        capabilities: evt.payload?.capabilities || null
      },
      null,
      2
    );
  }

  if (evt.type === "runner.job.started" || evt.type === "runner.job.completed") {
    externalRunnerJobStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        runner_job_id: evt.payload?.runner_job_id || null,
        runner_id: evt.payload?.runner_id || null,
        job_type: evt.payload?.job_type || null,
        command_summary: evt.payload?.command_summary || null,
        status: evt.payload?.status || null,
        exit_code: evt.payload?.exit_code ?? null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "runner.artifact.synced") {
    externalRunnerArtifactSyncStatusPanel.textContent = JSON.stringify(
      {
        runner_artifact_sync_id: evt.payload?.runner_artifact_sync_id || null,
        runner_job_id: evt.payload?.runner_job_id || null,
        sync_direction: evt.payload?.sync_direction || null,
        status: evt.payload?.status || null,
        artifact_path: evt.payload?.artifact_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "android.fulfillment.started" || evt.type === "android.fulfillment.completed") {
    androidFulfillmentStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        android_toolchain_fulfillment_id: evt.payload?.android_toolchain_fulfillment_id || null,
        status: evt.payload?.status || null,
        target_api: evt.payload?.target_api || null,
        sdk_root_redacted: evt.payload?.sdk_root_redacted || null,
        cmdline_tools_status: evt.payload?.cmdline_tools_status || null,
        platform_tools_status: evt.payload?.platform_tools_status || null,
        build_tools_status: evt.payload?.build_tools_status || null
      },
      null,
      2
    );
  }

  if (evt.type === "android.redetect.completed") {
    androidSdkStatusPanel.textContent = JSON.stringify(
      {
        android_prerequisite_check_id: evt.payload?.android_prerequisite_check_id || null,
        sdk_status: evt.payload?.sdk_status || null,
        sdkmanager_status: evt.payload?.sdkmanager_status || null,
        adb_status: evt.payload?.adb_status || null,
        jdk_status: evt.payload?.jdk_status || null,
        javac_status: evt.payload?.javac_status || null,
        gradle_status: evt.payload?.gradle_status || null,
        build_tools_version: evt.payload?.build_tools_version || null,
        platform_api: evt.payload?.platform_api || null,
        missing_prerequisites: evt.payload?.missing_prerequisites || []
      },
      null,
      2
    );
  }

  if (
    evt.type === "android.build.started" ||
    evt.type === "android.build.completed" ||
    evt.type === "android.verify.completed" ||
    evt.type === "android.receipt.written"
  ) {
    androidBuildVerifyStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        android_build_run_id: evt.payload?.android_build_run_id || null,
        android_verify_run_id: evt.payload?.android_verify_run_id || null,
        status: evt.payload?.status || null,
        verify_summary: evt.payload?.verify_summary || null,
        artifact_path: evt.payload?.artifact_path || evt.payload?.receipt_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "android.lane.completed") {
    externalAndroidLaneStatusPanel.textContent = JSON.stringify(
      {
        lane_id: evt.payload?.lane_id || null,
        android_release_ready: evt.payload?.android_release_ready || false,
        flutter_android_status: evt.payload?.flutter_android_status || null,
        blocker: evt.payload?.blocker || null
      },
      null,
      2
    );
  }

  if (evt.type === "android.readiness.checked") {
    flutterAndroidStatusPanel.textContent = JSON.stringify(
      {
        android_readiness_result_id: evt.payload?.android_readiness_result_id || null,
        flutter_android_status: evt.payload?.flutter_android_status || null,
        android_sdk_ready: evt.payload?.android_sdk_ready || false,
        android_fulfillment_ready: evt.payload?.android_fulfillment_ready || false,
        android_build_ready: evt.payload?.android_build_ready || false,
        blocker: evt.payload?.blocker || null
      },
      null,
      2
    );
  }

  if (evt.type === "apple.boundary.frozen" || evt.type === "store.boundary.frozen") {
    externalAppleStoreBoundaryStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        lane_id: evt.payload?.lane_id || null,
        required_runner: evt.payload?.required_runner || null,
        required_host_os: evt.payload?.required_host_os || null,
        current_availability: evt.payload?.current_availability || null,
        blocking_scope: evt.payload?.blocking_scope || null,
        non_blocking: evt.payload?.non_blocking ?? null
      },
      null,
      2
    );
  }

  if (evt.type === "external.expansion.readiness.checked") {
    externalExpansionReadinessPanel.textContent = JSON.stringify(
      {
        external_expansion_readiness_id: evt.payload?.external_expansion_readiness_id || null,
        same_host_real_maintained: evt.payload?.same_host_real_maintained || false,
        external_runner_plane_ready: evt.payload?.external_runner_plane_ready || false,
        android_release_ready: evt.payload?.android_release_ready || false,
        apple_release_ready: evt.payload?.apple_release_ready || false,
        store_release_ready: evt.payload?.store_release_ready || false,
        final_future_expansion_ready: evt.payload?.final_future_expansion_ready || false,
        blocker_group: evt.payload?.blocker_group || null,
        blocked_modules: evt.payload?.blocked_modules || [],
        current_host_boundary: evt.payload?.current_host_boundary || null
      },
      null,
      2
    );
  }

  if (evt.type === "runner.failure.classified") {
    externalRunnerJobStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        runner_failure_event_id: evt.payload?.runner_failure_event_id || null,
        runner_job_id: evt.payload?.runner_job_id || null,
        failure_type: evt.payload?.failure_type || null,
        failure_stage: evt.payload?.failure_stage || null,
        recovery_action: evt.payload?.recovery_action || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "capability.checked" || evt.type === "capability.reused" || evt.type === "capability.granted") {
    adapterStatePanel.textContent = `${evt.type} | ${JSON.stringify(evt.payload, null, 2)}`;
  }

  if (evt.type === "adapter.selected") {
    adapterStatePanel.textContent = JSON.stringify(evt.payload, null, 2);
    commandCwdPanel.textContent = JSON.stringify(
      {
        command_or_action: evt.payload?.command_or_action || null,
        cwd: evt.payload?.cwd || null,
        adapter_id: evt.payload?.adapter_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "adapter.install.required") {
    adapterStatePanel.textContent = `adapter.install.required | ${JSON.stringify(evt.payload, null, 2)}`;
    adapterInstallRequiredPanel.textContent = JSON.stringify(evt.payload, null, 2);
    missingToolPanel.textContent = JSON.stringify(
      {
        required_tool: evt.payload?.required_tool || evt.payload?.tool_id || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "project.inspect.started" || evt.type === "project.inspect.completed") {
    projectInspectSummaryPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "workspace.trust.checked") {
    workspaceTrustStatusPanel.textContent = JSON.stringify(
      {
        trust_status: evt.payload?.trust_status || null,
        risk_level: evt.payload?.risk_level || null,
        risk_summary: evt.payload?.risk_summary || null,
        workspace_root: evt.payload?.workspace_root || null,
        allowed_roots: evt.payload?.allowed_roots || [],
        forbidden_paths: evt.payload?.forbidden_paths || []
      },
      null,
      2
    );
  }

  if (evt.type === "tool.discovery.started" || evt.type === "tool.discovery.completed") {
    toolDiscoveryStatusPanel.textContent = JSON.stringify(evt.payload, null, 2);
    const detected = {
      tool_name: evt.payload?.tool_name || null,
      status: evt.payload?.status || (evt.type.endsWith("started") ? "checking" : null),
      resolved_path: evt.payload?.resolved_path || null,
      discovery_source: evt.payload?.discovery_source || null,
      version_result: evt.payload?.version_result || null
    };
    detectedToolsPanel.textContent = JSON.stringify(detected, null, 2);
    if (evt.payload?.status === "missing" || evt.payload?.status === "invalid") {
      missingToolPanel.textContent = JSON.stringify(
        {
          tool_name: evt.payload?.tool_name || null,
          status: evt.payload?.status || null
        },
        null,
        2
      );
    }
  }

  if (evt.type === "tool.install.proposed") {
    toolInstallProposalPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "tool.install.policy_checked") {
    toolInstallPolicyPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "tool.install.rollback_snapshot.created") {
    toolInstallRollbackSnapshotPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "tool.install.started" || evt.type === "tool.install.completed" || evt.type === "tool.install.rejected") {
    toolInstallRunPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "tool.install.rollback.completed") {
    toolInstallRollbackSnapshotPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "phase3.closeout.started") {
    phase3CloseoutStatusPanel.textContent = JSON.stringify(
      {
        status: "started",
        case_id: evt.payload?.case_id || null,
        workspace_path: evt.payload?.workspace_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "tool.install.rollback.started") {
    toolInstallRollbackStatusPanel.textContent = JSON.stringify(
      {
        status: "started",
        rollback_run_id: evt.payload?.rollback_run_id || null,
        snapshot_id: evt.payload?.snapshot_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "tool.install.rollback.completed") {
    toolInstallRollbackStatusPanel.textContent = JSON.stringify(
      {
        status: evt.payload?.status || "completed",
        rollback_run_id: evt.payload?.rollback_run_id || null,
        snapshot_id: evt.payload?.snapshot_id || null,
        artifacts_path: evt.payload?.artifacts_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "tool.install.rollback.verified") {
    hashVerificationStatusPanel.textContent = JSON.stringify(
      {
        rollback_run_id: evt.payload?.rollback_run_id || null,
        hash_verification_status: evt.payload?.hash_verification_status || null
      },
      null,
      2
    );
    gitVerificationStatusPanel.textContent = JSON.stringify(
      {
        rollback_run_id: evt.payload?.rollback_run_id || null,
        git_status_verification_status: evt.payload?.git_status_verification_status || null,
        git_status_after: evt.payload?.git_status_after || null
      },
      null,
      2
    );
  }

  if (evt.type === "phase3.smoke.case.started") {
    smokeCaseStatusMap[evt.payload?.smoke_case || "unknown"] = "running";
    smokeSuiteCaseListPanel.textContent = JSON.stringify(smokeCaseStatusMap, null, 2);
  }

  if (evt.type === "phase3.smoke.case.completed") {
    smokeCaseStatusMap[evt.payload?.smoke_case || "unknown"] = "passed";
    smokeSuiteCaseListPanel.textContent = JSON.stringify(smokeCaseStatusMap, null, 2);
    smokeSuiteResultPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "phase3.smoke.case.failed_controlled") {
    smokeCaseStatusMap[evt.payload?.smoke_case || "unknown"] = "failed_controlled";
    smokeSuiteCaseListPanel.textContent = JSON.stringify(smokeCaseStatusMap, null, 2);
    smokeSuiteResultPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "contract.consistency.checked" || evt.type === "schema.consistency.checked") {
    consistencyCheckResultPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "phase4.readiness.checked") {
    phase4ReadinessStatusPanel.textContent = JSON.stringify(
      {
        phase3_ready: evt.payload?.phase3_ready || false,
        verified_modules: evt.payload?.verified_modules || [],
        evidence_path: evt.payload?.evidence_path || null
      },
      null,
      2
    );
    readinessBlockedReasonsPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || [],
        risks: evt.payload?.risks || [],
        fixture_only_boundaries: evt.payload?.fixture_only_boundaries || []
      },
      null,
      2
    );
  }

  if (evt.type === "context.hydration.started") {
    hydrationStatusPanel.textContent = JSON.stringify(
      {
        run_id: evt.payload?.run_id || null,
        baseline_run_id: evt.payload?.baseline_run_id || null,
        status_before_hydration: evt.payload?.status_before_hydration || null
      },
      null,
      2
    );
  }

  if (evt.type === "context.hydration.completed") {
    hydrationStatusPanel.textContent = JSON.stringify(evt.payload, null, 2);
    hydrateModePanel.textContent = JSON.stringify(
      {
        hydrate_mode: evt.payload?.hydrate_mode || "raw",
        compact_run_id: evt.payload?.compact_run_id || null
      },
      null,
      2
    );
    deltaFromSeqPanel.textContent = JSON.stringify(
      {
        delta_from_seq: evt.payload?.delta_from_seq || null
      },
      null,
      2
    );
    loadedEventsCountPanel.textContent = JSON.stringify(
      {
        loaded_events_count: evt.payload?.loaded_events_count || 0
      },
      null,
      2
    );
    loadedTablesPanel.textContent = JSON.stringify(
      {
        loaded_ledger_tables: evt.payload?.loaded_ledger_tables || []
      },
      null,
      2
    );
    finalProjectionStatusPanel.textContent = JSON.stringify(
      {
        final_projection_status: evt.payload?.final_projection_status || null,
        projection_artifact_path: evt.payload?.projection_artifact_path || null
      },
      null,
      2
    );
    if (evt.payload?.compact_fallback_reason) {
      compactFallbackReasonPanel.textContent = JSON.stringify(
        {
          compact_fallback_reason: evt.payload.compact_fallback_reason
        },
        null,
        2
      );
    }
    if (evt.payload?.lineage_summary) {
      lineageListPanel.textContent = JSON.stringify(evt.payload.lineage_summary, null, 2);
      sourceRunIdPanel.textContent = JSON.stringify(
        { source_run_id: evt.payload?.lineage_summary?.parent?.parent_run_id || null },
        null,
        2
      );
      forkRunIdPanel.textContent = JSON.stringify(
        { fork_run_id: evt.payload?.run_id || evt.run_id || null },
        null,
        2
      );
    }
  }

  if (evt.type === "reconnect.started") {
    reconnectStatusPanel.textContent = JSON.stringify(evt.payload, null, 2);
    cursorStatusPanel.textContent = JSON.stringify(
      {
        last_seen_seq: evt.payload?.last_seen_seq || 0
      },
      null,
      2
    );
  }

  if (evt.type === "reconnect.missed_events.replayed") {
    missedEventsPanel.textContent = JSON.stringify(evt.payload, null, 2);
    cursorStatusPanel.textContent = JSON.stringify(
      {
        last_seen_seq: evt.payload?.last_seen_seq || 0,
        replayed_from_seq: evt.payload?.replayed_from_seq || null,
        replayed_to_seq: evt.payload?.replayed_to_seq || null
      },
      null,
      2
    );
  }

  if (evt.type === "reconnect.completed") {
    reconnectStatusPanel.textContent = JSON.stringify(evt.payload, null, 2);
    cursorStatusPanel.textContent = JSON.stringify(
      {
        final_cursor: evt.payload?.final_cursor || 0
      },
      null,
      2
    );
  }

  if (evt.type === "resume.requested" || evt.type === "resume.started" || evt.type === "resume.completed" || evt.type === "resume.rejected") {
    resumeStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        run_id: evt.payload?.run_id || null,
        resume_session_id: evt.payload?.resume_session_id || null,
        status_before_resume: evt.payload?.status_before_resume || null,
        resume_cursor: evt.payload?.resume_cursor || null,
        resumed_step_id: evt.payload?.resumed_step_id || null
      },
      null,
      2
    );
    resumableReasonPanel.textContent = JSON.stringify(
      {
        resumable: evt.type !== "resume.rejected",
        resume_reason: evt.payload?.resume_reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "baseline.binding.created" || evt.type === "baseline.binding.verified") {
    baselineBindingStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        binding_id: evt.payload?.binding_id || null,
        binding_status: evt.payload?.binding_status || null
      },
      null,
      2
    );
    baselineBindingIdsPanel.textContent = JSON.stringify(
      {
        baseline_run_id: evt.payload?.baseline_run_id || null,
        smoke_run_id: evt.payload?.smoke_run_id || null,
        consistency_run_id: evt.payload?.consistency_run_id || null,
        readiness_run_id: evt.payload?.readiness_run_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "compact.requested" || evt.type === "compact.started" || evt.type === "compact.completed") {
    compactStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        compact_run_id: evt.payload?.compact_run_id || null,
        compact_id: evt.payload?.compact_id || null,
        run_id: evt.payload?.run_id || null
      },
      null,
      2
    );
    compactTriggerTypePanel.textContent = JSON.stringify(
      {
        trigger_type: evt.payload?.trigger_type || null
      },
      null,
      2
    );
    compactSourceRangePanel.textContent = JSON.stringify(
      {
        source_event_from_seq:
          evt.payload?.source_event_from_seq || evt.payload?.source_event_range?.from_seq || null,
        source_event_to_seq:
          evt.payload?.source_event_to_seq || evt.payload?.source_event_range?.to_seq || null
      },
      null,
      2
    );
  }

  if (evt.type === "compact.artifact.written") {
    compactArtifactPathPanel.textContent = JSON.stringify(
      {
        compact_run_id: evt.payload?.compact_run_id || null,
        artifact_path: evt.payload?.artifact_path || null
      },
      null,
      2
    );
    compactIntegrityHashPanel.textContent = JSON.stringify(
      {
        integrity_hash: evt.payload?.integrity_hash || null
      },
      null,
      2
    );
  }

  if (evt.type === "compact.ledger.mapped") {
    deltaFromSeqPanel.textContent = JSON.stringify(
      {
        delta_from_seq: evt.payload?.delta_from_seq || null,
        hydrate_policy: evt.payload?.hydrate_policy || null
      },
      null,
      2
    );
  }

  if (evt.type === "compact.failed_controlled") {
    compactStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        compact_run_id: evt.payload?.compact_run_id || null
      },
      null,
      2
    );
    compactFallbackReasonPanel.textContent = JSON.stringify(
      {
        reason: evt.payload?.reason || null,
        fallback_mode: evt.payload?.fallback_mode || null
      },
      null,
      2
    );
  }

  if (
    evt.type === "stale.running.detected" ||
    evt.type === "stale.running.recovery.started" ||
    evt.type === "stale.running.recovery.completed" ||
    evt.type === "stale.running.recovery.failed_controlled"
  ) {
    staleRecoveryStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        run_id: evt.payload?.run_id || null,
        marker_status: evt.payload?.marker_status || null,
        heartbeat_status: evt.payload?.heartbeat_status || null,
        recovery_action: evt.payload?.recovery_action || null,
        final_status: evt.payload?.final_status || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "fork.requested" || evt.type === "fork.started" || evt.type === "fork.completed" || evt.type === "fork.failed_controlled") {
    forkStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        source_run_id: evt.payload?.source_run_id || null,
        fork_run_id: evt.payload?.fork_run_id || evt.run_id || null,
        baseline_run_id: evt.payload?.baseline_run_id || null,
        source_status: evt.payload?.source_status || null,
        fork_mode: evt.payload?.fork_mode || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
    sourceRunIdPanel.textContent = JSON.stringify(
      {
        source_run_id: evt.payload?.source_run_id || null,
        source_status: evt.payload?.source_status || null
      },
      null,
      2
    );
    forkRunIdPanel.textContent = JSON.stringify(
      {
        fork_run_id: evt.payload?.fork_run_id || evt.run_id || null
      },
      null,
      2
    );
    forkBaselinePanel.textContent = JSON.stringify(
      {
        baseline_run_id: evt.payload?.baseline_run_id || null
      },
      null,
      2
    );
    if (evt.type === "fork.completed") {
      forkRunStatusPanel.textContent = JSON.stringify(
        {
          fork_run_id: evt.payload?.fork_run_id || evt.run_id || null,
          status: evt.payload?.status || "completed"
        },
        null,
        2
      );
    }
    if (evt.type === "fork.failed_controlled") {
      forkRunStatusPanel.textContent = JSON.stringify(
        {
          fork_run_id: evt.payload?.fork_run_id || evt.run_id || null,
          status: "failed_controlled",
          reason: evt.payload?.reason || null
        },
        null,
        2
      );
    }
    forkLifecyclePanel.textContent = JSON.stringify(
      {
        lifecycle_event: evt.type,
        fork_run_id: evt.payload?.fork_run_id || evt.run_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "fork.policy.checked" || evt.type === "fork.policy.rejected" || evt.type === "fork.policy.redirected") {
    forkPolicyStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        policy_check_id: evt.payload?.policy_check_id || null,
        source_workspace: evt.payload?.source_workspace || null,
        target_workspace: evt.payload?.target_workspace || evt.payload?.requested_target_workspace || null,
        ancestry_relation: evt.payload?.ancestry_relation || null,
        self_copy_detected: evt.payload?.self_copy_detected || false,
        policy_action: evt.payload?.policy_action || (evt.type.endsWith("rejected") ? "reject" : evt.type.endsWith("redirected") ? "auto_redirect" : null),
        redirected_target: evt.payload?.redirected_target || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
    ancestryRelationPanel.textContent = JSON.stringify(
      { ancestry_relation: evt.payload?.ancestry_relation || null },
      null,
      2
    );
    policyActionForkPanel.textContent = JSON.stringify(
      {
        policy_action: evt.payload?.policy_action || (evt.type.endsWith("rejected") ? "reject" : evt.type.endsWith("redirected") ? "auto_redirect" : null),
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
    redirectedTargetPanel.textContent = JSON.stringify(
      { redirected_target: evt.payload?.redirected_target || null },
      null,
      2
    );
  }

  if (evt.type === "fork.workspace.created") {
    forkWorkspacePanel.textContent = JSON.stringify(evt.payload, null, 2);
    isolationResultPanel.textContent = JSON.stringify(
      {
        isolation_status: evt.payload?.isolation_status || null,
        source_workspace: evt.payload?.source_workspace || null,
        fork_workspace: evt.payload?.fork_workspace || null
      },
      null,
      2
    );
  }

  if (evt.type === "fork.lineage.written") {
    lineageTypePanel.textContent = JSON.stringify(
      {
        lineage_type: "fork",
        lineage_id: evt.payload?.lineage_id || null,
        source_compact_run_id: evt.payload?.source_compact_run_id || null,
        source_event_range: evt.payload?.source_event_range || null
      },
      null,
      2
    );
    sourceRunIdPanel.textContent = JSON.stringify(
      {
        source_run_id: evt.payload?.parent_run_id || null
      },
      null,
      2
    );
    forkRunIdPanel.textContent = JSON.stringify(
      {
        fork_run_id: evt.payload?.child_run_id || evt.run_id || null
      },
      null,
      2
    );
    forkBaselinePanel.textContent = JSON.stringify(
      {
        baseline_run_id: evt.payload?.baseline_run_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "fork.artifacts.mapped") {
    artifactMappingStatusPanel.textContent = JSON.stringify(
      {
        source_run_id: evt.payload?.source_run_id || null,
        fork_run_id: evt.payload?.fork_run_id || null,
        mapping_count: evt.payload?.mapping_count || 0,
        mapping_policy: evt.payload?.mapping_policy || null
      },
      null,
      2
    );
  }

  if (evt.type === "lineage.verified") {
    lineageTypePanel.textContent = JSON.stringify(
      {
        lineage_type: "fork",
        lineage_id: evt.payload?.lineage_id || null,
        integrity_status: evt.payload?.integrity_status || null
      },
      null,
      2
    );
  }

  if (evt.type === "fork.hydration.completed" || evt.type === "fork.resume.completed" || evt.type === "fork.compact.completed") {
    forkLifecyclePanel.textContent = JSON.stringify(
      {
        lifecycle_event: evt.type,
        run_id: evt.payload?.run_id || evt.run_id || null,
        parent_run_id: evt.payload?.parent_run_id || null,
        compact_run_id: evt.payload?.compact_run_id || null,
        final_status: evt.payload?.final_status || null
      },
      null,
      2
    );
  }

  if (evt.type === "context.projection.built") {
    contextProjectionStatusPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "context.projection.verified") {
    projectionIntegrityPanel.textContent = JSON.stringify(
      {
        projection_integrity: evt.payload?.projection_integrity || false,
        terminal_status: evt.payload?.terminal_status || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "phase4.closeout.started" || evt.type === "phase4.closeout.completed") {
    phase4CloseoutStatusPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "phase5.readiness.checked") {
    phase5ReadinessStatusPanel.textContent = JSON.stringify(
      {
        phase4_ready: evt.payload?.phase4_ready || false,
        phase5_ready: evt.payload?.phase5_ready || false,
        blocked_modules: evt.payload?.blocked_modules || [],
        evidence_path: evt.payload?.evidence_path || null
      },
      null,
      2
    );
    readinessBlockedReasonsPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || [],
        risks: evt.payload?.risks || []
      },
      null,
      2
    );
    phase5AllowedInputsPanel.textContent = JSON.stringify(
      { allowed_phase5_inputs: evt.payload?.allowed_phase5_inputs || [] },
      null,
      2
    );
    phase5ForbiddenActionsPanel.textContent = JSON.stringify(
      { forbidden_phase5_actions: evt.payload?.forbidden_phase5_actions || [] },
      null,
      2
    );
  }

  if (evt.type === "browser.discovery.started" || evt.type === "browser.discovery.completed") {
    browserDiscoveryStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        selected_browser: evt.payload?.selected_browser || null,
        tools: evt.payload?.tools || []
      },
      null,
      2
    );
    if (evt.payload?.selected_browser) {
      localBrowserPathPanel.textContent = JSON.stringify(evt.payload.selected_browser, null, 2);
    }
  }

  if (evt.type === "browser.adapter.install.required") {
    missingToolPanel.textContent = JSON.stringify(
      {
        required_tool: evt.payload?.required_tool || null,
        reason: evt.payload?.reason || null,
        install_mode: evt.payload?.install_mode || null
      },
      null,
      2
    );
    adapterInstallRequiredPanel.textContent = JSON.stringify(evt.payload || {}, null, 2);
    browserPolicyStatusPanel.textContent = JSON.stringify(
      {
        policy_status: "install_required",
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "browser.policy.checked") {
    browserPolicyStatusPanel.textContent = JSON.stringify(
      {
        policy_status: evt.payload?.policy_status || null,
        approved: evt.payload?.approved || false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "browser.smoke.started" || evt.type === "browser.smoke.completed") {
    browserSmokeStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        smoke_run_id: evt.payload?.smoke_run_id || null,
        status: evt.payload?.status || (evt.type === "browser.smoke.started" ? "started" : null),
        target: evt.payload?.target_url_or_path || null,
        screenshot_path: evt.payload?.screenshot_path || null,
        extracted_text: evt.payload?.extracted_text || null
      },
      null,
      2
    );
  }

  if (evt.type === "deploy.adapter.discovery.started" || evt.type === "deploy.adapter.discovery.completed") {
    deployAdapterDiscoveryStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        adapter_name: evt.payload?.adapter_name || null,
        status: evt.payload?.status || null,
        resolved_path: evt.payload?.resolved_path || null
      },
      null,
      2
    );
    if (evt.type === "deploy.adapter.discovery.completed") {
      deployAdapterReadonlyStatePanel.textContent = JSON.stringify(
        {
          adapter_name: evt.payload?.adapter_name || null,
          auth_state: evt.payload?.auth_state || null,
          readonly_actions: evt.payload?.readonly_actions || []
        },
        null,
        2
      );
    }
  }

  if (evt.type === "deploy.policy.checked") {
    deployPolicyStatusPanel.textContent = JSON.stringify(
      {
        adapter_name: evt.payload?.adapter_name || null,
        requested_action: evt.payload?.requested_action || null,
        policy_action: evt.payload?.policy_action || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "deploy.action.rejected") {
    deployRejectedReasonPanel.textContent = JSON.stringify(
      {
        adapter_name: evt.payload?.adapter_name || null,
        requested_action: evt.payload?.requested_action || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "phase5a.readiness.checked") {
    phase5aReadinessPanel.textContent = JSON.stringify(
      {
        readiness_id: evt.payload?.readiness_id || null,
        browser_lane_ready: evt.payload?.browser_lane_ready || false,
        deploy_adapter_gate_ready: evt.payload?.deploy_adapter_gate_ready || false,
        phase5a_ready: evt.payload?.phase5a_ready || false
      },
      null,
      2
    );
    phase5bReadinessPanel.textContent = JSON.stringify(
      {
        phase5b_ready: evt.payload?.phase5b_ready || false
      },
      null,
      2
    );
    phase5aBlockedReasonsPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || []
      },
      null,
      2
    );
    phase5aAllowedInputsPanel.textContent = JSON.stringify(
      {
        allowed_inputs: evt.payload?.allowed_inputs || []
      },
      null,
      2
    );
    phase5aForbiddenActionsPanel.textContent = JSON.stringify(
      {
        forbidden_actions: evt.payload?.forbidden_actions || []
      },
      null,
      2
    );
  }

  if (evt.type === "playwright.discovery.started" || evt.type === "playwright.discovery.completed") {
    playwrightDiscoveryStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        cli_status: evt.payload?.cli_status || null,
        discovery_source: evt.payload?.discovery_source || null,
        blocked_reason: evt.payload?.blocked_reason || null,
        final_status: evt.payload?.final_status || null
      },
      null,
      2
    );
    if (evt.type === "playwright.discovery.completed") {
      playwrightCliStatusPanel.textContent = JSON.stringify(
        {
          cli_path: evt.payload?.cli_path || null,
          cli_status: evt.payload?.cli_status || null,
          install_mode: evt.payload?.install_mode || null
        },
        null,
        2
      );
      playwrightBrowserBinaryStatusPanel.textContent = JSON.stringify(
        {
          browser_binary_status: evt.payload?.browser_binary_status || null,
          skip_browser_download: evt.payload?.skip_browser_download ?? null
        },
        null,
        2
      );
      playwrightChannelPanel.textContent = JSON.stringify(
        {
          browser_channel_used: evt.payload?.browser_channel_used || null
        },
        null,
        2
      );
    }
  }

  if (
    evt.type === "playwright.install.required" ||
    evt.type === "playwright.install.started" ||
    evt.type === "playwright.install.completed" ||
    evt.type === "playwright.install.failed_controlled"
  ) {
    playwrightInstallRequiredPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        required_tool: evt.payload?.required_tool || "playwright_cli",
        install_mode: evt.payload?.install_mode || null,
        blocked_reason: evt.payload?.blocked_reason || null,
        cli_path: evt.payload?.cli_path || null
      },
      null,
      2
    );
    playwrightInstallStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        install_run_id: evt.payload?.install_run_id || null,
        status:
          evt.type === "playwright.install.completed"
            ? "completed"
            : evt.type === "playwright.install.failed_controlled"
              ? "failed_controlled"
              : evt.type === "playwright.install.started"
                ? "started"
                : "required",
        cli_path: evt.payload?.cli_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "playwright.runtime.profile.applied") {
    playwrightRuntimeProfilePanel.textContent = JSON.stringify(
      {
        runtime_profile_id: evt.payload?.runtime_profile_id || null,
        profile_version: evt.payload?.profile_version || null,
        cli_mode: evt.payload?.cli_mode || null,
        browser_binary_download: evt.payload?.browser_binary_download || null,
        workers: evt.payload?.workers ?? null,
        fully_parallel: evt.payload?.fully_parallel ?? null,
        trace: evt.payload?.trace ?? null,
        video: evt.payload?.video ?? null,
        resource_mode: evt.payload?.resource_mode || null
      },
      null,
      2
    );
    playwrightChannelPanel.textContent = JSON.stringify(
      {
        browser_channel_used: evt.payload?.browser_channel_used || null
      },
      null,
      2
    );
  }

  if (evt.type === "browser.matrix.rerun.started" || evt.type === "browser.matrix.rerun.completed") {
    browserMatrixRerunScopePanel.textContent = JSON.stringify(
      {
        type: evt.type,
        rerun_scope: evt.payload?.rerun_scope || []
      },
      null,
      2
    );
    browserMatrixRerunCasePanel.textContent = JSON.stringify(
      {
        type: evt.type,
        status: evt.payload?.status || null,
        completed_cases: evt.payload?.completed_cases || [],
        failed_cases: evt.payload?.failed_cases || [],
        teardown: evt.payload?.teardown || null
      },
      null,
      2
    );
  }

  if (evt.type === "browser.matrix.action.started") {
    browserMatrixCurrentActionPanel.textContent = JSON.stringify(
      {
        action_name: evt.payload?.action_name || null,
        target: evt.payload?.target || null,
        action_input: evt.payload?.action_input || null
      },
      null,
      2
    );
  }

  if (evt.type === "browser.matrix.action.completed") {
    browserMatrixStatusPanel.textContent = JSON.stringify(
      {
        action_name: evt.payload?.action_name || null,
        status: evt.payload?.status || null,
        result: evt.payload?.result || null,
        screenshot_path: evt.payload?.screenshot_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "browser.matrix.action.blocked") {
    browserMatrixBlockedReasonPanel.textContent = JSON.stringify(
      {
        action_name: evt.payload?.action_name || null,
        target: evt.payload?.target || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "browser.verification.gate.checked" || evt.type === "browser.verification.completed") {
    browserVerificationGatePanel.textContent = JSON.stringify(
      {
        type: evt.type,
        verification_type: evt.payload?.verification_type || null,
        policy_status: evt.payload?.policy_status || null,
        status: evt.payload?.status || null,
        required_capabilities: evt.payload?.required_capabilities || [],
        granted_capabilities: evt.payload?.granted_capabilities || []
      },
      null,
      2
    );
  }

  if (evt.type === "phase5b.readiness.checked") {
    phase5bReadinessPanel.textContent = JSON.stringify(
      {
        readiness_id: evt.payload?.readiness_id || null,
        phase5b_ready: evt.payload?.phase5b_ready || false,
        playwright_cli_ready: evt.payload?.playwright_cli_ready || false,
        browser_action_matrix_ready: evt.payload?.browser_action_matrix_ready || false,
        post_auth_verification_gate_ready: evt.payload?.post_auth_verification_gate_ready || false
      },
      null,
      2
    );
    phase5bPreviousBlockerPanel.textContent = JSON.stringify(
      {
        previous_blocker: evt.payload?.previous_blocker || null
      },
      null,
      2
    );
    phase5bBlockerResolvedPanel.textContent = JSON.stringify(
      {
        blocker_resolved: evt.payload?.blocker_resolved || false
      },
      null,
      2
    );
    phase5bNewBlockedPanel.textContent = JSON.stringify(
      {
        new_blocked_modules: evt.payload?.new_blocked_modules || evt.payload?.blocked_modules || []
      },
      null,
      2
    );
    phase5bBlockedReasonsPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || []
      },
      null,
      2
    );
    phase5bAllowedInputsPanel.textContent = JSON.stringify(
      {
        allowed_inputs: evt.payload?.allowed_inputs || []
      },
      null,
      2
    );
    phase5bForbiddenActionsPanel.textContent = JSON.stringify(
      {
        forbidden_actions: evt.payload?.forbidden_actions || []
      },
      null,
      2
    );
  }

  if (evt.type === "browser.external.allowlist.checked") {
    externalProviderPanel.textContent = JSON.stringify(
      {
        provider: evt.payload?.provider || null
      },
      null,
      2
    );
    externalTargetPanel.textContent = JSON.stringify(
      {
        target_url: evt.payload?.target_url || null
      },
      null,
      2
    );
    externalAllowlistPanel.textContent = JSON.stringify(
      {
        allowlist_status: evt.payload?.allowlist_status || null,
        matched_rule: evt.payload?.matched_rule || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "approval.escalation.checked") {
    approvalEscalationPanel.textContent = JSON.stringify(
      {
        provider: evt.payload?.provider || null,
        target_url: evt.payload?.target_url || null,
        risk_level: evt.payload?.risk_level || null,
        policy_action: evt.payload?.policy_action || null,
        reason: evt.payload?.reason || null,
        requires_user_approval: evt.payload?.requires_user_approval || false
      },
      null,
      2
    );
  }

  if (
    evt.type === "browser.external.verification.started" ||
    evt.type === "browser.external.verification.completed" ||
    evt.type === "browser.external.verification.rejected"
  ) {
    externalVerificationPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        provider: evt.payload?.provider || null,
        target_url: evt.payload?.target_url || null,
        status: evt.payload?.status || (evt.type === "browser.external.verification.started" ? "started" : null),
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
    externalSelectorTextPanel.textContent = JSON.stringify(
      {
        expected_selector: evt.payload?.expected_selector || null,
        selector_summary: evt.payload?.selector_summary || null,
        text_summary: evt.payload?.text_summary || null
      },
      null,
      2
    );
    externalScreenshotPanel.textContent = JSON.stringify(
      {
        screenshot_path: evt.payload?.screenshot_path || null,
        receipt_path: evt.payload?.receipt_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "phase5c.readiness.checked") {
    phase5cReadinessPanel.textContent = JSON.stringify(
      {
        readiness_id: evt.payload?.readiness_id || null,
        readonly_external_verification_ready: evt.payload?.readonly_external_verification_ready || false,
        approval_escalation_ready: evt.payload?.approval_escalation_ready || false,
        phase5c_ready: evt.payload?.phase5c_ready || false,
        phase5d_ready: evt.payload?.phase5d_ready || false
      },
      null,
      2
    );
    phase5cBlockedPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || []
      },
      null,
      2
    );
    phase5cAllowedTargetsPanel.textContent = JSON.stringify(
      {
        allowed_external_targets: evt.payload?.allowed_external_targets || []
      },
      null,
      2
    );
    phase5cForbiddenActionsPanel.textContent = JSON.stringify(
      {
        forbidden_actions: evt.payload?.forbidden_actions || []
      },
      null,
      2
    );
  }

  if (
    evt.type === "approval.pending.created" ||
    evt.type === "approval.pending.restored" ||
    evt.type === "approval.pending.listed"
  ) {
    approvalPendingDetailPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        approval_request_id: evt.payload?.approval_request_id || null,
        provider: evt.payload?.provider || null,
        target_url: evt.payload?.target_url || null,
        pending_reason: evt.payload?.pending_reason || null,
        pending_since: evt.payload?.pending_since || null,
        expires_at: evt.payload?.expires_at || null,
        status: evt.payload?.status || null,
        restore_source: evt.payload?.restore_source || null,
        source: evt.payload?.source || null
      },
      null,
      2
    );
    refreshPendingApprovals().catch(() => {});
  }

  if (evt.type === "approval.approved" || evt.type === "approval.rejected" || evt.type === "approval.expired") {
    approvalDecisionStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        approval_request_id: evt.payload?.approval_request_id || null,
        decision_id: evt.payload?.decision_id || null,
        provider: evt.payload?.provider || null,
        target_url: evt.payload?.target_url || null,
        decision_source: evt.payload?.decision_source || null,
        approver_type: evt.payload?.approver_type || null,
        reason: evt.payload?.reason || null,
        receipt_path: evt.payload?.receipt_path || null
      },
      null,
      2
    );
    refreshPendingApprovals().catch(() => {});
  }

  if (evt.type === "approval.continue.started" || evt.type === "approval.continue.completed") {
    approvalContinuationStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        approval_request_id: evt.payload?.approval_request_id || null,
        decision_id: evt.payload?.decision_id || null,
        continuation_status: evt.payload?.continuation_status || null,
        reason: evt.payload?.reason || null,
        receipt_path: evt.payload?.receipt_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "phase5d.readiness.checked") {
    phase5dReadinessPanel.textContent = JSON.stringify(
      {
        readiness_id: evt.payload?.readiness_id || null,
        pending_persistence_ready: evt.payload?.pending_persistence_ready || false,
        approval_decision_ready: evt.payload?.approval_decision_ready || false,
        same_run_continue_ready: evt.payload?.same_run_continue_ready || false,
        phase5d_ready: evt.payload?.phase5d_ready || false,
        phase5e_ready: evt.payload?.phase5e_ready || false
      },
      null,
      2
    );
    phase5dBlockedPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || []
      },
      null,
      2
    );
    phase5dAllowedTargetsPanel.textContent = JSON.stringify(
      {
        allowed_external_targets: evt.payload?.allowed_external_targets || []
      },
      null,
      2
    );
    phase5dForbiddenActionsPanel.textContent = JSON.stringify(
      {
        forbidden_actions: evt.payload?.forbidden_actions || []
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.discovery.started" || evt.type === "e2b.discovery.completed") {
    e2bDiscoveryPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        e2b_discovery_id: evt.payload?.e2b_discovery_id || null,
        status: evt.payload?.status || null,
        sdk_or_cli_mode: evt.payload?.sdk_or_cli_mode || null,
        credential_status: evt.payload?.credential_status || null,
        env_key_present: evt.payload?.env_key_present ?? null,
        cli_found: evt.payload?.cli_found ?? null,
        cli_path: evt.payload?.cli_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.routing.selected") {
    e2bRoutingDecisionPanel.textContent = JSON.stringify(
      {
        lane_decision_id: evt.payload?.lane_decision_id || null,
        task_type: evt.payload?.task_type || null,
        routing_reason: evt.payload?.routing_reason || null,
        local_allowed: evt.payload?.local_allowed || false,
        e2b_required: evt.payload?.e2b_required || false,
        final_lane: evt.payload?.final_lane || null
      },
      null,
      2
    );
    e2bFinalLanePanel.textContent = JSON.stringify(
      {
        final_lane: evt.payload?.final_lane || null
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.sandbox.create.started" || evt.type === "e2b.sandbox.create.completed") {
    e2bSandboxCreatePanel.textContent = JSON.stringify(
      {
        type: evt.type,
        create_status: evt.payload?.create_status || null,
        timeout_ms: evt.payload?.timeout_ms || null,
        sandbox_id_redacted: evt.payload?.sandbox_id_redacted || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.execution.started" || evt.type === "e2b.execution.completed") {
    e2bExecutionPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        command_summary: evt.payload?.command_summary || null,
        cwd_summary: evt.payload?.cwd_summary || null,
        execute_status: evt.payload?.execute_status || null,
        exit_code: evt.payload?.exit_code ?? null,
        stdout_summary: evt.payload?.stdout_summary || null,
        stderr_summary: evt.payload?.stderr_summary || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.artifacts.collected") {
    e2bArtifactPanel.textContent = JSON.stringify(
      {
        artifact_path: evt.payload?.artifact_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.sandbox.teardown.started" || evt.type === "e2b.sandbox.teardown.completed") {
    e2bTeardownPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        teardown_status: evt.payload?.teardown_status || null,
        sandbox_id_redacted: evt.payload?.sandbox_id_redacted || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "phase6a.readiness.checked") {
    phase6aReadinessPanel.textContent = JSON.stringify(
      {
        readiness_id: evt.payload?.readiness_id || null,
        api_key_ready: evt.payload?.api_key_ready || false,
        sdk_or_cli_ready: evt.payload?.sdk_or_cli_ready || false,
        sandbox_create_ready: evt.payload?.sandbox_create_ready || false,
        sandbox_execute_ready: evt.payload?.sandbox_execute_ready || false,
        sandbox_teardown_ready: evt.payload?.sandbox_teardown_ready || false,
        phase6a_ready: evt.payload?.phase6a_ready || false
      },
      null,
      2
    );
    phase6aBlockedPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || []
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.task.started" || evt.type === "e2b.task.completed" || evt.type === "e2b.task.failed") {
    phase6bTaskPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        task_type: evt.payload?.task_type || null,
        final_lane: evt.payload?.final_lane || evt.payload?.lane || null,
        sandbox_run_id: evt.payload?.sandbox_run_id || null,
        execution_result_id: evt.payload?.execution_result_id || null,
        final_status: evt.payload?.final_status || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.failure.classified") {
    phase6bFailurePanel.textContent = JSON.stringify(
      {
        failure_event_id: evt.payload?.failure_event_id || null,
        failure_type: evt.payload?.failure_type || null,
        failure_stage: evt.payload?.failure_stage || null,
        retry_count: evt.payload?.retry_count ?? null,
        recovery_action: evt.payload?.recovery_action || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (
    evt.type === "e2b.fallback.selected" ||
    evt.type === "e2b.fallback.completed" ||
    evt.type === "e2b.fallback.failed_controlled"
  ) {
    phase6bFallbackPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        task_type: evt.payload?.task_type || null,
        original_lane: evt.payload?.original_lane || "e2b",
        fallback_lane: evt.payload?.fallback_lane || null,
        fallback_run_id: evt.payload?.fallback_run_id || null,
        same_run_continue: evt.payload?.same_run_continue ?? null,
        reason: evt.payload?.reason || null,
        final_status: evt.payload?.final_status || null
      },
      null,
      2
    );
    phase6bSameRunPanel.textContent = JSON.stringify(
      {
        same_run_continue: evt.payload?.same_run_continue ?? null,
        continuation_result:
          evt.type === "e2b.fallback.completed"
            ? "continued_completed"
            : evt.type === "e2b.fallback.failed_controlled"
              ? "failed_controlled"
              : "pending"
      },
      null,
      2
    );
  }

  if (evt.type === "phase6b.readiness.checked") {
    phase6bReadinessPanel.textContent = JSON.stringify(
      {
        readiness_id: evt.payload?.readiness_id || null,
        real_task_matrix_ready: evt.payload?.real_task_matrix_ready || false,
        failure_hardening_ready: evt.payload?.failure_hardening_ready || false,
        local_fallback_ready: evt.payload?.local_fallback_ready || false,
        phase6b_ready: evt.payload?.phase6b_ready || false,
        phase6c_ready: evt.payload?.phase6c_ready || false
      },
      null,
      2
    );
    phase6bBlockedPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || []
      },
      null,
      2
    );
    phase6bFallbackEnabledPanel.textContent = JSON.stringify(
      {
        fallback_enabled_tasks: evt.payload?.fallback_enabled_tasks || []
      },
      null,
      2
    );
    phase6bNonFallbackPanel.textContent = JSON.stringify(
      {
        non_fallback_tasks: evt.payload?.non_fallback_tasks || []
      },
      null,
      2
    );
  }

  if (evt.type === "e2b.workspace.sync.started" || evt.type === "e2b.workspace.sync.completed") {
    phase6cTaskTypePanel.textContent = JSON.stringify(
      {
        type: evt.type,
        task_type: evt.payload?.task_type || null,
        workspace_sync_id: evt.payload?.workspace_sync_id || null,
        sandbox_workspace_ref: evt.payload?.sandbox_workspace_ref || null,
        local_workspace_ref: evt.payload?.local_workspace_ref || null,
        status: evt.payload?.status || null
      },
      null,
      2
    );
    phase6cDiffSummaryPanel.textContent = JSON.stringify(
      {
        patch_artifact_path: evt.payload?.patch_artifact_path || null,
        diff_summary: evt.payload?.diff_summary || null
      },
      null,
      2
    );
  }

  if (evt.type === "writeback.candidate.created") {
    phase6cHashStatusPanel.textContent = JSON.stringify(
      {
        candidate_id: evt.payload?.candidate_id || null,
        baseline_hash: evt.payload?.baseline_hash || null
      },
      null,
      2
    );
  }

  if (evt.type === "writeback.gate.checked") {
    phase6cGateStatusPanel.textContent = JSON.stringify(
      {
        candidate_id: evt.payload?.candidate_id || null,
        gate_status: evt.payload?.gate_status || null,
        diff_binding_status: evt.payload?.diff_binding_status || null
      },
      null,
      2
    );
    phase6cHashStatusPanel.textContent = JSON.stringify(
      {
        baseline_hash: evt.payload?.baseline_hash || null,
        current_hash: evt.payload?.current_hash || null
      },
      null,
      2
    );
    phase6cRejectReasonPanel.textContent = JSON.stringify(
      {
        reasons: evt.payload?.reasons || []
      },
      null,
      2
    );
  }

  if (evt.type === "writeback.applied" || evt.type === "writeback.rejected") {
    phase6cApplyRejectPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        application_id: evt.payload?.application_id || null,
        apply_status: evt.payload?.apply_status || null,
        verify_status: evt.payload?.verify_status || null,
        applied_files: evt.payload?.applied_files || [],
        receipt_path: evt.payload?.receipt_path || null
      },
      null,
      2
    );
    if (evt.type === "writeback.rejected") {
      phase6cRejectReasonPanel.textContent = JSON.stringify(
        {
          reject_reason: evt.payload?.reject_reason || null,
          conflict_type: evt.payload?.conflict_type || null
        },
        null,
        2
      );
    }
  }

  if (evt.type === "writeback.verify.completed") {
    phase6cVerifyPanel.textContent = JSON.stringify(
      {
        verify_status: evt.payload?.verify_status || null,
        exit_code: evt.payload?.exit_code ?? null,
        stdout_summary: evt.payload?.stdout_summary || null,
        stderr_summary: evt.payload?.stderr_summary || null
      },
      null,
      2
    );
  }

  if (evt.type === "phase6c.readiness.checked") {
    phase6cReadinessPanel.textContent = JSON.stringify(
      {
        readiness_id: evt.payload?.readiness_id || null,
        workspace_sync_ready: evt.payload?.workspace_sync_ready || false,
        writeback_gate_ready: evt.payload?.writeback_gate_ready || false,
        conflict_reject_ready: evt.payload?.conflict_reject_ready || false,
        phase6c_ready: evt.payload?.phase6c_ready || false
      },
      null,
      2
    );
    phase6cV1CloseoutPanel.textContent = JSON.stringify(
      {
        v1_closeout_ready: evt.payload?.v1_closeout_ready || false
      },
      null,
      2
    );
    phase6cListsPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || [],
        writeback_enabled_task_types: evt.payload?.writeback_enabled_task_types || [],
        rejected_writeback_conditions: evt.payload?.rejected_writeback_conditions || []
      },
      null,
      2
    );
  }

  if (evt.type === "workspace.root.bound" || evt.type === "workspace.root.rejected") {
    workspaceWorkingRootPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        root_id: evt.payload?.root_id || null,
        working_root: evt.payload?.working_root || null,
        detected_project_root: evt.payload?.detected_project_root || null,
        root_config_sources: evt.payload?.root_config_sources || [],
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "task.storage.created") {
    workspaceStorageRootsPanel.textContent = JSON.stringify(
      {
        working_root: evt.payload?.working_root || null,
        task_root: evt.payload?.task_root || null,
        artifact_root: evt.payload?.artifact_root || null,
        scratch_root: evt.payload?.scratch_root || null
      },
      null,
      2
    );
  }

  if (evt.type === "path.jail.checked") {
    workspacePathJailPanel.textContent = JSON.stringify(
      {
        path_checked: evt.payload?.path_checked || null,
        policy_status: evt.payload?.policy_status || null,
        reject_reason: evt.payload?.reject_reason || null
      },
      null,
      2
    );
  }

  if (
    evt.type === "deploy.preflight.started" ||
    evt.type === "deploy.preflight.completed" ||
    evt.type === "deploy.command.started" ||
    evt.type === "deploy.command.completed" ||
    evt.type === "deploy.command.failed"
  ) {
    deployCloseoutPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        provider: evt.payload?.provider || null,
        deploy_mode: evt.payload?.deploy_mode || null,
        preflight_status: evt.payload?.preflight_status || null,
        deploy_status: evt.payload?.deploy_status || null,
        release_url_redacted: evt.payload?.release_url_redacted || null,
        receipt_path: evt.payload?.receipt_path || null,
        reason: evt.payload?.reason || evt.payload?.failure_class || null
      },
      null,
      2
    );
  }

  if (evt.type === "deploy.retry.started" || evt.type === "deploy.retry.completed") {
    deployRetryStatusPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        retry_number: evt.payload?.retry_number ?? null,
        failure_class: evt.payload?.failure_class || null,
        correction_applied: evt.payload?.correction_applied || null,
        status: evt.payload?.status || null
      },
      null,
      2
    );
  }

  if (evt.type === "release.receipt.created") {
    releaseReceiptPanel.textContent = JSON.stringify(
      {
        provider: evt.payload?.provider || null,
        release_url_redacted: evt.payload?.release_url_redacted || null,
        receipt_path: evt.payload?.receipt_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "online.verification.started" || evt.type === "online.verification.completed") {
    onlineVerificationPanel.textContent = JSON.stringify(
      {
        type: evt.type,
        release_url_redacted: evt.payload?.release_url_redacted || null,
        node_status: evt.payload?.node_status || null,
        powershell_status: evt.payload?.powershell_status || null,
        browser_status: evt.payload?.browser_status || null,
        final_status: evt.payload?.final_status || null,
        pass_count: evt.payload?.pass_count ?? null
      },
      null,
      2
    );
  }

  if (evt.type === "final.operational.readiness.checked") {
    finalOperationalReadinessPanel.textContent = JSON.stringify(
      {
        workspace_root_binding_ready: evt.payload?.workspace_root_binding_ready || false,
        task_storage_root_ready: evt.payload?.task_storage_root_ready || false,
        real_deploy_closeout_ready: evt.payload?.real_deploy_closeout_ready || false,
        online_verification_ready: evt.payload?.online_verification_ready || false,
        release_flow_ready: evt.payload?.release_flow_ready || false,
        litecodex_v1_operational_ready: evt.payload?.litecodex_v1_operational_ready || false
      },
      null,
      2
    );
    operationalBlockedPanel.textContent = JSON.stringify(
      {
        blocked_modules: evt.payload?.blocked_modules || []
      },
      null,
      2
    );
  }

  if (evt.type === "phase3.closeout.completed") {
    phase3CloseoutStatusPanel.textContent = JSON.stringify(
      {
        status: evt.payload?.final_status || null,
        case_id: evt.payload?.case_id || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "file.read.started" || evt.type === "file.read.completed" || evt.type === "file.write.started" || evt.type === "file.write.completed") {
    fileSummaryPanel.textContent = `${evt.type} | ${JSON.stringify(evt.payload, null, 2)}`;
  }

  if (evt.type === "shell.command.started" || evt.type === "shell.command.completed") {
    commandCwdPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "git.status.completed") {
    gitStatusSummaryPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "git.diff.completed") {
    gitDiffSummaryPanel.textContent = JSON.stringify(evt.payload, null, 2);
  }

  if (evt.type === "verify.started") {
    verifyStatusPanel.textContent = `verify.started | ${JSON.stringify(evt.payload, null, 2)}`;
    verifyAttemptPanel.textContent = JSON.stringify(
      {
        case_id: evt.payload?.case_id || null,
        attempt: evt.payload?.attempt || null,
        current_attempt: evt.payload?.current_attempt || evt.payload?.attempt || null
      },
      null,
      2
    );
    attemptBudgetPanel.textContent = JSON.stringify(
      {
        max_attempts: evt.payload?.max_attempts || null,
        current_attempt: evt.payload?.current_attempt || evt.payload?.attempt || null
      },
      null,
      2
    );
    timeoutMsPanel.textContent = JSON.stringify(
      { timeout_ms: evt.payload?.timeout_ms || null },
      null,
      2
    );
  }

  if (evt.type === "verify.failed") {
    verifyStatusPanel.textContent = `verify.failed | ${JSON.stringify(evt.payload, null, 2)}`;
    failedCommandPanel.textContent = JSON.stringify(
      {
        command: evt.payload?.command || null,
        cwd: evt.payload?.cwd || null,
        exit_code: evt.payload?.exit_code || null
      },
      null,
      2
    );
    verifyFailurePanel.textContent = JSON.stringify(
      {
        attempt: evt.payload?.attempt || null,
        failure_summary: evt.payload?.failure_summary || null,
        exit_code: evt.payload?.exit_code || null
      },
      null,
      2
    );
    ioSummaryPanel.textContent = JSON.stringify(
      {
        stdout_summary: evt.payload?.stdout_summary || null,
        stderr_summary: evt.payload?.stderr_summary || null,
        duration_ms: evt.payload?.duration_ms || null
      },
      null,
      2
    );
  }

  if (
    evt.type === "repair.started" ||
    evt.type === "repair.completed" ||
    evt.type === "repair.skipped" ||
    evt.type === "repair.failed"
  ) {
    repairActionPanel.textContent = `${evt.type} | ${JSON.stringify(evt.payload, null, 2)}`;
  }

  if (evt.type === "verify.passed") {
    verifyStatusPanel.textContent = `verify.passed | ${JSON.stringify(evt.payload, null, 2)}`;
    finalStatusPanel.textContent = JSON.stringify(
      {
        status: "verify.passed",
        case_id: evt.payload?.case_id || null,
        attempt: evt.payload?.attempt || null,
        replay_artifact_path: evt.payload?.replay_artifact_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "verify.failure.classified") {
    failureClassPanel.textContent = JSON.stringify(
      {
        case_id: evt.payload?.case_id || null,
        attempt: evt.payload?.attempt || null,
        failure_class: evt.payload?.failure_class || null,
        verify_run_id: evt.payload?.verify_run_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "repair.strategy.selected") {
    repairStrategyPanel.textContent = JSON.stringify(
      {
        case_id: evt.payload?.case_id || null,
        attempt: evt.payload?.attempt || null,
        selected_strategy: evt.payload?.selected_strategy || null,
        retryable: evt.payload?.retryable || false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "command.adjustment.proposed") {
    failedCommandPanel.textContent = JSON.stringify(
      {
        failed_command: evt.payload?.failed_command || null
      },
      null,
      2
    );
    adjustedCommandPanel.textContent = JSON.stringify(
      {
        adjusted_command: evt.payload?.adjusted_command || null,
        adjustment_id: evt.payload?.adjustment_id || null,
        reason: evt.payload?.reason || null,
        confidence: evt.payload?.confidence || null
      },
      null,
      2
    );
    adjustedCwdPanel.textContent = JSON.stringify(
      {
        adjusted_cwd: evt.payload?.adjusted_cwd || null
      },
      null,
      2
    );
  }

  if (evt.type === "command.adjustment.policy_checked") {
    commandPolicyPanel.textContent = JSON.stringify(
      {
        adjustment_id: evt.payload?.adjustment_id || null,
        policy_status: evt.payload?.policy_status || null,
        approved: evt.payload?.approved || false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "command.adjustment.applied") {
    adjustedCommandPanel.textContent = JSON.stringify(
      {
        adjusted_command: evt.payload?.adjusted_command || null,
        adjustment_id: evt.payload?.adjustment_id || null
      },
      null,
      2
    );
    adjustedCwdPanel.textContent = JSON.stringify(
      {
        adjusted_cwd: evt.payload?.adjusted_cwd || null
      },
      null,
      2
    );
  }

  if (evt.type === "dependency.missing.detected") {
    missingDependencyPanel.textContent = JSON.stringify(
      {
        missing_dependency: evt.payload?.missing_dependency || null,
        verify_run_id: evt.payload?.verify_run_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "dependency.install.proposed") {
    dependencyInstallProposalPanel.textContent = JSON.stringify(
      {
        proposal_id: evt.payload?.proposal_id || null,
        package_manager: evt.payload?.package_manager || null,
        dependency_name: evt.payload?.dependency_name || null,
        dependency_type: evt.payload?.dependency_type || null,
        install_command: evt.payload?.install_command || null
      },
      null,
      2
    );
  }

  if (evt.type === "dependency.install.policy_checked") {
    installPolicyStatusPanel.textContent = JSON.stringify(
      {
        proposal_id: evt.payload?.proposal_id || null,
        policy_status: evt.payload?.policy_status || null,
        approved: evt.payload?.approved || false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "dependency.install.rollback_snapshot.created") {
    rollbackSnapshotPanel.textContent = JSON.stringify(
      {
        proposal_id: evt.payload?.proposal_id || null,
        snapshot_artifact_path: evt.payload?.snapshot_artifact_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "install.rollback.snapshot.created") {
    const payload = {
      snapshot_id: evt.payload?.snapshot_id || null,
      proposal_id: evt.payload?.proposal_id || null,
      affected_files: evt.payload?.affected_files || [],
      snapshot_artifact_path: evt.payload?.snapshot_artifact_path || null
    };
    rollbackSnapshotPanel.textContent = JSON.stringify(payload, null, 2);
    installRollbackSnapshotIdPanel.textContent = JSON.stringify(
      {
        snapshot_id: evt.payload?.snapshot_id || null
      },
      null,
      2
    );
    installRollbackAffectedFilesPanel.textContent = JSON.stringify(
      {
        affected_files: evt.payload?.affected_files || []
      },
      null,
      2
    );
    installRollbackStatusPanel.textContent = JSON.stringify(
      {
        rollback_status: "snapshot_created"
      },
      null,
      2
    );
  }

  if (evt.type === "dependency.install.started") {
    installStatusPanel.textContent = JSON.stringify(
      {
        status: "started",
        proposal_id: evt.payload?.proposal_id || null,
        command: evt.payload?.command || null,
        cwd: evt.payload?.cwd || null
      },
      null,
      2
    );
  }

  if (evt.type === "dependency.install.completed") {
    installStatusPanel.textContent = JSON.stringify(
      {
        status: evt.payload?.status || "completed",
        proposal_id: evt.payload?.proposal_id || null,
        install_run_id: evt.payload?.install_run_id || null,
        exit_code: evt.payload?.exit_code || null,
        artifacts_path: evt.payload?.artifacts_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "install.rollback.started") {
    installRollbackStatusPanel.textContent = JSON.stringify(
      {
        rollback_status: "started",
        snapshot_id: evt.payload?.snapshot_id || null,
        snapshot_artifact_path: evt.payload?.snapshot_artifact_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "install.rollback.completed") {
    installRollbackStatusPanel.textContent = JSON.stringify(
      {
        rollback_status: "completed",
        snapshot_id: evt.payload?.snapshot_id || null,
        rollback_run_id: evt.payload?.rollback_run_id || null,
        artifacts_path: evt.payload?.artifacts_path || null
      },
      null,
      2
    );
    installRollbackVerificationPanel.textContent = JSON.stringify(
      {
        verification_status: evt.payload?.verification_status || null,
        git_status_after: evt.payload?.git_status_after || null
      },
      null,
      2
    );
  }

  if (evt.type === "install.rollback.failed") {
    installRollbackStatusPanel.textContent = JSON.stringify(
      {
        rollback_status: "failed",
        snapshot_id: evt.payload?.snapshot_id || null,
        rollback_run_id: evt.payload?.rollback_run_id || null,
        artifacts_path: evt.payload?.artifacts_path || null
      },
      null,
      2
    );
    installRollbackVerificationPanel.textContent = JSON.stringify(
      {
        verification_status: evt.payload?.verification_status || null,
        restore_summary: evt.payload?.restore_summary || null
      },
      null,
      2
    );
  }

  if (evt.type === "dependency.install.rejected") {
    installStatusPanel.textContent = JSON.stringify(
      {
        status: "rejected",
        proposal_id: evt.payload?.proposal_id || null,
        reason: evt.payload?.reason || null,
        policy_status: evt.payload?.policy_status || null
      },
      null,
      2
    );
  }

  if (evt.type === "repair.planner.started") {
    candidateFilesPanel.textContent = JSON.stringify(
      {
        planner: evt.payload?.planner_id || "repair_planner.v1",
        input: evt.payload?.input || {}
      },
      null,
      2
    );
  }

  if (evt.type === "repair.candidate_files.selected") {
    candidateFilesPanel.textContent = JSON.stringify(
      {
        case_id: evt.payload?.case_id || null,
        verify_run_id: evt.payload?.verify_run_id || null,
        candidate_files: evt.payload?.candidate_files || [],
        confidence: evt.payload?.confidence || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "patch.proposal.created") {
    patchProposalPanel.textContent = JSON.stringify(
      {
        proposal_id: evt.payload?.proposal_id || null,
        verify_run_id: evt.payload?.verify_run_id || null,
        target_files: evt.payload?.target_files || [],
        risk_level: evt.payload?.risk_level || null,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
    diffArtifactPanel.textContent = JSON.stringify(
      {
        proposal_artifact_path: evt.payload?.proposal_artifact_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "patch.policy.checked") {
    policyStatusPanel.textContent = JSON.stringify(
      {
        proposal_id: evt.payload?.proposal_id || null,
        policy_status: evt.payload?.policy_status || null,
        approved: evt.payload?.approved || false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "patch.applied") {
    filesChangedPanel.textContent = JSON.stringify(
      {
        proposal_id: evt.payload?.proposal_id || null,
        files_changed: evt.payload?.files_changed || 0
      },
      null,
      2
    );
    diffArtifactPanel.textContent = JSON.stringify(
      {
        diff_artifact_path: evt.payload?.diff_artifact_path || null,
        patch_application_id: evt.payload?.patch_application_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "patch.rejected") {
    policyStatusPanel.textContent = JSON.stringify(
      {
        proposal_id: evt.payload?.proposal_id || null,
        policy_status: evt.payload?.policy_status || null,
        approved: false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "rollback.snapshot.created") {
    rollbackSnapshotPanel.textContent = JSON.stringify(
      {
        snapshot_id: evt.payload?.snapshot_id || null,
        snapshot_artifact_path: evt.payload?.snapshot_artifact_path || null,
        proposal_id: evt.payload?.proposal_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "rollback.applied") {
    rollbackSnapshotPanel.textContent = JSON.stringify(
      {
        snapshot_id: evt.payload?.snapshot_id || null,
        snapshot_artifact_path: evt.payload?.snapshot_artifact_path || null,
        restored: evt.payload?.restored || false,
        restored_files: evt.payload?.restored_files || []
      },
      null,
      2
    );
  }

  if (evt.type === "verify.retry.scheduled") {
    verifyStatusPanel.textContent = `verify.retry.scheduled | ${JSON.stringify(evt.payload, null, 2)}`;
    verifyRetryPanel.textContent = JSON.stringify(
      {
        from_attempt: evt.payload?.from_attempt || null,
        to_attempt: evt.payload?.to_attempt || null,
        failure_class: evt.payload?.failure_class || null,
        selected_strategy: evt.payload?.selected_strategy || null,
        proposal_id: evt.payload?.proposal_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "replay.evidence.written") {
    replayEvidencePanel.textContent = JSON.stringify(
      {
        case_id: evt.payload?.case_id || null,
        verify_run_id: evt.payload?.verify_run_id || null,
        replay_artifact_path: evt.payload?.replay_artifact_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "replay.runner.started") {
    replayTypePanel.textContent = JSON.stringify(
      {
        replay_type: evt.payload?.replay_type || null,
        replay_id: evt.payload?.replay_id || null
      },
      null,
      2
    );
    replaySourcePanel.textContent = JSON.stringify(
      {
        source_run_id: evt.payload?.source_run_id || null,
        source_artifact_path: evt.payload?.source_artifact_path || null
      },
      null,
      2
    );
    replayCommandSummaryPanel.textContent = JSON.stringify(
      {
        command_summary: evt.payload?.command_summary || null
      },
      null,
      2
    );
  }

  if (evt.type === "replay.policy.checked") {
    replayPolicyStatusPanel.textContent = JSON.stringify(
      {
        replay_id: evt.payload?.replay_id || null,
        replay_type: evt.payload?.replay_type || null,
        policy_status: evt.payload?.policy_status || null,
        approved: evt.payload?.approved || false,
        reason: evt.payload?.reason || null
      },
      null,
      2
    );
  }

  if (evt.type === "replay.command.started" || evt.type === "replay.command.completed") {
    replayCommandSummaryPanel.textContent = JSON.stringify(
      {
        replay_id: evt.payload?.replay_id || null,
        replay_type: evt.payload?.replay_type || null,
        command: evt.payload?.command || null,
        cwd: evt.payload?.cwd || null,
        exit_code: evt.payload?.exit_code || null
      },
      null,
      2
    );
  }

  if (evt.type === "replay.verify.started" || evt.type === "replay.verify.completed") {
    verifyStatusPanel.textContent = `${evt.type} | ${JSON.stringify(evt.payload, null, 2)}`;
  }

  if (evt.type === "replay.completed" || evt.type === "replay.failed_controlled") {
    replayFinalStatusPanel.textContent = JSON.stringify(
      {
        replay_id: evt.payload?.replay_id || null,
        replay_type: evt.payload?.replay_type || null,
        final_status: evt.type === "replay.completed" ? "completed" : "failed_controlled",
        reason: evt.payload?.reason || null,
        artifacts_path: evt.payload?.artifacts_path || null
      },
      null,
      2
    );
  }

  if (evt.type === "verify.controlled_failed") {
    controlledFailedPanel.textContent = JSON.stringify(evt.payload, null, 2);
    finalStatusPanel.textContent = JSON.stringify(
      {
        status: "verify.controlled_failed",
        case_id: evt.payload?.case_id || null,
        failure_class: evt.payload?.failure_class || null,
        selected_strategy: evt.payload?.selected_strategy || null
      },
      null,
      2
    );
  }

  if (evt.type === "auth.required") {
    activeAuthSessionId = evt.payload.auth_session_id;
    authSessionStatusPanel.textContent = `pending | ${JSON.stringify(evt.payload, null, 2)}`;
    if (isVercelEvent(evt)) {
      vercelAuthStatusPanel.textContent = `required | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (isWranglerEvent(evt)) {
      wranglerAuthStatusPanel.textContent = `required | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (isSupabaseEvent(evt)) {
      supabaseAuthStatusPanel.textContent = `required | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.mode.selected") {
    recipeVerifierPanel.textContent = JSON.stringify(
      {
        mode: evt.payload.mode,
        selected_recipe_id: evt.payload.selected_recipe_id,
        selected_verifier_id: evt.payload.selected_verifier_id,
        lifecycle_state: evt.payload.lifecycle_state
      },
      null,
      2
    );
  }

  if (
    evt.type === "auth.challenge.emitted" ||
    evt.type === "auth.browser_opened" ||
    evt.type === "auth.command_rendered" ||
    evt.type === "auth.input_requested"
  ) {
    authCommandPanel.textContent = JSON.stringify(evt.payload, null, 2);
    if (evt.type === "auth.command_rendered" && String(evt.payload?.command || "").includes("vercel login")) {
      vercelAuthStatusPanel.textContent = `command_rendered | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (evt.type === "auth.command_rendered" && String(evt.payload?.command || "").includes("wrangler login")) {
      wranglerAuthStatusPanel.textContent = `command_rendered | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (evt.type === "auth.input_requested" && isSupabaseEvent(evt)) {
      supabaseAuthStatusPanel.textContent = `input_requested | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.pending_user_action") {
    activeAuthSessionId = evt.payload.auth_session_id;
    authSessionStatusPanel.textContent = `pending | ${JSON.stringify(evt.payload, null, 2)}`;
    if (isVercelEvent(evt)) {
      vercelAuthStatusPanel.textContent = `pending_user_action | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (isWranglerEvent(evt)) {
      wranglerAuthStatusPanel.textContent = `pending_user_action | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (isSupabaseEvent(evt)) {
      supabaseAuthStatusPanel.textContent = `pending_user_action | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.user_submitted") {
    tokenState.textContent = JSON.stringify(evt.payload, null, 2);
    if (isSupabaseEvent(evt)) {
      supabaseAuthStatusPanel.textContent = `user_submitted | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.verifying") {
    verificationStatus.textContent = `verifying | ${JSON.stringify(evt.payload, null, 2)}`;
    if (evt.payload?.verifier_id === "verifier.vercel_cli_login.real.v1") {
      vercelAuthStatusPanel.textContent = `detecting/verifying | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (evt.payload?.verifier_id === "wrangler_oauth_verifier") {
      wranglerAuthStatusPanel.textContent = `detecting/verifying | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (evt.payload?.verifier_id === "supabase_token_verifier") {
      supabaseAuthStatusPanel.textContent = `detecting/verifying | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.detected_external_completion") {
    if (isVercelEvent(evt)) {
      vercelAuthStatusPanel.textContent = `detected_external_completion | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (isWranglerEvent(evt)) {
      wranglerAuthStatusPanel.textContent = `detected_external_completion | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.verified") {
    authSessionStatusPanel.textContent = `verified | ${JSON.stringify(evt.payload, null, 2)}`;
    verificationStatus.textContent = `verified | ${JSON.stringify(evt.payload, null, 2)}`;
    if (evt.payload?.selected_verifier_id === "verifier.vercel_cli_login.real.v1") {
      vercelAuthStatusPanel.textContent = `verified | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (evt.payload?.selected_verifier_id === "wrangler_oauth_verifier") {
      wranglerAuthStatusPanel.textContent = `verified | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (evt.payload?.selected_verifier_id === "supabase_token_verifier") {
      supabaseAuthStatusPanel.textContent = `verified | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.failed") {
    authSessionStatusPanel.textContent = `failed | ${JSON.stringify(evt.payload, null, 2)}`;
    verificationStatus.textContent = `failed | ${JSON.stringify(evt.payload, null, 2)}`;
    if (isSupabaseEvent(evt)) {
      supabaseAuthStatusPanel.textContent = `failed | ${JSON.stringify(evt.payload, null, 2)}`;
    }
  }

  if (evt.type === "auth.timeout") {
    activeAuthSessionId = null;
    authSessionStatusPanel.textContent = `timeout | ${JSON.stringify(evt.payload, null, 2)}`;
  }

  if (evt.type === "auth.cancelled") {
    activeAuthSessionId = null;
    authSessionStatusPanel.textContent = `cancelled | ${JSON.stringify(evt.payload, null, 2)}`;
  }

  if (
    evt.type === "capability.granted" ||
    evt.type === "capability.expired" ||
    evt.type === "capability.revoked"
  ) {
    grantBuffer.unshift(evt.payload);
    trimBuffer(grantBuffer, 20);
    if (evt.payload?.grant_id) {
      latestGrantId = evt.payload.grant_id;
    }
  }

  if (evt.type === "step.resumed") {
    resumedBuffer.unshift(evt.payload);
    trimBuffer(resumedBuffer, 20);
  }

  if (evt.type === "step.completed") {
    activeAuthSessionId = null;
    if (String(evt?.payload?.step_id || "").includes("vercel")) {
      vercelAuthStatusPanel.textContent = `run_completed | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (String(evt?.payload?.step_id || "").includes("wrangler")) {
      wranglerAuthStatusPanel.textContent = `run_completed | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (String(evt?.payload?.step_id || "").includes("supabase")) {
      supabaseAuthStatusPanel.textContent = `run_completed | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (String(evt?.payload?.step_id || "").includes("phase3a") || String(evt?.payload?.step_id || "").includes("mainchain")) {
      verifyStatusPanel.textContent = `step.completed | ${JSON.stringify(evt.payload, null, 2)}`;
    }
    if (String(evt?.payload?.step_id || "").includes("phase3b")) {
      finalStatusPanel.textContent = JSON.stringify(
        {
          status: "step.completed",
          case_id: evt?.payload?.case_id || null,
          step_id: evt?.payload?.step_id || null
        },
        null,
        2
      );
    }
    if (String(evt?.payload?.step_id || "").includes("phase3d")) {
      finalStatusPanel.textContent = JSON.stringify(
        {
          status: "step.completed",
          case_id: evt?.payload?.case_id || null,
          step_id: evt?.payload?.step_id || null
        },
        null,
        2
      );
    }
    if (String(evt?.payload?.step_id || "").includes("phase3e")) {
      finalStatusPanel.textContent = JSON.stringify(
        {
          status: "step.completed",
          case_id: evt?.payload?.case_id || null,
          step_id: evt?.payload?.step_id || null
        },
        null,
        2
      );
    }
    if (String(evt?.payload?.step_id || "").includes("phase3f")) {
      finalStatusPanel.textContent = JSON.stringify(
        {
          status: "step.completed",
          case_id: evt?.payload?.case_id || null,
          step_id: evt?.payload?.step_id || null
        },
        null,
        2
      );
    }
  }

  if (evt.type === "step.failed_controlled") {
    finalStatusPanel.textContent = JSON.stringify(
      {
        status: "step.failed_controlled",
        case_id: evt?.payload?.case_id || null,
        reason: evt?.payload?.reason || null,
        step_id: evt?.payload?.step_id || null
      },
      null,
      2
    );
  }

  if (evt.type === "step.failed") {
    finalStatusPanel.textContent = JSON.stringify(
      {
        status: "step.failed",
        case_id: evt?.payload?.case_id || null,
        reason: evt?.payload?.reason || null,
        step_id: evt?.payload?.step_id || null
      },
      null,
      2
    );
  }

  renderBuffers();
  renderBanners();
}

async function hydrateFromRuns() {
  const loaded = [];
  let latestPending = null;

  for (const run of visibleRuns) {
    const details = await getJson(`${hostBase}/runs/${run.id}`);
    for (const evt of details.events) {
      loaded.push({
        event_id: `evt_${run.id}_${evt.seq}`,
        run_id: run.id,
        seq: evt.seq,
        type: evt.type,
        ts: evt.created_at,
        payload: evt.payload
      });
    }
    if (!latestPending && details.auth_sessions.length > 0) {
      latestPending = details.auth_sessions[0];
    }
  }

  loaded.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  eventBuffer.length = 0;
  timelineBuffer.length = 0;

  for (const evt of loaded) {
    consumeEvent(evt);
  }

  if (latestPending) {
    activeAuthSessionId = latestPending.status === "pending_user_action" ? latestPending.id : null;
    authSessionStatusPanel.textContent = JSON.stringify(latestPending, null, 2);
  }

  renderBuffers();
}

function connectEvents() {
  const stream = new EventSource(`${hostBase}/events`);
  stream.onmessage = async (event) => {
    try {
      const evt = JSON.parse(event.data);
      if (!evt.type) {
        return;
      }
      consumeEvent(evt);
      await refreshRuns();
      await refreshState();
      await refreshGrants();
    } catch {
      // ignore malformed event
    }
  };

  stream.addEventListener("replay", async (event) => {
    try {
      const evt = JSON.parse(event.data);
      if (!evt.type) {
        return;
      }
      consumeEvent(evt);
      await refreshRuns();
      await refreshState();
      await refreshGrants();
    } catch {
      // ignore malformed replay event
    }
  });

  stream.onerror = () => {
    hostStatus.textContent = "host: stream disconnected";
  };
}

async function submitAuthPayload(payload) {
  if (!activeAuthSessionId) {
    tokenState.textContent = "no active auth session";
    return;
  }
  const result = await getJson(`${hostBase}/auth/sessions/${activeAuthSessionId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  tokenState.textContent = JSON.stringify(result, null, 2);
}
authModeSelect.addEventListener("change", () => {
  capabilityInput.value = modeCapabilityTemplate(authModeSelect.value);
});

createRunBtn.addEventListener("click", async () => {
  const mode = authModeSelect.value;
  const capability = capabilityInput.value.trim() || modeCapabilityTemplate(mode);
  const recipeId = preferredRecipeByMode[mode] || null;

  try {
    await getJson(`${hostBase}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `UI auth ${mode}`,
        auth_mode: mode,
        recipe_id: recipeId,
        required_capability: capability,
        step_id:
          mode === "cli_login"
            ? `step.${mode}.vercel`
            : mode === "browser_oauth"
              ? `step.${mode}.wrangler`
              : mode === "token_input"
                ? `step.${mode}.supabase`
              : `step.${mode}`,
        force_auth_challenge: forceAuthChallenge.checked
      })
    });

    capabilityInput.value = modeCapabilityTemplate(mode);
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase3eRunBtn.addEventListener("click", async () => {
  const caseId = phase3eCaseSelect.value;
  try {
    await getJson(`${hostBase}/runs/phase3e-install-rollback-replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase3e ${caseId}`,
        step_id: `step.phase3e.${caseId}`,
        case_id: caseId
      })
    });
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase3e run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase3fRunBtn.addEventListener("click", async () => {
  const caseId = phase3fCaseSelect.value;
  try {
    await getJson(`${hostBase}/runs/phase3f-project-tool-install-boundary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase3f ${caseId}`,
        step_id: `step.phase3f.${caseId}`,
        case_id: caseId
      })
    });
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase3f run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase3gRunBtn.addEventListener("click", async () => {
  const caseId = phase3gCaseSelect.value;
  try {
    await getJson(`${hostBase}/runs/phase3g-execution-closeout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase3g ${caseId}`,
        step_id: `step.phase3g.${caseId}`,
        case_id: caseId
      })
    });
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase3g run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase4aRunBtn.addEventListener("click", async () => {
  const caseId = phase4aCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase4a-resume-reconnect-hydration`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase4a ${caseId}`,
        step_id: `step.phase4a.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase4a run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase4bRunBtn.addEventListener("click", async () => {
  const caseId = phase4bCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase4b-compact-stale-recovery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase4b ${caseId}`,
        step_id: `step.phase4b.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase4b run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase4cSourceRunBtn.addEventListener("click", async () => {
  const caseId = phase4cSourceCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase4c-fork-lineage-source`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase4c source ${caseId}`,
        step_id: `step.phase4c.source.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    sourceRunIdPanel.textContent = JSON.stringify(
      {
        source_run_id: created?.run?.id || null,
        case_id: caseId
      },
      null,
      2
    );
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase4c source run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase5aRunBtn.addEventListener("click", async () => {
  const caseId = phase5aCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase5a-browser-deploy-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase5a ${caseId}`,
        step_id: `step.phase5a.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase5a run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase5bRunBtn.addEventListener("click", async () => {
  const caseId = phase5bCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase5b-browser-lane-matrix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase5b ${caseId}`,
        step_id: `step.phase5b.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase5b run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase5cRunBtn.addEventListener("click", async () => {
  const caseId = phase5cCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase5c-readonly-external-verification`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase5c ${caseId}`,
        step_id: `step.phase5c.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase5c run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase5dRunBtn.addEventListener("click", async () => {
  const caseId = phase5dCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase5d-approval-pending`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase5d ${caseId}`,
        step_id: `step.phase5d.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
    await refreshPendingApprovals();
  } catch (error) {
    currentActionLine.textContent = `create phase5d run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase6aRunBtn.addEventListener("click", async () => {
  const caseId = phase6aCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase6a-e2b-second-lane`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase6a ${caseId}`,
        step_id: `step.phase6a.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase6a run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase6bRunBtn.addEventListener("click", async () => {
  const caseId = phase6bCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase6b-e2b-real-task-matrix`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase6b ${caseId}`,
        step_id: `step.phase6b.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase6b run rejected: ${error.payload?.error || error.message}`;
  }
});

createPhase6cRunBtn.addEventListener("click", async () => {
  const caseId = phase6cCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/phase6c-e2b-writeback-gate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `phase6c ${caseId}`,
        step_id: `step.phase6c.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create phase6c run rejected: ${error.payload?.error || error.message}`;
  }
});

createWorkspaceDeployRunBtn.addEventListener("click", async () => {
  const caseId = workspaceDeployCaseSelect.value;
  try {
    const created = await getJson(`${hostBase}/runs/workspace-root-deploy-closeout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: `workspace-deploy ${caseId}`,
        step_id: `step.workspace-deploy.${caseId}`,
        case_id: caseId
      })
    });
    phase4aRunIdInput.value = created?.run?.id || "";
    await refreshRuns();
    await refreshState();
  } catch (error) {
    currentActionLine.textContent = `create workspace deploy run rejected: ${error.payload?.error || error.message}`;
  }
});

pendingApprovalSelect.addEventListener("change", () => {
  const row = selectedPendingApprovalRow();
  approvalPendingDetailPanel.textContent = JSON.stringify(row || {}, null, 2);
});

refreshPendingApprovalsBtn.addEventListener("click", async () => {
  try {
    await refreshPendingApprovals();
    approvalDecisionStatusPanel.textContent = JSON.stringify(
      {
        action: "list_pending",
        pending_count: pendingApprovalRows.length
      },
      null,
      2
    );
  } catch (error) {
    approvalDecisionStatusPanel.textContent = JSON.stringify(error.payload || { message: error.message }, null, 2);
  }
});

approvePendingBtn.addEventListener("click", async () => {
  const id = selectedPendingApprovalId();
  if (!id) {
    approvalDecisionStatusPanel.textContent = "pending approval id required";
    return;
  }
  try {
    const result = await getJson(`${hostBase}/approval-requests/${encodeURIComponent(id)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision_source: "ui_manual",
        approver_type: "local_user"
      })
    });
    approvalDecisionStatusPanel.textContent = JSON.stringify(result, null, 2);
    await refreshRuns();
    await refreshState();
    await refreshPendingApprovals();
  } catch (error) {
    approvalDecisionStatusPanel.textContent = JSON.stringify(error.payload || { message: error.message }, null, 2);
  }
});

rejectPendingBtn.addEventListener("click", async () => {
  const id = selectedPendingApprovalId();
  if (!id) {
    approvalDecisionStatusPanel.textContent = "pending approval id required";
    return;
  }
  try {
    const result = await getJson(`${hostBase}/approval-requests/${encodeURIComponent(id)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision_source: "ui_manual",
        approver_type: "local_user"
      })
    });
    approvalDecisionStatusPanel.textContent = JSON.stringify(result, null, 2);
    await refreshRuns();
    await refreshState();
    await refreshPendingApprovals();
  } catch (error) {
    approvalDecisionStatusPanel.textContent = JSON.stringify(error.payload || { message: error.message }, null, 2);
  }
});

createForkBtn.addEventListener("click", async () => {
  const sourceRunId = currentRunId();
  if (!sourceRunId) {
    currentActionLine.textContent = "fork rejected: source run id required";
    return;
  }
  try {
    const baselineRunId = (baselineRunIdInput.value || "").trim();
    const payload = {
      fork_reason: (forkReasonInput.value || "").trim() || "phase4c_manual_fork",
      fork_mode: forkModeSelect.value || "hydrate_only",
      auto_redirect: forkAutoRedirectInput.checked
    };
    if (baselineRunId) {
      payload.baseline_run_id = baselineRunId;
    }
    const targetWorkspace = (forkTargetWorkspaceInput.value || "").trim();
    if (targetWorkspace) {
      payload.target_workspace = targetWorkspace;
    }
    const created = await getJson(`${hostBase}/runs/${encodeURIComponent(sourceRunId)}/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const forkRunId = created?.fork_run_id || "";
    phase4aRunIdInput.value = forkRunId;
    forkStatusPanel.textContent = JSON.stringify(created, null, 2);
    sourceRunIdPanel.textContent = JSON.stringify(
      {
        source_run_id: sourceRunId,
        source_status: created?.fork_run_row?.source_status || null
      },
      null,
      2
    );
    forkRunIdPanel.textContent = JSON.stringify(
      {
        fork_run_id: forkRunId
      },
      null,
      2
    );
    forkBaselinePanel.textContent = JSON.stringify(
      {
        baseline_run_id: created?.fork_run_row?.baseline_run_id || null
      },
      null,
      2
    );
    lineageTypePanel.textContent = JSON.stringify(
      {
        lineage_type: created?.lineage?.lineage_type || "fork",
        lineage_id: created?.lineage_id || null
      },
      null,
      2
    );
    forkWorkspacePanel.textContent = JSON.stringify(
      {
        fork_workspace: created?.fork_workspace || null
      },
      null,
      2
    );
    artifactMappingStatusPanel.textContent = JSON.stringify(
      {
        mapping_count: Array.isArray(created?.artifact_mappings) ? created.artifact_mappings.length : 0
      },
      null,
      2
    );
    forkPolicyStatusPanel.textContent = JSON.stringify(created?.fork_policy_check || {}, null, 2);
    ancestryRelationPanel.textContent = JSON.stringify(
      {
        ancestry_relation: created?.fork_policy_check?.ancestry_relation || null
      },
      null,
      2
    );
    policyActionForkPanel.textContent = JSON.stringify(
      {
        policy_action: created?.policy_action || null
      },
      null,
      2
    );
    redirectedTargetPanel.textContent = JSON.stringify(
      {
        redirected_target: created?.redirected_target || null
      },
      null,
      2
    );
    await refreshRuns();
    await refreshState();
  } catch (error) {
    forkStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
    forkPolicyStatusPanel.textContent = JSON.stringify(error.payload?.fork_policy_check || error.payload || {}, null, 2);
    ancestryRelationPanel.textContent = JSON.stringify(
      {
        ancestry_relation: error.payload?.fork_policy_check?.ancestry_relation || null
      },
      null,
      2
    );
    policyActionForkPanel.textContent = JSON.stringify(
      {
        policy_action: error.payload?.policy_action || null,
        reason: error.payload?.reason || error.payload?.error || null
      },
      null,
      2
    );
    redirectedTargetPanel.textContent = JSON.stringify(
      {
        redirected_target: error.payload?.redirected_target || null
      },
      null,
      2
    );
  }
});

loadLineageBtn.addEventListener("click", async () => {
  const runId = currentRunId();
  if (!runId) {
    currentActionLine.textContent = "load lineage rejected: run id required";
    return;
  }
  try {
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/lineage`);
    lineageListPanel.textContent = JSON.stringify(data, null, 2);
    sourceRunIdPanel.textContent = JSON.stringify(
      {
        source_run_id: data?.parent?.parent_run_id || null
      },
      null,
      2
    );
    forkRunIdPanel.textContent = JSON.stringify(
      {
        fork_run_id: runId
      },
      null,
      2
    );
    lineageTypePanel.textContent = JSON.stringify(
      {
        lineage_type: data?.parent?.lineage_type || "fork",
        parent_run_id: data?.parent?.parent_run_id || null,
        child_count: Array.isArray(data?.children) ? data.children.length : 0
      },
      null,
      2
    );
  } catch (error) {
    lineageListPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

loadForksBtn.addEventListener("click", async () => {
  const runId = currentRunId();
  if (!runId) {
    currentActionLine.textContent = "load forks rejected: run id required";
    return;
  }
  try {
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/forks`);
    lineageListPanel.textContent = JSON.stringify(data, null, 2);
    forkRunStatusPanel.textContent = JSON.stringify(
      {
        source_run_id: runId,
        fork_count: Array.isArray(data?.forks) ? data.forks.length : 0
      },
      null,
      2
    );
  } catch (error) {
    lineageListPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

hydrateRunBtn.addEventListener("click", async () => {
  const runId = currentRunId();
  if (!runId) {
    currentActionLine.textContent = "hydrate rejected: run id required";
    return;
  }
  try {
    const baselineRunId = (baselineRunIdInput.value || "").trim();
    const params = [];
    if (baselineRunId) {
      params.push(`baseline_run_id=${encodeURIComponent(baselineRunId)}`);
    }
    params.push("include_lineage=true");
    const qp = params.length ? `?${params.join("&")}` : "";
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/hydrate${qp}`);
    hydrationStatusPanel.textContent = JSON.stringify(data.hydration || {}, null, 2);
    loadedEventsCountPanel.textContent = JSON.stringify(
      { loaded_events_count: data.projection?.loaded_events_count || 0 },
      null,
      2
    );
    loadedTablesPanel.textContent = JSON.stringify(
      { loaded_ledger_tables: data.projection?.loaded_ledger_tables || [] },
      null,
      2
    );
    finalProjectionStatusPanel.textContent = JSON.stringify(
      {
        final_projection_status: data.projection?.final_projection_status || null,
        projection_artifact_path: data.projection_row?.artifact_path || null
      },
      null,
      2
    );
    hydrateModePanel.textContent = JSON.stringify(
      {
        hydrate_mode: data.projection?.hydrate_mode || "raw"
      },
      null,
      2
    );
    deltaFromSeqPanel.textContent = JSON.stringify(
      {
        delta_from_seq: data.projection?.delta_from_seq || null
      },
      null,
      2
    );
    if (data.projection?.compact_fallback_reason) {
      compactFallbackReasonPanel.textContent = JSON.stringify(
        {
          compact_fallback_reason: data.projection?.compact_fallback_reason || null
        },
        null,
        2
      );
    }
  } catch (error) {
    currentActionLine.textContent = `hydrate rejected: ${error.payload?.error || error.message}`;
  }
});

hydrateCompactRunBtn.addEventListener("click", async () => {
  const runId = currentRunId();
  if (!runId) {
    currentActionLine.textContent = "hydrate compact rejected: run id required";
    return;
  }
  try {
    const baselineRunId = (baselineRunIdInput.value || "").trim();
    const params = [];
    if (baselineRunId) params.push(`baseline_run_id=${encodeURIComponent(baselineRunId)}`);
    params.push("use_compact=true");
    params.push("include_lineage=true");
    const qp = params.length ? `?${params.join("&")}` : "";
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/hydrate${qp}`);
    hydrationStatusPanel.textContent = JSON.stringify(data.hydration || {}, null, 2);
    hydrateModePanel.textContent = JSON.stringify(
      {
        hydrate_mode: data.projection?.hydrate_mode || "raw",
        compact_run_id: data.projection?.compact_run_id || null
      },
      null,
      2
    );
    deltaFromSeqPanel.textContent = JSON.stringify(
      {
        delta_from_seq: data.projection?.delta_from_seq || null
      },
      null,
      2
    );
    compactArtifactPathPanel.textContent = JSON.stringify(
      {
        compact_artifact_path: data.projection?.compact_artifact_path || null
      },
      null,
      2
    );
    compactIntegrityHashPanel.textContent = JSON.stringify(
      {
        compact_integrity_hash: data.projection?.compact_integrity_hash || null
      },
      null,
      2
    );
    if (data.projection?.compact_fallback_reason) {
      compactFallbackReasonPanel.textContent = JSON.stringify(
        {
          compact_fallback_reason: data.projection?.compact_fallback_reason || null
        },
        null,
        2
      );
    }
  } catch (error) {
    currentActionLine.textContent = `hydrate compact rejected: ${error.payload?.error || error.message}`;
  }
});

reconnectRunBtn.addEventListener("click", async () => {
  const runId = (phase4aRunIdInput.value || "").trim() || visibleRuns[0]?.id || "";
  if (!runId) {
    currentActionLine.textContent = "reconnect rejected: run id required";
    return;
  }
  try {
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/reconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: (clientIdInput.value || "").trim() || "ui-client",
        last_seen_seq: Number(sinceSeqInput.value || 0)
      })
    });
    reconnectStatusPanel.textContent = JSON.stringify(data.reconnect_session || {}, null, 2);
    missedEventsPanel.textContent = JSON.stringify(
      {
        replayed_events: data.replayed_events?.length || 0
      },
      null,
      2
    );
    cursorStatusPanel.textContent = JSON.stringify(
      {
        last_seen_seq: Number(sinceSeqInput.value || 0),
        final_cursor: data.final_cursor || 0
      },
      null,
      2
    );
  } catch (error) {
    currentActionLine.textContent = `reconnect rejected: ${error.payload?.error || error.message}`;
  }
});

resumeRunBtn.addEventListener("click", async () => {
  const runId = (phase4aRunIdInput.value || "").trim() || visibleRuns[0]?.id || "";
  if (!runId) {
    currentActionLine.textContent = "resume rejected: run id required";
    return;
  }
  try {
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        resume_reason: "ui_resume_request"
      })
    });
    resumeStatusPanel.textContent = JSON.stringify(data.resume_session || {}, null, 2);
    resumableReasonPanel.textContent = JSON.stringify(
      {
        resumable: true,
        resume_reason: "ui_resume_request"
      },
      null,
      2
    );
    await refreshRuns();
    await refreshState();
  } catch (error) {
    resumeStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
    resumableReasonPanel.textContent = JSON.stringify(
      {
        resumable: false,
        reason: error.payload?.reason || error.message
      },
      null,
      2
    );
  }
});

compactRunBtn.addEventListener("click", async () => {
  const runId = (phase4aRunIdInput.value || "").trim() || visibleRuns[0]?.id || "";
  if (!runId) {
    currentActionLine.textContent = "manual compact rejected: run id required";
    return;
  }
  try {
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/compact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trigger_type: "manual" })
    });
    compactStatusPanel.textContent = JSON.stringify(
      {
        compact_run_id: data.compact_id || null,
        status: data.compact_run?.status || null
      },
      null,
      2
    );
    compactTriggerTypePanel.textContent = JSON.stringify(
      { trigger_type: data.compact_run?.trigger_type || "manual" },
      null,
      2
    );
    compactSourceRangePanel.textContent = JSON.stringify(data.source_event_range || {}, null, 2);
    compactArtifactPathPanel.textContent = JSON.stringify(
      { artifact_path: data.artifact_path || null },
      null,
      2
    );
    compactIntegrityHashPanel.textContent = JSON.stringify(
      { integrity_hash: data.compact_run?.integrity_hash || null },
      null,
      2
    );
  } catch (error) {
    compactStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

loadCompactBtn.addEventListener("click", async () => {
  const runId = (phase4aRunIdInput.value || "").trim() || visibleRuns[0]?.id || "";
  if (!runId) {
    currentActionLine.textContent = "load compact rejected: run id required";
    return;
  }
  try {
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/compact`);
    const latest = data.latest_compact_run || null;
    compactStatusPanel.textContent = JSON.stringify(latest || {}, null, 2);
    compactTriggerTypePanel.textContent = JSON.stringify(
      { trigger_type: latest?.trigger_type || null },
      null,
      2
    );
    compactSourceRangePanel.textContent = JSON.stringify(
      {
        source_event_from_seq: latest?.source_event_from_seq || null,
        source_event_to_seq: latest?.source_event_to_seq || null
      },
      null,
      2
    );
    compactArtifactPathPanel.textContent = JSON.stringify(
      { artifact_path: latest?.artifact_path || null },
      null,
      2
    );
    compactIntegrityHashPanel.textContent = JSON.stringify(
      { integrity_hash: latest?.integrity_hash || null },
      null,
      2
    );
    if (data.latest_mapping?.delta_from_seq) {
      deltaFromSeqPanel.textContent = JSON.stringify(
        { delta_from_seq: data.latest_mapping.delta_from_seq },
        null,
        2
      );
    }
  } catch (error) {
    compactStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

loadProjectionBtn.addEventListener("click", async () => {
  const runId = (phase4aRunIdInput.value || "").trim() || visibleRuns[0]?.id || "";
  if (!runId) {
    currentActionLine.textContent = "load projection rejected: run id required";
    return;
  }
  try {
    const data = await getJson(`${hostBase}/runs/${encodeURIComponent(runId)}/projection`);
    finalProjectionStatusPanel.textContent = JSON.stringify(
      {
        latest_projection: data.latest_projection || null,
        latest_compact_mapping: data.latest_compact_mapping || null
      },
      null,
      2
    );
    contextProjectionStatusPanel.textContent = JSON.stringify(
      {
        context_projection: data.context_projection || null,
        context_projection_row: data.context_projection_row || null
      },
      null,
      2
    );
    projectionIntegrityPanel.textContent = JSON.stringify(
      {
        projection_integrity: data.context_projection?.projection_integrity || false,
        terminal_status: data.context_projection?.terminal_status || null
      },
      null,
      2
    );
    if (data.context_projection?.lineage_parent_run_id || Array.isArray(data.context_projection?.lineage_child_run_ids)) {
      lineageListPanel.textContent = JSON.stringify(
        {
          parent_run_id: data.context_projection?.lineage_parent_run_id || null,
          child_run_ids: data.context_projection?.lineage_child_run_ids || []
        },
        null,
        2
      );
    }
  } catch (error) {
    finalProjectionStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
    contextProjectionStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

staleRecoverBtn.addEventListener("click", async () => {
  const runId = (phase4aRunIdInput.value || "").trim() || "";
  try {
    const payload = runId ? { trigger: "ui_manual", run_id: runId } : { trigger: "ui_manual" };
    const data = await getJson(`${hostBase}/runtime/stale-running-recover`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    staleRecoveryStatusPanel.textContent = JSON.stringify(data, null, 2);
    await refreshRuns();
    await refreshState();
  } catch (error) {
    staleRecoveryStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

bindBaselineBtn.addEventListener("click", async () => {
  try {
    const data = await getJson(`${hostBase}/phase4/baseline-bind`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseline_run_id: (baselineRunIdInput.value || "").trim(),
        smoke_run_id: (smokeRunIdInput.value || "").trim(),
        consistency_run_id: (consistencyRunIdInput.value || "").trim(),
        readiness_run_id: (readinessRunIdInput.value || "").trim(),
        evidence_root: (evidenceRootInput.value || "").trim()
      })
    });
    baselineBindingStatusPanel.textContent = JSON.stringify(
      {
        binding_id: data.binding?.id || null,
        binding_status: data.binding?.status || null
      },
      null,
      2
    );
    baselineBindingIdsPanel.textContent = JSON.stringify(
      {
        baseline_run_id: data.binding?.baseline_run_id || null,
        smoke_run_id: data.binding?.smoke_run_id || null,
        consistency_run_id: data.binding?.consistency_run_id || null,
        readiness_run_id: data.binding?.readiness_run_id || null
      },
      null,
      2
    );
  } catch (error) {
    baselineBindingStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

runPhase4CloseoutBtn.addEventListener("click", async () => {
  const runId = (phase4CloseoutRunIdInput.value || "").trim();
  const moduleRunIds = parseJsonObjectSafe(phase4ModuleRunIdsInput.value || "{}", {});
  const projectionRunIds = parseCsvIds(phase4ProjectionRunIdsInput.value || "");
  try {
    const data = await getJson(`${hostBase}/phase4/closeout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId || undefined,
        baseline_run_id: (baselineRunIdInput.value || "").trim() || undefined,
        smoke_run_id: (smokeRunIdInput.value || "").trim() || undefined,
        consistency_run_id: (consistencyRunIdInput.value || "").trim() || undefined,
        readiness_run_id: (readinessRunIdInput.value || "").trim() || undefined,
        module_run_ids: moduleRunIds,
        projection_run_ids: projectionRunIds
      })
    });
    phase4CloseoutStatusPanel.textContent = JSON.stringify(
      {
        run_id: data.run_id || null,
        closeout_status: data.closeout_result?.status || null,
        verified_modules: data.payload?.verified_modules || [],
        failed_modules: data.payload?.failed_modules || [],
        evidence_path: data.payload?.evidence_path || null
      },
      null,
      2
    );
    readinessBlockedReasonsPanel.textContent = JSON.stringify(
      {
        failed_modules: data.payload?.failed_modules || [],
        risks: data.payload?.risks || []
      },
      null,
      2
    );
    if (data.run_id) {
      phase5CloseoutRunIdInput.value = data.run_id;
    }
    await refreshRuns();
    await refreshState();
  } catch (error) {
    phase4CloseoutStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

runPhase5ReadinessBtn.addEventListener("click", async () => {
  const runId = (phase5ReadinessRunIdInput.value || "").trim();
  const closeoutRunId = (phase5CloseoutRunIdInput.value || "").trim();
  const projectionRunIds = parseCsvIds(phase5ProjectionRunIdsInput.value || "");
  try {
    const data = await getJson(`${hostBase}/phase5/readiness-check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        run_id: runId || undefined,
        closeout_run_id: closeoutRunId || undefined,
        baseline_run_id: (baselineRunIdInput.value || "").trim() || undefined,
        smoke_run_id: (smokeRunIdInput.value || "").trim() || undefined,
        consistency_run_id: (consistencyRunIdInput.value || "").trim() || undefined,
        readiness_run_id: (readinessRunIdInput.value || "").trim() || undefined,
        projection_run_ids: projectionRunIds
      })
    });
    phase5ReadinessStatusPanel.textContent = JSON.stringify(
      {
        run_id: data.run_id || null,
        readiness_id: data.phase5_readiness?.id || null,
        phase4_ready: data.payload?.phase4_ready || false,
        phase5_ready: data.payload?.phase5_ready || false
      },
      null,
      2
    );
    phase5AllowedInputsPanel.textContent = JSON.stringify(
      { allowed_phase5_inputs: data.payload?.allowed_phase5_inputs || [] },
      null,
      2
    );
    phase5ForbiddenActionsPanel.textContent = JSON.stringify(
      { forbidden_phase5_actions: data.payload?.forbidden_phase5_actions || [] },
      null,
      2
    );
    readinessBlockedReasonsPanel.textContent = JSON.stringify(
      {
        blocked_modules: data.payload?.blocked_modules || [],
        risks: data.payload?.risks || []
      },
      null,
      2
    );
    await refreshRuns();
    await refreshState();
  } catch (error) {
    phase5ReadinessStatusPanel.textContent = JSON.stringify(error.payload || {}, null, 2);
  }
});

reloadRunsBtn.addEventListener("click", async () => {
  await refreshRuns();
  await hydrateFromRuns();
  await refreshState();
  await refreshGrants();
  await refreshPendingApprovals();
});

submitTokenBtn.addEventListener("click", async () => {
  const token = tokenInput.value.trim();
  if (!token) {
    tokenState.textContent = "token required";
    return;
  }
  await submitAuthPayload({ token });
  tokenInput.value = "";
  await refreshState();
});

confirmActionBtn.addEventListener("click", async () => {
  await submitAuthPayload({ confirmed: true });
  await refreshState();
});

cancelAuthBtn.addEventListener("click", async () => {
  if (!activeAuthSessionId) {
    tokenState.textContent = "no active auth session to cancel";
    return;
  }
  const result = await getJson(`${hostBase}/auth/sessions/${activeAuthSessionId}/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_reason: "ui_cancel" })
  });
  tokenState.textContent = JSON.stringify(result, null, 2);
  await refreshState();
});

revokeGrantBtn.addEventListener("click", async () => {
  if (!latestGrantId) {
    tokenState.textContent = "no grant available for revoke";
    return;
  }
  const result = await getJson(`${hostBase}/capability-grants/${latestGrantId}/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ revoke_reason: "ui_revoke" })
  });
  tokenState.textContent = JSON.stringify(result, null, 2);
  await refreshGrants();
});

saveKeyBtn.addEventListener("click", async () => {
  const apiKey = byoKeyInput.value.trim();
  if (!apiKey) {
    keyState.textContent = "empty key";
    return;
  }
  const proof = await getByoChallengeProof("bind", {
    bindingScope: byoScopeSelect?.value || "browser_profile_scope"
  });
  const bound = await getJson(`${hostBase}/byo/openai/bind`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify({
      api_key: apiKey,
      binding_scope: byoScopeSelect?.value || "browser_profile_scope",
      validate_now: true,
      ...proof
    })
  });
  keyState.textContent = `bound:${bound?.binding?.status || "unknown"}`;
  byoKeyInput.value = "";
  await refreshState();
});

clearKeyBtn.addEventListener("click", async () => {
  const binding = await fetchCurrentByoBinding();
  if (binding?.id) {
    const proof = await getByoChallengeProof("unbind", {
      bindingScope: binding.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
      bindingId: binding.id
    });
    await getJson(`${hostBase}/byo/openai/unbind`, {
      method: "POST",
      headers: byoHeaders(),
      body: JSON.stringify({
        binding_id: binding.id,
        binding_scope: binding.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
        ...proof
      })
    });
  } else {
    await getJson(`${hostBase}/session/byo-key`, { method: "DELETE" });
  }
  await refreshState();
});

bindByoBtn?.addEventListener("click", async () => {
  const apiKey = byoKeyInput.value.trim();
  if (!apiKey) {
    keyState.textContent = "empty key";
    return;
  }
  const proof = await getByoChallengeProof("bind", {
    bindingScope: byoScopeSelect?.value || "browser_profile_scope"
  });
  const result = await getJson(`${hostBase}/byo/openai/bind`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify({
      api_key: apiKey,
      binding_scope: byoScopeSelect?.value || "browser_profile_scope",
      validate_now: true,
      ...proof
    })
  });
  keyState.textContent = `bind:${result?.validation?.validation_status || "unknown"}`;
  byoKeyInput.value = "";
  await refreshState();
});

validateByoBtn?.addEventListener("click", async () => {
  const binding = await fetchCurrentByoBinding();
  const proof = await getByoChallengeProof("validate", {
    bindingScope: binding?.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
    bindingId: binding?.id || null
  });
  const result = await getJson(`${hostBase}/byo/openai/validate`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify({
      binding_scope: binding?.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
      binding_id: binding?.id || null,
      ...proof
    })
  });
  keyState.textContent = `validate:${result?.validation?.validation_status || "unknown"}`;
  await refreshState();
});

revalidateByoBtn?.addEventListener("click", async () => {
  const binding = await fetchCurrentByoBinding();
  const proof = await getByoChallengeProof("revalidate", {
    bindingScope: binding?.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
    bindingId: binding?.id || null
  });
  const result = await getJson(`${hostBase}/byo/openai/revalidate`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify({
      binding_scope: binding?.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
      binding_id: binding?.id || null,
      ...proof
    })
  });
  keyState.textContent = `revalidate:${result?.validation?.validation_status || "unknown"}`;
  await refreshState();
});

unbindByoBtn?.addEventListener("click", async () => {
  const binding = await fetchCurrentByoBinding();
  const proof = await getByoChallengeProof("unbind", {
    bindingScope: binding?.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
    bindingId: binding?.id || null
  });
  await getJson(`${hostBase}/byo/openai/unbind`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify({
      binding_scope: binding?.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
      binding_id: binding?.id || null,
      ...proof
    })
  });
  keyState.textContent = "unbound";
  await refreshState();
});

deleteByoBtn?.addEventListener("click", async () => {
  const binding = await fetchCurrentByoBinding();
  if (!binding?.id) {
    keyState.textContent = "no binding to delete";
    return;
  }
  const proof = await getByoChallengeProof("delete", {
    bindingScope: binding.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
    bindingId: binding.id
  });
  await getJson(`${hostBase}/byo/openai/bindings/${encodeURIComponent(binding.id)}`, {
    method: "DELETE",
    headers: byoHeaders(),
    body: JSON.stringify({
      binding_scope: binding.binding_scope || (byoScopeSelect?.value || "browser_profile_scope"),
      ...proof
    })
  });
  keyState.textContent = "deleted";
  await refreshState();
});

freezeRetrievalDesignBtn?.addEventListener("click", async () => {
  const run = await getJson(`${hostBase}/runs/byo-exact-retrieval`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify({
      case_id: "case7_retrieval_exa_firecrawl_design_frozen_disabled",
      title: "retrieval design freeze"
    })
  });
  if (retrievalDesignFrozenPanel) {
    retrievalDesignFrozenPanel.textContent = JSON.stringify(run, null, 2);
  }
  await refreshRuns();
  await refreshState();
});

createByoExactRunBtn?.addEventListener("click", async () => {
  const caseId = String(byoExactCaseSelect?.value || "case1_openai_byo_bind_exact_validation_success");
  const payload = {
    case_id: caseId,
    title: `byo-exact ${caseId}`,
    binding_scope: byoScopeSelect?.value || "browser_profile_scope"
  };
  if (
    caseId === "case1_openai_byo_bind_exact_validation_success" ||
    caseId === "case3_unbind_delete_old_binding_unusable" ||
    caseId === "case4_browser_profile_isolation_proof"
  ) {
    const key = byoKeyInput?.value?.trim();
    if (key) {
      payload.api_key = key;
    }
  }
  const created = await getJson(`${hostBase}/runs/byo-exact-retrieval`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify(payload)
  });
  if (created?.run?.id && phase4aRunIdInput) {
    phase4aRunIdInput.value = created.run.id;
  }
  await refreshRuns();
  await refreshState();
});

createRetrievalMultiRunBtn?.addEventListener("click", async () => {
  const caseId = String(retrievalMultiCaseSelect?.value || "case1_local_task_no_search");
  const payload = {
    case_id: caseId,
    title: `retrieval-multi ${caseId}`
  };
  const created = await getJson(`${hostBase}/runs/retrieval-multi-provider-closeout`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify(payload)
  });
  if (created?.run?.id && phase4aRunIdInput) {
    phase4aRunIdInput.value = created.run.id;
  }
  await refreshRuns();
  await refreshState();
});

createRetrievalGovernanceRunBtn?.addEventListener("click", async () => {
  const caseId = String(retrievalGovernanceCaseSelect?.value || "case1_local_task_no_search");
  const payload = {
    case_id: caseId,
    title: `retrieval-governance ${caseId}`
  };
  const created = await getJson(`${hostBase}/runs/retrieval-governance-closeout`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify(payload)
  });
  if (created?.run?.id && phase4aRunIdInput) {
    phase4aRunIdInput.value = created.run.id;
  }
  await refreshRuns();
  await refreshState();
});

createSystemAcceptanceRunBtn?.addEventListener("click", async () => {
  const storyId = String(systemAcceptanceStorySelect?.value || "global_system_acceptance_chain_v1");
  const payload = {
    title: `system-acceptance ${storyId}`,
    story_id: storyId,
    step_id: "step.system.acceptance.closeout",
    binding_scope: byoScopeSelect?.value || "browser_profile_scope"
  };
  const key = byoKeyInput?.value?.trim();
  if (key) {
    payload.api_key = key;
  }
  const created = await getJson(`${hostBase}/runs/system-acceptance-closeout`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify(payload)
  });
  if (created?.run?.id && phase4aRunIdInput) {
    phase4aRunIdInput.value = created.run.id;
  }
  await refreshRuns();
  await refreshState();
});

createTaskEngineeringRunBtn?.addEventListener("click", async () => {
  const storyId = String(engineeringStorySelect?.value || "polyglot_engineering_chain_v1");
  const payload = {
    title: `task-to-engineering ${storyId}`,
    story_id: storyId,
    step_id: "step.task_to_engineering.closeout"
  };
  const created = await getJson(`${hostBase}/runs/task-to-engineering-closeout`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify(payload)
  });
  if (created?.run?.id && phase4aRunIdInput) {
    phase4aRunIdInput.value = created.run.id;
  }
  await refreshRuns();
  await refreshState();
});

createOpenAiTransportRunBtn?.addEventListener("click", async () => {
  const caseId = String(transportCaseSelect?.value || "case1_openai_codegen_transport_closeout");
  const payload = {
    title: `openai transport ${caseId}`,
    case_id: caseId,
    step_id: "step.openai_codegen_transport.closeout"
  };
  const created = await getJson(`${hostBase}/runs/openai-codegen-transport-closeout`, {
    method: "POST",
    headers: byoHeaders(),
    body: JSON.stringify(payload)
  });
  if (created?.run?.id && phase4aRunIdInput) {
    phase4aRunIdInput.value = created.run.id;
  }
  await refreshRuns();
  await refreshState();
});

async function loadRuntimeProfile() {
  try {
    const data = await getJson(`${hostBase}/runtime-profile`);
    runtimeProfile = data.runtime_profile;
    eventBufferLimit = runtimeProfile.limits.ui_event_buffer_max;
    runListLimit = runtimeProfile.limits.run_list_max;
    stepTimelineLimit = runtimeProfile.limits.step_timeline_max;
  } catch {
    runtimeProfile = { id: "lite_8gb", limits: { ...fallbackLimits }, deferred_lanes: [] };
  }
  runtimeProfileBadge.textContent = runtimeProfile.id;
  renderBanners();
}

(async function init() {
  await loadRuntimeProfile();
  capabilityInput.value = modeCapabilityTemplate(authModeSelect.value);
  await refreshRuns();
  await hydrateFromRuns();
  await refreshState();
  await refreshGrants();
  await refreshPendingApprovals();
  connectEvents();
  renderBuffers();
  renderBanners();
})();
