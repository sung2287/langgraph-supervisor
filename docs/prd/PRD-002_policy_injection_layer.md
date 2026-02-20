# PRD-002: Policy Injection Layer

## Objective
Define a structured system for externalizing workflows, modes, and triggers into document-based policies, allowing the runtime's behavior to be modified without changing the core engine.

## Background
To maintain a domain-neutral core, the "strategy" and "workflow" must be stored in external configuration documents. This layer allows the runtime to understand what a "mode" means and when it should change.

## Scope
- Definition of the `policy/profiles/` directory structure.
- Implementation of the policy resolution step that produces an `executionPlan`.
- Definition of `triggers` for mode switching (Hard and Soft).
- Externalization of document bundle definitions.
- **CLI Profile Selection:** Support selecting a policy profile at runtime startup via CLI flag (e.g., `--profile <name>`).
    - The selected profile determines the policy root directory used by the Policy Interpreter.
    - If no profile is specified, the runtime MUST default to `default`.
    - Profile switching does NOT modify the core engine; it only affects policy resolution and `executionPlan` generation.

## Non-Goals
- Specific domain policies (these will be added later by users).
- Detailed memory retrieval algorithms.
- Implementation of the actual repository scanner.
- **Runtime Profile Switching:** Switching profiles during an active execution cycle.
- **Profile Merging:** Merging multiple profiles in a single execution.

## Architecture
The policy layer acts as an interpreter between static configuration files and the core execution engine:

```text
[policy/profiles/<name>/modes.yaml]
[policy/profiles/<name>/triggers.yaml]
[policy/profiles/<name>/bundles.yaml]
          |
          v
[Policy Injection Layer (PolicyInterpreter)]
          |
          | (Generates executionPlan)
          v
[Core Engine (Plan Executor)]
```

The core engine never reads policy files directly. All policy parsing and interpretation are performed exclusively by the `PolicyInterpreter`. The core engine only executes the `executionPlan` produced by the `PolicyInterpreter`.

The `PolicyInterpreter` resolves the active policy profile based on CLI input before generating the `executionPlan`. The core engine remains unaware of profile semantics.

### CLI Selection Example
```bash
npm run run:local -- --profile coding -- "Refactor core logic"
```

**Data Flow:**
1. **CLI:** Read `--profile` flag (defaults to `default`).
2. **Init:** Initialize `PolicyInterpreter` with the selected profile root.
3. **Resolve:** Generate `executionPlan` based on profile configuration.
4. **Invoke:** Execute `CoreEngine(executionPlan)`.

## Data Structures
### Policy Components
- **`modes`**: Definition of available phases (e.g., `CHAT`, `DIAGNOSE`). Mode identifiers are opaque string labels to the core engine and carry no semantic meaning within the engine itself.
- **`triggers`**: Logic to switch modes based on input or state.
    - **Hard Trigger**: Immediate, automatic transition (e.g., specific command).
    - **Soft Trigger**: Suggested transition that requires verification or specific context.
- **`bundles`**: Mappings of modes to specific documentation sets (e.g., `DIAGNOSE` -> `reference_docs.md`).

## Execution Rules
1. **Source of Truth:** The resolution step must use `triggers.yaml` and `modes.yaml` to resolve the `executionPlan` (with optional mode metadata).
2. **ExecutionPlan Primacy:** The policy resolution step produces an `executionPlan` as the primary artifact. Any mode label is treated as metadata within that plan.
3. **Policy-Driven Loading:** The document loader must use `bundles.yaml` to determine which documents to load.
4. **Branch-Free Core:** The core engine must not contain conditional branches based on specific mode names.
5. **Policy Interpretation Limit:** The policy layer must not directly execute runtime steps. Its sole responsibility is to interpret static configuration files and produce a resolved execution configuration or plan for the core engine.
6. **External Modification:** Changing a policy file must result in a different runtime behavior without a recompile.
7. **Fail-Fast Resolution:** If policy resolution fails due to invalid schema, missing profile directory, or malformed configuration, the runtime MUST fail-fast and MUST NOT invoke the Core Engine.

## Success Criteria
- A new mode (e.g., `REVIEW`) can be added by only creating/modifying files in `policy/`.
- The engine correctly switches modes based on a keyword defined in `triggers.yaml`.
- Different document sets are loaded for different modes as defined in `bundles.yaml`.
