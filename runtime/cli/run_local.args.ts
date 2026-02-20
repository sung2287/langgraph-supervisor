import type { SupervisorPhase } from "../graph/graph";

export interface RunLocalArgs {
  input: string;
  projectId: string;
  repoPath: string;
  profile: string;
  phase: SupervisorPhase;
}

export function parseRunLocalArgs(argv: string[]): RunLocalArgs {
  const positional: string[] = [];
  let repoPathFromFlag: string | undefined;
  let profileFromFlag: string | undefined;
  let phaseFromFlag: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--") {
      continue;
    }
    if (token === "--repo") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        repoPathFromFlag = next;
        i += 1;
        continue;
      }
    }
    if (token === "--profile") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        profileFromFlag = next.trim();
        i += 1;
        continue;
      }
    }
    if (token === "--phase") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        phaseFromFlag = next.trim().toUpperCase();
        i += 1;
        continue;
      }
    }
    positional.push(token);
  }

  const input = positional[0] ?? "Hello from local CLI";
  const projectId = positional[1] ?? "default";
  const repoPath = repoPathFromFlag ?? process.cwd();
  const profile = profileFromFlag ?? "default";
  const rawPhase = phaseFromFlag ?? "CHAT";
  const phase: SupervisorPhase =
    rawPhase === "PRD_DRAFT" ||
    rawPhase === "IMPLEMENT" ||
    rawPhase === "DIAGNOSE" ||
    rawPhase === "CHAT"
      ? rawPhase
      : "CHAT";

  return { input, projectId, repoPath, profile, phase };
}
