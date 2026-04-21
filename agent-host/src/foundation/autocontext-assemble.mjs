import fs from "node:fs";
import path from "node:path";

function safeParseJson(raw, fallback = null) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return fallback;
  }
}

function toRepoRelative(repoRoot, abs) {
  return path.relative(repoRoot, abs).replace(/\\/g, "/");
}

export function assembleAutoContext({
  db,
  repoRoot,
  runsRoot,
  runId,
  stepId,
  nowIso,
  shortId,
  textHash
}) {
  const run = db.prepare("SELECT id, status, last_event_type, updated_at FROM runs WHERE id = ?").get(runId);
  if (!run) {
    return { ok: false, reason: "run_not_found" };
  }

  const latestCompact = db
    .prepare(
      "SELECT id, status, artifact_path, integrity_hash, source_event_from_seq, source_event_to_seq FROM compact_runs WHERE run_id = ? ORDER BY COALESCE(completed_at, started_at) DESC, started_at DESC LIMIT 1"
    )
    .get(runId);
  const latestManifest = db
    .prepare("SELECT * FROM attachment_manifests WHERE run_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(runId);
  const attachments = db
    .prepare("SELECT * FROM run_attachments WHERE run_id = ? ORDER BY created_at DESC LIMIT 64")
    .all(runId);
  const authSession = db
    .prepare("SELECT id, status, mode, required_capability, updated_at FROM auth_sessions WHERE run_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(runId);
  const resumeSession = db
    .prepare("SELECT id, status, resumable, resume_cursor, completed_at FROM resume_sessions WHERE run_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(runId);
  const reconnectSession = db
    .prepare("SELECT id, status, last_seen_seq, replayed_to_seq, completed_at FROM reconnect_sessions WHERE run_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(runId);
  const latestEvents = db
    .prepare("SELECT seq, type, created_at, payload_json FROM events WHERE run_id = ? ORDER BY seq DESC LIMIT 24")
    .all(runId)
    .reverse();

  const sourceTables = [
    "runs",
    "events",
    "auth_sessions",
    "resume_sessions",
    "reconnect_sessions",
    "compact_runs",
    "attachment_manifests",
    "run_attachments"
  ];

  const compactRef = {
    compact_run_id: latestCompact?.id || null,
    artifact_path: latestCompact?.artifact_path || null,
    integrity_hash: latestCompact?.integrity_hash || null,
    status:
      latestCompact?.status === "completed"
        ? "completed"
        : latestCompact
          ? "fallback_raw"
          : "missing",
    source_event_from_seq: latestCompact?.source_event_from_seq || null,
    source_event_to_seq: latestCompact?.source_event_to_seq || null
  };

  const attachmentRefs = attachments.map((row) => String(row.artifact_path || "")).filter(Boolean);
  const references = {
    latest_event_seq: latestEvents.length ? Number(latestEvents[latestEvents.length - 1].seq) : 0,
    latest_event_types: latestEvents.map((evt) => evt.type),
    compact_ref: compactRef,
    manifest_path: latestManifest?.manifest_path || null,
    manifest_id: latestManifest?.id || null,
    attachment_refs: attachmentRefs,
    auth_session_id: authSession?.id || null,
    resume_session_id: resumeSession?.id || null,
    reconnect_session_id: reconnectSession?.id || null
  };

  const snapshot = {
    snapshot_id: shortId("autctx"),
    run_id: runId,
    step_id: stepId,
    created_at: nowIso(),
    run_ref: run,
    compact_ref: compactRef,
    attachment_refs: attachmentRefs,
    session_refs: {
      auth_session: authSession || null,
      resume_session: resumeSession || null,
      reconnect_session: reconnectSession || null
    },
    evidence_refs: {
      manifest_path: latestManifest?.manifest_path || null,
      attachment_ids: attachments.map((row) => row.id)
    },
    source_tables: sourceTables,
    recent_events: latestEvents.map((evt) => ({
      seq: evt.seq,
      type: evt.type,
      created_at: evt.created_at,
      payload: safeParseJson(evt.payload_json, {})
    }))
  };
  snapshot.snapshot_hash = textHash(JSON.stringify(snapshot));

  const fileName = `autocontext_snapshot_${Date.now()}_${String(stepId || "step").replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
  const artifactDir = path.join(runsRoot, runId, "artifacts");
  fs.mkdirSync(artifactDir, { recursive: true });
  const absPath = path.join(artifactDir, fileName);
  fs.writeFileSync(absPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  const snapshotPath = toRepoRelative(repoRoot, absPath);

  const rowId = snapshot.snapshot_id;
  db.prepare(
    `INSERT INTO autocontext_snapshots (
      id, run_id, step_id, snapshot_path, snapshot_hash,
      compact_run_id, manifest_id, attachment_ids_json,
      source_tables_json, references_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    rowId,
    runId,
    stepId,
    snapshotPath,
    snapshot.snapshot_hash,
    compactRef.compact_run_id,
    latestManifest?.id || null,
    JSON.stringify(attachments.map((row) => row.id)),
    JSON.stringify(sourceTables),
    JSON.stringify(references),
    nowIso()
  );

  return {
    ok: true,
    snapshot_id: rowId,
    snapshot_path: snapshotPath,
    snapshot_hash: snapshot.snapshot_hash,
    row: db.prepare("SELECT * FROM autocontext_snapshots WHERE id = ?").get(rowId)
  };
}
