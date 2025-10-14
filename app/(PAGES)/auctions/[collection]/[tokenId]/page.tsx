// app/auctions/[collection]/[tokenId]/page.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { ExternalLink, Timer, User2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";
import { CountdownChip } from "@/components/shared/nft-token-page/CountdownChip";

/* ---------------- utils ---------------- */
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
type SearchParams = { cursor?: string; sort?: "end" | "recent"; limit?: string };

type AuctionRow = {
  id: string;
  onChainId?: string | number;
  auctionId?: string | number;

  startTime: string;
  endTime: string | null;

  seller?: { address?: string; username?: string | null };
  quantity?: number;

  nft: {
    contract: string;
    tokenId: string;
    name?: string;
    image?: string | null;
    standard?: "ERC721" | "ERC1155" | string;
  };
  currency: {
    id: string | null;
    kind: "NATIVE" | "ERC20";
    symbol: string;
    decimals: number;
    tokenAddress: string | null;
  };
  price: { currentWei?: string | null; current?: string | null };
};

function sortAuctions(items: AuctionRow[], mode: "end" | "recent") {
  const toTs = (iso?: string | null) => {
    if (!iso) return Number.POSITIVE_INFINITY;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  if (mode === "recent") {
    return [...items].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    );
  }
  return [...items].sort((a, b) => toTs(a.endTime) - toTs(b.endTime));
}

async function fetchActiveAuctions(
  contract: string,
  tokenId: string,
  cursor?: string,
  limit: number = 24
): Promise<{ items: AuctionRow[]; nextCursor: string | null }> {
  const url = await absoluteUrl(
    `/api/auction/active?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(
      tokenId
    )}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`
  );
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { items: [], nextCursor: null };
  return (await res.json()) as any;
}

/* ---- smart header: show collection name if available ---- */
async function fetchCollectionLabel(contract: string, tokenId: string): Promise<string | null> {
  try {
    const url = await absoluteUrl(`/api/nft/${contract}/${tokenId}`);
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    const j: any = await r.json();
    return (
      j?.collection?.name ??
      j?.collection?.title ??
      j?.displayGroup?.title ??
      j?.nft?.collectionName ??
      j?.collectionName ??
      null
    );
  } catch {
    return null;
  }
}

/* ---- helpers ---- */
function mediaKind(url?: string | null): "video" | "image" {
  if (!url) return "image";
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|ogg|mov)$/.test(clean)) return "video";
  return "image";
}
const short = (addr?: string) =>
  addr && addr.startsWith("0x") ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr ?? "";

/* ---------------- Page (await params/searchParams) ---------------- */
type PageContext = { params: Promise<PageParams>; searchParams: Promise<SearchParams> };

