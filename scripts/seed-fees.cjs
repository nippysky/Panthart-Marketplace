// scripts/seed-fees.cjs
// -----------------------------------------------------------------------------
// Idempotent FeeConfig seeder + audit logging (FeeConfigLog).
// Now supports dynamic USD-targeted pricing; computes wei from CryptoCompare.
// Safe to run in CI: quietly no-ops if DATABASE_URL missing/invalid.
// -----------------------------------------------------------------------------

require("dotenv").config();

let PrismaClient;
try {
  ({ PrismaClient } = require("../lib/generated/prisma")); // prefer generated output
} catch {
  ({ PrismaClient } = require("@prisma/client"));
}

const { FEES, REQUIRED_RECIPIENT } = require("./fees.config.cjs");
const { ethers } = require("ethers");

const DB_URL = process.env.DATABASE_URL || "";
if (!/^postgres(ql)?:\/\//i.test(DB_URL)) {
  console.log("Skipping FeeConfig seeding: DATABASE_URL missing or not a postgres URL.");
  process.exit(0);
}

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
});

// ---------- Helpers ----------
function isWeiString(v) {
  return typeof v === "string" && /^\d+$/.test(v);
}
function checksum(addr) {
  if (!ethers.isAddress(addr)) throw new Error(`Invalid EVM address: ${addr}`);
  return ethers.getAddress(addr);
}

function ceilDiv(numerator, denominator) {
  return (numerator + (denominator - 1n)) / denominator;
}

/**
 * Compute fee in wei from:
 *   targetUsdCents (Int) + priceUsd (Number)
 * Integer math:
 *   priceScaled = round(priceUsd * 1e8)
 *   usdScaled   = targetUsdCents * 1e6     // cents→1e8 scale
 *   wei         = ceil( (usdScaled * 1e18) / priceScaled )
 */
function computeWeiFromTarget(targetUsdCents, priceUsd) {
  if (!Number.isFinite(Number(priceUsd)) || Number(priceUsd) <= 0) {
    throw new Error(`Bad priceUsd: ${priceUsd}`);
  }
  const priceScaled = BigInt(Math.round(Number(priceUsd) * 1e8));
  const usdScaled   = BigInt(targetUsdCents) * 1_000_000n;
  const numerator   = usdScaled * 1_000_000_000_000_000_000n; // 1e18
  return ceilDiv(numerator, priceScaled);
}

async function fetchEtnUsd() {
  const url = "https://min-api.cryptocompare.com/data/price?fsym=ETN&tsyms=USD";
  const headers = {};
  if (process.env.CRYPTOCOMPARE_API_KEY) headers.Apikey = process.env.CRYPTOCOMPARE_API_KEY;

  try {
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const usd = json?.USD;
    if (!Number.isFinite(Number(usd))) throw new Error(`Invalid JSON: ${JSON.stringify(json)}`);
    return Number(usd);
  } catch (e) {
    console.warn("⚠️  CryptoCompare price fetch failed; seeding will set fee=0 and hourly job will fix it:", e?.message || e);
    return null;
  }
}

