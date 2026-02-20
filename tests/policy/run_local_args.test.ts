import test from "node:test";
import assert from "node:assert/strict";
import { parseRunLocalArgs } from "../../runtime/cli/run_local.args";

test("run_local args: defaults profile to default when flag is absent", () => {
  const args = parseRunLocalArgs(["--repo", ".", "--", "ping"]);
  assert.equal(args.profile, "default");
  assert.equal(args.repoPath, ".");
  assert.equal(args.input, "ping");
});
