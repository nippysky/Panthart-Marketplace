// utils/format.ts
export function formatTokenAmount(
  wei: string | bigint | number | null | undefined,
  decimals = 18,
  maxDp = 6
): string {
  if (wei == null) return "0";
  const v = typeof wei === "bigint" ? wei : BigInt(wei.toString());
  const base = BigInt(10) ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;

  if (frac === 0n) return Intl.NumberFormat().format(Number(whole));

  // left-pad to `decimals`, then keep up to maxDp and trim trailing zeros
  const fp = (base + frac).toString().slice(1);
  const trimmed = fp.slice(0, maxDp).replace(/0+$/, "");
  const intPart = Intl.NumberFormat().format(Number(whole));
  return trimmed ? `${intPart}.${trimmed}` : intPart;
}
