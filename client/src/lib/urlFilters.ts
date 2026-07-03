export function getInitialSearchParam<T extends string>(
  key: string,
  allowedValues: readonly T[],
  fallback: T
): T {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(key);
  return allowedValues.includes(value as T) ? (value as T) : fallback;
}

export function getInitialPositiveIntegerSearchParam(
  key: string,
  fallback = "all"
) {
  if (typeof window === "undefined") return fallback;
  const value = new URLSearchParams(window.location.search).get(key);
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? String(parsed) : fallback;
}
