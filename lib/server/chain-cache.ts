

type Entry<T> = { value: T; expiresAt: number };
const store = new Map<string, Entry<any>>();

export function cacheKey(parts: (string | number | boolean | null | undefined)[]) {
  return parts.map((p) => String(p ?? "")).join("|");
}

export async function memoizeAsync<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;

  const value = await fn();
  store.set(key, { value, expiresAt: now + Math.max(0, ttlMs) });
  return value;
}

/** Optional helper to manually clear a key (rarely needed). */
export function cacheDelete(key: string) {
  store.delete(key);
}
