import { parseRunLocalArgs } from "./run_local.args";
import { CycleFailError, FailFastError } from "../../src/core/plan/errors";
import { ConfigurationError as LlmConfigurationError } from "../llm/errors";
import { ConfigurationError as PolicyConfigurationError } from "../../src/policy/interpreter/policy.errors";
import { isSessionHashMismatchError, runRuntimeOnce } from "../orchestrator/run_request";
import { buildSessionFilename } from "../orchestrator/session_namespace";

const {
  input,
  repoPath,
  phase,
  currentDomain,
  profile,
  secretProfile,
  freshSession,
  session,
  provider,
  model,
  timeoutMs,
  maxAttempts,
} = parseRunLocalArgs(process.argv.slice(2));

const sessionFilename = buildSessionFilename(session);

try {
  const result = await runRuntimeOnce({
    inputText: input,
    repoPath,
    phase,
    currentDomain,
    profile,
    secretProfile,
    freshSession,
    sessionName: session,
    provider,
    model,
    timeoutMs,
    maxAttempts,
  });

  console.log(
    `mode=local repoPath=${repoPath} phase=${phase} profile=${profile} secretProfile=${secretProfile} provider=${result.provider} model=${result.model}`
  );
  if (typeof result.loadedSessionId === "string" && result.loadedSessionId !== "") {
    console.log(`[session] loaded ${sessionFilename} (sessionId=${result.loadedSessionId})`);
  }
  console.log("----- output -----");
  console.log(result.output);
  console.log("----- plan metadata -----");
  console.log(`policyId=${result.policyId} modeLabel=${result.modeLabel}`);
} catch (error) {
  if (error instanceof LlmConfigurationError || error instanceof PolicyConfigurationError) {
    console.error(`run:local configuration error: ${error.message}`);
    process.exitCode = 1;
  } else if (error instanceof CycleFailError) {
    console.error(`run:local cycle failed: ${error.message}`);
    process.exitCode = 1;
  } else if (error instanceof FailFastError) {
    console.error(`run:local fail-fast: ${error.message}`);
    process.exitCode = 1;
  } else if (isSessionHashMismatchError(error)) {
    console.error("Session hash mismatch: your provider/model/mode/domain changed.");
    console.error("Re-run with --fresh-session OR use a new --session <name>.");
    console.error(`run:local failed: ${error.message}`);
    process.exitCode = 1;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`run:local failed: ${message}`);
    process.exitCode = 1;
  }
}
