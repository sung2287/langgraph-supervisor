# B-002: Policy Injection Layer Contract

## 1. ExecutionPlan Schema
The `ExecutionPlan` is the primary interface between the Policy Layer and the Core Engine. It MUST be an ordered list of abstract steps.

### 1.1 Step Interface (TypeScript)
```typescript
interface ExecutionStep {
  type: string; // Opaque step identifier
  params: Record<string, any>;
}

interface ExecutionPlan {
  version: string;
  steps: ExecutionStep[];
  metadata: {
    modeLabel?: string; // Opaque to core
    policyId: string;
  };
}
```

The core engine MUST resolve step handlers dynamically through a registry mechanism. Adding a new step type MUST NOT require modification of the core execution execution loop.

## 2. Policy File Schemas
Policy files MUST be YAML-formatted and adhere to the following schemas.

### 2.1 `modes.yaml`
Defines available logical states and their associated execution plans.
```yaml
version: "1.0"
modes:
  - id: "string" # Opaque identifier
    plan:
      - type: "string" # Opaque step identifier
        params: {}
```

### 2.2 `triggers.yaml`
Defines transition logic from the current state to a target mode.
```yaml
version: "1.0"
triggers:
  - condition: "regex | keyword"
    target_mode: "string"
    type: "HARD | SOFT"
```

### 2.3 `bundles.yaml`
Maps modes or specific conditions to document sets.
```yaml
version: "1.0"
bundles:
  - mode_id: "string"
    files:
      - "path/to/doc.md"
```

## 3. Core/Policy Boundary Contracts
- **Plan-Centric Execution:** The Core Engine MUST ONLY execute steps defined within an `ExecutionPlan`.
- **Mode Opacity:** The Core Engine MUST NOT interpret the semantic meaning of `modeLabel`. It is treated as non-functional metadata.
- **Indirect Access:** The Core Engine MUST NOT directly parse YAML policy files. All policy data MUST be accessed through the `PolicyInterpreter`.
- **Immutable Cycle:** The `ExecutionPlan` MUST be immutable for the duration of a single execution cycle.

## 4. Invariant Rules (MUST/MUST NOT)
- **MUST NOT:** Use `if (mode === 'IMPLEMENT')` or similar branching in `src/core`.
- **MUST:** Derive all runtime behavior (including plugin calls) from the `ExecutionPlan`.
- **MUST:** Ensure that a policy change (updating YAML) can fundamentally alter the workflow without requiring a recompile of `src/core`.
- **Policy Profiles:**
    - A policy profile is a selectable policy root directory containing `modes`/`triggers`/`bundles` definitions.
    - The runtime MUST support selecting a policy profile at startup (e.g., 'default', 'coding', 'writing').
    - The core engine MUST remain profile-agnostic; only the policy interpreter is aware of policy root selection.
    - Profile selection MUST ONLY change the policy source location and MUST NOT alter core engine logic or control flow.

## 5. Versioning Strategy
- All policy files MUST include a `version` field.
- The `PolicyInterpreter` MUST validate the schema version before producing an `ExecutionPlan`.
