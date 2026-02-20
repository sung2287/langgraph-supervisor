import type { MemoryEntry, MemoryRepository } from "./memory.types";

export class InMemoryRepository implements MemoryRepository {
  private readonly entries: MemoryEntry[] = [];

  async write(record: MemoryEntry): Promise<void> {
    this.entries.push(record);
  }

  getEntries(): readonly MemoryEntry[] {
    return this.entries;
  }
}
