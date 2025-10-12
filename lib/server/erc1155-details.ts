// lib/server/erc1155-mint-details.ts
import type { PrismaClient } from "@prisma/client";
import { ethers } from "ethers";
import { ERC1155_SINGLE_ABI } from "../abis/ERC1155SingleDropABI";
import prisma, { prismaReady } from "../db";

// ---- Small helpers ----
function httpFromIpfs(u?: string | null): string {
  if (!u) return "";
  return u.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7)}` : u;
}

function getProvider(): ethers.Provider | null {
  const url = process.env.RPC_URL;
  try {
    return url ? new ethers.JsonRpcProvider(url) : null;
  } catch {
    return null;
  }
}

// SSR details type
export type ERC1155MintDetails = {
  kind: "erc1155";
  name: string;
  symbol: string;
  contract: string;

  // media + text
  imageUrl: string; // resolved from token JSON
  description?: string | null;

  // supply / live
  supply: number;
  minted: number;
  mintedPct: number;

  // price + caps
  priceEtnWei: string; // wei string
  maxPerWallet: number;

  // creator info (best effort DB)
  creator: {
    walletAddress: string;
    username?: string | null;
    profileAvatar?: string | null;
  };
};

// Try to read on-chain everything we can
async function readOnChain(contractAddr: string) {
  const provider = getProvider();
  if (!provider) return null;

  const c = new ethers.Contract(contractAddr, ERC1155_SINGLE_ABI, provider);
  try {
    const [name, symbol, maxSupply, mintPrice, maxPerWallet, totalMinted, tokenUri] =
      await Promise.all([
        c.name(),
        c.symbol(),
        c.maxSupply(),
        c.mintPrice(),
        c.maxPerWallet(),
        c.totalMinted(),
        c.uri(1n),
      ]);

    // Fetch token JSON to get image/animation_url
    let imageUrl = "";
    let description: string | null = null;
    try {
      const jsonRes = await fetch(httpFromIpfs(String(tokenUri)), { cache: "no-store" });
      const j = await jsonRes.json();
      const anim = httpFromIpfs(j?.animation_url || "");
      const img = httpFromIpfs(j?.image || "");
      imageUrl = anim || img || "";
      description = (j?.description as string) ?? null;
    } catch {
      // ignore JSON errors
    }

    const supply = Number(maxSupply);
    const minted = Number(totalMinted);
    const mintedPct = supply > 0 ? Math.min(100, Math.round((minted / supply) * 100)) : 0;

    return {
      name: String(name),
      symbol: String(symbol),
      imageUrl,
      description,
      supply,
      minted,
      mintedPct,
      priceEtnWei: String(mintPrice),
      maxPerWallet: Number(maxPerWallet),
    };
  } catch {
    return null;
  }
}

/** On-chain first; DB fallback (image/description/supply/price caps) **/
export async function getERC1155MintDetails(
  p: PrismaClient,
  contract: string
): Promise<ERC1155MintDetails | null> {
  const on = await readOnChain(contract);

  // Try to enrich/fallback with DB Single1155 row (case-insensitive match)
  const row = await p.single1155.findFirst({
    where: { contract: { equals: contract, mode: "insensitive" } },
    include: {
      balances: { select: { balance: true } },
      deployment: true,
    },
  });

  if (!on && !row) return null;

  const creatorWallet = row?.ownerAddress || row?.deployment?.deployerAddress || "";
  const creatorUser = creatorWallet
    ? await p.user.findFirst({
        where: { walletAddress: { equals: creatorWallet, mode: "insensitive" } },
      })
    : null;

  // If no on-chain, fallback to DB
  if (!on) {
    const supply = Number(row?.maxSupply ?? 0);

    const minted = (row?.balances || []).reduce(
      (acc: number, b: { balance: number | null }) => acc + (b.balance ?? 0),
      0
    );

    const mintedPct = supply > 0 ? Math.min(100, Math.round((minted / supply) * 100)) : 0;

    return {
      kind: "erc1155",
      name: row?.name || "ERC1155 Drop",
      symbol: row?.symbol || "",
      contract,

      imageUrl: row?.imageUrl || "",
      description: row?.description ?? null,

      supply,
      minted,
      mintedPct,

      priceEtnWei: String(row?.mintPriceEtnWei ?? "0"),
      maxPerWallet: Number(row?.maxPerWallet ?? 0),

      creator: {
        walletAddress: creatorWallet,
        username: creatorUser?.username ?? null,
        profileAvatar: creatorUser?.profileAvatar ?? null,
      },
    };
  }

  // Merge on-chain (truth) with DB for missing pieces (image / description if blank)
  const imageUrl = on.imageUrl || row?.imageUrl || "";
  const description = (on.description ?? null) ?? row?.description ?? null;

  return {
    kind: "erc1155",
    name: on.name,
    symbol: on.symbol,
    contract,

    imageUrl,
    description,

    supply: on.supply,
    minted: on.minted,
    mintedPct: on.mintedPct,

    priceEtnWei: on.priceEtnWei,
    maxPerWallet: on.maxPerWallet,

    creator: {
      walletAddress: creatorWallet,
      username: creatorUser?.username ?? null,
      profileAvatar: creatorUser?.profileAvatar ?? null,
    },
  };
}

export async function fetchERC1155MintDetails(contract: string) {
  await prismaReady; // ensure the shared client is ready
  return getERC1155MintDetails(prisma as unknown as PrismaClient, contract);
}
