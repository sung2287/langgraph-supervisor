export interface RunLocalArgs {
  input: string;
  projectId: string;
  repoPath: string;
  profile: string;
  secretProfile: string;
  phase: string;
  currentDomain?: string;
  freshSession: boolean;
  session?: string;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

export function normalizePhase(raw: string | undefined): string {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed === "") {
    return "default";
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "chat") {
    return "default";
  }
  return lowered;
}

export function parseRunLocalArgs(argv: string[]): RunLocalArgs {
  const positional: string[] = [];
  let repoPathFromFlag: string | undefined;
  let profileFromFlag: string | undefined;
  let phaseFromFlag: string | undefined;
  let secretProfileFromFlag: string | undefined;
  let currentDomainFromFlag: string | undefined;
  let freshSessionFromFlag = false;
  let sessionFromFlag: string | undefined;
  let providerFromFlag: string | undefined;
  let modelFromFlag: string | undefined;
  let timeoutMsFromFlag: number | undefined;
  let maxAttemptsFromFlag: number | undefined;

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
        phaseFromFlag = next.trim();
        i += 1;
        continue;
      }
    }
    if (token === "--secret-profile") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        secretProfileFromFlag = next.trim();
        i += 1;
        continue;
      }
    }
    if (token === "--domain" || token === "--current-domain") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        currentDomainFromFlag = next.trim();
        i += 1;
        continue;
      }
    }
    if (token === "--fresh-session") {
      freshSessionFromFlag = true;
      continue;
    }
    if (token === "--session") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        sessionFromFlag = next.trim();
        i += 1;
        continue;
      }
    }
    if (token === "--provider") {
      const next = argv[i + 1];
      if (typeof next === "string" && next !== "") {
        providerFromFlag = next;
        i += 1;
        continue;
      }
    }
    if (token === "--model") {
      const next = argv[i + 1];
      if (typeof next === "string" && next !== "") {
        modelFromFlag = next;
        i += 1;
        continue;
      }
    }
    if (token === "--timeoutMs") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        const parsed = Number(next);
        if (Number.isFinite(parsed)) {
          timeoutMsFromFlag = parsed;
          i += 1;
          continue;
        }
      }
    }
    if (token === "--maxAttempts") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        const parsed = Number(next);
        if (Number.isFinite(parsed)) {
          maxAttemptsFromFlag = parsed;
          i += 1;
          continue;
        }
      }
    }
    positional.push(token);
  }

  const input = positional[0] ?? "Hello from local CLI";
  const projectId = positional[1] ?? "default";
  const repoPath = repoPathFromFlag ?? process.cwd();
  const profile = profileFromFlag ?? "default";
  const secretProfile = secretProfileFromFlag ?? "default";
  const phase = normalizePhase(phaseFromFlag);

  return {
    input,
    projectId,
    repoPath,
    profile,
    secretProfile,
    phase,
    currentDomain: currentDomainFromFlag,
    freshSession: freshSessionFromFlag,
    session: sessionFromFlag,
    provider: providerFromFlag,
    model: modelFromFlag,
    timeoutMs: timeoutMsFromFlag,
    maxAttempts: maxAttemptsFromFlag,
  };
}
