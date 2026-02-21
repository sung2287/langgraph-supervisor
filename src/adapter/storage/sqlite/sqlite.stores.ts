import { SQLiteStorage, type SQLiteParam, type SQLiteStorageOptions } from "./sqlite.storage";

export type DecisionStrength = "axis" | "lock" | "normal";

export interface DecisionRecord {
  readonly id: string;
  readonly rootId: string;
  readonly version: number;
  readonly previousVersionId?: string;
  readonly text: string;
  readonly strength: DecisionStrength;
  readonly scope: string;
  readonly isActive: boolean;
  readonly createdAt?: string;
}

export interface DecisionInsertInput {
  readonly id: string;
  readonly rootId: string;
  readonly version: number;
  readonly previousVersionId?: string;
  readonly text: string;
  readonly strength: DecisionStrength;
  readonly scope: string;
  readonly isActive?: boolean;
}

export interface NextDecisionVersionInput {
  readonly id: string;
  readonly version: number;
  readonly text: string;
  readonly strength: DecisionStrength;
  readonly scope: string;
}

export interface EvidenceInput {
  readonly id: string;
  readonly content: string;
  readonly tags?: string;
}

export interface AnchorInput {
  readonly id: string;
  readonly hint: string;
  readonly targetRef: string;
  readonly type: "evidence_link" | "decision_link";
}

export interface RepositorySnapshotInput {
  readonly versionId: string;
  readonly repoPath: string;
  readonly fileCount: number;
  readonly lastScannedAt?: string;
}

function toSQLiteBool(value: boolean): number {
  return value ? 1 : 0;
}

function fromDecisionRow(row: Record<string, unknown>): DecisionRecord {
  return {
    id: String(row.id),
    rootId: String(row.root_id),
    version: Number(row.version),
    previousVersionId:
      typeof row.previous_version_id === "string" ? row.previous_version_id : undefined,
    text: String(row.text),
    strength: String(row.strength) as DecisionStrength,
    scope: String(row.scope),
    isActive: Number(row.is_active) === 1,
    createdAt: typeof row.created_at === "string" ? row.created_at : undefined,
  };
}

export class DecisionStore {
  constructor(private readonly storage: SQLiteStorage) {}

  insertDecisionV1(decision: DecisionInsertInput): void {
    if (decision.version !== 1) {
      throw new Error("DECISION_STORE_ERROR insertDecisionV1 requires version=1");
    }
    if (decision.rootId !== decision.id) {
      throw new Error("DECISION_STORE_ERROR insertDecisionV1 requires rootId=id");
    }

    this.storage.exec(
      `
      INSERT INTO decisions (
        id, root_id, version, previous_version_id, text, strength, scope, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        decision.id,
        decision.rootId,
        decision.version,
        decision.previousVersionId ?? null,
        decision.text,
        decision.strength,
        decision.scope,
        toSQLiteBool(decision.isActive ?? true),
      ]
    );
  }

  createNextVersionAtomically(
    rootId: string,
    prevId: string,
    newDecision: NextDecisionVersionInput
  ): void {
    let transactionStarted = false;
    try {
      this.storage.exec("BEGIN TRANSACTION;");
      transactionStarted = true;

      const updateResult = this.storage.exec(
        `
        UPDATE decisions
        SET is_active = 0
        WHERE root_id = ? AND id = ? AND is_active = 1
        `,
        [rootId, prevId]
      ) as { changes?: number };

      if (Number(updateResult?.changes ?? 0) !== 1) {
        throw new Error("DECISION_STORE_ERROR previous active decision not found");
      }

      this.storage.exec(
        `
        INSERT INTO decisions (
          id, root_id, version, previous_version_id, text, strength, scope, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          newDecision.id,
          rootId,
          newDecision.version,
          prevId,
          newDecision.text,
          newDecision.strength,
          newDecision.scope,
        ]
      );

      this.storage.exec("COMMIT;");
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        this.storage.exec("ROLLBACK;");
      }
      throw error;
    }
  }

  getActiveByScopeStrength(scope: string, strength: DecisionStrength): readonly DecisionRecord[] {
    const rows = this.storage.query<Record<string, unknown>>(
      `
      SELECT id, root_id, version, previous_version_id, text, strength, scope, is_active, created_at
      FROM decisions
      WHERE scope = ? AND strength = ? AND is_active = 1
      ORDER BY root_id ASC, version DESC
      `,
      [scope, strength]
    );
    return rows.map((row) => fromDecisionRow(row));
  }
}

export class EvidenceStore {
  constructor(private readonly storage: SQLiteStorage) {}

  insertEvidence(evidence: EvidenceInput): void {
    this.storage.exec(
      `
      INSERT INTO evidences (id, content, tags)
      VALUES (?, ?, ?)
      `,
      [evidence.id, evidence.content, evidence.tags ?? null]
    );
  }
}

export class LinkStore {
  constructor(private readonly storage: SQLiteStorage) {}

  linkDecisionEvidence(decisionId: string, evidenceId: string): void {
    this.storage.exec(
      `
      INSERT INTO decision_evidence_links (decision_id, evidence_id)
      VALUES (?, ?)
      `,
      [decisionId, evidenceId]
    );
  }
}

export class AnchorStore {
  constructor(private readonly storage: SQLiteStorage) {}

  insertAnchor(anchor: AnchorInput): void {
    this.storage.exec(
      `
      INSERT INTO anchors (id, hint, target_ref, type)
      VALUES (?, ?, ?, ?)
      `,
      [anchor.id, anchor.hint, anchor.targetRef, anchor.type]
    );
  }
}

export class RepoSnapshotStore {
  constructor(private readonly storage: SQLiteStorage) {}

  upsertSnapshot(meta: RepositorySnapshotInput): void {
    const params: readonly SQLiteParam[] = [
      meta.versionId,
      meta.repoPath,
      meta.fileCount,
      meta.lastScannedAt ?? null,
    ];

    this.storage.exec(
      `
      INSERT INTO repository_snapshots (
        version_id, repo_path, file_count, last_scanned_at
      ) VALUES (?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
      ON CONFLICT(version_id) DO UPDATE SET
        repo_path = excluded.repo_path,
        file_count = excluded.file_count,
        last_scanned_at = CASE
          WHEN excluded.last_scanned_at IS NULL THEN CURRENT_TIMESTAMP
          ELSE excluded.last_scanned_at
        END
      `,
      params
    );
  }
}

export interface SQLiteStorageLayer {
  readonly storage: SQLiteStorage;
  readonly decisionStore: DecisionStore;
  readonly evidenceStore: EvidenceStore;
  readonly linkStore: LinkStore;
  readonly anchorStore: AnchorStore;
  readonly repoSnapshotStore: RepoSnapshotStore;
}

export function createSQLiteStorageLayer(
  options: SQLiteStorageOptions = {}
): SQLiteStorageLayer {
  const storage = new SQLiteStorage(options);
  return {
    storage,
    decisionStore: new DecisionStore(storage),
    evidenceStore: new EvidenceStore(storage),
    linkStore: new LinkStore(storage),
    anchorStore: new AnchorStore(storage),
    repoSnapshotStore: new RepoSnapshotStore(storage),
  };
}
