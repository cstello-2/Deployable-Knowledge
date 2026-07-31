export type LayoutPresetDropPosition = "before" | "after";

export function reorderItemsById<T extends { id: string }>(
  items: readonly T[],
  movingId: string,
  targetId: string,
  position: LayoutPresetDropPosition,
): T[] {
  if (movingId === targetId) return [...items];

  const moving = items.find((item) => item.id === movingId);
  if (!moving || !items.some((item) => item.id === targetId)) {
    return [...items];
  }

  const remaining = items.filter((item) => item.id !== movingId);
  const targetIndex = remaining.findIndex((item) => item.id === targetId);
  const insertIndex = targetIndex + (position === "after" ? 1 : 0);

  return [
    ...remaining.slice(0, insertIndex),
    moving,
    ...remaining.slice(insertIndex),
  ];
}
