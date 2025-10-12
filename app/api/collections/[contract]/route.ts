export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { ethers } from "ethers";
import {
  AuctionStatus,
  ListingStatus,
  NftStatus,
  Prisma,
} from "@/lib/generated/prisma";

/* =============================================================================
   Helpers & utilities
   ========================================================================== */

/** Small TTL helper (kept in case you wire to Accelerate/edge caching later). */
function ttl() {
  return 60; // 60s cache for non-volatile metadata reads
}

/** Convert base units (wei) to ETN (18 decimals). Accepts Decimal, bigint, string, etc. */
function weiToEtn(wei: any): number {
  if (wei == null) return 0;
  const s = (wei as any).toString?.() ?? String(wei);
  return Number(s) / 1e18;
}

/** Sanitize strings for PATCH body. */
function safeStr(u?: any): string | null {
  if (u == null) return null;
  const s = String(u).trim();
  return s || null;
}

/** Ensure URLs are https:// prefixed. */
function normalizeUrl(u?: string | null): string | null {
  if (!u) return null;
  const s = u.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

/** Lazy provider (used for on-chain owner sampling when ownersCount is 0). */
function getProvider(): ethers.AbstractProvider | null {
  const url = process.env.RPC_URL;
  try {
    return url ? new ethers.JsonRpcProvider(url) : null;
  } catch {
    return null;
  }
}

/** Minimal ABI for ERC721.ownerOf. */
const ERC721_ABI_MIN = [
  "function ownerOf(uint256 tokenId) view returns (address)",
];

/**
 * Sample owners from chain for up to `tokenIds.length` tokens (bounded by concurrency).
 * Returns number of unique non-zero owners discovered.
 */
async function getErc721OwnersOnChain(
  provider: ethers.AbstractProvider | null,
  contract: string,
  tokenIds: string[],
  concurrency = 12
): Promise<number> {
  if (!provider) return 0;
  const c = new ethers.Contract(contract, ERC721_ABI_MIN, provider);
  const owners = new Set<string>();
  let i = 0;
  async function worker() {
    while (i < tokenIds.length) {
      const idx = i++;
      try {
        const owner: string = await c.ownerOf(tokenIds[idx]);
        if (owner && owner !== ethers.ZeroAddress)
          owners.add(owner.toLowerCase());
      } catch {
        // ignore burned/nonexistent
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, tokenIds.length) },
      () => worker()
    )
  );
  return owners.size;
}

/**
 * Build a "header" blob for the collection: stable fields + fresh counters.
 * Also computes listing/auction live counts with proper time gates.
 */
async function buildHeader(contractLookup: string) {
  const collection = await prisma.collection.findFirst({
    where: { contract: { equals: contractLookup, mode: "insensitive" } },
    select: {
      id: true,
      name: true,
      description: true,
      contract: true,
      logoUrl: true,
      coverUrl: true,
      website: true,
      instagram: true,
      x: true,
      discord: true,
      telegram: true,
      floorPrice: true,
      volume: true,
      supply: true,
      ownersCount: true,
      standard: true,
      itemsCount: true,
      ownerAddress: true,
      creator: {
        select: {
          walletAddress: true,
          username: true,
          profileAvatar: true,
        },
      },
    },
  });
  if (!collection) return null;

  const contract = collection.contract;

  // live item count (fresh)
  const itemsCount = await prisma.nFT.count({
    where: { contract, status: NftStatus.SUCCESS },
  });

  // live listing/auction counters (time-gated)
  const now = new Date();
  const [listingActiveCount, auctionActiveCount] = await Promise.all([
    prisma.marketplaceListing.count({
      where: {
        status: ListingStatus.ACTIVE,
        nft: { contract },
        startTime: { lte: now },
        OR: [{ endTime: null }, { endTime: { gt: now } }],
      },
    }),
    prisma.auction.count({
      where: {
        status: AuctionStatus.ACTIVE,
        nft: { contract },
        startTime: { lte: now },
        endTime: { gt: now },
      },
    }),
  ]);

  // owners fallback (if not set yet, try to resolve)
  let ownersResolved = collection.ownersCount ?? 0;
  if (!ownersResolved || ownersResolved <= 0) {
    const provider = getProvider();
    if ((collection.standard || "").toUpperCase() === "ERC1155") {
      const holds = await prisma.erc1155Holding.groupBy({
        by: ["ownerAddress"],
        where: {
          contract: { equals: contract, mode: "insensitive" },
          balance: { gt: 0 },
        },
      });
      ownersResolved = holds.length;
    } else {
      const maxSample = Math.min(500, Math.max(itemsCount, 0));
      if (maxSample > 0) {
        const tokenRows = await prisma.nFT.findMany({
          where: {
            contract: { equals: contract, mode: "insensitive" },
            status: NftStatus.SUCCESS,
          },
          select: { tokenId: true },
          orderBy: { id: "asc" },
          take: maxSample,
        });
        const tokenIds = tokenRows.map((t) => t.tokenId);
        ownersResolved = await getErc721OwnersOnChain(
          provider,
          contract,
          tokenIds
        );
      } else {
        ownersResolved = 0;
      }
    }
  }

  // rarity population
  let rarityPopulation = 0;
  try {
    const popRows = await prisma.$queryRawUnsafe<{ cnt: bigint }[]>(
      `SELECT COUNT(*)::bigint AS cnt
       FROM "NFTRarity" r
       WHERE lower(r.contract) = lower($1) AND r.rank IS NOT NULL`,
      contract
    );
    rarityPopulation = Number(popRows?.[0]?.cnt ?? 0);
  } catch {
    rarityPopulation = 0;
  }

  return {
    ...collection,
    itemsCount,
    ownersCount: ownersResolved,
    listingActiveCount,
    auctionActiveCount,
    rarityEnabled: rarityPopulation > 0,
    rarityPopulation,
  };
}

