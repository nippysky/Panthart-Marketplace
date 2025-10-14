// app/api/nft/[contract]/[tokenId]/activities/route.ts
export const revalidate = 0;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/* ---------- helpers ---------- */
const ETN_DECIMALS = 18;

const toTitle = (s: string) =>
  s ? s.slice(0, 1).toUpperCase() + s.slice(1).toLowerCase() : s;

const ZERO_TX = (id: string) => `app-${id}`;
const isRealHash = (h?: string) => /^0x[0-9a-fA-F]{64}$/.test(String(h || ""));

function canonType(input: string): string {
  const t = input?.toUpperCase?.() || "";
  switch (t) {
    case "LISTED":
    case "LISTING":
      return "LISTING";
    case "AUCTION_STARTED":
    case "AUCTION":
      return "AUCTION";
    case "CANCELLED_LISTING":
    case "UNLISTING":
      return "UNLISTING";
    case "CANCELLED_AUCTION":
      return "CANCELLED_AUCTION";
    case "SALE":
      return "SALE";
    case "TRANSFER":
      return "TRANSFER";
    case "BID":
      return "BID";
    case "MINT":
      return "MINT";
    default:
      return t || "TRANSFER";
  }
}

function decimalStrToFloat(decStr: string, decimals: number) {
  try {
    const n = BigInt(decStr);
    const base = 10n ** BigInt(decimals);
    const whole = Number(n / base);
    const frac = Number(n % base) / Number(base);
    return +(whole + frac).toFixed(6);
  } catch {
    return NaN;
  }
}

type CurrencyMeta = { symbol: string; decimals: number };

/**
 * Price resolver for NFTActivity rows.
 * Priority:
 *   1) priceEtnWei (native ETN)
 *   2) rawData.currencyId + rawData.priceTokenAmount   (new server shape)
 *   3) rawData.currencyAddress + rawData.amountWei     (legacy shape)
 */
function priceFromActivityRow(
  row: any,
  currenciesByAddr: Map<string, CurrencyMeta>,
  currenciesById: Map<string, CurrencyMeta>
) {
  // Native
  if (row.priceEtnWei != null) {
    const wei =
      typeof row.priceEtnWei === "string" ? row.priceEtnWei : String(row.priceEtnWei);
    return { amount: decimalStrToFloat(wei, ETN_DECIMALS), symbol: "ETN" as const };
  }

  const raw = (row.rawData ?? {}) as any;

  // New (ID-based) shape
  if (raw?.currencyId && raw?.priceTokenAmount != null) {
    const meta = currenciesById.get(String(raw.currencyId));
    if (meta) {
      return {
        amount: decimalStrToFloat(String(raw.priceTokenAmount), meta.decimals),
        symbol: meta.symbol,
      };
    }
  }

  // Legacy (address-based) shape
  if (raw?.currencyAddress && raw?.amountWei != null) {
    const addr = String(raw.currencyAddress).toLowerCase();
    const meta = currenciesByAddr.get(addr);
    if (meta) {
      return {
        amount: decimalStrToFloat(String(raw.amountWei), meta.decimals),
        symbol: meta.symbol,
      };
    }
  }

  return { amount: null as number | null, symbol: null as string | null };
}

