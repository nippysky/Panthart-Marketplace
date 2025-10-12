// app/api/legends/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/**
 * Legends API
 * GET /api/legends?limit=25&offset=0
 *
 * Leaderboard of current holders for the
 * "Non-Fungible Comrades" collection:
 *  - rank, username, avatar, walletAddress
 *  - comrades (current NFTs held for this contract)
 *  - feeShareEtn (pro-rata from 1.5% of all SOLD listings in this collection)
 */

type LegendsRow = {
  id: string;
  walletAddress: string;     // selected with explicit alias
  username: string;
  profileAvatar: string | null; // selected with explicit alias
  comrades: bigint;
};

export async function GET(req: Request) {
  await prismaReady;

  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 25), 1), 100);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0), 0);

  // 1) Resolve the contract address
  let CONTRACT = process.env.PANTHART_NFC_CONTRACT?.trim();

  if (!CONTRACT) {
    // Fallback by collection name (case-insensitive)
    const col = await prisma.collection.findFirst({
      where: { name: { equals: "Non-Fungible Comrades", mode: "insensitive" } },
      select: { contract: true },
    });
    if (col?.contract) {
      CONTRACT = col.contract;
    } else {
      return NextResponse.json(
        { error: "Missing PANTHART_NFC_CONTRACT env and collection not found by name." },
        { status: 500 }
      );
    }
  }

  // 2) Total comrades currently held for this contract
  //    (NFTs with ownerId present, status SUCCESS)
  const totalRows = await prisma.$queryRaw<Array<{ total_comrades: bigint }>>`
    SELECT COUNT(*)::bigint AS total_comrades
    FROM "NFT" n
    WHERE n.contract = ${CONTRACT}::citext
      AND n.status = 'SUCCESS'::"NftStatus"
      AND n."ownerId" IS NOT NULL
  `;

  const totalComrades = totalRows[0]?.total_comrades ?? BigInt(0);
  if (totalComrades === BigInt(0)) {
    return NextResponse.json({
      holders: [],
      nextOffset: null,
      totalComrades: 0,
      poolEtn: 0,
      poolWei: "0",
      shareRate: 0.015,
    });
  }

  // 3) Sum of SOLD listing prices (wei) for this collection
  const feeRows = await prisma.$queryRaw<Array<{ sum_wei: string | null }>>`
    SELECT COALESCE(SUM(ml."priceEtnWei")::text, '0') AS sum_wei
    FROM "MarketplaceListing" ml
    JOIN "NFT" n ON n.id = ml."nftId"
    WHERE n.contract = ${CONTRACT}::citext
      AND ml.status = 'SOLD'::"ListingStatus"
  `;
  const totalWei = BigInt(feeRows[0]?.sum_wei ?? "0");

  // 1.5% holder pool
  const holderShareRate = 0.015;
  const poolShareWei = (totalWei * BigInt(15)) / BigInt(1000); // 1.5%
  const poolEtn = Number(poolShareWei) / 1e18; // displayed as float; wei preserved below

  // 4) Page of holders (ranked by comrades desc, stable tie-breaker)
  const pageRows = await prisma.$queryRaw<LegendsRow[]>`
    SELECT
      u.id,
      u."walletAddress" AS "walletAddress",
      u.username,
      u."profileAvatar" AS "profileAvatar",
      COUNT(n.*)::bigint AS comrades
    FROM "NFT" n
    JOIN "User" u ON u.id = n."ownerId"
    WHERE n.contract = ${CONTRACT}::citext
      AND n.status = 'SUCCESS'::"NftStatus"
      AND n."ownerId" IS NOT NULL
    GROUP BY u.id
    ORDER BY comrades DESC, u.id ASC
    LIMIT ${limit} OFFSET ${offset}
  `;

  // 5) Shape & compute each holder’s proportional fee share
  const data = pageRows.map((r, i) => {
    const comradesNum = Number(r.comrades);
    const ratio = comradesNum / Number(totalComrades);
    // pro-rata wei, keep as bigint -> string for precision
    const userWeiBig = BigInt(Math.floor(ratio * Number(poolShareWei)));
    const userEtn = Number(userWeiBig) / 1e18;

    return {
      rank: offset + i + 1,
      userId: r.id,
      walletAddress: r.walletAddress,
      username: r.username,
      profileAvatar: r.profileAvatar,
      comrades: comradesNum,
      feeShareWei: userWeiBig.toString(),
      feeShareEtn: userEtn,
    };
  });

  const nextOffset = pageRows.length < limit ? null : offset + limit;

  return NextResponse.json({
    holders: data,
    nextOffset,
    totalComrades: Number(totalComrades),
    poolEtn,
    poolWei: poolShareWei.toString(),
    shareRate: holderShareRate,
  });
}
