export const ALLOWED_PHASES = ["default", "diagnose", "implement"] as const;

export type RuntimePhase = (typeof ALLOWED_PHASES)[number];

export interface RunLocalArgs {
  input: string;
  projectId: string;
  repoPath: string;
  profile: string;
  phase: RuntimePhase;
  provider?: string;
  model?: string;
  timeoutMs?: number;
  maxAttempts?: number;
}

function isRuntimePhase(value: string): value is RuntimePhase {
  return (ALLOWED_PHASES as readonly string[]).includes(value);
}

export function normalizePhase(raw: string | undefined): RuntimePhase {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (trimmed === "") {
    return "default";
  }

  const lowered = trimmed.toLowerCase();
  if (lowered === "chat") {
    return "default";
  }

  if (isRuntimePhase(lowered)) {
    return lowered;
  }

  throw new Error(
    `Unknown phase "${trimmed}". Available phases: ${ALLOWED_PHASES.join(", ")}`
  );
}

export function parseRunLocalArgs(argv: string[]): RunLocalArgs {
  const positional: string[] = [];
  let repoPathFromFlag: string | undefined;
  let profileFromFlag: string | undefined;
  let phaseFromFlag: string | undefined;
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
    if (token === "--provider") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        providerFromFlag = next.trim();
        i += 1;
        continue;
      }
    }
    if (token === "--model") {
      const next = argv[i + 1];
      if (typeof next === "string" && next.trim() !== "") {
        modelFromFlag = next.trim();
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
  const phase = normalizePhase(phaseFromFlag);

  return {
    input,
    projectId,
    repoPath,
    profile,
    phase,
    provider: providerFromFlag,
    model: modelFromFlag,
    timeoutMs: timeoutMsFromFlag,
    maxAttempts: maxAttemptsFromFlag,
  };
}
