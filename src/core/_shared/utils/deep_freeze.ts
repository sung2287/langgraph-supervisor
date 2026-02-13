export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (Object.isFrozen(obj)) {
    return obj;
  }

  if (Array.isArray(obj)) {
    obj.forEach((item) => deepFreeze(item));
  } else {
    Object.keys(obj).forEach((key) => {
      const value = (obj as any)[key];
      deepFreeze(value);
    });
  }

  return Object.freeze(obj);
}
