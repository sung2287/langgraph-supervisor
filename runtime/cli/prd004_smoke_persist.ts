import fs from "node:fs";
import path from "node:path";
import { executePlan } from "../../src/core/plan/plan.executor";
import { coreStepExecutors } from "../../src/core/plan/plan.handlers";
import {
  type ExecutionPlanV1,
  type GraphState,
  type PlanExecutorDeps,
} from "../../src/core/plan/plan.types";
import { createStepExecutorRegistry } from "../../src/core/plan/step.registry";
import { createSQLiteStorageLayer } from "../../src/adapter/storage/sqlite";
import {
  FileSessionStore,
  SESSION_STATE_REL_PATH,
} from "../../src/session/file_session.store";
import { createRuntimePlanExecutorDeps } from "../graph/plan_executor_deps";

const SMOKE_SESSION_ID = "smoke-prd004";
const SMOKE_HASH = "smoke-prd004-hash";
const SMOKE_UPDATED_AT = "1970-01-01T00:00:00.000Z";

interface SmokeArgs {
  readonly repoPath: string;
}

class NoopMemoryRepo {
  async write(): Promise<void> {
    return;
  }
}

function parseArgs(argv: readonly string[]): SmokeArgs {
  let repoPath = process.cwd();

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if ((token === "--repo" || token === "--repoPath") && typeof argv[i + 1] === "string") {
      repoPath = argv[i + 1] ?? repoPath;
      i += 1;
    }
  }

  return {
    repoPath: path.resolve(repoPath),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function buildPlan(projectId: string): ExecutionPlanV1 {
  return {
    step_contract_version: "1",
    extensions: [],
    metadata: {
      policyProfile: "smoke",
      mode: "smoke",
    },
    steps: [
      {
        id: "s1",
        type: "ContextSelect",
        payload: { input: "smoke", sources: [] },
      },
      {
        id: "s2",
        type: "PromptAssemble",
        payload: {},
      },
      {
        id: "s3",
        type: "LLMCall",
        payload: {},
      },
      {
        id: "s4",
        type: "PersistSession",
        payload: { projectId },
      },
    ],
  };
}

function buildState(plan: ExecutionPlanV1, projectId: string): GraphState {
  return {
    userInput: "PRD-004 smoke",
    executionPlan: plan,
    policyRef: Object.freeze({ policyId: "smoke-policy" }),
    projectId,
    currentMode: "smoke",
    currentDomain: undefined,
    loadedDocs: undefined,
    selectedContext: undefined,
    assembledPrompt: undefined,
    actOutput: undefined,
    stepResults: undefined,
    stepUnavailableReasons: undefined,
    repoScanVersion: undefined,
    repoContextArtifactPath: undefined,
    repoContextUnavailableReason: undefined,
    lastResponse: undefined,
    stepLog: [],
  };
}

async function runSmoke(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const repoPath = args.repoPath;
  const sessionPath = path.resolve(repoPath, SESSION_STATE_REL_PATH);
  const runtimeDir = path.dirname(sessionPath);
  const beforeExists = fs.existsSync(sessionPath);

  let beforeUpdatedAt: string | undefined;
  if (beforeExists) {
    try {
      const parsed = JSON.parse(fs.readFileSync(sessionPath, "utf8")) as unknown;
      const record = asRecord(parsed);
      if (typeof record.updatedAt === "string") {
        beforeUpdatedAt = record.updatedAt;
      }
    } catch {
      beforeUpdatedAt = undefined;
    }
  }

  const storageLayer = createSQLiteStorageLayer({
    dbPath: path.resolve(repoPath, "ops", "runtime", "runtime.db"),
  });
  const sessionStore = new FileSessionStore(repoPath);
  storageLayer.storage.connect();

  try {
    const registry = createStepExecutorRegistry();
    for (const [kind, executor] of Object.entries(coreStepExecutors)) {
      registry.register(kind, executor);
    }

    const deps: PlanExecutorDeps = createRuntimePlanExecutorDeps({
      llmClient: {
        async generate(prompt: string): Promise<string> {
          return `SMOKE:${prompt}`;
        },
      },
      memoryRepo: new NoopMemoryRepo(),
      storageLayer,
      sessionStore,
      expectedHash: SMOKE_HASH,
      loadedSession: {
        sessionId: SMOKE_SESSION_ID,
        memoryRef: "runtime:memory:in-memory",
        repoScanVersion: "none",
        lastExecutionPlanHash: SMOKE_HASH,
        updatedAt: SMOKE_UPDATED_AT,
      },
    });

    const plan = buildPlan(repoPath);
    const state = buildState(plan, repoPath);
    await executePlan(plan, state, deps, registry);
  } finally {
    storageLayer.storage.close();
  }

  const afterExists = fs.existsSync(sessionPath);
  if (!afterExists) {
    throw new Error("Smoke failed: session file was not created");
  }

  const bytes = fs.statSync(sessionPath).size;
  if (bytes <= 0) {
    throw new Error("Smoke failed: session file is empty");
  }

  const raw = fs.readFileSync(sessionPath, "utf8");
  const parsed = JSON.parse(raw) as unknown;
  const parsedRecord = asRecord(parsed);
  const jsonValid = true;

  if (parsedRecord.sessionId !== SMOKE_SESSION_ID) {
    throw new Error("Smoke failed: sessionId mismatch");
  }
  if (typeof parsedRecord.updatedAt !== "string") {
    throw new Error("Smoke failed: updatedAt is missing");
  }

  const baseline = beforeUpdatedAt ?? SMOKE_UPDATED_AT;
  const updatedAtIncreased =
    Number.isFinite(Date.parse(parsedRecord.updatedAt)) &&
    Date.parse(parsedRecord.updatedAt) > Date.parse(baseline);
  if (!updatedAtIncreased) {
    throw new Error("Smoke failed: updatedAt was not increased");
  }

  const leftovers = fs.existsSync(runtimeDir)
    ? fs
        .readdirSync(runtimeDir)
        .filter((name) => name.startsWith("session_state.json.tmp-"))
    : [];
  if (leftovers.length > 0) {
    throw new Error(`Smoke failed: atomic temp leftovers detected (${leftovers.join(",")})`);
  }

  console.log(`repoPath=${repoPath}`);
  console.log(`sessionPath=${sessionPath}`);
  console.log(`beforeExists=${String(beforeExists)}`);
  console.log(`afterExists=${String(afterExists)}`);
  console.log(`bytes=${String(bytes)}`);
  console.log(`jsonValid=${String(jsonValid)}`);
  console.log("PASS");
}

runSmoke().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prd:004:smoke failed: ${message}`);
  process.exitCode = 1;
});
