import test from "node:test";
import assert from "node:assert/strict";
import { runGraph } from "../../../agent/graph/graph";
import { LLMClient } from "../../../agent/llm/llm.types";
import { MemoryRepository } from "../../../agent/memory/memory.repository";
import { MemoryCard, MemoryType, SearchFilters } from "../../../agent/memory/memory.types";

class ThrowLLM implements LLMClient {
  async generate(_prompt: string): Promise<string> {
    throw new Error("LLM_GENERATE_FAILED");
  }
}

class SpyMemoryRepository implements MemoryRepository {
  public saveCalls = 0;
  public updateCalls = 0;

  get persistCalls(): number {
    return this.saveCalls + this.updateCalls;
  }

  async save(_card: MemoryCard): Promise<void> {
    this.saveCalls += 1;
  }

  async update(_card: MemoryCard): Promise<void> {
    this.updateCalls += 1;
  }

  async search(_query: string, _filters?: SearchFilters): Promise<MemoryCard[]> {
    return [];
  }

  async getByType(_type: MemoryType): Promise<MemoryCard[]> {
    return [];
  }

  async getLatestState(_projectId: string): Promise<MemoryCard | null> {
    return null;
  }
}

test("runGraph: LLM error propagates and blocks persistence", async () => {
  const repo = new SpyMemoryRepository();
  const llm = new ThrowLLM();

  await assert.rejects(
    () => runGraph(repo, llm, "trigger llm error", "project-llm-error"),
    /LLM_GENERATE_FAILED/
  );

  assert.equal(repo.persistCalls, 0);
  assert.equal(repo.saveCalls, 0);
  assert.equal(repo.updateCalls, 0);
});
