// app/api/rewards/prepare-claim/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/**
 * Prepare a signed claim for the RewardsDistributor (EIP-712).
 * GET /api/rewards/prepare-claim?account=0x...&currency=ETN|0xToken
 *
 * - Resolves currency (native if omitted/ETN).
 * - Counts comrades (NFC NFTs) for the account.
 * - Loads accPerToken(1e27), computes TOTAL(1e18 normalized).
 * - Calls signer service to sign {account, token, total, deadline}.
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const EXTRA_1e9 = 10n ** 9n;

type CurrencyPick = {
  id: string;
  symbol: string;
  decimals: number;
  tokenAddress: string | null;
};

const currencySelect = {
  id: true,
  symbol: true,
  decimals: true,
  tokenAddress: true,
} as const;

function toBigIntSafe(x?: string | null) {
  if (!x) return 0n;
  return BigInt(x);
}

function isHexAddrLower(s: string) {
  return /^0x[a-f0-9]{40}$/.test(s);
}

export async function GET(req: Request) {
  await prismaReady;

  const url = new URL(req.url);
  const accountRaw = (url.searchParams.get("account") || "").trim();
  const currencyParamRaw = (url.searchParams.get("currency") || "").trim();

  // Normalize & validate account
  const account = accountRaw.toLowerCase();
  if (!isHexAddrLower(account)) {
    return NextResponse.json({ error: "bad account" }, { status: 400 });
  }

  // 1) Resolve currency
  // - If param looks like an address → match tokenAddress (case-insensitive)
  // - Else if param is empty or "ETN" → native (tokenAddress = null, active = true)
  // - Else → match by symbol (case-insensitive, active = true)
  const isAddrLike = /^0x[0-9a-fA-F]{40}$/.test(currencyParamRaw);
  const currencyParam = currencyParamRaw || "ETN";

  let currency: CurrencyPick | null = null;

  if (isAddrLike) {
    currency = await prisma.currency.findFirst({
      where: {
        tokenAddress: { equals: currencyParamRaw, mode: "insensitive" },
        active: true,
      },
      select: currencySelect,
    });
  } else if (!currencyParamRaw || currencyParam.toUpperCase() === "ETN") {
    // Native currency by convention: tokenAddress = null, active = true
    currency = await prisma.currency.findFirst({
      where: { tokenAddress: null, active: true },
      select: currencySelect,
    });
  } else {
    currency = await prisma.currency.findFirst({
      where: {
        symbol: { equals: currencyParam, mode: "insensitive" },
        active: true,
      },
      select: currencySelect,
    });
  }

  if (!currency) {
    return NextResponse.json(
      { error: `currency not found: ${currencyParamRaw || "(native)"}` },
      { status: 400 }
    );
  }

  // 2) NFC collection contract
  let CONTRACT = process.env.PANTHART_NFC_CONTRACT?.trim();
  if (!CONTRACT) {
    const col = await prisma.collection.findFirst({
      where: { name: { equals: "Non-Fungible Comrades", mode: "insensitive" } },
      select: { contract: true },
    });
    CONTRACT = col?.contract || "";
  }
  if (!CONTRACT) {
    return NextResponse.json({ error: "collection not configured" }, { status: 500 });
  }

  // 3) Comrades (owned NFTs in that collection by this account)
  const rows = await prisma.$queryRaw<Array<{ comrades: bigint }>>`
    SELECT COUNT(*)::bigint AS comrades
    FROM "NFT" n
    JOIN "User" u ON u.id = n."ownerId"
    WHERE n.contract = ${CONTRACT}::citext
      AND n.status   = 'SUCCESS'::"NftStatus"
      AND u."walletAddress" = ${account}::citext
  `;
  const comrades = rows[0]?.comrades ?? 0n;

  // 4) Accumulator (1e27)
  const acc = await prisma.rewardAccumulatorMulti.findFirst({
    where: { currencyId: currency.id },
    select: { accPerToken: true },
  });
  const accPerToken1e27 = toBigIntSafe(acc?.accPerToken?.toString() ?? "0");

  // 5) TOTAL entitlement (1e18 normalized) = comrades * accPerToken / 1e9
  const totalWei = (comrades * accPerToken1e27) / EXTRA_1e9;

  // 6) Ask signer service to sign the claim
  const tokenAddr = currency.tokenAddress ? currency.tokenAddress : ZERO;

  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(process.env.SIGNER_DEADLINE_SECONDS || "3600");
  const deadline = now + ttl;

  const base = (process.env.SIGNER_SERVICE_URL || "").replace(/\/+$/, "");
  if (!base) {
    return NextResponse.json({ error: "signer_not_configured" }, { status: 500 });
  }
  const signUrl = `${base}/sign`;
  const auth = process.env.SIGNER_SERVICE_TOKEN || "";

  const resp = await fetch(signUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: `Bearer ${auth}` } : {}),
    },
    body: JSON.stringify({
      account,
      token: tokenAddr,
      total: totalWei.toString(),
      deadline,
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    return NextResponse.json(
      { error: `signer_error: ${t || resp.status}` },
      { status: 502 }
    );
  }

  const signed = await resp.json();

  return NextResponse.json({
    currency: {
      symbol: currency.symbol,
      decimals: currency.decimals,
      tokenAddress: tokenAddr,
    },
    account,
    total: totalWei.toString(),
    deadline,
    signature: signed.signature, // EIP-712 signature from signer service
  });
}
