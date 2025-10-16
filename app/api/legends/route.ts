// app/api/legends/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/**
 * Legends API (multi-currency)
 * GET /api/legends?limit=25&offset=0&currency=ETN | 0xTokenAddr
 *
 * DB scales:
 * - amounts @ 1e18 (Decimal(78,18)) — treat as integer-like
 * - accPerToken @ 1e27 (Decimal(78,27)) — treat as integer-like
 */

type LegendsRow = {
  id: string;
  walletAddress: string;
  username: string;
  profileAvatar: string | null;
  comrades: string; // returned as TEXT from SQL (we sort via COUNT() directly)
};

function isAddressLike(s: string | null | undefined) {
  if (!s) return false;
  const x = s.trim();
  return /^0x[0-9a-fA-F]{40}$/.test(x);
}

/** Tolerant converter -> bigint (handles "123.000…", Decimal, number). */
function toBigIntTolerant(v: any): bigint {
  if (v == null) return 0n;
  const s = v.toString().trim();
  // Ensure we only grab the integer portion and avoid scientific notation
  const m = s.match(/^(-?\d+)/);
  if (m && m[1] !== "" && m[1] !== "-" && m[1] !== "-0") return BigInt(m[1]);
  return 0n;
}

// Pending = (accPerToken(1e27) - lastAccPerToken(1e27)) * comrades / 1e9 → 1e18 units
function pendingWei(deltaAccPerToken1e27: bigint, comrades: bigint): bigint {
  if (deltaAccPerToken1e27 <= 0n || comrades <= 0n) return 0n;
  return (deltaAccPerToken1e27 * comrades) / 1_000_000_000n; // 1e27 / 1e9 = 1e18
}

