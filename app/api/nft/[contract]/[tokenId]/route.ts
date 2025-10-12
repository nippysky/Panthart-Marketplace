// app/api/nft/[contract]/[tokenId]/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { Prisma, ListingStatus, AuctionStatus } from "@/lib/generated/prisma";

/* ----------------------------- helpers ----------------------------- */
function weiToEtn(wei?: any): number | undefined {
  if (wei == null) return undefined;
  const s = (wei as any).toString?.() ?? String(wei);
  const n = Number(s);
  return Number.isFinite(n) ? n / 1e18 : undefined;
}

/* ------------------------------ rarity ----------------------------- */
async function buildRaritySQL(nftId: string, contract: string) {
  const meta = await prisma.$queryRaw<
    Array<{ total: number; score: number; rank: number }>
  >(Prisma.sql`
    WITH scope AS (
      SELECT "id","attributes","traits"
      FROM "NFT"
      WHERE "contract" = ${contract}::citext
        AND "status" = 'SUCCESS'::"NftStatus"
    ),
    flat AS (
      SELECT s."id",(e->>'trait_type')::text AS trait_type,(e->>'value')::text AS value
      FROM scope s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s."attributes") = 'array' THEN s."attributes" ELSE '[]'::jsonb END
      ) AS e
      WHERE coalesce(btrim((e->>'trait_type')::text), '') <> ''
        AND coalesce(btrim((e->>'value')::text), '') <> ''

      UNION

      SELECT s."id", kv.key::text AS trait_type, btrim(kv.value::text, '"') AS value
      FROM scope s
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(s."traits") = 'object' THEN s."traits" ELSE '{}'::jsonb END
      ) AS kv
      WHERE coalesce(btrim(kv.key::text), '') <> ''
        AND coalesce(btrim(kv.value::text), '') <> ''
    ),
    freq AS (
      SELECT trait_type, value, COUNT(*)::numeric AS cnt
      FROM flat
      GROUP BY trait_type, value
    ),
    scores AS (
      SELECT f.id, COALESCE(SUM(1.0 / fr.cnt), 0) AS score
      FROM flat f
      JOIN freq fr USING (trait_type, value)
      GROUP BY f.id
    ),
    ranked AS (
      SELECT id, score, RANK() OVER (ORDER BY score DESC) AS rk
      FROM scores
    ),
    pop AS (SELECT COUNT(*)::int AS total FROM scope)

    SELECT p.total, r.score, r.rk AS rank
    FROM ranked r
    JOIN pop p ON true
    WHERE r.id = ${nftId};
  `);

  const population = Number(meta[0]?.total ?? 0);
  const totalScore = Number(meta[0]?.score ?? 0);
  const rarityRank = Number(meta[0]?.rank ?? (population || 1));

  const rowTraits = await prisma.$queryRaw<
    Array<{ trait_type: string; value: string; cnt: number }>
  >(Prisma.sql`
    WITH scope AS (
      SELECT "id","attributes","traits"
      FROM "NFT"
      WHERE "contract" = ${contract}::citext
        AND "status" = 'SUCCESS'::"NftStatus"
    ),
    flat AS (
      SELECT s."id",(e->>'trait_type')::text AS trait_type,(e->>'value')::text AS value
      FROM scope s
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s."attributes") = 'array' THEN s."attributes" ELSE '[]'::jsonb END
      ) AS e
      WHERE coalesce(btrim((e->>'trait_type')::text), '') <> ''
        AND coalesce(btrim((e->>'value')::text), '') <> ''

      UNION

      SELECT s."id", kv.key::text AS trait_type, btrim(kv.value::text, '"') AS value
      FROM scope s
      CROSS JOIN LATERAL jsonb_each(
        CASE WHEN jsonb_typeof(s."traits") = 'object' THEN s."traits" ELSE '{}'::jsonb END
      ) AS kv
      WHERE coalesce(btrim(kv.key::text), '') <> ''
        AND coalesce(btrim(kv.value::text), '') <> ''
    ),
    freq AS (
      SELECT trait_type, value, COUNT(*)::numeric AS cnt
      FROM flat
      GROUP BY trait_type, value
    )
    SELECT f.trait_type, f.value, fr.cnt
    FROM flat f
    JOIN freq fr USING (trait_type, value)
    WHERE f.id = ${nftId};
  `);

  const traitsWithRarity = rowTraits.map((r) => {
    const count = Number(r.cnt ?? 0);
    const frequency = population > 0 ? count / population : 0;
    return {
      trait_type: r.trait_type,
      value: r.value,
      count,
      frequency,
      rarityPercent: Number((frequency * 100).toFixed(2)),
      rarityScore: Number((frequency > 0 ? 1 / frequency : 0).toFixed(4)),
    };
  });

  return {
    traitsWithRarity,
    totalRarityScore: Number(totalScore.toFixed(2)),
    rarityRank,
    population,
  };
}

