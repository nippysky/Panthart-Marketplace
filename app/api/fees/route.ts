export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import prisma, { prismaReady } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { ContractType, MetadataOption } from "@/lib/generated/prisma";

/** Ensure wei is returned as a plain base-10 integer string (no exponent, no decimals) */
function toPlainWeiString(x: any): string {
  if (x == null) return "";
  // Prisma Decimal has .toFixed(); use it to avoid scientific notation.
  const maybeDecimal = x as unknown as { toFixed?: (dp?: number) => string };
  if (maybeDecimal && typeof maybeDecimal.toFixed === "function") {
    // wei must be an integer
    return maybeDecimal.toFixed(0);
  }
  const s = String(x).trim();
  if (!s) return "";
  // Already plain integer?
  if (/^[+-]?\d+$/.test(s)) return s.replace(/^\+/, "");
  // If it has a decimal point but no exponent, drop fractional part (wei is integer)
  if (/^[+-]?\d+\.\d+$/.test(s)) return s.split(".")[0].replace(/^\+/, "");
  // Scientific notation?
  const m = s.match(/^([+-]?\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (m) {
    const sign = m[1].startsWith("-") ? "-" : "";
    const intPart = m[1].replace(/^[+-]/, "");
    const frac = m[2] || "";
    const exp = parseInt(m[3], 10);
    if (exp >= 0) {
      const digits = intPart + frac;
      const zeros = exp - frac.length;
      const body = zeros >= 0 ? digits + "0".repeat(zeros) : digits.slice(0, digits.length + zeros);
      return (sign ? "-" : "") + (body.replace(/^0+(?=\d)/, "") || "0");
    } else {
      // Negative exponent => value < 1 wei; treat as 0
      return "0";
    }
  }
  // Fallback: strip non-digits
  return s.replace(/[^\d-]/g, "");
}

/** Shared resolver so GET and POST use the same code */
async function resolveFee(contractType: string, metadataOption: string) {
  // map to enums
  let ct: ContractType | null = null;
  switch (contractType) {
    case "ERC721_DROP":
      ct = ContractType.ERC721_DROP;
      break;
    case "ERC721_SINGLE":
      ct = ContractType.ERC721_SINGLE;
      break;
    case "ERC1155_SINGLE":
      ct = ContractType.ERC1155_SINGLE;
      break;
    default:
      throw new Error("Invalid contractType");
  }

  let mo: MetadataOption | null = null;
  switch (metadataOption) {
    case "UPLOAD":
      mo = MetadataOption.UPLOAD;
      break;
    case "EXTERNAL":
      mo = MetadataOption.EXTERNAL;
      break;
    default:
      throw new Error("Invalid metadataOption");
  }

  // Prefer DB
  const cfg = await prisma.feeConfig.findFirst({
    where: { contractType: ct, metadataOption: mo, active: true },
    orderBy: { updatedAt: "desc" },
  });

  if (cfg) {
    return {
      feeRecipient: cfg.feeRecipient,
      feeAmountEtnWei: toPlainWeiString(cfg.feeAmountEtnWei), // ✅ plain integer string
      targetUsdCents: cfg.targetUsdCents ?? undefined,
      lastPriceUsd: cfg.lastPriceUsd ?? undefined,
      lastPriceAt: cfg.lastPriceAt ?? undefined,
      pricingSource: cfg.pricingSource ?? undefined,
      pricingPair: cfg.pricingPair ?? undefined,
    };
  }

  // --------- Robust fallback (no external calls here) ---------
  // 1) legacy: *_WEI (direct wei string)
  const envRecipient = process.env.FEE_RECIPIENT;
  const envWei =
    ct === ContractType.ERC721_DROP && mo === MetadataOption.EXTERNAL
      ? process.env.FEE_ERC721_DROP_EXTERNAL_WEI
      : ct === ContractType.ERC721_DROP && mo === MetadataOption.UPLOAD
      ? process.env.FEE_ERC721_DROP_UPLOAD_WEI
      : ct === ContractType.ERC721_SINGLE
      ? process.env.FEE_ERC721_SINGLE_WEI
      : ct === ContractType.ERC1155_SINGLE
      ? process.env.FEE_ERC1155_SINGLE_WEI
      : undefined;

  if (envRecipient && envWei) {
    return {
      feeRecipient: envRecipient,
      feeAmountEtnWei: toPlainWeiString(envWei), // ✅ sanitize
    };
  }

  // 2) USD-centric fallback: *_USD_CENTS + FALLBACK_PRICE_USD (optional)
  const usdCentsStr =
    ct === ContractType.ERC721_DROP && mo === MetadataOption.EXTERNAL
      ? process.env.FEE_ERC721_DROP_EXTERNAL_USD_CENTS
      : ct === ContractType.ERC721_DROP && mo === MetadataOption.UPLOAD
      ? process.env.FEE_ERC721_DROP_UPLOAD_USD_CENTS
      : ct === ContractType.ERC721_SINGLE
      ? process.env.FEE_ERC721_SINGLE_USD_CENTS
      : ct === ContractType.ERC1155_SINGLE
      ? process.env.FEE_ERC1155_SINGLE_USD_CENTS
      : undefined;

  const fallbackPriceUsd = process.env.FALLBACK_PRICE_USD; // e.g., "0.00325"
  const recipient2 = process.env.FEE_RECIPIENT;

  if (usdCentsStr && recipient2 && fallbackPriceUsd && Number(fallbackPriceUsd) > 0) {
    const targetUsdCents = parseInt(usdCentsStr, 10);
    const priceScaled = BigInt(Math.round(Number(fallbackPriceUsd) * 1e8));
    const usdScaled = BigInt(targetUsdCents) * 1_000_000n; // cents → 1e8 scale
    const numerator = usdScaled * 1_000_000_000_000_000_000n; // *1e18
    const feeWei = ((numerator + (priceScaled - 1n)) / priceScaled).toString();
    return {
      feeRecipient: recipient2,
      feeAmountEtnWei: toPlainWeiString(feeWei), // ✅ plain
      targetUsdCents,
      lastPriceUsd: fallbackPriceUsd,
      pricingSource: "FALLBACK_ENV",
      pricingPair: "ETNUSD",
    };
  }

  throw new Error("FeeConfig not set");
}

/** POST /api/fees  (body: { contractType, metadataOption }) */
export async function POST(req: NextRequest) {
  await prismaReady;
  try {
    const body = (await req.json()) as {
      contractType?: string;
      metadataOption?: string;
    };
    if (!body?.contractType || !body?.metadataOption) {
      return NextResponse.json(
        { error: "Missing contractType/metadataOption" },
        { status: 400 }
      );
    }
    const payload = await resolveFee(body.contractType, body.metadataOption);
    return NextResponse.json(payload);
  } catch (e: any) {
    const msg = e?.message || "Internal error";
    const code = msg.includes("not set") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}

/** GET /api/fees?contractType=...&metadataOption=...  (handy for quick tests) */
export async function GET(req: NextRequest) {
  await prismaReady;
  try {
    const url = new URL(req.url);
    const ct = url.searchParams.get("contractType") || "";
    const mo = url.searchParams.get("metadataOption") || "";
    if (!ct || !mo) {
      return NextResponse.json(
        { error: "Missing contractType/metadataOption" },
        { status: 400 }
      );
    }
    const payload = await resolveFee(ct, mo);
    return NextResponse.json(payload);
  } catch (e: any) {
    const msg = e?.message || "Internal error";
    const code = msg.includes("not set") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status: code });
  }
}
