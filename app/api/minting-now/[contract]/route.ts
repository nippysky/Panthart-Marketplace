// app/api/minting-now/[contract]/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { fetchMintDetails } from "@/lib/server/mint-details";

type PageParams = { params: Promise<{ contract: string }> };

export async function GET(_: Request, ctx: PageParams) {
  const { contract } = await ctx.params;

  try {
    const details = await fetchMintDetails(contract);
    if (!details) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }

    // Mirror the shape your client fallback expects
    return NextResponse.json({
      contract: details.contract,
      name: details.name,
      description: details.description,
      logoUrl: details.logoUrl,
      coverUrl: details.coverUrl,
      supply: details.supply,
      minted: details.minted,
      mintedPct: details.mintedPct,
      flags: {
        soldOut: details.flags.soldOut,
        presaleActive: details.flags.presaleActive,
        publicLive: details.flags.publicLive,
      },
      publicSale: details.publicSale,
      presale: details.presale
        ? {
            ...details.presale,
            // include merkleRoot here later if you add it to MintDetails
          }
        : null,
      creator: {
        walletAddress: details.creator.walletAddress,
        username: details.creator.username,
        profileAvatar: details.creator.profileAvatar,
      },
      social: details.social,
    });
  } catch (e) {
    console.error("[GET /api/minting-now/[contract]]", e);
    return NextResponse.json({ error: "server-error" }, { status: 500 });
  }
}