async function upsertFeeConfig({
  contractType,
  metadataOption,
  recipient,
  fixedAmountWei,          // string|undefined
  targetUsdCents,          // number|undefined
  priceUsd,                // number|null
}) {
  const whereUnique = { contractType_metadataOption: { contractType, metadataOption } };
  const existing = await prisma.feeConfig.findUnique({ where: whereUnique });

  const baseData = {
    feeRecipient: checksum(recipient),
    active: true,
  };

  let computedWei = null;
  let usdMeta = {};
  if (!fixedAmountWei && typeof targetUsdCents === "number" && targetUsdCents > 0) {
    if (priceUsd) {
      computedWei = computeWeiFromTarget(targetUsdCents, priceUsd).toString();
      usdMeta = {
        targetUsdCents,
        pricingSource: "CRYPTOCOMPARE",
        pricingPair: "ETNUSD",
        lastPriceUsd: priceUsd.toString(),
        lastPriceAt: new Date(),
      };
    } else {
      // price missing → seed with 0, hourly job will correct
      computedWei = "0";
      usdMeta = {
        targetUsdCents,
        pricingSource: "CRYPTOCOMPARE",
        pricingPair: "ETNUSD",
        lastPriceUsd: null,
        lastPriceAt: null,
      };
    }
  }

  const nextWei = fixedAmountWei || computedWei || "0";

  if (!existing) {
    const created = await prisma.feeConfig.create({
      data: {
        contractType,
        metadataOption,
        ...baseData,
        feeAmountEtnWei: nextWei,
        ...usdMeta,
        logs: {
          create: {
            previousRecipient: null,
            newRecipient: baseData.feeRecipient,
            previousAmountEtnWei: null,
            newAmountEtnWei: nextWei,
            changedByUserId: null,
            reason: fixedAmountWei ? "Initial seed (fixed wei)" : "Initial seed (usd-target)",
          },
        },
      },
    });
    console.log(`➕ Created FeeConfig(${contractType}, ${metadataOption}) → wei=${nextWei}`);
    return created;
  }

  const recipientChanged = checksum(existing.feeRecipient) !== baseData.feeRecipient;
  const amountChanged = String(existing.feeAmountEtnWei) !== String(nextWei);
  const needsActivate = existing.active !== true;

  if (recipientChanged || amountChanged || needsActivate) {
    const updated = await prisma.feeConfig.update({
      where: whereUnique,
      data: {
        ...baseData,
        feeAmountEtnWei: nextWei,
        // update USD meta only if we’re using usd target mode
        ...(fixedAmountWei
          ? {}
          : usdMeta),
        logs: {
          create: {
            previousRecipient: existing.feeRecipient,
            newRecipient: baseData.feeRecipient,
            previousAmountEtnWei: String(existing.feeAmountEtnWei),
            newAmountEtnWei: nextWei,
            changedByUserId: null,
            reason:
              fixedAmountWei
                ? (recipientChanged && amountChanged
                    ? "Recipient & amount changed (fixed)"
                    : recipientChanged
                    ? "Recipient changed (fixed)"
                    : amountChanged
                    ? "Amount changed (fixed)"
                    : "Reactivated (fixed)")
                : (recipientChanged && amountChanged
                    ? "Recipient & amount changed (usd-target)"
                    : recipientChanged
                    ? "Recipient changed (usd-target)"
                    : amountChanged
                    ? "Amount changed (usd-target)"
                    : "Reactivated (usd-target)"),
          },
        },
      },
    });
    console.log(`♻️ Updated FeeConfig(${contractType}, ${metadataOption}) → wei=${nextWei}`);
    return updated;
  }

  // If no structural change but we're in usd-target mode and price is fresh,
  // ensure lastPrice* fields are current (non-destructive).
  if (!fixedAmountWei && priceUsd) {
    await prisma.feeConfig.update({
      where: whereUnique,
      data: {
        targetUsdCents,
        pricingSource: "CRYPTOCOMPARE",
        pricingPair: "ETNUSD",
        lastPriceUsd: priceUsd.toString(),
        lastPriceAt: new Date(),
      },
    });
  }

  console.log(`✓ No change: FeeConfig(${contractType}, ${metadataOption})`);
  return existing;
}

(async function main() {
  try {
    if (!REQUIRED_RECIPIENT) {
      console.log("Skipping seeding: FEE_RECIPIENT not set.");
      process.exit(0);
    }

    // Flatten config into a list
    const targets = [];
    for (const ct of Object.keys(FEES)) {
      for (const mo of Object.keys(FEES[ct])) {
        const { recipient, amountWei, targetUsdCents } = FEES[ct][mo];
        if (recipient !== REQUIRED_RECIPIENT) {
          throw new Error("All fee recipients must match the global FEE_RECIPIENT");
        }
        checksum(recipient);
        if (amountWei && !isWeiString(amountWei)) {
          throw new Error(`FEES[${ct}][${mo}].amountWei must be a wei string`);
        }
        if (!amountWei && !(typeof targetUsdCents === "number" && targetUsdCents >= 0)) {
          throw new Error(`FEES[${ct}][${mo}] requires amountWei (string) or targetUsdCents (number >= 0)`);
        }
        targets.push({ contractType: ct, metadataOption: mo, recipient, amountWei, targetUsdCents });
      }
    }

    // If any USD-target is present, fetch price once
    const needsPrice = targets.some(t => !t.amountWei && (t.targetUsdCents ?? 0) > 0);
    const priceUsd = needsPrice ? await fetchEtnUsd() : null;

    console.log("Seeding FeeConfig across all types…");
    for (const t of targets) {
      await upsertFeeConfig({
        contractType: t.contractType,
        metadataOption: t.metadataOption,
        recipient: t.recipient,
        fixedAmountWei: t.amountWei,      // if present, overrides dynamic pricing
        targetUsdCents: t.targetUsdCents, // used when fixed not present
        priceUsd,                         // single fetch reused
      });
    }
    console.log("✅ FeeConfig seeding complete.");
    process.exit(0);
  } catch (err) {
    console.error("❌ FeeConfig seeding failed (non-fatal):", err?.message || err);
    process.exit(0);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {}
  }
})();
