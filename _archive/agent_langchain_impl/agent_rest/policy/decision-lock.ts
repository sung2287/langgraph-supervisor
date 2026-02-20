import { MemoryCard } from "../memory/memory.types";

export function detectConflict(
  existingDecisions: MemoryCard[],
  newOutput: string
): boolean {
  for (const decision of existingDecisions) {
    if (decision.type !== "decision") continue;
    if (newOutput.includes("override")) continue;
    if (!newOutput.includes(decision.summary)) {
      return true;
    }
  }
  return false;
}