/* =============================================================================
   Trait filter parsing (API shape: trait[TYPE]=VALUE or traits="Type:Value|…")
   ========================================================================== */

type TraitSelections = Record<string, string[]>;

/** Parse trait selections from URLSearchParams into a normalized map. */
function parseTraitSelections(url: URL): TraitSelections {
  const pick: TraitSelections = {};

  // expanded form: trait[Background]=Blue
  for (const [key, value] of url.searchParams.entries()) {
    const m = key.match(/^trait\[(.+)\]$/i);
    if (m && value != null) {
      const type = m[1].trim();
      if (!pick[type]) pick[type] = [];
      pick[type].push(value);
    }
  }

  // compact form: traits=Background:Blue|Hat:Cap
  const compact = url.searchParams.get("traits");
  if (compact) {
    const parts = compact
      .split("|")
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const idx = part.indexOf(":");
      if (idx <= 0) continue;
      const type = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      if (!type || !value) continue;
      if (!pick[type]) pick[type] = [];
      pick[type].push(value);
    }
  }

  // dedupe values per type
  for (const k of Object.keys(pick)) {
    pick[k] = Array.from(new Set(pick[k]));
  }
  return pick;
}

/**
 * Build a raw SQL WHERE fragment that checks the attributes JSONB array for
 * the selected trait types/values.
 */
function buildTraitsWhereSql(
  alias: string,
  selections: TraitSelections,
  params: any[]
): string {
  const types = Object.keys(selections);
  if (types.length === 0) return "";

  const clauses: string[] = [];
  for (const t of types) {
    const values = selections[t];
    if (!values || values.length === 0) continue;
    params.push(t);
    params.push(values);
    const typeIdx = params.length - 1;
    const valsIdx = params.length;
    clauses.push(`
      EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(${alias}.attributes, '[]'::jsonb)) AS att
        WHERE att->>'trait_type' = $${typeIdx}
          AND att->>'value' = ANY($${valsIdx}::text[])
      )
    `);
  }
  if (clauses.length === 0) return "";
  return ` AND ${clauses.join(" AND ")} `;
}