export async function GET(req: Request) {
  await prismaReady;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25), 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);
  const currencyParam = (url.searchParams.get("currency") || "").trim() || null;

  // 1) NFC contract
  let CONTRACT = process.env.PANTHART_NFC_CONTRACT?.trim();
  if (!CONTRACT) {
    const col = await prisma.collection.findFirst({
      where: { name: { equals: "Non-Fungible Comrades", mode: "insensitive" } },
      select: { contract: true },
    });
    if (!col?.contract) {
      return NextResponse.json(
        { error: "Missing PANTHART_NFC_CONTRACT env and collection not found by name." },
        { status: 500 }
      );
    }
    CONTRACT = col.contract;
  }

  // 2) Currency
  let currency:
    | null
    | {
        id: string;
        symbol: string;
        decimals: number;
        tokenAddress: string | null;
      } = null;

  if (!currencyParam) {
    currency = await prisma.currency.findFirst({
      where: { kind: "NATIVE", tokenAddress: null, active: true },
      select: { id: true, symbol: true, decimals: true, tokenAddress: true },
    });
  } else if (isAddressLike(currencyParam)) {
    currency = await prisma.currency.findFirst({
      where: { tokenAddress: currencyParam },
      select: { id: true, symbol: true, decimals: true, tokenAddress: true },
    });
  } else {
    currency = await prisma.currency.findFirst({
      where: { symbol: { equals: currencyParam, mode: "insensitive" }, active: true },
      select: { id: true, symbol: true, decimals: true, tokenAddress: true },
    });
  }

  if (!currency) {
    return NextResponse.json(
      { error: `Unknown or inactive currency: ${currencyParam ?? "(native)"}` },
      { status: 400 }
    );
  }

  // 3) Total comrades (TEXT → bigint). Keep as TEXT to avoid bigint overflows.
  const totalRows = await prisma.$queryRaw<Array<{ total_comrades: string }>>`
    SELECT (COUNT(*)::numeric(78,0))::text AS total_comrades
    FROM "NFT" n
    WHERE n.contract = ${CONTRACT}::citext
      AND n.status   = 'SUCCESS'::"NftStatus"
      AND n."ownerId" IS NOT NULL
  `;
  const totalComrades = toBigIntTolerant(totalRows[0]?.total_comrades);

  // 4) Current accPerToken for this currency (1e27) — Decimal → bigint
  const accRow = await prisma.rewardAccumulatorMulti.findFirst({
    where: { currencyId: currency.id },
    select: { accPerToken: true, updatedAt: true },
  });
  const accPerToken1e27 = toBigIntTolerant(accRow?.accPerToken);

  // 5) Pool distributed so far — keep everything NUMERIC → TEXT (no ::bigint).
  const poolRows = await prisma.$queryRaw<Array<{ sum_amt: string }>>`
    SELECT COALESCE( (SUM(rdl.amount)::numeric(78,0))::text, '0') AS sum_amt
    FROM "RewardDistributionLog" rdl
    WHERE rdl."currencyId" = ${currency.id}
  `;
  const poolDistWei = toBigIntTolerant(poolRows[0]?.sum_amt);

  if (totalComrades === 0n) {
    return NextResponse.json({
      holders: [],
      nextOffset: null,
      totalComrades: 0,
      currency,
      accPerToken1e27: accPerToken1e27.toString(),
      poolDistributedWei: poolDistWei.toString(),
      // NOTE: Number() is for UI convenience; if values can exceed JS safe range, format on the client.
      poolDistributedHuman: Number(poolDistWei) / 1e18,
      shareRate: 0.015,
    });
  }

  // 6) Page of holders (ranked by comrades)
  // Return comrades as TEXT; sort in SQL by COUNT directly.
  const pageRows = await prisma.$queryRaw<LegendsRow[]>`
    SELECT
      u.id,
      u."walletAddress" AS "walletAddress",
      u.username,
      u."profileAvatar" AS "profileAvatar",
      (COUNT(n.*)::numeric(78,0))::text AS comrades
    FROM "NFT" n
    JOIN "User" u ON u.id = n."ownerId"
    WHERE n.contract = ${CONTRACT}::citext
      AND n.status   = 'SUCCESS'::"NftStatus"
      AND n."ownerId" IS NOT NULL
    GROUP BY u.id
    ORDER BY COUNT(n.*) DESC, u.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  const walletAddresses = pageRows.map((r) => r.walletAddress);

  // 7) Holder reward rows
  const holderRows = await prisma.holderRewardMulti.findMany({
    where: { walletAddress: { in: walletAddresses }, currencyId: currency.id },
    select: { walletAddress: true, lastAccPerToken: true, claimedAmount: true },
  });
  const holderMap = new Map(holderRows.map((h) => [h.walletAddress.toLowerCase(), h]));

  // 8) Compute page
  const data = pageRows.map((r, i) => {
    const comrades = toBigIntTolerant(r.comrades);
    const meta = holderMap.get(r.walletAddress.toLowerCase());
    const lastAcc1e27 = toBigIntTolerant(meta?.lastAccPerToken);
    const claimedWei  = toBigIntTolerant(meta?.claimedAmount);

    const delta = accPerToken1e27 > lastAcc1e27 ? (accPerToken1e27 - lastAcc1e27) : 0n;
    const pending = pendingWei(delta, comrades);
    const totalWei = claimedWei + pending;

    return {
      rank: offset + i + 1,
      userId: r.id,
      walletAddress: r.walletAddress,
      username: r.username,
      profileAvatar: r.profileAvatar,
      comrades: Number(comrades),
      feeShareWei: totalWei.toString(),
      // For very large values you may want to format server-side with a decimal lib instead of Number()
      feeShareHuman: Number(totalWei) / 1e18,
    };
  });

  const nextOffset = pageRows.length < limit ? null : offset + limit;

  return NextResponse.json({
    holders: data,
    nextOffset,
    totalComrades: Number(totalComrades),
    currency,
    accPerToken1e27: accPerToken1e27.toString(),
    poolDistributedWei: poolDistWei.toString(),
    poolDistributedHuman: Number(poolDistWei) / 1e18,
    shareRate: 0.015,
  });
}
