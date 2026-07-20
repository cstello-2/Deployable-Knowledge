export function readObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function clampInteger(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.floor(number)));
}

export function clampText(
  value: unknown,
  maximumLength: number,
  fallback = "",
): string {
  const text = typeof value === "string" ? value : fallback;
  return text.trim().slice(0, Math.max(0, Math.floor(maximumLength)));
}

export function compactText(value: unknown, maximumLength: number): string {
  const text = typeof value === "string" ? value : "";
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maximumLength) return compact;
  return `${compact.slice(0, maximumLength).trimEnd()}...`;
}

export function toJsonValue(value: unknown, maximumLength = 32_000): unknown {
  if (value === undefined) return null;

  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return null;
    if (serialized.length <= maximumLength) return JSON.parse(serialized);
    return serialized.slice(0, maximumLength);
  } catch {
    return clampText(String(value), maximumLength);
  }
}
