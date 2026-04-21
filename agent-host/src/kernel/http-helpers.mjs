import fs from "node:fs";

export function setCorsHeaders(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Browser-Profile-Id, X-PCP-Token");
}

export function sendJson(res, statusCode, payload) {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(`${JSON.stringify(payload, null, 2)}\n`);
}

export function sendText(res, statusCode, text, contentType = "text/plain; charset=utf-8") {
  setCorsHeaders(res);
  res.writeHead(statusCode, { "content-type": contentType, "cache-control": "no-store" });
  res.end(String(text));
}

export function sendSseHeaders(res) {
  setCorsHeaders(res);
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });
}

export function writeSseEvent(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`id: ${event.id}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function readJsonBody(req, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > limitBytes) {
        reject(new Error("request_body_too_large"));
      }
    });
    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid_json_body"));
      }
    });
    req.on("error", reject);
  });
}

export function ensureDir(pathValue) {
  fs.mkdirSync(pathValue, { recursive: true });
}

export function normalizeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function nowIso() {
  return new Date().toISOString();
}
