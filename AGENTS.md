# AGENT.md SMOKE TEST (MUST COMPLY)
- 너는 매 응답의 첫 줄을 정확히 아래로 시작해야 한다:
AGENT_MD_LOADED=YES

## Test Reporting: Intent Header Echo (MANDATORY)

If you create or modify any test file (*.test.ts), then in your FINAL report you MUST:

1) For each changed/created test file, print the file path.
2) Immediately under it, print the exact Intent header block (verbatim) that appears at the top of that test file.

### Required Output Shape (exact)

- <path/to/file.test.ts>

The header must match the following template EXACTLY (character-by-character, including leading "* " on each line).
Do NOT replace "* " with "-" or any other character.
Do NOT change indentation.
Do NOT add or remove any character.

Print the header inside a single triple-backtick code block exactly as shown below:

```ts
/**
 * Intent: ...
 * Scope: ...
 * Non-Goals: ...
 */
```
### Constraints
- The printed block MUST exactly match the header in the file (no drift).
- Print only file paths + Intent header blocks.
- If any changed test file lacks the header:
  Respond ONLY with:
  MISSING_INTENT_HEADER: <path>


# AI CODING CONSTITUTION

APPLIES TO: /src/**
This is LAW.

---

## 1. CONTRACT_FIRST

- Do NOT create fields or concepts not defined in contract.
- If new requirement appears:
  → STOP
  → Propose contract change
  → Do NOT implement directly.
- Same concept = same name.

---

## 2. NO_SILENT_FAILURE

- Do NOT swallow errors.
- Do NOT return undefined/null to hide failure.
- Failure must be explicit (error or structured result).

---

## 3. NO_HIDDEN_STATE

- No global state.
- No implicit shared state.
- All required data must come from function inputs.
- Logic must be input → output deterministic.

---

## 4. ARCHITECTURE_BOUNDARY

- core MUST NOT import adapter.
- Separate pure logic from I/O.
- One function = one responsibility.

---

## 5. MEANINGFUL_LITERAL_RULE

- Do NOT hardcode:
  - state values
  - IDs
  - file paths
  - policy constants
- Simple numeric values (0,1,2) are allowed.
- If you cannot explain why a value is fixed → it is a violation.

---

## 6. TEST_INTEGRITY

IMPLEMENTER MODE:
- Do NOT modify tests unless explicitly instructed.
- Do NOT bypass tests using hardcoding.
- Code must satisfy tests without structural corruption.

---

## 7. AI_BEHAVIOR

If a violation risk is detected:
- DO NOT continue silently.
- Either:
  - Ask a clarification question, OR
  - Propose a patch (diff).
- Do NOT expand design on your own.

---

Violation = STOP or PATCH.