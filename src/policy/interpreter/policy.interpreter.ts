import fs from "node:fs";
import path from "node:path";
import {
  type BundleDefinition,
  type BundlesFile,
  type ExecutionPlan,
  type ModesFile,
  type ModeDefinition,
  type TriggersFile,
} from "../schema/policy.types";
import { loadYamlFile } from "./yaml.loader";
import {
  validateBundlesFile,
  validateModesFile,
  validateTriggersFile,
} from "./policy.validator";

export interface PolicyInterpreterOptions {
  repoRoot: string;
  profile: string;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (Object.isFrozen(value)) {
    return value;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => deepFreeze(item));
  } else {
    Object.values(value as Record<string, unknown>).forEach((item) =>
      deepFreeze(item)
    );
  }

  return Object.freeze(value);
}

function fail(absPath: string, message: string): never {
  throw new Error(`POLICY_INTERPRETER_ERROR ${absPath}: ${message}`);
}

export class PolicyInterpreter {
  readonly profileRoot: string;
  readonly profile: string;
  private readonly modesPath: string;
  private readonly triggersPath: string;
  private readonly bundlesPath: string;
  private readonly modesFile: ModesFile;
  private readonly triggersFile: TriggersFile;
  private readonly bundlesFile: BundlesFile;

  constructor(opts: PolicyInterpreterOptions) {
    this.profile = opts.profile.trim();
    if (this.profile === "") {
      throw new Error("POLICY_INTERPRETER_ERROR profile must not be empty");
    }

    this.profileRoot = path.join(opts.repoRoot, "policy", "profiles", this.profile);
    if (!fs.existsSync(this.profileRoot) || !fs.statSync(this.profileRoot).isDirectory()) {
      throw new Error(
        `POLICY_INTERPRETER_ERROR ${this.profileRoot}: profile directory does not exist`
      );
    }

    this.modesPath = path.join(this.profileRoot, "modes.yaml");
    this.triggersPath = path.join(this.profileRoot, "triggers.yaml");
    this.bundlesPath = path.join(this.profileRoot, "bundles.yaml");

    this.modesFile = validateModesFile(loadYamlFile(this.modesPath), this.modesPath);
    this.triggersFile = validateTriggersFile(
      loadYamlFile(this.triggersPath),
      this.triggersPath
    );
    this.bundlesFile = validateBundlesFile(
      loadYamlFile(this.bundlesPath),
      this.bundlesPath
    );
  }

  resolveExecutionPlan(input: { userInput: string; requestedPhase?: string }): ExecutionPlan {
    const requestedPhase = input.requestedPhase?.trim();
    const mode = requestedPhase
      ? this.modesFile.modes.find(
          (m) => m.id.toLowerCase() === requestedPhase.toLowerCase()
        )
      : this.findMode(this.resolveTargetMode(input.userInput));

    if (!mode && requestedPhase) {
      throw new Error(
        `Unknown phase "${requestedPhase}". Available modes: ${this.modesFile.modes
          .map((m) => m.id)
          .join(", ")}`
      );
    }

    if (!mode) {
      fail(this.modesPath, `target mode '${this.resolveTargetMode(input.userInput)}' is not defined`);
    }

    const plan: ExecutionPlan = {
      version: "1.0",
      steps: structuredClone(mode.plan),
      metadata: {
        modeLabel: mode.id,
        policyId: this.profile,
      },
    };

    return deepFreeze(plan);
  }

  getBundlesForMode(modeId: string): BundleDefinition[] {
    return this.bundlesFile.bundles.filter((bundle) => bundle.mode_id === modeId);
  }

  private resolveTargetMode(userInput: string): string {
    for (const trigger of this.triggersFile.triggers) {
      if (this.matchesCondition(trigger.condition, userInput)) {
        return trigger.target_mode;
      }
    }
    return "default";
  }

  private findMode(modeId: string): ModeDefinition | undefined {
    return this.modesFile.modes.find((mode) => mode.id === modeId);
  }

  private matchesCondition(condition: string, userInput: string): boolean {
    const raw = condition.trim();
    if (raw.startsWith("re:")) {
      const pattern = raw.slice(3).trim();
      if (pattern === "") {
        fail(this.triggersPath, "trigger condition 're:' requires a pattern");
      }
      try {
        return new RegExp(pattern).test(userInput);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        fail(this.triggersPath, `invalid regex pattern '${pattern}': ${message}`);
      }
    }

    return userInput.toLowerCase().includes(raw.toLowerCase());
  }
}
