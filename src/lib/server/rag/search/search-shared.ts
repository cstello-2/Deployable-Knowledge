// Shared helpers for search modules

export function cleanFilterValues<T extends string>(values: readonly T[] | undefined): T[] {
  const cleaned = new Set<T>();

  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (trimmed) {
      cleaned.add(trimmed as T);
    }
  }

  return [...cleaned];
}
