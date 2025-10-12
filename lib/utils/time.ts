// lib/utils/time.ts

/** Safe: anything -> ISO string or undefined (never throws) */
export function asISO(input: unknown): string | undefined {
  if (!input) return undefined;
  try {
    const d =
      input instanceof Date
        ? input
        : typeof input === "number"
        ? new Date(input) // epoch ms
        : new Date(String(input)); // parse string-ish
    const t = d.getTime();
    if (!Number.isFinite(t)) return undefined;
    return new Date(t).toISOString();
  } catch {
    return undefined;
  }
}

/** Seconds (bigint/number) -> ISO or null (never throws) */
export function toISOFromSeconds(sec?: bigint | number | null): string | null {
  try {
    if (sec === null || sec === undefined) return null;
    const n = typeof sec === "bigint" ? Number(sec) : Number(sec);
    if (!Number.isFinite(n) || n <= 0) return null;
    return new Date(n * 1000).toISOString();
  } catch {
    return null;
  }
}
