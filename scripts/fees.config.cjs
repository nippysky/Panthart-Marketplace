// scripts/fees.config.cjs
// -----------------------------------------------------------------------------
// Single source of truth for platform fees.
// - One global recipient wallet for all contract types (REQUIRED_RECIPIENT).
// - Each entry can be fixed (amountWei) OR dynamic (targetUsdCents).
// - If both are provided, amountWei wins (explicit override).
// -----------------------------------------------------------------------------
//
// Env suggestions (examples):
//   FEE_RECIPIENT=0xabc...        (REQUIRED)
//   FEE_TARGET_USD_CENTS_DEFAULT=200        # $2.00 default
//   FEE_TARGET_ERC721_DROP_UPLOAD_USD_CENTS=300
//   FEE_TARGET_ERC721_DROP_EXTERNAL_USD_CENTS=200
//   FEE_TARGET_ERC721_SINGLE_USD_CENTS=200
//   FEE_TARGET_ERC1155_SINGLE_USD_CENTS=200
//
//   # Optional fixed overrides (string in wei). If set, overrides targetUsdCents:
//   FEE_ERC721_DROP_UPLOAD_WEI=0
//   FEE_ERC721_DROP_EXTERNAL_WEI=0
//   FEE_ERC721_SINGLE_WEI=0
//   FEE_ERC1155_SINGLE_WEI=0
//
// -----------------------------------------------------------------------------

const REQUIRED_RECIPIENT = process.env.FEE_RECIPIENT || ""; // ⛔ required

const USD_DEFAULT = Number(process.env.FEE_TARGET_USD_CENTS_DEFAULT || "5000"); // $50.00

function intFromEnv(name, fallback) {
  const v = process.env[name];
  if (v == null || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : fallback;
}

// Helper per-entry builder
function entry({ fixedWeiEnv, targetUsdEnv, defaultUsdCents }) {
  const amountWei = process.env[fixedWeiEnv] || undefined; // string or undefined
  const targetUsdCents = intFromEnv(targetUsdEnv, defaultUsdCents);
  return {
    recipient: REQUIRED_RECIPIENT,
    amountWei, // if provided, takes precedence
    targetUsdCents, // used when amountWei not set
  };
}

const FEES = {
  ERC721_DROP: {
    UPLOAD:   entry({
      fixedWeiEnv:  "FEE_ERC721_DROP_UPLOAD_WEI",
      targetUsdEnv: "FEE_TARGET_ERC721_DROP_UPLOAD_USD_CENTS",
      defaultUsdCents: USD_DEFAULT,
    }),
    EXTERNAL: entry({
      fixedWeiEnv:  "FEE_ERC721_DROP_EXTERNAL_WEI",
      targetUsdEnv: "FEE_TARGET_ERC721_DROP_EXTERNAL_USD_CENTS",
      defaultUsdCents: USD_DEFAULT,
    }),
  },
  ERC721_SINGLE: {
    // store under UPLOAD (your current uniqueness allows either; keeping as your existing pattern)
    UPLOAD: entry({
      fixedWeiEnv:  "FEE_ERC721_SINGLE_WEI",
      targetUsdEnv: "FEE_TARGET_ERC721_SINGLE_USD_CENTS",
      defaultUsdCents: USD_DEFAULT,
    }),
  },
  ERC1155_SINGLE: {
    // store under UPLOAD (consistent with your current config)
    UPLOAD: entry({
      fixedWeiEnv:  "FEE_ERC1155_SINGLE_WEI",
      targetUsdEnv: "FEE_TARGET_ERC1155_SINGLE_USD_CENTS",
      defaultUsdCents: USD_DEFAULT,
    }),
  },
};

module.exports = { FEES, REQUIRED_RECIPIENT };
