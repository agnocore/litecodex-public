import fs from "node:fs";
import path from "node:path";

function readContract(sharedDir, fileName, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(path.join(sharedDir, fileName), "utf8"));
  } catch {
    return fallback;
  }
}

export function loadKernelContracts(sharedDir) {
  return {
    entryPreflight: readContract(sharedDir, "entry-preflight-contract.v1.json", { version: "v1" }),
    entryWorkspace: readContract(sharedDir, "entry-workspace-contract.v1.json", { version: "v1" }),
    entrySession: readContract(sharedDir, "entry-session-contract.v1.json", { version: "v1" }),
    entryAttachment: readContract(sharedDir, "entry-attachment-contract.v1.json", { version: "v1" }),
    entryAccess: readContract(sharedDir, "entry-access-contract.v1.json", { version: "v1" }),
    entryByo: readContract(sharedDir, "entry-byo-openai-contract.v1.json", { version: "v1" }),
    privateProvider: readContract(sharedDir, "private-capability-provider.v1.json", { version: "v1" }),
    pathBoundaryErrors: readContract(sharedDir, "path-boundary-error-contract.v1.json", { version: "v1" }),
    frontendEvents: readContract(sharedDir, "frontend-event-contract.v1.json", { version: "v1", frozen_subset: [] }),
    communityBoundary: readContract(sharedDir, "community-boundary-guard.v1.json", {
      version: "v1",
      code: "COMMUNITY_EDITION_RESTRICTED",
      required_feature: "official_advanced",
      routes: []
    })
  };
}
