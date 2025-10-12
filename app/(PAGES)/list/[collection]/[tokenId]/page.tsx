export const dynamic = "force-dynamic";

import Link from "next/link";
import { headers } from "next/headers";
import { ExternalLink } from "lucide-react";
import ListingsGridIsland from "./ListingsGridIsland";

/* utils kept the same */
async function absoluteUrl(path: string) {
  const envBase = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  if (envBase) return `${envBase}${path}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto =
    h.get("x-forwarded-proto") ?? (host && host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}

type PageParams = { collection: string; tokenId: string };
type SearchParams = { cursor?: string; sort?: "price" | "recent"; limit?: string };

type ListingRow = {
  id: string;
  sellerAddress: string;
  quantity: number;
  startTime: string;
  endTime: string | null;
  nft: { contract: string; tokenId: string; name?: string; image?: string | null; standard: string };
  currency: { id: string | null; kind: "NATIVE" | "ERC20"; symbol: string; decimals: number; tokenAddress: string | null };
  price: {
    unitWei?: string | null;
    unit?: string | null;
    totalWei?: string | null;
    total?: string | null;
    currentWei?: string | null;
    current?: string | null;
  };
};

function sortListings(items: ListingRow[], mode: "price" | "recent") {
  if (mode === "recent") {
    return [...items].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }
  return [...items].sort((a, b) => {
    const as = (a.currency?.symbol || "").localeCompare(b.currency?.symbol || "");
    if (as !== 0) return as;
    const ap = Number(a.price?.unit ?? a.price?.total ?? Number.POSITIVE_INFINITY);
    const bp = Number(b.price?.unit ?? b.price?.total ?? Number.POSITIVE_INFINITY);
    return ap - bp;
  });
}

async function fetchActiveListings(
  contract: string,
  tokenId: string,
  cursor?: string,
  limit: number = 24
): Promise<{ items: ListingRow[]; nextCursor: string | null }> {
  const base = await absoluteUrl(
    `/api/listing/active?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(
      tokenId
    )}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
  );
  const res = await fetch(base, { cache: "no-store" });
  if (!res.ok) return { items: [], nextCursor: null };
  return (await res.json()) as any;
}

async function fetchNftMeta(contract: string, tokenId: string) {
  try {
    const url = await absoluteUrl(`/api/nft/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

type PageContext = {
  params: Promise<PageParams>;
  searchParams: Promise<SearchParams>;
};

export default async function Page(ctx: PageContext) {
  const { collection, tokenId } = await ctx.params;
  const sp = await ctx.searchParams;

  const sortMode = (sp.sort as "price" | "recent") || "price";
  const limit = Math.min(Number(sp.limit || 24), 60);
  const cursor = sp.cursor;

  const [{ items, nextCursor }, nftMeta] = await Promise.all([
    fetchActiveListings(collection, tokenId, cursor, limit),
    fetchNftMeta(collection, tokenId),
  ]);
  const sorted = sortListings(items, sortMode);

  const canonicalTokenUrl = `/collections/${encodeURIComponent(collection)}/${encodeURIComponent(
    tokenId
  )}`;

  const collectionTitle: string =
    nftMeta?.displayGroup?.title ||
    nftMeta?.nft?.collectionName ||
    collection;

  return (
    <section className="py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-semibold truncate">
            Listings — {collectionTitle}
          </h1>
          <div className="mt-1 text-sm text-muted-foreground">
            Token page:{" "}
            <Link href={canonicalTokenUrl} className="font-semibold hover:underline break-all">
              {canonicalTokenUrl} <ExternalLink className="inline-block -mt-1 ml-1 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Sort</span>
          <Link
            href={`/list/${encodeURIComponent(collection)}/${encodeURIComponent(
              tokenId
            )}?sort=price`}
            className={`text-sm rounded-md border px-3 py-1.5 ${
              sortMode === "price" ? "bg-accent font-semibold" : "hover:bg-accent/50"
            }`}
          >
            Price ↑
          </Link>
          <Link
            href={`/list/${encodeURIComponent(collection)}/${encodeURIComponent(
              tokenId
            )}?sort=recent`}
            className={`text-sm rounded-md border px-3 py-1.5 ${
              sortMode === "recent" ? "bg-accent font-semibold" : "hover:bg-accent/50"
            }`}
          >
            Newest
          </Link>
        </div>
      </div>

      <ListingsGridIsland
        contract={collection}
        tokenId={tokenId}
        initialItems={sorted}
        initialNextCursor={nextCursor}
      />
    </section>
  );
}