export default async function Page(ctx: PageContext) {
  const { collection, tokenId } = await ctx.params;
  const sp = await ctx.searchParams;

  const sortMode = (sp.sort as "end" | "recent") || "end";
  const limit = Math.min(Number(sp.limit || 24), 60);
  const cursor = sp.cursor;

  const [auctionsRes, collectionLabel] = await Promise.all([
    fetchActiveAuctions(collection, tokenId, cursor, limit),
    fetchCollectionLabel(collection, tokenId),
  ]);

  const { items, nextCursor } = auctionsRes;
  const sorted = sortAuctions(items, sortMode);

  const canonicalTokenUrl = `/collections/${encodeURIComponent(collection)}/${encodeURIComponent(
    tokenId
  )}`;

  return (
    <section className="py-6 sm:py-8">
      {/* Header / nav */}
      <div className="mb-5 grid gap-3 md:grid-cols-2 md:items-end">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold leading-tight">
            {collectionLabel ? (
              <>
                Auctions for <span className="font-medium">{collectionLabel}</span>{" "}
                <span className="opacity-60">•</span>{" "}
                <span className="font-mono">#{tokenId}</span>
              </>
            ) : (
              <>
                Auctions for <span className="font-mono">{tokenId}</span>
              </>
            )}
          </h1>
          <div className="mt-1 text-xs sm:text-sm text-muted-foreground truncate">
            Token page:{" "}
            <Link href={canonicalTokenUrl} className="font-semibold hover:underline">
              {canonicalTokenUrl}
              <ExternalLink className="inline-block -mt-0.5 ml-1 h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-start md:justify-end gap-2 overflow-x-auto">
          <span className="whitespace-nowrap text-xs sm:text-sm text-muted-foreground">Sort</span>
          <div className="inline-flex rounded-full border bg-background p-0.5">
            <Link
              href={`/auctions/${encodeURIComponent(collection)}/${encodeURIComponent(
                tokenId
              )}?sort=end`}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-full whitespace-nowrap ${
                sortMode === "end"
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 text-foreground/80"
              }`}
            >
              Ending soon
            </Link>
            <Link
              href={`/auctions/${encodeURIComponent(collection)}/${encodeURIComponent(
                tokenId
              )}?sort=recent`}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-full whitespace-nowrap ${
                sortMode === "recent"
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50 text-foreground/80"
              }`}
            >
              Newest
            </Link>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {sorted.length === 0 ? (
        <div className="rounded-xl border p-8 sm:p-10 text-center text-sm text-muted-foreground">
          No active auctions for this token.
          <div className="mt-3">
            <Link href={canonicalTokenUrl}>
              <Button>Go to token page</Button>
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* GRID: 1 col on small, 2 on sm, 3 on lg, 4 on xl */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 md:gap-6">
            {sorted.map((it) => {
              const img = it.nft?.image || "/placeholder.svg";
              const name =
                it.nft?.name ||
                `${it.nft.contract.slice(0, 6)}…${it.nft.contract.slice(-4)} #${it.nft.tokenId}`;
              const priceHuman =
                typeof it.price?.current === "string" ? it.price.current : undefined;
              const ccy = it.currency?.symbol || "ETN";
              const qty = typeof it.quantity === "number" ? it.quantity : undefined;
              const endISO = it.endTime || null;
              const startISO = it.startTime || null;

              const preferredId = (it.onChainId as any) ?? (it.auctionId as any) ?? it.id;
              const auctionIdForUrl = /^\d+$/.test(String(preferredId))
                ? String(preferredId)
                : String(it.id);

              const sellerLabel =
                it.seller?.username && it.seller.username.trim().length > 0
                  ? it.seller.username
                  : short(it.seller?.address);

              const kind = mediaKind(img);

              return (
                <li
                  key={`${it.id}`}
                  className="group rounded-xl border bg-card text-card-foreground overflow-hidden transition-shadow hover:shadow-lg"
                >
                  <div className="relative aspect-square bg-muted/40">
                    {kind === "video" ? (
                      <video
                        src={img}
                        className="w-full h-full object-cover"
                        playsInline
                        muted
                        autoPlay
                        loop
                      />
                    ) : (
                      <Image
                        src={img}
                        alt={name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        unoptimized
                      />
                    )}
                  </div>

                  <div className="p-4 sm:p-5 space-y-3">
                    <div className="min-w-0">
                      <div className="text-[11px] sm:text-xs text-muted-foreground">
                        {it.nft.standard ?? "ERC721"}
                      </div>
                      <div className="font-semibold truncate" title={name}>
                        {name}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-start">
                      <div className="min-w-0">
                        <div className="opacity-70 text-xs">Starting Price</div>
                        <div className="font-semibold text-base sm:text-lg">
                          {priceHuman ? formatNumber(Number(priceHuman)) : "—"} {ccy}
                        </div>
                        {typeof qty === "number" && qty > 1 && (
                          <div className="text-xs text-muted-foreground">Qty {qty}</div>
                        )}
                        {sellerLabel && (
                          <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1 min-w-0">
                            <User2 className="h-3.5 w-3.5 shrink-0" />
                            <span className="truncate" title={sellerLabel}>
                              {sellerLabel}
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="sm:text-right">
                        <div className="text-xs text-muted-foreground flex items-center gap-1 sm:justify-end">
                          <Timer className="h-3.5 w-3.5 shrink-0" /> Ends in
                        </div>
                        <div className="mt-1 sm:mt-1.5">
                          <CountdownChip endISO={endISO} />
                        </div>
                        <div className="mt-2 hidden text-[11px] text-muted-foreground leading-relaxed md:block">
                          {startISO && <div>Start: {new Date(startISO).toLocaleString()}</div>}
                          {endISO && <div>End: {new Date(endISO).toLocaleString()}</div>}
                        </div>
                      </div>
                    </div>

                    <Button asChild className="w-full">
                      <Link href={`/auction/${encodeURIComponent(auctionIdForUrl)}`} prefetch={false}>
                        View auction
                      </Link>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Pagination */}
          <div className="mt-8 flex justify-center">
            {nextCursor ? (
              <Link
                href={`/auctions/${encodeURIComponent(collection)}/${encodeURIComponent(
                  tokenId
                )}?sort=${sortMode}&cursor=${encodeURIComponent(nextCursor)}&limit=${limit}`}
              >
                <Button variant="outline">Next page</Button>
              </Link>
            ) : (
              <div className="text-sm text-muted-foreground">No more results</div>
            )}
          </div>
        </>
      )}
    </section>
  );
}
