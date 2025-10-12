// lib/server/mint-details.ts
import { ERC721_DROP_ABI } from "../abis/ERC721DropABI";
import prisma, { prismaReady } from "../db";
import type { PrismaClient, User } from "../generated/prisma";
import { ethers } from "ethers";

// Premium placeholder
const PLACEHOLDER =
  "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png";

export type MintDetails = {
  id: string;
  name: string;
  contract: string;
  description?: string | null;
  logoUrl: string;
  coverUrl: string;

  supply: number;
  minted: number;
  mintedPct: number;

  publicSale: {
    startISO: string;
    priceEtnWei: string;
    maxPerWallet: number;
    maxPerTx: number;
  };
  presale?: {
    startISO: string;
    endISO: string;
    priceEtnWei: string;
    maxSupply: number;
  };

  flags: {
    presaleActive: boolean;
    publicLive: boolean;
    soldOut: boolean;
    upcoming: boolean;
  };

  social: {
    x?: string | null;
    instagram?: string | null;
    website?: string | null;
    discord?: string | null;
    telegram?: string | null;
  };

  creator: {
    id: string;
    walletAddress: string;
    username: string;
    profileAvatar?: string | null;
  };
};

/** Ensure a user row exists for a wallet; fill defaults if missing. */
async function ensureUserByWallet(
  p: PrismaClient,
  wallet: string
): Promise<User> {
  let user = await p.user.findUnique({ where: { walletAddress: wallet } });
  if (!user) {
    user = await p.user.create({
      data: {
        walletAddress: wallet,
        username: `${wallet.slice(0, 6)}...${wallet.slice(-4)}`,
        profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${wallet}`,
        profileBanner: PLACEHOLDER,
      },
    });
  } else {
    const needUsername = !user.username || user.username.trim() === "";
    const needAvatar = !user.profileAvatar || user.profileAvatar.trim() === "";
    if (needUsername || needAvatar || !user.profileBanner) {
      user = await p.user.update({
        where: { id: user.id },
        data: {
          username: needUsername
            ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}`
            : user.username,
          profileAvatar: needAvatar
            ? `https://api.dicebear.com/7.x/identicon/svg?seed=${wallet}`
            : user.profileAvatar,
          profileBanner: user.profileBanner ?? PLACEHOLDER,
        },
      });
    }
  }
  return user;
}

/* ---------- On-chain helpers ---------- */

// Try the best available RPC on the server
function getProvider(): ethers.Provider | null {
  const url = process.env.RPC_URL;
  try {
    return url ? new ethers.JsonRpcProvider(url) : null;
  } catch {
    return null;
  }
}

export async function getMintDetails(
  p: PrismaClient,
  contract: string
): Promise<MintDetails | null> {
  // Ensure Prisma engine is connected before any query
  await prismaReady;

  // Primary query using your existing schema/links
  const row = await p.collection.findFirst({
    where: {
      standard: "ERC721",
      isOrphan: false,
      deployment: { is: { cloneAddress: { equals: contract, mode: "insensitive" } } },
    },
    include: {
      _count: { select: { nfts: true } },
      deployment: true,
      publicSale: true,
      presale: true,
      creator: true,
    },
  });

  if (!row || !row.supply || !row.publicSale || !row.deployment?.cloneAddress) {
    return null;
  }

  // ----- On-chain truth (best-effort)
  const provider = getProvider();
  let mintedOnChain: number | null = null;
  let supplyOnChain: number | null = null;

  if (provider) {
    try {
      const c = new ethers.Contract(row.deployment.cloneAddress, ERC721_DROP_ABI, provider);
      // Prefer totalMinted() if present, else totalSupply() as a proxy for "minted so far"
      try {
        const tm: bigint = await c.totalMinted();
        mintedOnChain = Number(tm);
      } catch {}
      if (mintedOnChain == null) {
        try {
          const ts: bigint = await c.totalSupply();
          mintedOnChain = Number(ts);
        } catch {}
      }
      // Some implementations expose totalSupply() as final cap; if present, take it
      try {
        const ts: bigint = await c.totalSupply();
        supplyOnChain = Number(ts); // if this is actually "current minted", DB supply will still cap UI
      } catch {}
    } catch {
      // ignore — fallback to DB below
    }
  }

  // ----- Consolidate counts (DB fallback)
  const minted = mintedOnChain ?? (row._count.nfts ?? 0);
  const supply = row.supply ?? supplyOnChain ?? 0;

  const mintedPct =
    supply > 0 ? Math.min(100, Math.max(0, Math.round((minted / supply) * 100))) : 0;

  // ----- Flags from times
  const now = new Date();
  const presaleActive =
    !!row.presale && row.presale.startTime <= now && row.presale.endTime > now;
  const publicLive = row.publicSale.startTime <= now;
  const soldOut = supply > 0 && minted >= supply;
  const upcoming = !publicLive && !(row.presale && row.presale.startTime <= now);

  // Creator safety (should already exist via FK, but keep robust)
  const creatorWallet = row.creator?.walletAddress ?? row.ownerAddress;
  const creator = await ensureUserByWallet(p, creatorWallet);

  return {
    id: row.id,
    name: row.name || "Collection",
    contract: row.deployment.cloneAddress,
    description: row.description ?? null,
    logoUrl: row.logoUrl || PLACEHOLDER,
    coverUrl: row.coverUrl || PLACEHOLDER,

    supply,
    minted,
    mintedPct,

    publicSale: {
      startISO: row.publicSale.startTime.toISOString(),
      priceEtnWei: row.publicSale.priceEtnWei.toString(),
      maxPerWallet: row.publicSale.maxPerWallet,
      maxPerTx: row.publicSale.maxPerTx,
    },
    presale: row.presale
      ? {
          startISO: row.presale.startTime.toISOString(),
          endISO: row.presale.endTime.toISOString(),
          priceEtnWei: row.presale.priceEtnWei.toString(),
          maxSupply: row.presale.maxSupply,
        }
      : undefined,

    flags: { presaleActive, publicLive, soldOut, upcoming },

    social: {
      x: row.x ?? null,
      instagram: row.instagram ?? null,
      website: row.website ?? null,
      discord: row.discord ?? null,
      telegram: row.telegram ?? null,
    },

    creator: {
      id: creator.id,
      walletAddress: creator.walletAddress,
      username: creator.username,
      profileAvatar: creator.profileAvatar ?? null,
    },
  };
}

// Convenience wrapper if you want a single-call helper.
// Note: no $disconnect() here — we keep the singleton alive.
export async function fetchMintDetails(contract: string): Promise<MintDetails | null> {
  await prismaReady;
  return getMintDetails(prisma, contract);
}
