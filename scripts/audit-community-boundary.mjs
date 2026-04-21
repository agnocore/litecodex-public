import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const thisFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(thisFile);
const repoRoot = path.resolve(scriptsDir, "..");
const proofDir = path.join(repoRoot, "release", "proof");
const proofFile = path.join(proofDir, "community-boundary-audit.json");
const host = "127.0.0.1";
const port = Number(process.env.LITECODEX_BOUNDARY_AUDIT_PORT || 43187);

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requestJson(method, route, body = null, timeoutMs = 7000) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host,
        port,
        path: route,
        method,
        timeout: timeoutMs,
        headers: payload
          ? {
              "content-type": "application/json; charset=utf-8",
              "content-length": Buffer.byteLength(payload)
            }
          : undefined
      },
      (res) => {
        let raw = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          let json = null;
          try {
            json = JSON.parse(raw);
          } catch {
            // no-op
          }
          resolve({ statusCode: res.statusCode || 0, json, raw });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("request_timeout")));
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function waitForHealth(deadlineMs = 30000) {
  const deadline = Date.now() + deadlineMs;
  while (Date.now() < deadline) {
    try {
      const health = await requestJson("GET", "/health", null, 2000);
      if (health.statusCode === 200 && health.json?.ok === true) {
        return health;
      }
    } catch {
      // retry
    }
    await sleep(400);
  }
  throw new Error("agent_host_health_timeout");
}

function assert(cond, code) {
  if (!cond) {
    throw new Error(code);
  }
}

async function main() {
  const steps = [];

  const serverProc = spawn(process.execPath, [path.join("agent-host", "src", "server.mjs")], {
    cwd: repoRoot,
    env: {
      ...process.env,
      LITE_CODEX_HOST_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stdout = "";
  let stderr = "";
  serverProc.stdout.on("data", (buf) => {
    stdout += buf.toString("utf8");
  });
  serverProc.stderr.on("data", (buf) => {
    stderr += buf.toString("utf8");
  });

  try {
    const health = await waitForHealth();
    steps.push({ step: "health", result: health });
    assert(health.json?.community_boundary?.restricted_routes > 0, "boundary_contract_not_loaded");

    const restrictedPhase = await requestJson("POST", "/runs/phase4a-resume-reconnect-hydration", {
      case_id: "boundary_audit_case"
    });
    steps.push({ step: "restricted_phase_route", result: restrictedPhase });
    assert(restrictedPhase.statusCode === 403, "restricted_phase_route_not_blocked");
    assert(
      restrictedPhase.json?.code === "COMMUNITY_EDITION_RESTRICTED",
      "restricted_phase_route_wrong_error_code"
    );

    const restrictedGrant = await requestJson("GET", "/capability-grants");
    steps.push({ step: "restricted_capability_grants", result: restrictedGrant });
    assert(restrictedGrant.statusCode === 403, "restricted_capability_grants_not_blocked");

    const allowedRuns = await requestJson("GET", "/runs");
    steps.push({ step: "allowed_runs_list", result: { statusCode: allowedRuns.statusCode } });
    assert(allowedRuns.statusCode === 200, "baseline_runs_route_broken");

    const proof = {
      generatedAt: new Date().toISOString(),
      ok: true,
      host,
      port,
      checks: {
        boundaryContractLoaded: true,
        restrictedPhaseRouteBlocked: true,
        restrictedCapabilityGrantRouteBlocked: true,
        baselineRunsRouteIntact: true
      },
      steps,
      serverLogs: {
        stdout: stdout.trim(),
        stderr: stderr.trim()
      }
    };
    writeJson(proofFile, proof);
    process.stdout.write(`${JSON.stringify(proof, null, 2)}\n`);
  } finally {
    if (!serverProc.killed) {
      try {
        serverProc.kill("SIGTERM");
      } catch {
        // no-op
      }
    }
    await sleep(250);
    if (!serverProc.killed) {
      try {
        serverProc.kill("SIGKILL");
      } catch {
        // no-op
      }
    }
  }
}

main().catch((error) => {
  const failure = {
    generatedAt: new Date().toISOString(),
    ok: false,
    host,
    port,
    error: String(error?.message || error)
  };
  writeJson(proofFile, failure);
  process.stderr.write(`${JSON.stringify(failure, null, 2)}\n`);
  process.exit(1);
});