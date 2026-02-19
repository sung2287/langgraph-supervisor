import { MemoryCard, SearchFilters, MemoryType } from "./memory.types";

export interface MemoryRepository {
  save(card: MemoryCard): Promise<void>;
  update(card: MemoryCard): Promise<void>;
  search(query: string, filters?: SearchFilters): Promise<MemoryCard[]>;
  getByType(type: MemoryType): Promise<MemoryCard[]>;
  getLatestState(projectId: string): Promise<MemoryCard | null>;
}
