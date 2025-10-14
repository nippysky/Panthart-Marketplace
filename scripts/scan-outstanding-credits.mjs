import {
  JsonRpcProvider,
  Interface,
  id,
  getAddress,
  ZeroAddress,
  zeroPadValue,
  formatEther,
} from "ethers";

// ── Config ──────────────────────────────────────────────────────────────────
const RPC_URL =
  "https://rpc.ankr.com/electroneum";

const MARKETPLACE =
  (process.env.MARKETPLACE ||
    process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS ||
    "0xFB8Ee1abfD654059DAc6bE46bCeC831313e91084").trim();

const CHAIN_ID = 52014; // Electroneum

// If you know the deployment block, set it here to speed things up a lot
const START_BLOCK_ENV = process.env.START_BLOCK;
const START_BLOCK = START_BLOCK_ENV ? BigInt(START_BLOCK_ENV) : 0n;

// ── Provider + ABI ──────────────────────────────────────────────────────────
const provider = new JsonRpcProvider(RPC_URL, CHAIN_ID);

const iface = new Interface([
  "event CreditAdded(address indexed currency, address indexed account, uint256 amount)",
  "event CreditWithdrawn(address indexed currency, address indexed account, uint256 amount)",
]);

const topicCreditAdded = id("CreditAdded(address,address,uint256)");
const topicCreditWithdrawn = id("CreditWithdrawn(address,address,uint256)");

// Filter where currency == ETN (zero address)
const topicsAdded = [topicCreditAdded, zeroPadValue(ZeroAddress, 32)];
const topicsWithdrawn = [topicCreditWithdrawn, zeroPadValue(ZeroAddress, 32)];

// ── Utils ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getLogsAdaptive({ address, topics, fromBlock, toBlock }) {
  const out = [];
  const minStep = 500n;
  const maxStep = 10_000n;
  let step = 2_000n;
  let start = BigInt(fromBlock);
  const end = BigInt(toBlock);

  while (start <= end) {
    let chunkEnd = start + step;
    if (chunkEnd > end) chunkEnd = end;

    try {
      const logs = await provider.getLogs({
        address,
        fromBlock: start,
        toBlock: chunkEnd,
        topics,
      });
      out.push(...logs);

      // Gentle growth on success
      if (step < maxStep) step += 500n;

      process.stdout.write(
        `\r${address.slice(0, 8)}… ${start} → ${chunkEnd} (logs: ${out.length}, step: ${step})     `
      );
      start = chunkEnd + 1n;
    } catch (e) {
      const msg = String(e?.error?.message || e?.message || "");
      const code = e?.error?.code ?? e?.code;

      // Provider says "range too large" -> shrink step and retry
      if (
        msg.toLowerCase().includes("block range is too large") ||
        msg.toLowerCase().includes("query timeout") // some RPCs phrase it like this
      ) {
        if (step > minStep) {
          step = step / 2n;
          continue; // retry same [start, chunkEnd] with smaller step
        }
      }

      // Rate limit (Ankr): -32090, "retry in 10s"
      if (code === -32090 || msg.toLowerCase().includes("too many requests")) {
        const base = 10_500; // 10.5s base
        const jitter = Math.floor(Math.random() * 1500); // + up to 1.5s
        const waitMs = base + jitter;
        process.stdout.write(
          `\nRate limited at ${start} → ${chunkEnd}. Waiting ${waitMs}ms then retrying…\n`
        );
        await sleep(waitMs);
        continue; // retry same chunk
      }

      // Some RPCs return -32005 / -32000 on heavy ranges
      if (code === -32005 || code === -32000) {
        if (step > minStep) {
          step = step / 2n;
          continue;
        }
      }

      console.error("\ngetLogs error at", start, "→", chunkEnd);
      console.error(e);
      throw e;
    }
  }

  process.stdout.write("\n");
  return out;
}

// ── Main ────────────────────────────────────────────────────────────────────
(async function main() {
  if (!/^0x[0-9a-fA-F]{40}$/.test(MARKETPLACE)) {
    console.error("Bad MARKETPLACE address:", MARKETPLACE);
    process.exit(1);
  }

  const latest = await provider.getBlockNumber();
  const fromBlock = START_BLOCK;
  const toBlock = BigInt(latest);

  console.log(
    `Scanning marketplace ${MARKETPLACE} from block ${fromBlock} to ${toBlock}…`
  );

  // Run two passes; they each respect throttling
  const [adds, withdrawals] = await Promise.all([
    getLogsAdaptive({
      address: MARKETPLACE,
      topics: topicsAdded,
      fromBlock,
      toBlock,
    }),
    getLogsAdaptive({
      address: MARKETPLACE,
      topics: topicsWithdrawn,
      fromBlock,
      toBlock,
    }),
  ]);

  // account => bigint (wei)
  const balances = new Map();

  for (const lg of adds) {
    const { args } = iface.parseLog(lg);
    const acct = getAddress(args.account);
    const amt = BigInt(args.amount);
    balances.set(acct, (balances.get(acct) ?? 0n) + amt);
  }

  for (const lg of withdrawals) {
    const { args } = iface.parseLog(lg);
    const acct = getAddress(args.account);
    const amt = BigInt(args.amount);
    balances.set(acct, (balances.get(acct) ?? 0n) - amt);
  }

  let total = 0n;
  const rows = [];
  for (const [acct, amt] of balances.entries()) {
    if (amt > 0n) {
      rows.push({ account: acct, wei: amt, etn: formatEther(amt) });
      total += amt;
    }
  }

  if (rows.length === 0) {
    console.log("No outstanding ETN credits.");
  } else {
    console.log("\nOutstanding ETN credits by account:");
    for (const r of rows) {
      console.log(`  ${r.account} => ${r.etn} ETN (${r.wei} wei)`);
    }
  }

  const nativeBal = await provider.getBalance(MARKETPLACE);
  const diff = nativeBal - total;

  console.log(
    `\nContract native balance: ${formatEther(nativeBal)} ETN` +
      `\nCredits sum (liability): ${formatEther(total)} ETN` +
      `\nBalance - Credits: ${formatEther(diff)} ETN ${
        diff === 0n ? "(exact match)" : "(likely dust/sent directly)"
      }`
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