/* =============================================================================
   GET /api/collections/[contract]
   - Header & list NFTs with optional filters/sorts
   - Two paths:
     • RAW SQL path: rarity + traits (and optional price sort)
     • "Light" Prisma path: simpler listing without rarity/traits
   ========================================================================== */

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ contract: string }> } // keep your Promise signature
) {
  await prismaReady;
  const { contract: rawParam } = await context.params;

  const url = new URL(req.url);
  const headerOnly = url.searchParams.get("header") != null;
  const limit = Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10));

  const search = url.searchParams.get("search")?.trim() || undefined;
  const listedFlag = url.searchParams.get("listed") === "true";
  const auctionedFlag = url.searchParams.get("auctioned") === "true";
  const priceSort = url.searchParams.get("sort") as
    | "lowToHigh"
    | "highToLow"
    | undefined;
  const cursor = url.searchParams.get("cursor") || undefined;

  const raritySort = (url.searchParams.get("raritySort") || "").toLowerCase() as
    | "asc"
    | "desc"
    | "";
  const rankMinRaw = url.searchParams.get("rankMin");
  const rankMaxRaw = url.searchParams.get("rankMax");
  const includeUnranked = url.searchParams.get("includeUnranked") !== "false"; // default true
  const traitSelections = parseTraitSelections(url);

  // If any rarity/trait constraint is present, we go through the RAW SQL path.
  const needsSqlPath =
    !!raritySort ||
    !!rankMinRaw ||
    !!rankMaxRaw ||
    includeUnranked === false ||
    Object.keys(traitSelections).length > 0 ||
    (!!priceSort && Object.keys(traitSelections).length > 0);

  try {
    const header = await buildHeader(rawParam);
    if (!header) return NextResponse.json("Not found", { status: 404 });
    const contract = header.contract;

    if (headerOnly) return NextResponse.json(header);

    /* -----------------------------------------------------------------------
       RAW SQL PATH (rarity/traits, with optional price sort)
       --------------------------------------------------------------------- */
    if (needsSqlPath) {
      const params: any[] = [];

      // Anchor by contract & SUCCESS status
      params.push(contract);
      let whereSql = ` WHERE n.contract = $1 AND n.status = '${NftStatus.SUCCESS}' `;

      // Search by name or tokenId
      if (search) {
        params.push(`%${search}%`, `%${search}%`);
        const i = params.length;
        whereSql += ` AND (n.name ILIKE $${i - 1} OR n."tokenId" ILIKE $${i}) `;
      }

      // Time gates & status strings
      const listedStr = ListingStatus.ACTIVE;
      const auctionStr = AuctionStatus.ACTIVE;
      const timeGateSql = `ml."startTime" <= NOW() AND (ml."endTime" IS NULL OR ml."endTime" > NOW())`;
      const timeGateAuctionSql = `a."startTime" <= NOW() AND a."endTime" > NOW()`;

      // Listed / auctioned filters (use EXISTS with time gates)
      if (listedFlag && auctionedFlag) {
        whereSql += `
          AND (
            EXISTS (
              SELECT 1 FROM "MarketplaceListing" ml
              WHERE ml."nftId" = n.id
                AND ml.status = '${listedStr}'
                AND ${timeGateSql}
            )
            OR
            EXISTS (
              SELECT 1 FROM "Auction" a
              WHERE a."nftId" = n.id
                AND a.status = '${auctionStr}'
                AND ${timeGateAuctionSql}
            )
          )
        `;
      } else if (listedFlag) {
        whereSql += `
          AND EXISTS (
            SELECT 1 FROM "MarketplaceListing" ml
            WHERE ml."nftId" = n.id
              AND ml.status = '${listedStr}'
              AND ${timeGateSql}
          )
        `;
      } else if (auctionedFlag) {
        whereSql += `
          AND EXISTS (
            SELECT 1 FROM "Auction" a
            WHERE a."nftId" = n.id
              AND a.status = '${auctionStr}'
              AND ${timeGateAuctionSql}
          )
        `;
      }

      // Trait filters (JSONB attributes)
      whereSql += buildTraitsWhereSql("n", traitSelections, params);

      // Rarity range + ordering toggles
      const hasRankMin = rankMinRaw != null && rankMinRaw !== "";
      const hasRankMax = rankMaxRaw != null && rankMaxRaw !== "";
      let rankMin: number | null = null;
      let rankMax: number | null = null;
      if (hasRankMin) rankMin = Math.max(1, parseInt(rankMinRaw as string, 10) || 1);
      if (hasRankMax) rankMax = Math.max(1, parseInt(rankMaxRaw as string, 10) || 1);
      if (rankMin && rankMax && rankMin > rankMax) [rankMin, rankMax] = [rankMax, rankMin];

      const usingRarityOrder =
        !!raritySort || hasRankMin || hasRankMax || includeUnranked === false;

      const maxInt = 2147483647;
      const bigNum =
        "99999999999999999999999999999999999999999999999999";

      /**
       * Subselects that find the lowest active listing for:
       *  - Native ETN: currencyId IS NULL OR currency.kind = 'NATIVE'
       *  - ERC-20:      currency.kind = 'ERC20'
       *
       * NOTE: When comparing to the Postgres enum, we **cast** the string
       *       to `"CurrencyKind"` to satisfy Postgres' enum semantics.
       */
      const lowestEtnExpr = `
        (
          SELECT ml."priceEtnWei"::numeric
          FROM "MarketplaceListing" ml
          LEFT JOIN "Currency" c ON c.id = ml."currencyId"
          WHERE ml."nftId" = n.id
            AND ml.status = '${listedStr}'
            AND ${timeGateSql}
            AND (ml."currencyId" IS NULL OR c.kind = 'NATIVE'::"CurrencyKind")
            AND ml."priceEtnWei" IS NOT NULL
          ORDER BY ml."priceEtnWei"::numeric ASC
          LIMIT 1
        )
      `;

      const lowestTokenAmtExpr = `
        (
          SELECT ml."priceTokenAmount"::numeric
          FROM "MarketplaceListing" ml
          JOIN "Currency" c ON c.id = ml."currencyId"
          WHERE ml."nftId" = n.id
            AND ml.status = '${listedStr}'
            AND ${timeGateSql}
            AND c.kind = 'ERC20'::"CurrencyKind"
            AND ml."priceTokenAmount" IS NOT NULL
          ORDER BY ml."priceTokenAmount"::numeric ASC
          LIMIT 1
        )
      `;

      const lowestTokenSymbolExpr = `
        (
          SELECT c.symbol
          FROM "MarketplaceListing" ml
          JOIN "Currency" c ON c.id = ml."currencyId"
          WHERE ml."nftId" = n.id
            AND ml.status = '${listedStr}'
            AND ${timeGateSql}
            AND c.kind = 'ERC20'::"CurrencyKind"
            AND ml."priceTokenAmount" IS NOT NULL
          ORDER BY ml."priceTokenAmount"::numeric ASC
          LIMIT 1
        )
      `;

      const lowestTokenDecimalsExpr = `
        (
          SELECT c.decimals
          FROM "MarketplaceListing" ml
          JOIN "Currency" c ON c.id = ml."currencyId"
          WHERE ml."nftId" = n.id
            AND ml.status = '${listedStr}'
            AND ${timeGateSql}
            AND c.kind = 'ERC20'::"CurrencyKind"
            AND ml."priceTokenAmount" IS NOT NULL
          ORDER BY ml."priceTokenAmount"::numeric ASC
          LIMIT 1
        )
      `;

      // Primary ORDER BY key: keep your original policy:
      // - If price sort is requested, we only consider native ETN prices.
      // - Else when using rarity order, order by rank asc/desc.
      // - Else default to createdAt (newest last).
      let keyExprNumeric = "";
      if (priceSort === "lowToHigh") {
        keyExprNumeric = `COALESCE(${lowestEtnExpr}, ${bigNum}::numeric)`;
      } else if (priceSort === "highToLow") {
        keyExprNumeric = `CASE WHEN ${lowestEtnExpr} IS NULL THEN ${bigNum}::numeric ELSE (${bigNum}::numeric - ${lowestEtnExpr}) END`;
      } else if (usingRarityOrder) {
        const keyAsc = `COALESCE(r.rank, ${maxInt})`;
        const keyDesc = `CASE WHEN r.rank IS NULL THEN ${maxInt} ELSE ${maxInt} - r.rank END`;
        keyExprNumeric = raritySort === "desc" ? keyDesc : keyAsc;
      } else {
        keyExprNumeric = `EXTRACT(EPOCH FROM n."createdAt")::numeric`;
      }

      const forceRanked = includeUnranked === false;

      // Build rarity range filter fragments (with positional params)
      let rarityRangeSql = "";
      if (hasRankMin || hasRankMax) {
        rarityRangeSql += " AND (1=1 ";
        if (hasRankMin) {
          params.push(rankMin!);
          rarityRangeSql += ` AND r.rank >= $${params.length} `;
        }
        if (hasRankMax) {
          params.push(rankMax!);
          rarityRangeSql += ` AND r.rank <= $${params.length} `;
        }
        rarityRangeSql += ")";
      }

      // Base query with rarity join + cheapest native/token subselects
      const sql = `
        WITH pop AS (
          SELECT COUNT(*)::int AS population
          FROM "NFTRarity" r2
          WHERE lower(r2.contract) = lower($1) AND r2.rank IS NOT NULL
        ),
        base AS (
          SELECT
            n.id,
            n."tokenId",
            n.name,
            n."imageUrl",
            n.description,
            n.traits,
            n.attributes,
            n."tokenUri",
            n.contract,
            n.standard,
            n."royaltyBps",
            n."royaltyRecipient",
            n."collectionId",
            n."createdAt",
            n."updatedAt",
            r.score        AS "rarityScore",
            r.rank         AS "rarityRank",
            (SELECT population FROM pop) AS "population",
            ${lowestEtnExpr}           AS "lowestEtnWei",
            ${lowestTokenAmtExpr}      AS "lowestTokenAmt",
            ${lowestTokenSymbolExpr}   AS "lowestTokenSymbol",
            ${lowestTokenDecimalsExpr} AS "lowestTokenDecimals",
            EXISTS (
              SELECT 1 FROM "Auction" a
              WHERE a."nftId" = n.id
                AND a.status = '${auctionStr}'
                AND ${timeGateAuctionSql}
            ) AS "hasAuction",
            -- numeric ordering key
            (${keyExprNumeric})::numeric AS key1_num,
            -- safe tie-breaker
            n.id::text AS id_text
          FROM "NFT" n
          LEFT JOIN "NFTRarity" r
            ON r.contract = n.contract AND r."tokenId" = n."tokenId"
          ${whereSql}
          ${forceRanked ? " AND r.rank IS NOT NULL " : ""}
          ${rarityRangeSql}
        )
        SELECT *
        FROM base
        WHERE 1=1
        /* cursor filter goes here */
        ORDER BY key1_num ASC, id_text ASC
        LIMIT ${limit}
      `;

      // Cursor support: compound key (key1_num, id_text)
      let cursorFilter = "";
      if (cursor) {
        try {
          const decoded = JSON.parse(
            Buffer.from(cursor, "base64").toString("utf8")
          ) as { k?: string | number; id?: string | number };
          const kParam = String(decoded.k ?? "");
          const idParam = String(decoded.id ?? "");
          if (kParam && idParam) {
            params.push(kParam);
            params.push(idParam);
            const kIndex = params.length - 1;
            const idIndex = params.length;
            cursorFilter = `
              AND (
                (key1_num > $${kIndex}::numeric) OR
                (key1_num = $${kIndex}::numeric AND id_text > $${idIndex}::text)
              )
            `;
          }
        } catch {
          // ignore bad cursor
        }
      }

      // Inject the cursor filter
      const finalSql = sql.replace("/* cursor filter goes here */", cursorFilter);

      const rows = (await prisma.$queryRawUnsafe<any[]>(
        finalSql,
        ...params
      )) ?? [];

      // Shape API items: prefer ETN if available; otherwise cheapest ERC20
      const nfts = rows.map((n) => {
        let listingPrice: number | undefined;
        let listingCurrencySymbol: string | undefined;
        let listingPriceWei: string | undefined;

        if (n.lowestEtnWei != null) {
          listingPrice = weiToEtn(n.lowestEtnWei);
          listingCurrencySymbol = "ETN";
          listingPriceWei = String(n.lowestEtnWei);
        } else if (n.lowestTokenAmt != null) {
          const dec = Number(n.lowestTokenDecimals ?? 18);
          listingPrice = Number(n.lowestTokenAmt) / 10 ** dec;
          listingCurrencySymbol = n.lowestTokenSymbol || "ERC20";
          listingPriceWei = String(n.lowestTokenAmt);
        }

        return {
          id: n.id,
          tokenId: n.tokenId,
          name: n.name ?? undefined,
          imageUrl: n.imageUrl ?? undefined,
          description: n.description ?? undefined,
          traits: n.traits ?? undefined,
          attributes: n.attributes ?? undefined,
          tokenUri: n.tokenUri ?? undefined,
          contract: n.contract,
          standard: n.standard ?? undefined,
          royaltyBps: n.royaltyBps ?? undefined,
          royaltyRecipient: n.royaltyRecipient ?? undefined,
          collectionId: n.collectionId ?? undefined,

          isListed: listingPrice != null,
          listingPrice,
          listingPriceWei,
          listingCurrencySymbol,

          isAuctioned: !!n.hasAuction,

          createdAt: new Date(n.createdAt).toISOString(),
          updatedAt: new Date(n.updatedAt).toISOString(),

          rarityScore: n.rarityScore ?? undefined,
          rarityRank: n.rarityRank ?? undefined,
          population: n.population ?? undefined,
        };
      });

      // Next cursor
      const last = rows[rows.length - 1];
      const nextCursor =
        rows.length === limit && last
          ? Buffer.from(
              JSON.stringify({
                k: last.key1_num != null ? String(last.key1_num) : "0",
                id: last.id_text != null ? String(last.id_text) : "",
              }),
              "utf8"
            ).toString("base64")
          : null;

      return NextResponse.json({
        ...header,
        nfts,
        nextCursor,
      });
    }

    /* -----------------------------------------------------------------------
       LIGHT PRISMA PATH (no rarity/traits)
       - Still handles ETN native (NULL or Currency.kind='NATIVE') & ERC-20.
       --------------------------------------------------------------------- */

    const now = new Date();
    const where: any = { contract: header.contract, status: NftStatus.SUCCESS };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { tokenId: { contains: search } },
      ];
    }

    const listedRelFilter = {
      some: {
        status: ListingStatus.ACTIVE,
        startTime: { lte: now },
        OR: [{ endTime: null }, { endTime: { gt: now } }],
      },
    } as const;

    const auctionRelFilter = {
      some: {
        status: AuctionStatus.ACTIVE,
        startTime: { lte: now },
        endTime: { gt: now },
      },
    } as const;

    if (listedFlag && auctionedFlag) {
      where.OR = [
        ...(where.OR ?? []),
        { listingEntries: listedRelFilter.some },
        { auctionEntries: auctionRelFilter.some },
      ];
    } else if (listedFlag) {
      where.listingEntries = listedRelFilter;
    } else if (auctionedFlag) {
      where.auctionEntries = auctionRelFilter;
    }

    const orderBy = { id: "asc" } as const;

    const raw = await prisma.nFT.findMany({
      where,
      orderBy,
      take: limit,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tokenId: true,
        name: true,
        imageUrl: true,
        description: true,
        traits: true,
        attributes: true,
        tokenUri: true,
        contract: true,
        standard: true,
        royaltyBps: true,
        royaltyRecipient: true,
        collectionId: true,
        createdAt: true,
        updatedAt: true,
        listingEntries: {
          where: {
            status: ListingStatus.ACTIVE,
            startTime: { lte: now },
            OR: [{ endTime: null }, { endTime: { gt: now } }],
          },
          // We'll compute cheapest ETN and token locally.
          orderBy: [{ priceEtnWei: "asc" }, { priceTokenAmount: "asc" }],
          take: 50,
          select: {
            priceEtnWei: true,
            priceTokenAmount: true,
            currency: { select: { symbol: true, decimals: true, kind: true } }, // 👈 include kind
          },
        },
        auctionEntries: {
          where: {
            status: AuctionStatus.ACTIVE,
            startTime: { lte: now },
            endTime: { gt: now },
          },
          select: { id: true, status: true },
          take: 1,
        },
      },
    });

    const nfts = raw.map((n) => {
      // Classify "native" ETN listings:
      //   - currency == null  OR  currency.kind === 'NATIVE'
      // Classify ERC-20 listings:
      //   - currency.kind === 'ERC20'
      const natives = n.listingEntries.filter(
        (le) =>
          (!le.currency || le.currency.kind === "NATIVE") &&
          le.priceEtnWei != null
      );
      const tokens = n.listingEntries.filter(
        (le) =>
          le.currency &&
          le.currency.kind === "ERC20" &&
          le.priceTokenAmount != null
      );

      let listingPrice: number | undefined;
      let listingCurrencySymbol: string | undefined;
      let listingPriceWei: string | undefined;

      if (natives.length > 0) {
        // Already ordered by priceEtnWei asc
        const cheapest = natives[0]!;
        listingPrice = weiToEtn(cheapest.priceEtnWei as any);
        listingCurrencySymbol = "ETN";
        listingPriceWei =
          (cheapest.priceEtnWei as any)?.toString?.() ??
          String(cheapest.priceEtnWei);
      } else if (tokens.length > 0) {
        const cheapest = tokens.sort(
          (a, b) => Number(a.priceTokenAmount) - Number(b.priceTokenAmount)
        )[0]!;
        const dec = Number(cheapest.currency?.decimals ?? 18);
        listingPrice = Number(cheapest.priceTokenAmount) / 10 ** dec;
        listingCurrencySymbol = cheapest.currency?.symbol || "ERC20";
        listingPriceWei =
          (cheapest.priceTokenAmount as any)?.toString?.() ??
          String(cheapest.priceTokenAmount);
      }

      return {
        id: n.id,
        tokenId: n.tokenId,
        name: n.name ?? undefined,
        imageUrl: n.imageUrl ?? undefined,
        description: n.description ?? undefined,
        traits: n.traits ?? undefined,
        attributes: n.attributes ?? undefined,
        tokenUri: n.tokenUri ?? undefined,
        contract: n.contract,
        standard: n.standard ?? undefined,
        royaltyBps: n.royaltyBps ?? undefined,
        royaltyRecipient: n.royaltyRecipient ?? undefined,
        collectionId: n.collectionId ?? undefined,

        isListed: listingPrice != null,
        listingPrice,
        listingPriceWei,
        listingCurrencySymbol,

        isAuctioned: n.auctionEntries.length > 0,

        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      };
    });

    // Client-side price sorting (if requested and we’re in the light path)
    if (priceSort === "lowToHigh") {
      nfts.sort(
        (a, b) => (a.listingPrice ?? Infinity) - (b.listingPrice ?? Infinity)
      );
    } else if (priceSort === "highToLow") {
      nfts.sort(
        (a, b) => (b.listingPrice ?? -Infinity) - (a.listingPrice ?? -Infinity)
      );
    }

    const nextCursor = raw.length === limit ? raw[raw.length - 1].id : null;

    return NextResponse.json({
      ...header,
      nfts,
      nextCursor,
    });
  } catch (err) {
    console.error("[GET /api/collections/[contract]]", err);
    return new NextResponse("Server error", { status: 500 });
  }
}

