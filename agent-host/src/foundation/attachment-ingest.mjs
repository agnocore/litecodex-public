import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function toRepoRelative(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}

function sha256Hex(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function jsonRead(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function jsonWrite(filePath, body) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

function sanitizeName(input) {
  const clean = String(input || "").trim();
  if (!clean) {
    return "attachment.bin";
  }
  const normalized = clean.replace(/[^\w.\-]+/g, "_");
  return normalized || "attachment.bin";
}

export function createAttachmentIngestor({
  db,
  repoRoot,
  runsRoot,
  nowIso,
  shortId,
  getTaskStorageRootForRun
}) {
  function resolveStorageRoot(runId) {
    const taskStorage = typeof getTaskStorageRootForRun === "function" ? getTaskStorageRootForRun(runId) : null;
    if (taskStorage?.task_root) {
      return path.join(taskStorage.task_root, "attachments");
    }
    return path.join(runsRoot, runId, "artifacts", "attachments");
  }

  function ensureManifest(runId, sessionId = null) {
    const existing = db
      .prepare(
        "SELECT * FROM attachment_manifests WHERE run_id = ? AND COALESCE(session_id, '') = COALESCE(?, '') ORDER BY created_at DESC LIMIT 1"
      )
      .get(runId, sessionId);
    if (existing && fs.existsSync(path.resolve(repoRoot, existing.manifest_path))) {
      return existing;
    }

    const manifestId = shortId("attmanifest");
    const storageRootAbs = resolveStorageRoot(runId);
    const manifestAbs = path.join(storageRootAbs, "manifest.json");
    const manifestPath = toRepoRelative(repoRoot, manifestAbs);
    const ts = nowIso();

    db.prepare(
      `INSERT INTO attachment_manifests (
        id, run_id, session_id, status, manifest_path, storage_root, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(manifestId, runId, sessionId, "active", manifestPath, toRepoRelative(repoRoot, storageRootAbs), ts, ts);

    jsonWrite(manifestAbs, {
      manifest_id: manifestId,
      run_id: runId,
      session_id: sessionId,
      storage_root: toRepoRelative(repoRoot, storageRootAbs),
      created_at: ts,
      updated_at: ts,
      attachments: []
    });

    return db.prepare("SELECT * FROM attachment_manifests WHERE id = ?").get(manifestId);
  }

  function appendManifestEntry(manifestRow, entry) {
    const manifestAbs = path.resolve(repoRoot, manifestRow.manifest_path);
    const body = jsonRead(manifestAbs, {
      manifest_id: manifestRow.id,
      run_id: manifestRow.run_id,
      session_id: manifestRow.session_id,
      storage_root: manifestRow.storage_root,
      created_at: manifestRow.created_at,
      updated_at: manifestRow.updated_at,
      attachments: []
    });
    body.attachments = Array.isArray(body.attachments) ? body.attachments : [];
    body.attachments.push(entry);
    body.updated_at = nowIso();
    jsonWrite(manifestAbs, body);
    db.prepare("UPDATE attachment_manifests SET updated_at = ? WHERE id = ?").run(body.updated_at, manifestRow.id);
  }

  function ingestBuffer({
    runId,
    stepId = null,
    sessionId = null,
    sourceType,
    ingestChannel,
    originalName = null,
    mimeType = null,
    buffer,
    metadata = {}
  }) {
    const run = db.prepare("SELECT id FROM runs WHERE id = ?").get(runId);
    if (!run) {
      return { ok: false, reason: "run_not_found" };
    }
    const manifest = ensureManifest(runId, sessionId || null);
    const attachmentId = shortId("attach");
    const ext = path.extname(sanitizeName(originalName || "")) || ".bin";
    const fileName = `${attachmentId}${ext}`;
    const storageRootAbs = path.resolve(repoRoot, manifest.storage_root);
    const artifactAbs = path.join(storageRootAbs, fileName);
    fs.mkdirSync(storageRootAbs, { recursive: true });
    fs.writeFileSync(artifactAbs, buffer);

    const artifactPath = toRepoRelative(repoRoot, artifactAbs);
    const contentHash = sha256Hex(buffer);
    const sizeBytes = buffer.length;
    const ts = nowIso();

    db.prepare(
      `INSERT INTO run_attachments (
        id, run_id, step_id, session_id, manifest_id, source_type, ingest_channel,
        mime_type, original_name, artifact_path, content_hash, size_bytes, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      attachmentId,
      runId,
      stepId,
      sessionId,
      manifest.id,
      sourceType,
      ingestChannel,
      mimeType,
      originalName,
      artifactPath,
      contentHash,
      sizeBytes,
      JSON.stringify(metadata || {}),
      ts
    );

    appendManifestEntry(manifest, {
      id: attachmentId,
      run_id: runId,
      step_id: stepId,
      session_id: sessionId,
      source_type: sourceType,
      ingest_channel: ingestChannel,
      mime_type: mimeType,
      original_name: originalName,
      artifact_path: artifactPath,
      content_hash: contentHash,
      size_bytes: sizeBytes,
      metadata_json: metadata || {},
      created_at: ts
    });

    const row = db.prepare("SELECT * FROM run_attachments WHERE id = ?").get(attachmentId);
    const manifestRow = db.prepare("SELECT * FROM attachment_manifests WHERE id = ?").get(manifest.id);
    return { ok: true, attachment: row, manifest: manifestRow };
  }

  return {
    ensureManifest,
    ingestBuffer
  };
}
