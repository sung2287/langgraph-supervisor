#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log("Usage: npm run prd:close -- <PRD-ID>");
  console.log("Runs: prd:evidence, delta:update (--reason \"close <PRD-ID>\" --require-pass), state:cycle, state:meaning, state:promote");
  process.exit(0);
}

const dashDashIndex = args.indexOf("--");
const forwardedArgs = dashDashIndex >= 0 ? args.slice(dashDashIndex + 1) : args;
const prdId = forwardedArgs[0];

if (!prdId || prdId.startsWith("-")) {
  console.error(`Invalid PRD id: "${prdId ?? ""}"`);
  console.error("Usage: node scripts/prd_close.mjs -- <PRD-ID>");
  process.exit(1);
}

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

const steps = [
  ["run", "prd:evidence", "--", prdId],
  ["run", "delta:update", "--", prdId, "--reason", `close ${prdId}`, "--require-pass"],
  ["run", "state:cycle"],
  ["run", "state:meaning"],
  ["run", "state:promote", "--", prdId],
];

for (const stepArgs of steps) {
  const result = spawnSync(npmCmd, stepArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

process.exit(0);
