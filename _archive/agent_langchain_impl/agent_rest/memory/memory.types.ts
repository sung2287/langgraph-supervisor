export type MemoryType =
  | "preference"
  | "decision"
  | "state"
  | "fact"
  | "episode";

export interface MemoryCard {
  id: string;
  projectId: string;
  type: MemoryType;
  title: string;
  summary: string;
  content: Record<string, any>;
  tags: string[];
  importance: number;
  status: "active" | "superseded" | "deprecated";
  createdAt: number;
  updatedAt: number;
}

export interface SearchFilters {
  type?: MemoryType[];
  tags?: string[];
  minImportance?: number;
  limit?: number;
}
