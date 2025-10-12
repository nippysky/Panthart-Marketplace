// app/api/search/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import Fuse from "fuse.js";

/** Group keys returned to the client (keep these plural to match the response shape) */
type GroupKey = "users" | "collections" | "nfts";

/** The item shape consumed by your popover */
type SearchItem = {
  id: string;
  label: string;
  image: string;
  href: string;
  type: GroupKey;
  subtitle?: string; // optional extra line (e.g., wallet, symbol, tokenId)
};

/* --------------------------------- helpers --------------------------------- */

const PLACEHOLDER =
  "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png";

const ETH_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/** true if the query looks like an Ethereum address */
function isEthAddress(q: string) {
  return ETH_ADDR_RE.test(q);
}

/** Try to parse "contract + tokenId" from inputs like:
 * - 0xabc...def 123
 * - 0xabc...def#123
 * - 0xabc...def/123
 * - 0xabc...def:123
 */
function parseContractTokenId(q: string): { contract: string; tokenId: string } | null {
  const m = q
    .trim()
    .match(/(0x[a-fA-F0-9]{40})\s*(?:[#/:\s])\s*([0-9]+)$/);
  if (!m) return null;
  return { contract: m[1], tokenId: m[2] };
}

/** Small de-duper by href (stable and unique in your app) */
function dedupeByHref(items: SearchItem[]): SearchItem[] {
  const seen = new Set<string>();
  const out: SearchItem[] = [];
  for (const it of items) {
    if (seen.has(it.href)) continue;
    seen.add(it.href);
    out.push(it);
  }
  return out;
}

/* ---------------------------------- route ---------------------------------- */

export async function GET(req: Request) {
  await prismaReady;

  const { searchParams } = new URL(req.url);
  const qRaw = (searchParams.get("q") || "").trim();

  // Empty → return empty groups (no RecentView)
  if (!qRaw) {
    return NextResponse.json({
      users: [] as SearchItem[],
      collections: [] as SearchItem[],
      nfts: [] as SearchItem[],
      recent: [] as SearchItem[],
    });
  }

  // Smart hints
  const isAddress = isEthAddress(qRaw);
  const parsedPair = parseContractTokenId(qRaw);
  const maybeTokenId = /^\d+$/.test(qRaw) ? qRaw : null;

  // Run the 3 main searches in parallel
  const [users, collections, nfts] = await Promise.all([
    // USERS
    prisma.user.findMany({
      where: {
        OR: [
          { username: { contains: qRaw, mode: "insensitive" } },
          { walletAddress: { contains: qRaw, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        username: true,
        walletAddress: true,
        profileAvatar: true,
      },
      take: 50,
    }),

    // COLLECTIONS (by name/symbol/contract)
    prisma.collection.findMany({
      where: {
        OR: [
          { name: { contains: qRaw, mode: "insensitive" } },
          { symbol: { contains: qRaw, mode: "insensitive" } },
          { contract: { contains: qRaw, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        symbol: true,
        logoUrl: true,
        contract: true,
      },
      take: 50,
    }),

    // NFTS (ERC721 + ERC1155 live in the same table; include several match paths)
    prisma.nFT.findMany({
      where: {
        status: "SUCCESS", // enum (uppercase) per your schema
        OR: [
          { name: { contains: qRaw, mode: "insensitive" } },
          ...(maybeTokenId ? [{ tokenId: { equals: maybeTokenId } }] : []),
          { contract: { contains: qRaw, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        tokenId: true,
        contract: true, // works for ERC721/1155 (with or without Collection)
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
    }),
  ]);

  // Optional: direct NFT lookup if query provides an exact "contract + tokenId"
  let directMatch: SearchItem[] = [];
  if (parsedPair) {
    const exact = await prisma.nFT.findUnique({
      where: {
        contract_tokenId: {
          contract: parsedPair.contract,
          tokenId: parsedPair.tokenId,
        },
      },
      select: {
        id: true,
        name: true,
        imageUrl: true,
        tokenId: true,
        contract: true,
      },
    });

    if (exact) {
      directMatch.push({
        id: exact.id,
        label: exact.name ?? `#${exact.tokenId}`,
        image: exact.imageUrl ?? PLACEHOLDER,
        href: `/collections/${exact.contract}/${exact.tokenId}`,
        type: "nfts",
        subtitle: `${exact.contract} • #${exact.tokenId}`,
      });
    }
  }

  // Map DB rows → SearchItem
  const userItems: SearchItem[] = users.map((u) => ({
    id: u.id,
    label:
      u.username && u.username.trim().length
        ? u.username
        : `${u.walletAddress.slice(0, 6)}...${u.walletAddress.slice(-4)}`,
    image: u.profileAvatar || PLACEHOLDER,
    href: `/profile/${u.walletAddress}`,
    type: "users",
    subtitle: u.walletAddress,
  }));

  const collectionItems: SearchItem[] = collections.map((c) => ({
    id: c.id,
    label: c.name || c.symbol || c.contract,
    image: c.logoUrl ?? PLACEHOLDER,
    href: `/collections/${c.contract}`,
    type: "collections",
    subtitle: c.symbol ? `${c.symbol} • ${c.contract}` : c.contract,
  }));

  // NOTE: we use nft.contract directly (works for both ERC721+ERC1155 and even when Collection is null)
  const nftItems: SearchItem[] = nfts.map((n) => ({
    id: n.id,
    label: n.name ?? `#${n.tokenId}`,
    image: n.imageUrl ?? PLACEHOLDER,
    href: `/collections/${n.contract}/${n.tokenId}`,
    type: "nfts",
    subtitle: `${n.contract} • #${n.tokenId}`,
  }));

  // Combine + include any direct exact match; then de-dupe by href
  const combined = dedupeByHref([...directMatch, ...userItems, ...collectionItems, ...nftItems]);

  // Fuzzy-rank by label + subtitle (helps when label is short like "#123")
  const fuse = new Fuse(combined, {
    keys: ["label", "subtitle"],
    threshold: 0.35,
    ignoreLocation: true,
  });
  const ranked = fuse.search(qRaw).map((r) => r.item);

  // Special ranking bump for exact address or exact contract hits
  const boosted = ranked.sort((a, b) => {
    const aBoost =
      isAddress && (a.subtitle?.toLowerCase() === qRaw.toLowerCase() || a.label === qRaw) ? 1 : 0;
    const bBoost =
      isAddress && (b.subtitle?.toLowerCase() === qRaw.toLowerCase() || b.label === qRaw) ? 1 : 0;
    return bBoost - aBoost;
  });

  // Group + cap (5 each)
  const grouped: Record<GroupKey, SearchItem[]> = {
    users: [],
    collections: [],
    nfts: [],
  };
  for (const item of boosted) {
    const key = item.type;
    if (grouped[key].length < 5) grouped[key].push(item);
  }

  return NextResponse.json({
    users: grouped.users,
    collections: grouped.collections,
    nfts: grouped.nfts,
    recent: [] as SearchItem[], // (no RecentView table by design)
  });
}
