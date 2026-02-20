import fs from "node:fs";
import path from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { AGENT_MEMORY_DB_PATH, DEFAULT_MEMORY_SEARCH_LIMIT } from "../config";
import { MemoryRepository } from "./memory.repository";
import { MemoryCard, MemoryType, SearchFilters } from "./memory.types";

type SQLiteDatabase = InstanceType<typeof BetterSqlite3>;

interface MemoryCardRow {
  id: string;
  projectId: string;
  type: MemoryType;
  title: string;
  summary: string;
  content: string;
  tags: string;
  importance: number;
  status: "active" | "superseded" | "deprecated";
  createdAt: number;
  updatedAt: number;
}

export class SqliteMemoryRepository implements MemoryRepository {
  private readonly db: SQLiteDatabase;

  constructor(
    private readonly projectId: string,
    dbPath: string = AGENT_MEMORY_DB_PATH
  ) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new BetterSqlite3(dbPath);
    this.initialize();
  }

  async save(card: MemoryCard): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO memory_cards (
        id, projectId, type, title, summary, content, tags, importance, status, createdAt, updatedAt
      ) VALUES (
        @id, @projectId, @type, @title, @summary, @content, @tags, @importance, @status, @createdAt, @updatedAt
      )
    `);
    stmt.run(this.toRow(card));
  }

  async update(card: MemoryCard): Promise<void> {
    const stmt = this.db.prepare(`
      UPDATE memory_cards
      SET
        projectId = @projectId,
        type = @type,
        title = @title,
        summary = @summary,
        content = @content,
        tags = @tags,
        importance = @importance,
        status = @status,
        createdAt = @createdAt,
        updatedAt = @updatedAt
      WHERE id = @id
    `);
    stmt.run(this.toRow(card));
  }

  async search(query: string, filters: SearchFilters = {}): Promise<MemoryCard[]> {
    const whereParts: string[] = ["projectId = ?", "summary LIKE ?"];
    const params: Array<string | number> = [
      this.projectId,
      `%${query.trim() || ""}%`,
    ];

    if (filters.type?.length) {
      whereParts.push(`type IN (${filters.type.map(() => "?").join(", ")})`);
      params.push(...filters.type);
    }

    if (typeof filters.minImportance === "number") {
      whereParts.push("importance >= ?");
      params.push(filters.minImportance);
    }

    if (filters.tags?.length) {
      for (const tag of filters.tags) {
        whereParts.push("tags LIKE ?");
        params.push(`%\"${tag}\"%`);
      }
    }

    const limit = filters.limit ?? DEFAULT_MEMORY_SEARCH_LIMIT;
    const sql = `
      SELECT id, projectId, type, title, summary, content, tags, importance, status, createdAt, updatedAt
      FROM memory_cards
      WHERE ${whereParts.join(" AND ")}
      ORDER BY updatedAt DESC
      LIMIT ?
    `;
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as MemoryCardRow[];
    return rows.map((row) => this.fromRow(row));
  }

  async getByType(type: MemoryType): Promise<MemoryCard[]> {
    const rows = this.db
      .prepare(
        `
        SELECT id, projectId, type, title, summary, content, tags, importance, status, createdAt, updatedAt
        FROM memory_cards
        WHERE projectId = ? AND type = ?
        ORDER BY updatedAt DESC
      `
      )
      .all(this.projectId, type) as MemoryCardRow[];
    return rows.map((row) => this.fromRow(row));
  }

  async getLatestState(projectId: string): Promise<MemoryCard | null> {
    const row = this.db
      .prepare(
        `
        SELECT id, projectId, type, title, summary, content, tags, importance, status, createdAt, updatedAt
        FROM memory_cards
        WHERE projectId = ? AND type = 'state'
        ORDER BY updatedAt DESC
        LIMIT 1
      `
      )
      .get(projectId) as MemoryCardRow | undefined;

    return row ? this.fromRow(row) : null;
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_cards (
        id TEXT PRIMARY KEY,
        projectId TEXT,
        type TEXT,
        title TEXT,
        summary TEXT,
        content TEXT,
        tags TEXT,
        importance INTEGER,
        status TEXT,
        createdAt INTEGER,
        updatedAt INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_memory_cards_project_type
      ON memory_cards (projectId, type);
      CREATE INDEX IF NOT EXISTS idx_memory_cards_project_updated
      ON memory_cards (projectId, updatedAt DESC);
    `);
  }

  private toRow(card: MemoryCard): MemoryCardRow {
    return {
      ...card,
      content: JSON.stringify(card.content ?? {}),
      tags: JSON.stringify(card.tags ?? []),
    };
  }

  private fromRow(row: MemoryCardRow): MemoryCard {
    return {
      ...row,
      content: this.safeParseRecord(row.content),
      tags: this.safeParseTags(row.tags),
    };
  }

  private safeParseRecord(raw: string): Record<string, any> {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, any>;
      }
      return {};
    } catch {
      return {};
    }
  }

  private safeParseTags(raw: string): string[] {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value));
      }
      return [];
    } catch {
      return [];
    }
  }
}
