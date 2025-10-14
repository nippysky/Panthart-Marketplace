/* app/api/marketplace/listings/route.ts */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import {
  Prisma,
  CurrencyKind,
  ListingStatus,
} from "@/lib/generated/prisma";
import prisma, { prismaReady } from "@/lib/db";

/**
 * Convert a human string like "1.2345" to base units as a string (no decimals),
 * respecting 'decimals'. No floating point; safe for big numbers.
 */
function toBaseUnits(human: string, decimals: number): string {
  const [wholeRaw, fracRaw = ""] = String(human).trim().split(".");
  const whole = wholeRaw.replace(/^0+/, "") || "0";

  if (decimals === 0) return whole;

  if (fracRaw.length > decimals) {
    // trim extra digits rather than rounding
    const frac = fracRaw.slice(0, decimals);
    const padded = frac.padEnd(decimals, "0");
    return `${whole}${padded}`.replace(/^0+/, "") || "0";
  }

  const padded = (fracRaw || "").padEnd(decimals, "0");
  const joined = `${whole}${padded}`;
  return joined.replace(/^0+/, "") || "0";
}

/**
 * Basic ISO date parser; returns Date or undefined if empty/invalid.
 */
function parseISO(maybeISO?: string): Date | undefined {
  if (!maybeISO) return undefined;
  const d = new Date(maybeISO);
  return Number.isFinite(d.valueOf()) ? d : undefined;
}

type Body = {
  contract: string;
  tokenId: string;
  standard: "ERC721" | "ERC1155";
  sellerAddress: string;

  // price is in human units (e.g., "1.25")
  price: string;
  quantity?: string;

  // Either currencyId, or fallback { kind, tokenAddress }
  currencyId?: string | null;
  currencyKind?: "NATIVE" | "ERC20";
  currencyTokenAddress?: string | null;

  // Optional schedule & tx
  startTimeISO?: string;
  endTimeISO?: string;
  txHashCreated?: string;
};

async function resolveCurrency(body: Body) {
  // 1) Try currencyId first (normal path)
  if (body.currencyId) {
    const id = String(body.currencyId);
    // Treat "native" sentinel as native currency
    if (id.toLowerCase() === "native") {
      // find or create the native ETN row
      let native = await prisma.currency.findFirst({
        where: { kind: CurrencyKind.NATIVE, tokenAddress: null },
      });
      if (!native) {
        native = await prisma.currency.create({
          data: {
            symbol: "ETN",
            decimals: 18,
            kind: CurrencyKind.NATIVE,
            tokenAddress: null,
            active: true,
          },
        });
      }
      return { row: native, isNative: true, decimals: native.decimals ?? 18 };
    }

    const row = await prisma.currency.findUnique({ where: { id } });
    if (row) {
      const isNative = row.kind === CurrencyKind.NATIVE;
      return { row, isNative, decimals: row.decimals ?? 18 };
    }

    // Fall through to fallback resolution if id not found
  }

  // 2) Fallback by kind/token address
  const kind = body.currencyKind ?? "NATIVE";
  if (kind === "NATIVE") {
    let native = await prisma.currency.findFirst({
      where: { kind: CurrencyKind.NATIVE, tokenAddress: null },
    });
    if (!native) {
      native = await prisma.currency.create({
        data: {
          symbol: "ETN",
          decimals: 18,
          kind: CurrencyKind.NATIVE,
          tokenAddress: null,
          active: true,
        },
      });
    }
    return { row: native, isNative: true, decimals: native.decimals ?? 18 };
  }

  // ERC20 requires a token address to look up
  const addr = (body.currencyTokenAddress || "").trim();
  if (!addr) {
    return {
      row: null,
      isNative: false,
      decimals: 18,
      error: "Missing token address for ERC20 currency.",
      status: 422,
    };
  }

  const erc20 = await prisma.currency.findFirst({
    where: {
      kind: CurrencyKind.ERC20,
      tokenAddress: addr as any, // citext handles case-insensitively server-side
    },
  });

  if (!erc20) {
    return {
      row: null,
      isNative: false,
      decimals: 18,
      error: "Currency (ERC20) not configured in DB.",
      status: 422,
    };
  }
  return { row: erc20, isNative: false, decimals: erc20.decimals ?? 18 };
}

