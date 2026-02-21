import { randomUUID } from "node:crypto";
import path from "node:path";
import {
  createSQLiteStorageLayer,
  DEFAULT_SQLITE_DB_REL_PATH,
} from "../../src/adapter/storage/sqlite";
import { retrieveDecisionContextHierarchically } from "../../src/core/decision/decision_context.service";

interface SmokeCliArgs {
  readonly repoPath: string;
  readonly dbPath?: string;
  readonly reset: boolean;
  readonly tag?: string;
}

function parseArgs(argv: readonly string[]): SmokeCliArgs {
  let repoPath = process.cwd();
  let dbPath: string | undefined;
  let reset = false;
  let tag: string | undefined;

  for (let idx = 0; idx < argv.length; idx += 1) {
    const token = argv[idx];
    if ((token === "--repo" || token === "--repoPath") && typeof argv[idx + 1] === "string") {
      repoPath = argv[idx + 1] ?? repoPath;
      idx += 1;
      continue;
    }
    if ((token === "--dbPath" || token === "--db-path") && typeof argv[idx + 1] === "string") {
      dbPath = argv[idx + 1];
      idx += 1;
      continue;
    }
    if (token === "--reset") {
      reset = true;
      continue;
    }
    if (token === "--tag" && typeof argv[idx + 1] === "string") {
      const raw = argv[idx + 1]?.trim();
      tag = raw === "" ? undefined : raw;
      idx += 1;
    }
  }

  return {
    repoPath: path.resolve(repoPath),
    dbPath,
    reset,
    tag,
  };
}

function listMarkerDecisionIds(
  layer: ReturnType<typeof createSQLiteStorageLayer>,
  marker: string
): readonly string[] {
  const rows = layer.storage.query<{ target_ref: unknown }>(
    `
    SELECT target_ref
    FROM anchors
    WHERE hint = ? AND type = 'decision_link'
    `,
    [marker]
  );

  const ids = rows
    .map((row) => row.target_ref)
    .filter((targetRef): targetRef is string => typeof targetRef === "string");
  return [...new Set(ids)];
}

function deleteByDecisionIds(
  layer: ReturnType<typeof createSQLiteStorageLayer>,
  tableName: "decisions" | "decision_evidence_links",
  columnName: "id" | "decision_id",
  ids: readonly string[]
): number {
  if (ids.length === 0) {
    return 0;
  }
  const placeholders = ids.map(() => "?").join(", ");
  const result = layer.storage.exec(
    `DELETE FROM ${tableName} WHERE ${columnName} IN (${placeholders})`,
    ids
  ) as { changes?: number };
  return Number(result.changes ?? 0);
}

function cleanupMarkerData(
  layer: ReturnType<typeof createSQLiteStorageLayer>,
  marker: string
): { readonly cleanupDeletedLinks: number; readonly cleanupDeletedDecisions: number } {
  const ids = listMarkerDecisionIds(layer, marker);
  const cleanupDeletedLinks = deleteByDecisionIds(
    layer,
    "decision_evidence_links",
    "decision_id",
    ids
  );
  const cleanupDeletedDecisions = deleteByDecisionIds(layer, "decisions", "id", ids);
  layer.storage.exec(
    `
    DELETE FROM anchors
    WHERE hint = ? AND type = 'decision_link'
    `,
    [marker]
  );

  return {
    cleanupDeletedLinks,
    cleanupDeletedDecisions,
  };
}

function runSmoke(): void {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.reset ? "reset" : "accumulate";
  const marker = typeof args.tag === "string" ? `smoke:prd005:${args.tag}` : "smoke:prd005";
  const layer = createSQLiteStorageLayer(
    typeof args.dbPath === "string" && args.dbPath.trim() !== ""
      ? { dbPath: args.dbPath }
      : undefined
  );

  try {
    layer.storage.connect();

    const cleanup =
      args.reset
        ? cleanupMarkerData(layer, marker)
        : { cleanupDeletedLinks: 0, cleanupDeletedDecisions: 0 };

    const before = retrieveDecisionContextHierarchically(layer.decisionStore, {
      currentDomain: undefined,
    });
    const beforeMarkerIds = new Set(listMarkerDecisionIds(layer, marker));
    const beforeCount = before.decisions.filter((decision) => beforeMarkerIds.has(decision.id)).length;

    const insertedDecisionId = randomUUID();
    const insertedDecisionText = "[SMOKE PRD-005] Always fail-fast on DB integrity errors.";
    layer.decisionStore.insertDecisionV1({
      id: insertedDecisionId,
      rootId: insertedDecisionId,
      version: 1,
      previousVersionId: undefined,
      text: insertedDecisionText,
      strength: "axis",
      scope: "global",
      isActive: true,
    });
    layer.anchorStore.insertAnchor({
      id: randomUUID(),
      hint: marker,
      targetRef: insertedDecisionId,
      type: "decision_link",
    });

    const after = retrieveDecisionContextHierarchically(layer.decisionStore, {
      currentDomain: undefined,
    });
    const afterMarkerIds = new Set(listMarkerDecisionIds(layer, marker));
    const afterCount = after.decisions.filter((decision) => afterMarkerIds.has(decision.id)).length;
    const inserted = after.decisions.find((decision) => decision.id === insertedDecisionId);
    if (!inserted) {
      throw new Error("Smoke failed: inserted decision was not returned by hierarchical retrieval");
    }
    const lastDecisionText =
      inserted && typeof (inserted as { text?: unknown }).text === "string"
        ? ((inserted as { text: string }).text ?? insertedDecisionText)
        : insertedDecisionText;

    if (args.reset) {
      if (beforeCount !== 0) {
        throw new Error(`Smoke failed: reset mode expected beforeCount=0, got ${String(beforeCount)}`);
      }
      if (afterCount !== 1) {
        throw new Error(`Smoke failed: reset mode expected afterCount=1, got ${String(afterCount)}`);
      }
    } else if (afterCount !== beforeCount + 1) {
      throw new Error(
        `Smoke failed: accumulate mode expected afterCount=beforeCount+1 (${String(beforeCount)}+1), got ${String(afterCount)}`
      );
    }

    console.log(`repoPath=${args.repoPath}`);
    console.log(`mode=${mode}`);
    console.log(`dbPath=${layer.storage.getResolvedDbPath() ?? path.resolve(DEFAULT_SQLITE_DB_REL_PATH)}`);
    console.log(`marker=anchor(${marker})`);
    console.log(`cleanupDeletedDecisions=${cleanup.cleanupDeletedDecisions}`);
    console.log(`cleanupDeletedLinks=${cleanup.cleanupDeletedLinks}`);
    console.log(`beforeCount=${beforeCount}`);
    console.log(`afterCount=${afterCount}`);
    console.log(`insertedDecisionId=${insertedDecisionId}`);
    console.log(`lastDecisionText=${lastDecisionText}`);
    console.log("PASS");
  } finally {
    layer.storage.close();
  }
}

try {
  runSmoke();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`prd:005:smoke failed: ${message}`);
  process.exitCode = 1;
}