async function count1155HoldersFromDB(contract: string, tokenId: string) {
  return prisma.erc1155Holding.count({
    where: {
      contract: { equals: contract, mode: "insensitive" },
      tokenId,
      balance: { gt: 0 },
    },
  });
}

/* ------------------------------- Route ------------------------------- */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ contract: string; tokenId: string }> }
) {
  await prismaReady;
  const { contract: rawContract, tokenId } = await ctx.params;

  try {
    const nft = await prisma.nFT.findFirst({
      where: { contract: { equals: rawContract, mode: "insensitive" }, tokenId },
      include: {
        owner: { select: { walletAddress: true, username: true, profileAvatar: true } },
        collection: {
          select: {
            id: true,
            name: true,
            logoUrl: true,
            coverUrl: true,
            supply: true,
            isOrphan: true,
            standard: true,
            creator: { select: { walletAddress: true, username: true, profileAvatar: true } },
            deployment: { select: { royaltyRecipient: true, royaltyBps: true } },
          },
        },
        single721:  { select: { royaltyRecipient: true, royaltyBps: true, name: true, symbol: true, ownerAddress: true } },
        single1155: { select: { royaltyRecipient: true, royaltyBps: true, name: true, symbol: true, maxSupply: true, ownerAddress: true } },
        listingEntries: {
          where: { status: ListingStatus.ACTIVE },
          orderBy: { priceEtnWei: "asc" },
          take: 1,
          select: { priceEtnWei: true, quantity: true },
        },
        // IMPORTANT: expose auction DB id and currency DB id for the client
        auctionEntries: {
          where: { status: AuctionStatus.ACTIVE },
          take: 1,
          select: {
            id: true,                         // Prisma auction id (cuid)
            startPriceEtnWei: true,
            highestBidEtnWei: true,
            startPriceTokenAmount: true,
            highestBidTokenAmount: true,
            minIncrementEtnWei: true,
            minIncrementTokenAmount: true,
            endTime: true,
            sellerAddress: true,
            currencyId: true,                 // Prisma currency id
            currency: {
              select: {
                id: true,
                symbol: true,
                decimals: true,
                kind: true,
                tokenAddress: true,
              }
            }
          },
        },
      },
    });

    if (!nft) return NextResponse.json("Not found", { status: 404 });

    const standard =
      nft.collection?.standard ?? nft.standard ?? (nft.single1155 ? "ERC1155" : "ERC721");

    const isOrphan =
      (nft.collection?.isOrphan ?? false) ||
      !nft.collection ||
      (nft.collection?.supply ?? 0) <= 1;

    // Creator
    let creatorWallet: string | null =
      nft.collection
        ? nft.collection.creator.walletAddress
        : (nft.single721?.ownerAddress ?? nft.single1155?.ownerAddress ?? null);

    if (!creatorWallet) {
      const dc = await prisma.deployedContract.findFirst({
        where: { cloneAddress: { equals: nft.contract, mode: "insensitive" } },
        select: { deployerAddress: true },
      });
      creatorWallet = dc?.deployerAddress ?? null;
    }

    let creator = nft.collection
      ? {
          walletAddress: nft.collection.creator.walletAddress,
          username: nft.collection.creator.username,
          imageUrl: nft.collection.creator.profileAvatar,
        }
      : {
          walletAddress: creatorWallet ?? nft.contract,
          username: undefined as string | undefined,
          imageUrl: `https://api.dicebear.com/7.x/identicon/svg?seed=${creatorWallet ?? nft.contract}`,
        };

    if (!nft.collection && creator.walletAddress) {
      const cu = await prisma.user.findFirst({
        where: { walletAddress: { equals: creator.walletAddress, mode: "insensitive" } },
        select: { walletAddress: true, username: true, profileAvatar: true },
      });
      if (cu) {
        creator = {
          walletAddress: cu.walletAddress,
          username: cu.username,
          imageUrl: cu.profileAvatar,
        };
      }
    }

    const royaltyBps =
      nft.royaltyBps ??
      nft.collection?.deployment?.royaltyBps ??
      nft.single721?.royaltyBps ??
      nft.single1155?.royaltyBps ??
      0;

    const royaltyRecipient =
      nft.royaltyRecipient ??
      nft.collection?.deployment?.royaltyRecipient ??
      nft.single721?.royaltyRecipient ??
      nft.single1155?.royaltyRecipient ??
      null;

    const isListed = (nft.listingEntries?.length ?? 0) > 0;
    const listingPrice = isListed ? weiToEtn(nft.listingEntries![0].priceEtnWei) : undefined;
    const listQuantity = isListed ? nft.listingEntries![0].quantity : 0;

    const ownerView = nft.owner
      ? {
          walletAddress: nft.owner.walletAddress,
          username: nft.owner.username,
          imageUrl: nft.owner.profileAvatar,
        }
      : {
          walletAddress:
            nft.collection?.creator.walletAddress ??
            "0x0000000000000000000000000000000000000000",
          username: nft.collection?.creator.username ?? "Unknown",
          imageUrl:
            nft.collection?.creator.profileAvatar ??
            `https://api.dicebear.com/7.x/identicon/svg?seed=${nft.contract}`,
        };

    const currentNFT = {
      id: nft.id,
      nftAddress: nft.contract,
      tokenId: nft.tokenId,
      name: nft.name,
      image: nft.imageUrl,
      description: nft.description ?? undefined,
      traits: nft.traits as any,
      attributes: nft.attributes as any,
      tokenUri: nft.tokenUri ?? undefined,
      contract: nft.contract,
      standard,
      royaltyBps: royaltyBps ?? undefined,
      royaltyRecipient: royaltyRecipient ?? undefined,
      ownerId: nft.ownerId ?? undefined,
      collectionId: nft.collectionId ?? undefined,

      isListed,
      listingPrice, // ETN
      isAuctioned: (nft.auctionEntries?.length ?? 0) > 0,

      createdAt: nft.createdAt.toISOString(),
      updatedAt: nft.updatedAt.toISOString(),
    };

    const { traitsWithRarity, totalRarityScore, rarityRank, population } =
      await buildRaritySQL(nft.id, nft.contract);

    const displayGroup =
      nft.collection
        ? {
            type: "collection" as const,
            id: nft.collection.id,
            slug: nft.contract,
            title: nft.collection.name,
            standard: (nft.collection.standard as "ERC721" | "ERC1155") ?? standard,
            itemCount: nft.collection.supply ?? undefined,
            coverImage: nft.collection.logoUrl ?? nft.collection.coverUrl ?? null,
            owner: nft.collection.creator.walletAddress,
          }
        : {
            type: "contract" as const,
            id: nft.contract,
            slug: nft.contract,
            title:
              nft.single721?.name ??
              nft.single1155?.name ??
              `Contract ${nft.contract.slice(0, 6)}…${nft.contract.slice(-4)}`,
            standard,
            itemCount: undefined,
            coverImage: null,
            owner: creator.walletAddress,
          };

    const erc1155OwnerCount =
      standard === "ERC1155"
        ? await count1155HoldersFromDB(nft.contract, nft.tokenId)
        : null;

    const raw = await prisma.nFT.findUnique({
      where: { id: nft.id },
      select: { rawMetadata: true },
    });

    const auction = nft.auctionEntries?.[0]
      ? {
          id: nft.auctionEntries[0].id,                          // Prisma auction id (DB)
          startPriceEtnWei: nft.auctionEntries[0].startPriceEtnWei,
          highestBidEtnWei: nft.auctionEntries[0].highestBidEtnWei,
          startPriceTokenAmount: nft.auctionEntries[0].startPriceTokenAmount,
          highestBidTokenAmount: nft.auctionEntries[0].highestBidTokenAmount,
          minIncrementEtnWei: nft.auctionEntries[0].minIncrementEtnWei,
          minIncrementTokenAmount: nft.auctionEntries[0].minIncrementTokenAmount,
          endTime: nft.auctionEntries[0].endTime,
          sellerAddress: nft.auctionEntries[0].sellerAddress,
          currencyId: nft.auctionEntries[0].currencyId ?? null,  // Prisma currency id (DB)
          currency: nft.auctionEntries[0].currency
            ? {
                id: nft.auctionEntries[0].currency!.id,
                symbol: nft.auctionEntries[0].currency!.symbol,
                decimals: nft.auctionEntries[0].currency!.decimals,
                kind: nft.auctionEntries[0].currency!.kind,
                tokenAddress: nft.auctionEntries[0].currency!.tokenAddress ?? null,
              }
            : null,
        }
      : null;

    const resp = NextResponse.json({
      nft: currentNFT,
      collection: nft.collection
        ? { id: nft.collection.id, name: nft.collection.name, logoUrl: nft.collection.logoUrl }
        : null,
      creator,
      owner: ownerView,
      isOrphan,
      traitsWithRarity,
      rarityScore: totalRarityScore,
      rarityRank,
      population,
      listQuantity,
      displayGroup,
      rawMetadata: raw?.rawMetadata ?? null,
      erc1155OwnerCount,

      auction,                                // contains Prisma auction id + currency id/metadata
      auctionSeller: auction?.sellerAddress ?? null,
    });

    resp.headers.set("Cache-Control", "s-maxage=30, stale-while-revalidate=300");
    return resp;
  } catch (e) {
    console.error("[api nft token] error:", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
