export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createPublicClient, getAddress, http } from "viem";
import prisma, { prismaReady } from "@/lib/db";
import { ERC20_ABI } from "@/lib/abis/tokens/erc20";


const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";

export async function GET() {
  await prismaReady;
  const list = await prisma.currency.findMany({
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ ok: true, data: list });
}

export async function POST(req: Request) {
  try {
    await prismaReady;

    const body = await req.json();
    const tokenAddressRaw = String(body?.tokenAddress || "");
    if (!tokenAddressRaw) {
      return NextResponse.json({ ok: false, error: "tokenAddress required" }, { status: 400 });
    }

    const tokenAddress = getAddress(tokenAddressRaw);

    if (!RPC_URL) {
      return NextResponse.json({ ok: false, error: "RPC not configured" }, { status: 500 });
    }

    const client = createPublicClient({ transport: http(RPC_URL) });

    // Read symbol/decimals from chain (best effort)
    let symbol = "TOKEN";
    let decimals = 18;
    try {
      symbol = (await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "symbol",
        args: [],
      })) as string;
    } catch {}
    try {
      const d = (await client.readContract({
        address: tokenAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: "decimals",
        args: [],
      })) as number;
      if (Number.isFinite(d)) decimals = Number(d);
    } catch {}

    // Persist to DB (kind=ERC20). Upsert by tokenAddress (unique).
    const created = await prisma.currency.upsert({
      where: { tokenAddress },
      create: {
        kind: "ERC20",
        tokenAddress,
        symbol,
        decimals,
        active: true,
      },
      update: {
        symbol,
        decimals,
        active: true,
      },
    });

    return NextResponse.json({ ok: true, data: created });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed" }, { status: 500 });
  }
}
