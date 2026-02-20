# PRD-003: Repository Context Plugin (Optional Tool)

## Objective
Implement a repository scanning system as an optional, policy-driven plugin tool to provide deep context when required.

## Background
Repository scanning (`repo_scan`) is an expensive and specialized tool. To maintain the runtime's domain neutrality and performance, this tool must not be a mandatory part of the core engine's execution loop.

## Scope
- Implementation of a repository snapshot structure.
- Implementation of a policy-driven trigger for repository scanning.
- Definition of snapshot reuse and refresh strategy.

## Non-Goals
- Automatic repository scanning on every interaction.
- Implementation of the actual code analysis or refactoring.
- Core engine dependence on the scanner.

## Architecture
The core engine executes an abstract execution plan and has no intrinsic knowledge of repository scanning. The repository context plugin is discovered and invoked through a policy-defined execution step:

```text
[Policy Resolution]
       ↓
[Execution Plan]
       ↓
[Core Engine Executes Plan Steps]
       ↓
[Repository Context Plugin] (only if present in execution plan)
                                             |
                                             +--> [Repository Snapshot]
                                             |      - File Index
                                             |      - Versioning
                                             |      - Cache
                                             +--> [scan-result.json]
```

## Data Structures
### Repository Snapshot
- **`scanVersion`**: Timestamp or Git hash to track freshness.
- **`fileIndex`**: List of files, metadata, and basic structure.
- **`summaryCache`**: Cached high-level summaries.
- **`snapshotPolicyRef`**: Reference to the policy that triggered the scan.
- **`storagePath`**: Reference to a runtime-managed directory (e.g., `ops/runtime/scan-result.json`) where snapshot artifacts are persisted.
- **`isFullScan`**: Boolean flag.

## Execution Rules
1. **Discovered Invocation:** The plugin is invoked only when policy resolution includes a repository context step.
2. **Snapshot Reuse:** Use `scan-result.json` if within the "freshness" window.
3. **Plugin Independence:** Removing or disabling the plugin requires zero modification to the core engine.
4. **Read-Only Enforcement:** The repository snapshot must be stored within runtime-managed state directories and must not modify the target repository.
5. **Explicit Refresh:** A scan is only performed if `scan-result.json` is missing or the `#rescan` trigger is received.

## Success Criteria
- The core engine runs successfully even if the plugin is disabled.
- Repository scan is only triggered via policy-defined keywords.
- Disabling the plugin requires zero code changes in the core loop.
