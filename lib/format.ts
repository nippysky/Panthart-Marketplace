export function formatETN(wei?: bigint | null) {
  if (wei == null) return "0";
  // Avoid importing viem everywhere for a single format; simple formatter:
  const s = wei.toString();
  // 1 ETN = 1e18 wei
  const pad = s.padStart(19, "0");
  const int = pad.slice(0, -18).replace(/^0+/, "") || "0";
  let dec = pad.slice(-18).replace(/0+$/, "");
  if (dec.length === 0) return int;
  if (dec.length > 6) dec = dec.slice(0, 6); // trim to 6 dp for UI
  return `${int}.${dec}`;
}

export function shortAddress(addr?: string, left = 6, right = 4) {
  if (!addr) return "";
  return `${addr.slice(0, left)}…${addr.slice(-right)}`;
}

export function formatDate(d: Date | string | number) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleString();
}
