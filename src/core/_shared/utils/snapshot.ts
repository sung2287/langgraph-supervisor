import { deepFreeze } from "./deep_freeze";

export function createSnapshot<T>(data: T): T {
  const clone = structuredClone(data);
  return deepFreeze(clone);
}
