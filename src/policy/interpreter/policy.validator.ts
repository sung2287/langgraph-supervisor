import type {
  BundlesFile,
  ExecutionStep,
  ModesFile,
  TriggersFile,
} from "../schema/policy.types";

const SUPPORTED_VERSION = "1.0";

function fail(absPath: string, message: string): never {
  throw new Error(`POLICY_VALIDATION_ERROR ${absPath}: ${message}`);
}

function assertVersion(absPath: string, value: unknown): void {
  if (typeof value !== "string" || value.trim() === "") {
    fail(absPath, "version must be a non-empty string");
  }
  if (value !== SUPPORTED_VERSION) {
    fail(absPath, `unsupported version '${value}', expected '${SUPPORTED_VERSION}'`);
  }
}

function assertObject(value: unknown, absPath: string, where: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(absPath, `${where} must be an object`);
  }
  return value as Record<string, unknown>;
}

function toParamsObject(
  paramsRaw: unknown,
  absPath: string,
  where: string
): Record<string, unknown> {
  if (typeof paramsRaw === "undefined") {
    return {};
  }
  if (typeof paramsRaw !== "object" || paramsRaw === null || Array.isArray(paramsRaw)) {
    fail(absPath, `${where}.params must be an object`);
  }
  return paramsRaw as Record<string, unknown>;
}

function assertExecutionStep(value: unknown, absPath: string, where: string): ExecutionStep {
  const row = assertObject(value, absPath, where);

  if (typeof row.kind === "string" && row.kind.trim() !== "") {
    const extras = Object.fromEntries(
      Object.entries(row).filter(([key]) => key !== "kind" && key !== "type" && key !== "params")
    );
    const params = {
      ...extras,
      ...toParamsObject(row.params, absPath, where),
    };

    return {
      kind: row.kind,
      params,
    };
  }

  if (typeof row.type === "string" && row.type.trim() !== "") {
    return {
      type: row.type,
      params: toParamsObject(row.params, absPath, where),
    };
  }

  fail(absPath, `${where} requires either non-empty kind or type`);
}

export function validateModesFile(value: unknown, absPath: string): ModesFile {
  const root = assertObject(value, absPath, "root");
  assertVersion(absPath, root.version);

  if (!Array.isArray(root.modes)) {
    fail(absPath, "modes must be an array");
  }

  const modes = root.modes.map((modeRaw, idx) => {
    const mode = assertObject(modeRaw, absPath, `modes[${idx}]`);
    if (typeof mode.id !== "string" || mode.id.trim() === "") {
      fail(absPath, `modes[${idx}].id must be a non-empty string`);
    }
    if (!Array.isArray(mode.plan)) {
      fail(absPath, `modes[${idx}].plan must be an array`);
    }
    return {
      id: mode.id,
      plan: mode.plan.map((step, stepIdx) =>
        assertExecutionStep(step, absPath, `modes[${idx}].plan[${stepIdx}]`)
      ),
    };
  });

  return {
    version: root.version as string,
    modes,
  };
}

export function validateTriggersFile(value: unknown, absPath: string): TriggersFile {
  const root = assertObject(value, absPath, "root");
  assertVersion(absPath, root.version);

  if (!Array.isArray(root.triggers)) {
    fail(absPath, "triggers must be an array");
  }

  const triggers = root.triggers.map((triggerRaw, idx) => {
    const trigger = assertObject(triggerRaw, absPath, `triggers[${idx}]`);

    if (typeof trigger.condition !== "string" || trigger.condition.trim() === "") {
      fail(absPath, `triggers[${idx}].condition must be a non-empty string`);
    }
    if (typeof trigger.target_mode !== "string" || trigger.target_mode.trim() === "") {
      fail(absPath, `triggers[${idx}].target_mode must be a non-empty string`);
    }
    if (trigger.type !== "HARD" && trigger.type !== "SOFT") {
      fail(absPath, `triggers[${idx}].type must be HARD or SOFT`);
    }

    return {
      condition: trigger.condition,
      target_mode: trigger.target_mode,
      type: trigger.type as "HARD" | "SOFT",
    };
  });

  return {
    version: root.version as string,
    triggers,
  };
}

export function validateBundlesFile(value: unknown, absPath: string): BundlesFile {
  const root = assertObject(value, absPath, "root");
  assertVersion(absPath, root.version);

  if (!Array.isArray(root.bundles)) {
    fail(absPath, "bundles must be an array");
  }

  const bundles = root.bundles.map((bundleRaw, idx) => {
    const bundle = assertObject(bundleRaw, absPath, `bundles[${idx}]`);
    if (typeof bundle.mode_id !== "string" || bundle.mode_id.trim() === "") {
      fail(absPath, `bundles[${idx}].mode_id must be a non-empty string`);
    }
    if (!Array.isArray(bundle.files)) {
      fail(absPath, `bundles[${idx}].files must be an array`);
    }
    if (!bundle.files.every((file) => typeof file === "string")) {
      fail(absPath, `bundles[${idx}].files must contain only strings`);
    }
    return {
      mode_id: bundle.mode_id,
      files: bundle.files as string[],
    };
  });

  return {
    version: root.version as string,
    bundles,
  };
}
