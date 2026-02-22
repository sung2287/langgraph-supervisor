# AI Orchestration Runtime (Orchestrator)

A domain-neutral context-assembling runtime built on LangGraph. This system provides a fixed core engine that facilitates a bundle-first, memory-aware prompt assembly process. All workflows—including phases, modes, document bundles, and triggers—are defined by external policy documents, ensuring policy-driven adaptability across any domain.

## Key Principles

- **Strategy is Human / System is Runtime:** Humans define the strategic goals and constraints; the runtime executes the context assembly, act steps, and state updates based on active policies.
- **Core vs. Domain/Policy Separation:** The engine remains domain-neutral and fixed. Specific behaviors, workflows, and domain rules are driven by interchangeable external configuration policies.
- **Context-Assembling Engine:** The runtime's primary role is to assemble the precise context required for the current state, optimizing LLM performance and consistency.
- **Repository Scanning is a Tool, Not a Default:**
    - The runtime does not re-scan repositories on every interaction.
    - Repository scanning is an optional plugin behavior, executed only when required by the current phase or an explicit user trigger.
    - Repository snapshots may be reused until explicitly refreshed by the system or user.
- **External Repo READ-ONLY:** The runtime treats target repositories as read-only context sources. Modifications are strictly limited to internal runtime-managed state directories (e.g., `ops/` or `agent/memory/`) to ensure system safety and traceability.

## Architecture Overview

The runtime executes a fixed, policy-driven pipeline focused on context assembly:

**DetectMode**
→ **LoadDocsForMode**
→ **ContextSelect** (Memory + Optional Retrieval)
→ **PromptAssemble**
→ **LLMCall**
→ **MemoryWrite**

**Core Constraints:**
- **Injected Steps:** Additional execution steps (e.g., repository scanning, validation, compilation) are injected by policy and are not part of the core execution loop.
- **Workflow Neutrality:** The runtime itself does not enforce a specific workflow structure; workflow definitions are entirely policy-driven.

## Requirements

- **Node.js:** 18+ (verified with v20+)
- **Ollama:** Installed and running (`ollama serve`).
- **Models:** Pulled model for local execution (e.g., `ollama pull qwen3:8b` or `qwen2.5-coder:7b`).

## Quickstart

1. **Install Dependencies:**
   ```bash
   npm ci
   ```

2. **Start Ollama Service:**
   ```bash
   ollama serve
   ```

3. **Run Locally:**
   Basic conversation:
   ```bash
   npm run run:local -- --repo . -- "Hello, let's discuss the project."
   ```

   Use a policy profile (defaults to `default` when omitted):
   ```bash
   npm run run:local -- --repo . --profile coding -- "Refactor core logic"
   ```

   Run a specific phase with debug logs:
   ```bash
   DEBUG_PROMPT=1 OLLAMA_TIMEOUT_MS=180000 npm run run:local -- --repo . --phase IMPLEMENT -- "Refactor the core logic in src/core"
   ```

## Configuration

The runtime can be configured via environment variables:

| Variable | Description | Default |
|---|---|---|
| `OLLAMA_BASE_URL` | Base URL for the Ollama API | `http://localhost:11434` |
| `OLLAMA_MODEL` | The local LLM model to use | `qwen3:8b` |
| `OLLAMA_TIMEOUT_MS` | Request timeout for LLM calls | `120000` |
| `DEBUG_PROMPT` | Set to `1` to output assembled prompts and metrics | `0` |

## Phase Model (Example Workflow)

Phases are not hardcoded. Phase behavior, triggers, and context injection rules are defined by external policy files.

- **CHAT:** For general discussion and planning. Focuses on memory and core documents.
- **PRD_DRAFT:** Focused on creating or updating product requirements.
- **IMPLEMENT:** May trigger repository scan depending on policy configuration.
- **DIAGNOSE:** May trigger repository scan if required for troubleshooting.

## LLM Routing Modes

