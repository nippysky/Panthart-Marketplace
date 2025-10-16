// app/api/rewards/prepare-claim/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/**
 * Prepare a signed claim for the RewardsDistributor (EIP-712).
 * GET /api/rewards/prepare-claim?account=0x...&currency=ETN|0xToken
 *
 * - Does NOT lowercase any address or contract string.
 * - DB comparisons are case-insensitive (citext / Prisma mode:"insensitive").
 * - Computes TOTAL entitlement in 1e18 units:
 *     total = comrades * accPerToken(1e27) / 1e9
 */

const ZERO = "0x0000000000000000000000000000000000000000";
const ONE_E9 = 1_000_000_000n;

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

function isHexAddressCaseAgnostic(s: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

/** BigInt-safe converter from Decimal/number/string to integer BigInt. */
function toBigIntIntPortion(v: any): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  const s = v.toString().trim();
  if (s.startsWith("0x") || s.startsWith("0X")) return BigInt(s); // hex ints
  const m = s.match(/^(-?\d+)/); // grab integer part only
  return BigInt(m ? m[1] : "0");
}

export async function GET(req: Request) {
  await prismaReady;

  const url = new URL(req.url);
  const account = (url.searchParams.get("account") || "").trim();
  const currencyParamRaw = (url.searchParams.get("currency") || "").trim();

  // Validate account format, but DO NOT change its case
  if (!isHexAddressCaseAgnostic(account)) {
    return NextResponse.json({ error: "bad account" }, { status: 400 });
  }

  // 1) Resolve currency (no lowercasing of inputs; lookups are case-insensitive)
  const isAddrLike = isHexAddressCaseAgnostic(currencyParamRaw);
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
    // Native currency: tokenAddress = null
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

  // 2) NFC collection contract (kept exactly as stored)
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

  // 3) Comrades owned by this exact account (case-insensitive compare via citext)
  const comradesRows = await prisma.$queryRaw<Array<{ comrades: bigint }>>`
    SELECT COUNT(*)::bigint AS comrades
    FROM "NFT" n
    JOIN "User" u ON u.id = n."ownerId"
    WHERE n.contract = ${CONTRACT}::citext
      AND n.status   = 'SUCCESS'::"NftStatus"
      AND u."walletAddress" = ${account}::citext
  `;
  const comrades = comradesRows[0]?.comrades ?? 0n;

  // 4) Accumulator (1e27 fixed)
  const acc = await prisma.rewardAccumulatorMulti.findFirst({
    where: { currencyId: currency.id },
    select: { accPerToken: true },
  });
  const accPerToken1e27 = toBigIntIntPortion(acc?.accPerToken);

  // 5) TOTAL entitlement (1e18) = comrades * accPerToken / 1e9
  const totalWei = (comrades * accPerToken1e27) / ONE_E9;

  // 6) Ask signer service to sign the claim. Use the token address *as stored*.
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
      account,           // exact casing from user
      token: tokenAddr,  // exact casing from DB (or ZERO)
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
      tokenAddress: tokenAddr, // unchanged
    },
    account,                     // unchanged
    total: totalWei.toString(),  // 1e18 units
    deadline,
    signature: signed.signature, // EIP-712 signature
  });
}