/* =============================================================================
   PATCH /api/collections/[contract]
   - Update a subset of collection metadata (owner-protected)
   ========================================================================== */

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ contract: string }> }
) {
  await prismaReady;
  const { contract: rawParam } = await context.params;

  try {
    const col = await prisma.collection.findFirst({
      where: { contract: { equals: rawParam, mode: "insensitive" } },
      select: { id: true, contract: true, ownerAddress: true },
    });
    if (!col) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const ownerHeader = req.headers.get("x-owner-wallet");
    if (!ownerHeader) {
      return NextResponse.json({ error: "Missing x-owner-wallet" }, { status: 401 });
    }
    if (col.ownerAddress.toLowerCase() !== ownerHeader.toLowerCase()) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const data: Prisma.CollectionUpdateInput = {};
    if ("description" in body) data.description = safeStr(body.description);
    if ("website" in body) data.website = normalizeUrl(safeStr(body.website));
    if ("x" in body) data.x = normalizeUrl(safeStr(body.x));
    if ("instagram" in body) data.instagram = normalizeUrl(safeStr(body.instagram));
    if ("telegram" in body) data.telegram = normalizeUrl(safeStr(body.telegram));
    if ("discord" in body) data.discord = normalizeUrl(safeStr(body.discord));
    if ("logoUrl" in body) data.logoUrl = safeStr(body.logoUrl);
    if ("coverUrl" in body) data.coverUrl = safeStr(body.coverUrl);

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No updatable fields provided" }, { status: 400 });
    }

    await prisma.collection.update({
      where: { id: col.id },
      data,
    });

    const header = await buildHeader(col.contract);
    return NextResponse.json({ success: true, data: header });
  } catch (err: any) {
    console.error("[PATCH /api/collections/[contract]]", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
