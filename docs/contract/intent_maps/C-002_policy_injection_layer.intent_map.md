# C-002: Policy Injection Layer Intent Map

## 1. Problem Definition
- **Hardcoding Risk:** Traditional LLM orchestrators often bake "implement," "fix," or "diagnose" logic directly into the core engine's branching paths, leading to fragile, domain-specific systems.
- **Scalability Barriers:** Without a clear boundary, adding new workflows (e.g., "Review," "Architecture Check") requires manual code changes in the core engine.
- **Repository-Scanning Bias:** Many systems assume repository scanning is a mandatory first step. This system's intent is to treat scanning as an expensive, optional tool triggered only when explicitly required by a policy.

## 2. Goals
- **Workflow Swappability:** Ensure that a change to a documentation set or a mode's logic only requires editing a YAML file or a Markdown document.
- **Core as Plan Executor:** Solidify the core engine's role as a blind, neutral executor of ordered `ExecutionPlan` steps.
- **Mode Decoupling:** Treat "modes" as metadata, allowing the system to scale to any domain (e.g., legal, medical, coding) without changing the core engine.

## 3. Non-Goals
- **Policy as Executor:** The policy layer MUST NOT perform runtime actions (e.g., calling an LLM or reading files). Its role is purely to **interpret** and **plan**.
- **Domain Enforcement in Core:** The core engine MUST NOT "know" it is in a "coding" or "PRD" domain.

## 4. Long-Term Direction
- **Multi-Domain Support:** Allow a single runtime to switch between "Software Engineering" and "Legal Analysis" domains simply by pointing to a different `policy/` directory.
- **Multi-Policy Coexistence:** Enable the system to load multiple policies for different sub-tasks within a single interaction.
- **Hot-Reloading:** Enable the system to reload policies at runtime without restarting the orchestrator, facilitating faster iteration of workflow logic.

## 5. Design Rationale
The "fixed core, interchangeable policy" philosophy ensures that the engine's stability is not compromised by the rapid iteration of prompts, documentation, or workflow strategies. By making the core engine an "Execution Plan Executor," we decouple the "How to execute" from the "What to execute."
