import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function resetDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
}

export function copyPath(fromRoot, toRoot, relativePath) {
  const src = path.join(fromRoot, relativePath);
  const dst = path.join(toRoot, relativePath);
  if (!fs.existsSync(src)) {
    throw new Error(`missing_include_path:${relativePath}`);
  }
  ensureDir(path.dirname(dst));
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.cpSync(src, dst, {
      recursive: true,
      force: true,
      filter: (srcPath) => {
        const rel = path.relative(src, srcPath).replace(/\\/g, "/");
        if (!rel) return true;
        if (rel.includes("/node_modules/") || rel.startsWith("node_modules/")) return false;
        if (rel.includes("/.git/") || rel.startsWith(".git/")) return false;
        return true;
      }
    });
    return;
  }
  fs.copyFileSync(src, dst);
}

export function listFilesRecursive(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) {
        if (name === ".git") continue;
        stack.push(path.join(current, name));
      }
    } else {
      out.push(current);
    }
  }
  out.sort();
  return out;
}

export function sha256File(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(fs.readFileSync(filePath));
  return hash.digest("hex");
}

export function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function runLeakGuards(buildRoot, denyPathContains = []) {
  const files = listFilesRecursive(buildRoot);
  const pathViolations = [];
  const contentViolations = [];

  for (const file of files) {
    const rel = path.relative(buildRoot, file).replace(/\\/g, "/");
    for (const token of denyPathContains) {
      const needle = String(token || "").toLowerCase();
      if (!needle) continue;
      if (rel.toLowerCase().includes(needle)) {
        pathViolations.push({ path: rel, rule: needle });
      }
    }

    const text = fs.readFileSync(file, "utf8");
    if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/m.test(text)) {
      contentViolations.push({ path: rel, rule: "BEGIN_PRIVATE_KEY" });
    }
    if (/LITECODEX_[A-Z0-9_]*PRIVATE_KEY\s*=/m.test(text)) {
      contentViolations.push({ path: rel, rule: "PRIVATE_KEY_LITERAL" });
    }
  }

  return {
    ok: pathViolations.length === 0 && contentViolations.length === 0,
    fileCount: files.length,
    pathViolations,
    contentViolations
  };
}

export function buildManifest(buildRoot) {
  const files = listFilesRecursive(buildRoot);
  const entries = files.map((filePath) => {
    const rel = path.relative(buildRoot, filePath).replace(/\\/g, "/");
    return {
      path: rel,
      size: fs.statSync(filePath).size,
      sha256: sha256File(filePath)
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    fileCount: entries.length,
    entries
  };
}
