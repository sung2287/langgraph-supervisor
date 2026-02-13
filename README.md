# 1. Clone template
git clone <this-repo-url> my-new-project
cd my-new-project

# 2. Install dependencies
npm ci

# 3. Create first PRD
# (e.g., docs/prd/PRD-001_<domain_name>.md)

# 4. Run quality gate
npm test && npm run typecheck && npm run arch:check

# 5. Close PRD and promote state
npm run prd:close -- PRD-001