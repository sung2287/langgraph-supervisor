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
npm test && npm run typecheck && npm run arch:check

# 5. Close PRD and promote state
npm run prd:close -- PRD-001

## Template Operating Rules

1. This repository starts with a clean seed state:
   - ops/state_delta/latest.json = null
   - ops/state_delta/history = empty
   - ops/evidence = empty

2. Smoke tests (PRD-000, PRD-001 trial runs) must NOT remain in history.

3. If a test close is executed, reset:
   - ops/evidence/*
   - ops/state_delta/history/*
   - latest.json
   - meaning.json

4. The template must always remain domain-free.

5. First real project PRD must start from PRD-001 in the new cloned repository.
