export function prettyEthersError(err: any): string {
  const msg =
    err?.info?.error?.message ??
    err?.shortMessage ??
    err?.reason ??
    err?.error?.message ??
    err?.message ??
    "Transaction failed";

  // Common translations
  if (msg.includes("CALL_EXCEPTION") && msg.includes("estimateGas")) {
    return "Transaction would revert (failed to estimate gas). Check factory address/ABI and your inputs.";
  }
  if (msg.includes("insufficient funds")) return "Insufficient funds for fees + gas.";
  if (/revert/i.test(msg)) return msg.replace(/^(.*revert[^:]*:?\s*)/i, "").trim();

  return msg.length > 220 ? msg.slice(0, 220) + "…" : msg;
}