/* ---------- GET ---------- */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ contract: string; tokenId: string }> }
) {
  await prismaReady;

  const { contract, tokenId } = await context.params;
  if (!contract || !tokenId) {
    return NextResponse.json(
      { error: "Missing contract or tokenId" },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.max(
    1,
    Math.min(100, parseInt(url.searchParams.get("limit") ?? "20", 10))
  );

  try {
    const nft = await prisma.nFT.findFirst({
      where: { contract: { equals: contract, mode: "insensitive" }, tokenId },
      select: { id: true },
    });
    if (!nft)
      return NextResponse.json([], { headers: { "Cache-Control": "no-store" } });

    // Load currencies (id + tokenAddress)
    const allCurrencies = await prisma.currency.findMany({
      select: { id: true, tokenAddress: true, symbol: true, decimals: true, active: true },
    });

    const currenciesByAddr = new Map<string, CurrencyMeta>();
    const currenciesById = new Map<string, CurrencyMeta>();

    for (const c of allCurrencies) {
      const meta = { symbol: c.symbol, decimals: c.decimals ?? 18 };
      if (c.tokenAddress)
        currenciesByAddr.set(String(c.tokenAddress).toLowerCase(), meta);
      currenciesById.set(c.id, meta);
    }

    // Activities (client + server created)
    const actRows = await prisma.nFTActivity.findMany({
      where: {
        contract: { equals: contract, mode: "insensitive" },
        tokenId,
      },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        type: true,
        fromAddress: true,
        toAddress: true,
        priceEtnWei: true,
        txHash: true,
        logIndex: true,
        blockNumber: true,
        timestamp: true,
        marketplace: true,
        rawData: true,
      },
    });

    // Confirmed sales (canonical source of truth for sales)
    const saleRows = await prisma.marketplaceSale.findMany({
      where: { nftId: nft.id },
      orderBy: [{ timestamp: "desc" }, { id: "desc" }],
      take: limit,
      select: {
        id: true,
        buyerAddress: true,
        sellerAddress: true,
        priceEtnWei: true,
        priceTokenAmount: true,
        currencyId: true,
        timestamp: true,
        txHash: true,
        logIndex: true,
        blockNumber: true,
      },
    });

    type UiRow = {
      id: string;
      type: string;
      fromAddress: string | null;
      toAddress: string | null;
      price: number | null;
      currencySymbol?: string | null;
      timestamp: string;
      txHash: string; // blank string means: do not render a link
      marketplace?: string | null;
    };

    /* ---- 1) Map confirmed sales (token-first) ---- */
    const mappedSales: UiRow[] = saleRows.map((s) => {
      let amount: number | null = null;
      let symbol: string | null = null;

      // If token price is present, prefer it over ETN
      if (s.priceTokenAmount != null && s.currencyId) {
        const weiStr = (s.priceTokenAmount as any).toString();
        const meta = currenciesById.get(s.currencyId);
        const dec = meta?.decimals ?? 18;
        amount = decimalStrToFloat(weiStr, dec);
        symbol = meta?.symbol ?? null;
      } else if (s.priceEtnWei != null) {
        const weiStr = (s.priceEtnWei as any).toString();
        amount = decimalStrToFloat(weiStr, ETN_DECIMALS);
        symbol = "ETN";
      }

      return {
        id: `sale-${s.id}`,
        type: "Sale",
        fromAddress: s.sellerAddress,
        toAddress: s.buyerAddress,
        price: amount,
        currencySymbol: symbol,
        timestamp: s.timestamp.toISOString(),
        txHash: isRealHash(s.txHash) ? s.txHash : "", // should be real, but guard anyway
        marketplace: "Panthart",
      };
    });

    // Build a quick lookup for sale tx hashes to suppress same-tx transfers
    const saleHashSet = new Set<string>(
      mappedSales.map((r) => (isRealHash(r.txHash) ? r.txHash : "")).filter(Boolean)
    );

    /* ---- 2) Map activity rows (and suppress noise) ---- */
    const mappedActs: UiRow[] = actRows
      .map((r) => {
        const priceMeta = priceFromActivityRow(r, currenciesByAddr, currenciesById);

        // Normalize some labels for UI
        let uiType = r.type?.toUpperCase?.() || "";
        let via: string | null = r.marketplace ?? null;
        if (uiType === "AUCTION") {
          uiType = "LISTING";
          via = "Auction";
        } else if (uiType === "CANCELLED_AUCTION") {
          uiType = "UNLISTING";
          via = "Auction";
        }

        // Only treat as "real" if it's a full hash
        const tx = isRealHash(r.txHash) ? r.txHash : "";

        return {
          id: `act-${r.id}`,
          type: toTitle(uiType),
          fromAddress: r.fromAddress,
          toAddress: r.toAddress,
          price: priceMeta.amount,
          currencySymbol: priceMeta.symbol,
          timestamp: r.timestamp.toISOString(),
          txHash: tx,
          marketplace: via,
        };
      })
      .filter((row) => {
        // 2a) Drop synthetic Sale rows (we keep canonical sale list only)
        if (row.type === "Sale" && !isRealHash(row.txHash)) return false;
        // 2b) Suppress Transfer rows that share a tx with a Sale (the Sale card is the one we want)
        if (row.type === "Transfer" && isRealHash(row.txHash) && saleHashSet.has(row.txHash)) {
          return false;
        }
        return true;
      });

    /* ---- 3) Merge, de-dupe, and sort ---- */
    const rawMerged = [...mappedActs, ...mappedSales];

    const seen = new Set<string>();
    const deduped: UiRow[] = [];
    for (const row of rawMerged) {
      // Prefer a real tx hash when present; otherwise fall back to a composite fingerprint.
      const key = isRealHash(row.txHash)
        ? `${row.type}|${row.txHash}`
        : `${row.type}|${row.timestamp}|${row.fromAddress}|${row.toAddress}|${row.price ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(row);
    }

    deduped.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return NextResponse.json(deduped.slice(0, limit), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[api/nft/activities] error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/* ---------- POST: log an app-side activity row ----------
   Accepts either:
     - Native: { priceWei: string } and NO currencyId/currencyAddress
     - Token by ADDRESS (legacy): { currencyAddress, currencySymbol?, priceWei }
     - Token by ID (preferred): { currencyId, priceTokenAmount }
*/
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ contract: string; tokenId: string }> }
) {
  await prismaReady;

  const { contract, tokenId } = await context.params;
  if (!contract || !tokenId) {
    return NextResponse.json({ error: "Missing contract or tokenId" }, { status: 400 });
  }

  try {
    const body = await req.json();

    const type = canonType(body?.type);
    const fromAddress: string | null = body?.fromAddress ?? null;
    const toAddress: string | null = body?.toAddress ?? null;

    // Native or legacy token (address) amount field
    const priceWeiStr: string | null = body?.priceWei ?? null;

    // Token by address (legacy)
    const currencyAddress: string | null = body?.currencyAddress ?? null;
    const currencySymbol: string | null = body?.currencySymbol ?? null;

    // Token by ID (preferred new shape)
    const currencyId: string | null = body?.currencyId ?? null;
    const priceTokenAmount: string | null = body?.priceTokenAmount ?? null;

    const txHash: string = body?.txHash || ZERO_TX(crypto.randomUUID());
    const logIndex: number = Number.isFinite(body?.logIndex) ? Number(body.logIndex) : 0;
    const blockNumber: number = Number.isFinite(body?.blockNumber) ? Number(body.blockNumber) : 0;
    const marketplace: string | null = body?.marketplace ?? "Panthart";
    const timestamp = body?.timestampISO ? new Date(body.timestampISO) : new Date();

    const nft = await prisma.nFT.findFirst({
      where: { contract: { equals: contract, mode: "insensitive" }, tokenId },
      select: { id: true },
    });
    if (!nft) return NextResponse.json({ error: "NFT not found" }, { status: 404 });

    // Decide how to store price:
    // - If currencyId present: token price by id (preferred) -> rawData { currencyId, priceTokenAmount }
    // - Else if currencyAddress present: legacy token by address -> rawData { currencyAddress, ...amountWei }
    // - Else: native ETN -> priceEtnWei
    const isTokenById = Boolean(currencyId && priceTokenAmount != null);
    const isTokenByAddr = !isTokenById && Boolean(currencyAddress && priceWeiStr != null);
    const isNative = !isTokenById && !isTokenByAddr;

    const data = {
      nft: { connect: { id: nft.id } },
      contract,
      tokenId,
      type,
      fromAddress: fromAddress ?? "",
      toAddress: toAddress ?? "",
      priceEtnWei: isNative ? priceWeiStr ?? null : null,
      txHash,
      logIndex,
      blockNumber,
      timestamp,
      marketplace: marketplace ?? undefined,
      rawData: isTokenById
        ? {
            currencyId,
            priceTokenAmount, // string base units
          }
        : isTokenByAddr
        ? {
            currencyAddress,
            currencySymbol: currencySymbol ?? undefined,
            amountWei: priceWeiStr ?? undefined, // legacy name
          }
        : undefined,
    } as const;

    const created = await prisma.nFTActivity.upsert({
      where: { txHash_logIndex: { txHash, logIndex } },
      update: data,
      create: data,
    });

    return NextResponse.json({ ok: true, id: created.id });
  } catch (err: any) {
    console.error("[api/nft/activities POST] error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
