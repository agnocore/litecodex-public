import fs from "node:fs";
import path from "node:path";

function normalizeFsPath(input) {
  return path.resolve(String(input || "")).replace(/\\/g, "/");
}

function isWithinWorkspace(targetPath, workspaceRootPath) {
  const target = normalizeFsPath(targetPath);
  const root = normalizeFsPath(workspaceRootPath);
  return target === root || target.startsWith(`${root}/`);
}

function normalizeRule(rule) {
  return String(rule || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function hasAncestorEscapeSegment(input) {
  const raw = String(input || "").replace(/\\/g, "/");
  const parts = raw.split("/").filter(Boolean);
  return parts.includes("..");
}

function makePathBoundaryError(result, absolutePath, workspaceRoot) {
  const error = new Error(`path_boundary_rejected:${result.reason}:${absolutePath}`);
  error.name = "PathBoundaryError";
  error.code = "path_boundary_rejected";
  error.status = 403;
  error.reason = result.reason || "path_rejected";
  error.check_type = result.checkType || "path_access";
  error.path = absolutePath || null;
  error.workspace_root = workspaceRoot || null;
  return error;
}

export function isPathBoundaryError(error) {
  return Boolean(error && error.code === "path_boundary_rejected");
}

function detectSymlinkEscape(workspaceRoot, targetAbs) {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(targetAbs);
  const realRoot = fs.existsSync(root) ? fs.realpathSync(root) : root;
  const rel = path.relative(root, target);
  const parts = rel.split(path.sep).filter(Boolean);
  let cursor = root;
  for (const part of parts) {
    cursor = path.join(cursor, part);
    if (!fs.existsSync(cursor)) {
      break;
    }
    const stat = fs.lstatSync(cursor);
    if (!stat.isSymbolicLink()) {
      continue;
    }
    const real = fs.realpathSync(cursor);
    const realNorm = normalizeFsPath(real);
    const rootNorm = normalizeFsPath(realRoot);
    if (!(realNorm === rootNorm || realNorm.startsWith(`${rootNorm}/`))) {
      return { escaped: true, reason: "symlink_escape", realPath: real };
    }
  }
  if (fs.existsSync(target)) {
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) {
      const real = fs.realpathSync(target);
      const realNorm = normalizeFsPath(real);
      const rootNorm = normalizeFsPath(realRoot);
      if (!(realNorm === rootNorm || realNorm.startsWith(`${rootNorm}/`))) {
        return { escaped: true, reason: "symlink_escape", realPath: real };
      }
    }
  }
  return { escaped: false, reason: "within_root", realPath: null };
}

function evaluateBoundaryPath({
  workspaceRoot,
  targetPath,
  forbiddenSubpaths = []
}) {
  const root = path.resolve(workspaceRoot);
  const target = path.resolve(targetPath);
  if (!isWithinWorkspace(target, root)) {
    return { approved: false, status: "rejected", reason: "outside_working_root", checkType: "outside_root", target };
  }

  const rel = normalizeRule(path.relative(root, target));
  for (const rawRule of forbiddenSubpaths) {
    const rule = normalizeRule(rawRule);
    if (!rule) {
      continue;
    }
    if (rel === rule || rel.startsWith(`${rule}/`)) {
      return { approved: false, status: "rejected", reason: "forbidden_subpath", checkType: "forbidden_subpath", target };
    }
  }

  const symlink = detectSymlinkEscape(root, target);
  if (symlink.escaped) {
    return {
      approved: false,
      status: "rejected",
      reason: symlink.reason,
      checkType: "symlink_escape",
      target,
      real_path: symlink.realPath
    };
  }

  return { approved: true, status: "approved", reason: "within_working_root", checkType: "within_root", target };
}

export function createBoundaryGuard({
  workspaceRoot,
  forbiddenSubpaths = [],
  maxFileSizeBytes = 1048576,
  onCheck = null
}) {
  function notify(result, meta = {}) {
    if (typeof onCheck !== "function") {
      return;
    }
    onCheck({
      ...result,
      ...meta
    });
  }

  function guardPath(targetPath, meta = {}) {
    const relativeInput = !path.isAbsolute(targetPath);
    if (relativeInput && hasAncestorEscapeSegment(targetPath)) {
      const absEscaped = path.resolve(workspaceRoot, targetPath);
      const rejected = {
        approved: false,
        status: "rejected",
        reason: "ancestor_escape",
        checkType: "ancestor_escape",
        target: absEscaped
      };
      notify(rejected, { absolute_path: absEscaped, ...meta });
      throw makePathBoundaryError(rejected, absEscaped, path.resolve(workspaceRoot));
    }
    const abs = path.isAbsolute(targetPath) ? targetPath : path.resolve(workspaceRoot, targetPath);
    const result = evaluateBoundaryPath({
      workspaceRoot,
      targetPath: abs,
      forbiddenSubpaths
    });
    notify(result, { absolute_path: path.resolve(abs), ...meta });
    if (!result.approved) {
      throw makePathBoundaryError(result, path.resolve(abs), path.resolve(workspaceRoot));
    }
    return path.resolve(abs);
  }

  function guardedRead(targetPath, meta = {}) {
    const abs = guardPath(targetPath, { checkType: "read", ...meta });
    const stat = fs.statSync(abs);
    if (stat.size > maxFileSizeBytes) {
      throw new Error(`file_too_large:${abs}`);
    }
    return fs.readFileSync(abs, "utf8");
  }

  function guardedWrite(targetPath, content, meta = {}) {
    const abs = guardPath(targetPath, { checkType: "write", ...meta });
    const body = String(content || "");
    if (Buffer.byteLength(body, "utf8") > maxFileSizeBytes) {
      throw new Error(`file_too_large_to_write:${abs}`);
    }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body, "utf8");
    return abs;
  }

  function guardedCwd(targetPath, meta = {}) {
    const abs = guardPath(targetPath, { checkType: "cwd", ...meta });
    return abs;
  }

  return {
    guardPath,
    guardedRead,
    guardedWrite,
    guardedCwd,
    evaluateBoundaryPath: (targetPath) =>
      evaluateBoundaryPath({ workspaceRoot, targetPath, forbiddenSubpaths })
  };
}

export { evaluateBoundaryPath, isWithinWorkspace, normalizeFsPath };
