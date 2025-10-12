// lib/dates.ts
export function formatInLagos(input?: string | number | Date | null): string | null {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input as any);
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  return new Intl.DateTimeFormat("en-NG", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(t));
}

export function secsToISO(secs?: bigint | number | null): string | null {
  if (secs == null) return null;
  const n = typeof secs === "bigint" ? Number(secs) : secs;
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}
