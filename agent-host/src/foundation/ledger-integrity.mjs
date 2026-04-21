import fs from "node:fs";
import path from "node:path";

function safeJsonParse(raw, fallback = null) {
  try {
    return JSON.parse(String(raw || ""));
  } catch {
    return fallback;
  }
}

function toRepoRelative(repoRoot, absPath) {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}

function normalizeText(input) {
  return String(input || "").trim();
}

export function runLedgerIntegrityScan({
  db,
  repoRoot,
  runsRoot,
  nowIso,
  shortId,
  computeCompactIntegrityHash,
  terminalTraceExemptRunIds = [],
  fix = true,
  triggerSource = "startup"
}) {
  const ts = nowIso();
  const exemptTerminalTraceRunIdSet = new Set(
    Array.isArray(terminalTraceExemptRunIds) ? terminalTraceExemptRunIds.map((x) => String(x || "").trim()).filter(Boolean) : []
  );
  const report = {
    trigger_source: triggerSource,
    scanned_at: ts,
    run_meta_mismatch_before: 0,
    run_meta_mismatch_after: 0,
    run_event_count_mismatch_before: 0,
    run_event_count_mismatch_after: 0,
    terminal_trace_missing_before: 0,
    terminal_trace_missing_after: 0,
    terminal_trace_missing_before_exempted: 0,
    terminal_trace_missing_after_exempted: 0,
    terminal_trace_missing_before_blocking: 0,
    terminal_trace_missing_after_blocking: 0,
    compact_invalid_before: 0,
    compact_invalid_after: 0,
    fixes: {
      meta_rewritten: [],
      events_rebuilt: [],
      compact_quarantined: []
    },
    exemptions: {
      terminal_trace_missing: {
        exempted_run_ids: [],
        blocking_run_ids: []
      }
    }
  };

  const runs = db.prepare("SELECT id, status, last_event_type FROM runs ORDER BY created_at ASC").all();
  for (const run of runs) {
    const runDir = path.join(runsRoot, run.id);
    const metaPath = path.join(runDir, "meta.json");
    const eventsPath = path.join(runDir, "events.ndjson");
    const dbEvents = db
      .prepare("SELECT seq, type, payload_json, created_at FROM events WHERE run_id = ? ORDER BY seq ASC")
      .all(run.id);
    const hasTerminalTrace =
      run.status === "completed"
        ? dbEvents.some((evt) => evt.type === "step.completed")
        : run.status === "failed"
          ? dbEvents.some((evt) => evt.type === "step.failed")
          : run.status === "failed_controlled"
            ? dbEvents.some((evt) => evt.type === "step.failed_controlled")
            : true;
    if (!hasTerminalTrace) {
      report.terminal_trace_missing_before += 1;
      if (exemptTerminalTraceRunIdSet.has(String(run.id))) {
        report.terminal_trace_missing_before_exempted += 1;
        report.exemptions.terminal_trace_missing.exempted_run_ids.push(run.id);
      } else {
        report.terminal_trace_missing_before_blocking += 1;
        report.exemptions.terminal_trace_missing.blocking_run_ids.push(run.id);
      }
    }

    const meta = safeJsonParse(fs.existsSync(metaPath) ? fs.readFileSync(metaPath, "utf8") : "", null);
    if (!meta || normalizeText(meta.status) !== normalizeText(run.status) || normalizeText(meta.last_event_type) !== normalizeText(run.last_event_type)) {
      report.run_meta_mismatch_before += 1;
      if (fix) {
        const nextMeta = {
          id: run.id,
          title: meta?.title || run.id,
          status: run.status,
          created_at: meta?.created_at || null,
          updated_at: ts,
          last_event_type: run.last_event_type
        };
        fs.mkdirSync(runDir, { recursive: true });
        fs.writeFileSync(metaPath, `${JSON.stringify(nextMeta, null, 2)}\n`, "utf8");
        report.fixes.meta_rewritten.push(run.id);
      }
    }

    const fileLineCount = fs.existsSync(eventsPath)
      ? fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean).length
      : 0;
    if (fileLineCount !== dbEvents.length) {
      report.run_event_count_mismatch_before += 1;
      if (fix) {
        fs.mkdirSync(runDir, { recursive: true });
        const lines = dbEvents.map((row) =>
          JSON.stringify({
            event_id: `evt_${run.id}_${row.seq}`,
            run_id: run.id,
            seq: row.seq,
            type: row.type,
            ts: row.created_at,
            payload: safeJsonParse(row.payload_json, {})
          })
        );
        fs.writeFileSync(eventsPath, lines.length ? `${lines.join("\n")}\n` : "", "utf8");
        report.fixes.events_rebuilt.push(run.id);
      }
    }
  }

  const compactRows = db
    .prepare(
      `SELECT cr.id, cr.run_id, cr.status, cr.artifact_path, cr.integrity_hash
       FROM compact_runs cr
       WHERE cr.status = 'completed'
       ORDER BY COALESCE(cr.completed_at, cr.started_at) ASC, cr.started_at ASC`
    )
    .all();
  for (const row of compactRows) {
    const artifactPath = normalizeText(row.artifact_path);
    const abs = artifactPath ? path.resolve(repoRoot, artifactPath) : null;
    let valid = true;
    if (!artifactPath || !abs || !fs.existsSync(abs)) {
      valid = false;
    } else {
      const parsed = safeJsonParse(fs.readFileSync(abs, "utf8"), null);
      const actual = parsed ? computeCompactIntegrityHash(parsed) : "";
      const expected = normalizeText(row.integrity_hash || parsed?.integrity_hash || "");
      if (!parsed || !expected || expected !== actual) {
        valid = false;
      }
    }

    if (!valid) {
      report.compact_invalid_before += 1;
      if (fix) {
        db.prepare("UPDATE compact_runs SET status = 'failed_controlled', completed_at = COALESCE(completed_at, ?) WHERE id = ?").run(ts, row.id);
        report.fixes.compact_quarantined.push(row.id);
      }
    }
  }

  // Post-fix recount.
  const postRuns = db.prepare("SELECT id, status, last_event_type FROM runs ORDER BY created_at ASC").all();
  for (const run of postRuns) {
    const runDir = path.join(runsRoot, run.id);
    const metaPath = path.join(runDir, "meta.json");
    const eventsPath = path.join(runDir, "events.ndjson");
    const meta = safeJsonParse(fs.existsSync(metaPath) ? fs.readFileSync(metaPath, "utf8") : "", null);
    const dbCount = db.prepare("SELECT COUNT(*) AS n FROM events WHERE run_id = ?").get(run.id).n;
    const fileCount = fs.existsSync(eventsPath)
      ? fs.readFileSync(eventsPath, "utf8").split(/\r?\n/).filter(Boolean).length
      : 0;
    const dbEvents = db.prepare("SELECT type FROM events WHERE run_id = ? ORDER BY seq ASC").all(run.id);
    const hasTerminalTrace =
      run.status === "completed"
        ? dbEvents.some((evt) => evt.type === "step.completed")
        : run.status === "failed"
          ? dbEvents.some((evt) => evt.type === "step.failed")
          : run.status === "failed_controlled"
            ? dbEvents.some((evt) => evt.type === "step.failed_controlled")
            : true;
    if (!meta || normalizeText(meta.status) !== normalizeText(run.status) || normalizeText(meta.last_event_type) !== normalizeText(run.last_event_type)) {
      report.run_meta_mismatch_after += 1;
    }
    if (dbCount !== fileCount) {
      report.run_event_count_mismatch_after += 1;
    }
    if (!hasTerminalTrace) {
      report.terminal_trace_missing_after += 1;
      if (exemptTerminalTraceRunIdSet.has(String(run.id))) {
        report.terminal_trace_missing_after_exempted += 1;
      } else {
        report.terminal_trace_missing_after_blocking += 1;
      }
    }
  }

  const postCompactRows = db
    .prepare(
      `SELECT cr.id, cr.artifact_path, cr.integrity_hash
       FROM compact_runs cr
       WHERE cr.status = 'completed'
       ORDER BY COALESCE(cr.completed_at, cr.started_at) ASC, cr.started_at ASC`
    )
    .all();
  for (const row of postCompactRows) {
    const artifactPath = normalizeText(row.artifact_path);
    const abs = artifactPath ? path.resolve(repoRoot, artifactPath) : null;
    let valid = true;
    if (!artifactPath || !abs || !fs.existsSync(abs)) {
      valid = false;
    } else {
      const parsed = safeJsonParse(fs.readFileSync(abs, "utf8"), null);
      const actual = parsed ? computeCompactIntegrityHash(parsed) : "";
      const expected = normalizeText(row.integrity_hash || parsed?.integrity_hash || "");
      if (!parsed || !expected || expected !== actual) {
        valid = false;
      }
    }
    if (!valid) {
      report.compact_invalid_after += 1;
    }
  }

  const reportDir = path.join(repoRoot, "evidence", "foundation-closeout");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportId = shortId("integrity");
  const reportAbs = path.join(reportDir, `ledger_integrity_${triggerSource}_${Date.now()}.json`);
  fs.writeFileSync(reportAbs, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const reportPath = toRepoRelative(repoRoot, reportAbs);
  db.prepare(
    "INSERT INTO ledger_integrity_reports (id, trigger_source, report_path, summary_json, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(reportId, triggerSource, reportPath, JSON.stringify(report), ts);

  return {
    ok: true,
    id: reportId,
    report_path: reportPath,
    report
  };
}
