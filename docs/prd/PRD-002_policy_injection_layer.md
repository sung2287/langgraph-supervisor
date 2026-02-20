# PRD-002: Policy Injection Layer

## Objective
Define a structured system for externalizing workflows, modes, and triggers into document-based policies, allowing the runtime's behavior to be modified without changing the core engine.

## Background
To maintain a domain-neutral core, the "strategy" and "workflow" must be stored in external configuration documents. This layer allows the runtime to understand what a "mode" means and when it should change.

## Scope
- Definition of the `policy/` directory structure.
- Implementation of the `DetectMode` node's policy-driven logic.
- Definition of `triggers` for mode switching (Hard and Soft).
- Externalization of document bundle definitions.

## Non-Goals
- Specific domain policies (these will be added later by users).
- Detailed memory retrieval algorithms.
- Implementation of the actual repository scanner.

## Architecture
The policy layer acts as an interpreter between static configuration files and the core execution engine:

```text
[Core Engine]
      ^
      | (Interprets policy)
[Policy Injection Layer]
      ^
      | (Reads files)
[policy/modes.yaml]
[policy/triggers.yaml]
[policy/bundles.yaml]
```

## Data Structures
### Policy Components
- **`modes`**: Definition of available phases (e.g., `CHAT`, `DIAGNOSE`). Mode identifiers are opaque string labels to the core engine and carry no semantic meaning within the engine itself.
- **`triggers`**: Logic to switch modes based on input or state.
    - **Hard Trigger**: Immediate, automatic transition (e.g., specific command).
    - **Soft Trigger**: Suggested transition that requires verification or specific context.
- **`bundles`**: Mappings of modes to specific documentation sets (e.g., `DIAGNOSE` -> `reference_docs.md`).

## Execution Rules
1. **Source of Truth:** The resolution step must use `triggers.yaml` and `modes.yaml` to determine the `currentMode`.
2. **Policy-Driven Loading:** The document loader must use `bundles.yaml` to determine which documents to load.
3. **Branch-Free Core:** The core engine must not contain conditional branches based on specific mode names.
4. **Policy Interpretation Limit:** The policy layer must not directly execute runtime steps. Its sole responsibility is to interpret static configuration files and produce a resolved execution configuration or plan for the core engine.
5. **External Modification:** Changing a policy file must result in a different runtime behavior without a recompile.

## Success Criteria
- A new mode (e.g., `REVIEW`) can be added by only creating/modifying files in `policy/`.
- The engine correctly switches modes based on a keyword defined in `triggers.yaml`.
- Different document sets are loaded for different modes as defined in `bundles.yaml`.