- `local`: Exclusively uses the local Ollama instance.
- `api`: Uses external API adapters (e.g., OpenAI).
- `auto`: Intelligently switches between local and API based on context length or specific triggers (e.g., `#use_api` tag).

## 🔐 Secret Injection (PRD-011)

This feature allows you to securely manage API keys and credentials without manually exporting environment variables or risking commits of sensitive data to the repository. It supports profile-based switching for different environments (e.g., `work`, `personal`, `default`).

### Storage Location
Secrets are stored physically outside the project directory in your user home folder:
- **Linux/macOS:** `~/.langgraph-orchestration/secrets.json`
- **Windows:** `%USERPROFILE%\.langgraph-orchestration\secrets.json`

### Setting a Secret
Use the `secret` CLI to set or update a provider key within a specific profile:

```bash
# Set Gemini API Key for the 'default' profile
npm run secret -- set default gemini "YOUR_GEMINI_API_KEY"
```

**What happens:**
- **Auto-Provisioning:** Creates the parent directory and `secrets.json` if they are missing.
- **Atomic Write:** Uses a temporary file and atomic rename to prevent data corruption.
- **Security:** The raw key is masked in CLI logs (e.g., `apiKey=****`).

### Running with a Secret Profile
When running the orchestrator, specify which secret profile to inject:

```bash
# Uses the 'default' secret profile (the default if flag is omitted)
npm run run:local -- --provider gemini --secret-profile default -- "hello"
```

**Key Behaviors:**
- **Fail-Fast:** If the specified profile (or the `default` profile) is missing, the system will exit with a `CONFIGURATION_ERROR`.
- **Multi-Profile Support:** You can easily switch between different sets of credentials:
  ```bash
  # Set up a work profile
  npm run secret -- set work gemini "WORK_API_KEY"
  
  # Run using work credentials
  npm run run:local -- --provider gemini --secret-profile work -- "hello"
  ```

### Security & Integrity
- **Isolation:** Secrets are **never** stored in `src/core`, `session_state.json`, or the SQLite database.
- **Redaction:** API keys are never logged in plaintext; they are automatically redacted in logs and error messages.
- **Immutability:** Secret injection does not affect the `ExecutionPlan` hash or session persistence logic.

### Troubleshooting
- **`CONFIGURATION_ERROR: secret profile '...' was not found`**: Ensure you have run the `secret set` command for that profile name.
- **Permission Issues:** Ensure the `.langgraph-orchestration` directory and `secrets.json` have restricted permissions (recommended: `600` for the file, `700` for the directory).

## Debugging & Tips

- **Explicit Re-scan:** A repository re-scan can be triggered explicitly via policy-defined keywords (e.g., `#rescan`) if needed.
- **Debug Prompt:** Set `DEBUG_PROMPT=1` to inspect the exactly assembled context sent to the LLM.
- **WSL Tip:** If running on WSL, run `ollama serve` in a separate Windows terminal to ensure accessibility.

---

# 1. Clone template
git clone <this-repo-url> my-new-project
cd my-new-project

# 2. Install dependencies
npm ci

# Optional local LLM env (defaults)
OLLAMA_MODEL=qwen3:8b OLLAMA_TIMEOUT_MS=120000

# 3. Create first PRD
# (e.g., docs/prd/PRD-001_<domain_name>.md)

# 4. Run quality gate
npm run ci:gate

# 5. Close PRD and promote state
npm run prd:close -- PRD-001

## Template Operating Rules

1. This repository starts with a clean seed state:
   - `ops/state_delta/latest.json` = `null`
   - `ops/state_delta/history` = empty
   - `ops/evidence` = empty

2. Smoke tests (PRD-000, PRD-001 trial runs) must NOT remain in history.

3. If a test close is executed, reset:
   - `ops/evidence/*`
   - `ops/state_delta/history/*`
   - `latest.json`
   - `meaning.json`

4. The template must always remain domain-free.

5. First real project PRD must start from PRD-001 in the new cloned repository.