export async function POST(req: NextRequest) {
  await prismaReady;

  try {
    const body = (await req.json()) as Body;

    // Basic args validation
    if (!body?.contract || !body?.tokenId || !body?.sellerAddress || !body?.standard) {
      return NextResponse.json(
        { error: "Missing required fields (contract, tokenId, sellerAddress, standard)." },
        { status: 400 }
      );
    }
    if (!body.price || Number.isNaN(Number(body.price)) || Number(body.price) <= 0) {
      return NextResponse.json(
        { error: "Invalid price." },
        { status: 400 }
      );
    }
    const is1155 = body.standard === "ERC1155";
    const qty = is1155 ? Math.max(1, Number(body.quantity || "1")) : 1;
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
    }

    // Resolve NFT row (we store by nftId)
    const nft = await prisma.nFT.findUnique({
      where: {
        contract_tokenId: {
          contract: body.contract as any,
          tokenId: String(body.tokenId),
        },
      },
      select: { id: true },
    });

    if (!nft) {
      return NextResponse.json(
        { error: "NFT not found in DB for the given contract & tokenId." },
        { status: 404 }
      );
    }

    // Resolve currency (id OR {kind, tokenAddress})
    const cur = await resolveCurrency({
      currencyId: body.currencyId,
      currencyKind: body.currencyKind,
      currencyTokenAddress: body.currencyTokenAddress,
      contract: body.contract,
      tokenId: body.tokenId,
      price: body.price,
      sellerAddress: body.sellerAddress,
      standard: body.standard,
      quantity: body.quantity,
      startTimeISO: body.startTimeISO,
      endTimeISO: body.endTimeISO,
      txHashCreated: body.txHashCreated,
    });

    if ((cur as any).error) {
      return NextResponse.json(
        { error: (cur as any).error },
        { status: (cur as any).status ?? 400 }
      );
    }

    const decimals = cur.decimals ?? 18;
    const priceBase = toBaseUnits(String(body.price), decimals);

    // Prepare data for insert
    const startTime = parseISO(body.startTimeISO);
    const endTime = parseISO(body.endTimeISO);

    const data: Prisma.MarketplaceListingCreateInput = {
      nft: { connect: { id: nft.id } },
      sellerAddress: body.sellerAddress as any,
      quantity: qty,
      status: ListingStatus.ACTIVE,
      startTime: startTime ?? new Date(),
      endTime: endTime ?? undefined,
      txHashCreated: body.txHashCreated ?? undefined,
      // price & currency
      priceEtnWei: cur.isNative ? new Prisma.Decimal(priceBase) : new Prisma.Decimal(0),
      priceTokenAmount: cur.isNative ? undefined : new Prisma.Decimal(priceBase),
      currency: cur.row ? { connect: { id: cur.row.id } } : undefined,
    };

    const created = await prisma.marketplaceListing.create({ data });

    /* ----------------------------------------------------
       NEW: Write a LISTING activity row at creation time
       - Native: priceEtnWei
       - ERC20 : rawData { currencyId, priceTokenAmount }
       ---------------------------------------------------- */
    const syntheticTx = body.txHashCreated ?? `listing-${created.id}`;
    await prisma.nFTActivity.upsert({
      where: { txHash_logIndex: { txHash: syntheticTx, logIndex: 0 } },
      update: {},
      create: {
        nftId: nft.id,
        contract: body.contract,
        tokenId: String(body.tokenId),
        type: "LISTING",
        fromAddress: body.sellerAddress.toLowerCase(),
        toAddress: "",
        priceEtnWei: cur.isNative ? (priceBase as any) : null,
        txHash: syntheticTx,
        logIndex: 0,
        blockNumber: Date.now() % 1_000_000_000,
        timestamp: created.createdAt, // aligns UI timing with the record
        marketplace: "Panthart",
        rawData: cur.isNative
          ? undefined
          : {
              currencyId: cur.row?.id,
              priceTokenAmount: priceBase,
            },
      },
    });

    return NextResponse.json(
      {
        ok: true,
        id: created.id,
        currencyId: cur.row?.id ?? null,
        isNative: cur.isNative,
        priceBaseUnits: priceBase,
      },
      { status: 201 }
    );
  } catch (e: any) {
    console.error("POST /api/marketplace/listings error:", e);
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}
