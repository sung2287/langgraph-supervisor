# D-002: Policy Injection Layer Platform

## 1. Directory Layout (Fixed)
The Policy Injection Layer is structured to isolate the core engine from configuration files and state.

```text
src/
  core/            # Fixed Core Engine (Plan Executor)
  policy/
    interpreter/   # Logic that converts profile data to ExecutionPlans
    schema/        # Type definitions for policy files
policy/
  profiles/        # Root for selectable policy sets
    default/
      modes.yaml
      triggers.yaml
      bundles.yaml
    coding/
      modes.yaml
      triggers.yaml
      bundles.yaml
    writing/
      modes.yaml
      triggers.yaml
      bundles.yaml
ops/
  runtime/         # Snapshots and artifacts
  state_delta/     # Latest system state (SSOT)
```

## 2. Runtime State Location Rules
- **`executionPlan`**: MUST exist ONLY in the runtime's memory during a single execution cycle.
- **Snapshots/Artifacts**: MUST be persisted ONLY within `ops/runtime/` or its subdirectories.
- **Metadata**: `currentMode` metadata label MUST be part of the `ExecutionPlan` structure and MUST NOT be persisted as an independent core-level state.

## 3. Import Boundary Rules
- **Core Engine (src/core/)**: MUST NOT import files directly from `policy/interpreter/` or `policy/*.yaml`.
- **Core Engine (src/core/)**: MUST access the `ExecutionPlan` through a neutral interface.
- **Policy Interpreter (src/policy/interpreter/)**: MUST NOT contain domain-specific logic. It MUST be a configuration interpreter independent of file format. The policy source format (YAML, JSON, etc.) MUST remain replaceable without requiring changes to the core engine.

## 4. CLI / Entry Integration Structure
The CLI (`runtime/cli/run_local.ts`) MUST initialize the `PolicyInterpreter` and load active policies before invoking the Core Engine.

- **Profile Selection:** The CLI or entry point MUST support selecting a policy profile using a `--profile <name>` flag.
- **Default Profile:** If no profile is specified, the runtime MUST use the `default` profile.
- **Execution Plan Generation:** The selected profile MUST ONLY affect the generation of the `ExecutionPlan`; the Core Engine remains identical regardless of the profile.

```text
[CLI]
  --> Resolve --profile <name> (default: "default")
  --> Init PolicyInterpreter(profile_root: "policy/profiles/<name>/")
  --> Load (modes, triggers, bundles) from profile_root
  --> Resolve ExecutionPlan
  --> Invoke CoreEngine(ExecutionPlan)
```

## 5. Persistence Boundary
The Core Engine MUST write LLM outputs and memory updates to the `ops/state_delta/` or `agent/memory/` paths as defined by the `ExecutionPlan`, not by hardcoded rules within the engine.
