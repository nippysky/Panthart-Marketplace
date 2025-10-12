"use client";

import useSWR from "swr";
import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import PriceCellIsland from "./PriceCellIsland";
import BuyNowIsland from "./BuyNowIsland";
import LoaderModal from "@/components/shared/loader-modal";
import { marketplace } from "@/lib/services/marketplace";
import { ZERO_ADDRESS } from "@/lib/evm/getSigner";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";
import { ethers } from "ethers";

/* ---------------------------------------------------------- */
/* Types                                                      */
/* ---------------------------------------------------------- */

type ListingRow = {
  id: string; // DB id or synthetic "onchain-<listingId>-<seller>"
  sellerAddress: string;
  quantity: number;
  startTime: string;
  endTime: string | null;
  nft: {
    contract: string;
    tokenId: string;
    name?: string;
    image?: string | null;
    standard: "ERC721" | "ERC1155" | string;
  };
  currency: {
    id: string | null;
    kind: "NATIVE" | "ERC20";
    symbol: string;
    decimals: number;
    tokenAddress: string | null;
  };
  price: {
    unitWei?: string | null;
    unit?: string | null;
    totalWei?: string | null;
    total?: string | null;
    currentWei?: string | null;
    current?: string | null;
  };
};

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json());

/* ---------------------------------------------------------- */
/* Helpers                                                    */
/* ---------------------------------------------------------- */

const FIXED_LOCALE = "en-US";
const FIXED_TZ = process.env.NEXT_PUBLIC_TIMEZONE || "Africa/Lagos";

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat(FIXED_LOCALE, {
      timeZone: FIXED_TZ,
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function toISOFromSeconds(n: bigint | number | null | undefined) {
  if (!n) return null;
  const s = typeof n === "bigint" ? Number(n) : n;
  if (!Number.isFinite(s)) return null;
  return new Date(s * 1000).toISOString();
}

function mergeUniqueBySeller(a: ListingRow[], b: ListingRow[]) {
  const seen = new Set(a.map((x) => x.sellerAddress.toLowerCase()));
  const merged = [...a];
  for (const x of b) {
    const key = x.sellerAddress.toLowerCase();
    if (!seen.has(key)) {
      merged.push(x);
      seen.add(key);
    }
  }
  return merged;
}

/** Get a read provider without forcing a wallet signature */
function getReadProvider(): ethers.Provider | null {
  const rpc = process.env.NEXT_PUBLIC_RPC_URL;
  if (rpc) return new ethers.JsonRpcProvider(rpc);
  const eth = (globalThis as any)?.ethereum;
  if (eth) return new ethers.BrowserProvider(eth);
  return null;
}

/**
 * Scan the most-recent N listing ids on-chain and return those that
 * match a given token+tokenId and are still active.
 * Works even when the marketplace escrow owns the NFT.
 */
async function scanRecentListingsForToken(
  token: string,
  tokenId: string,
  maxToScan: number = 250
): Promise<ListingRow[]> {
  const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
  const provider = getReadProvider();
  if (!mktAddr || !provider) return [];

  const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, provider);
  let nextId: bigint;
  try {
    nextId = (await mkt.nextListingId()) as bigint;
  } catch {
    return [];
  }
  if (!nextId || nextId <= 1n) return [];

  const start = nextId - 1n;
  const min = start > BigInt(maxToScan) ? start - BigInt(maxToScan) : 1n;

  const ids: bigint[] = [];
  for (let i = start; i >= min; i--) ids.push(i);

  const batches: bigint[][] = [];
  const batchSize = 25;
  for (let i = 0; i < ids.length; i += batchSize) {
    batches.push(ids.slice(i, i + batchSize));
  }

  const out: ListingRow[] = [];
  for (const batch of batches) {
    const reads = batch.map(async (id) => {
      try {
        const row = await mkt.listings(id);
        const matchesToken =
          String(row.token).toLowerCase() === token.toLowerCase() &&
          String(row.tokenId) === String(tokenId);
        if (!matchesToken || !row.active) return null;

        // price / currency meta
        const isNative =
          !row.currency || String(row.currency).toLowerCase() === ZERO_ADDRESS.toLowerCase();
        let symbol = "ETN";
        let decimals = 18;
        if (!isNative) {
          try {
            const meta = await marketplace.getErc20Meta(row.currency as `0x${string}`);
            symbol = meta.symbol || "ERC20";
            decimals = meta.decimals || 18;
          } catch {}
        }

        const totalHuman = Number(row.price) / 10 ** decimals;
        const qty = Number(row.quantity || 1n);
        const unitHuman = qty > 0 ? totalHuman / qty : totalHuman;

        const startISO = toISOFromSeconds(row.startTime) || new Date().toISOString();
        const endISO = row.endTime && row.endTime !== 0n ? toISOFromSeconds(row.endTime) : null;

        const mapped: ListingRow = {
          id: `onchain-${id.toString()}-${String(row.seller).toLowerCase()}`,
          sellerAddress: String(row.seller),
          quantity: qty,
          startTime: startISO,
          endTime: endISO,
          nft: {
            contract: token,
            tokenId,
            standard: Number(row.standard) === 1 ? "ERC1155" : "ERC721",
          },
          currency: {
            id: null,
            kind: isNative ? "NATIVE" : "ERC20",
            symbol,
            decimals,
            tokenAddress: isNative ? null : String(row.currency),
          },
          price: {
            unit: unitHuman.toString(),
            total: totalHuman.toString(),
            totalWei: (row.price ?? 0n).toString(),
          },
        };
        return mapped;
      } catch {
        return null;
      }
    });

    const results = (await Promise.all(reads)).filter(Boolean) as ListingRow[];
    out.push(...results);
  }

  const unique = mergeUniqueBySeller([], out);
  const now = Date.now();
  return unique.filter((l) => {
    const s = l.startTime ? new Date(l.startTime).getTime() : 0;
    const e = l.endTime ? new Date(l.endTime).getTime() : Number.POSITIVE_INFINITY;
    return now >= s && now <= e;
  });
}

/** Verify a single listing is still active on-chain */
async function isListingActiveOnChain(it: ListingRow): Promise<boolean> {
  try {
    const is1155 = (it.nft.standard || "").toUpperCase() === "ERC1155";
    if (is1155) {
      const li = await marketplace.readActiveListingForSeller({
        collection: it.nft.contract as `0x${string}`,
        tokenId: BigInt(it.nft.tokenId),
        standard: "ERC1155",
        seller: it.sellerAddress as `0x${string}`,
      });
      return !!li?.id && li.id !== 0n;
    } else {
      const li = await marketplace.readActiveListing({
        collection: it.nft.contract as `0x${string}`,
        tokenId: BigInt(it.nft.tokenId),
        standard: "ERC721",
      });
      return !!li?.id && li.row?.seller?.toLowerCase?.() === it.sellerAddress.toLowerCase();
    }
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------- */
/* Component                                                  */
/* ---------------------------------------------------------- */

export default function ListingsGridIsland({
  contract,
  tokenId,
  standardHint,
  nameHint,
  imageHint,
  initialItems = [],
  initialNextCursor = null,
}: {
  contract: string;
  tokenId: string;
  standardHint?: "ERC721" | "ERC1155" | string;
  nameHint?: string;
  imageHint?: string;
  initialItems?: ListingRow[];
  initialNextCursor?: string | null;
}) {
  const [items, setItems] = React.useState<ListingRow[]>(Array.isArray(initialItems) ? initialItems : []);

  // SWR — live DB refresh
  const key = `/api/listing/active?contract=${encodeURIComponent(contract)}&tokenId=${encodeURIComponent(
    tokenId
  )}&limit=60`;
  const { data, mutate } = useSWR<{ items?: ListingRow[]; nextCursor?: string | null }>(key, fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 8000,
  });

  React.useEffect(() => {
    if (Array.isArray(data?.items)) setItems(data!.items!);
  }, [data?.items]);

  // On-chain fallback (DB empty → scan chain)
  React.useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if ((items?.length ?? 0) > 0) return;

      try {
        const scanned = await scanRecentListingsForToken(contract, tokenId, 200);
        if (!cancelled && scanned.length) {
          const filtered =
            standardHint && (standardHint === "ERC721" || standardHint === "ERC1155")
              ? scanned.filter((x) => x.nft.standard === standardHint)
              : scanned;

          if (filtered.length) setItems(filtered);
        }
      } catch {}
    }

    hydrate();
    const id = window.setInterval(hydrate, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract, tokenId, standardHint, Array.isArray(items) ? items.length : 0]);

  // PRUNE
  React.useEffect(() => {
    let cancelled = false;
    async function prune() {
      const curr = Array.isArray(items) ? items : [];
      if (!curr.length) return;

      const checks = await Promise.all(
        curr.map(async (it) => ({ it, ok: await isListingActiveOnChain(it) }))
      );
      const filtered = checks.filter((c) => c.ok).map((c) => c.it);
      if (!cancelled) setItems(filtered);
    }
    prune();
    const id = window.setInterval(prune, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [items]);

  function handleCardDone(sellerAddress?: string) {
    if (!sellerAddress) return;
    setItems((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (it) => it.sellerAddress.toLowerCase() !== sellerAddress.toLowerCase()
      )
    );
    mutate();
  }

  const safeItems = Array.isArray(items) ? items : [];

  if (safeItems.length === 0) {
    return (
      <>
        <LoaderModal />
        <div className="rounded-xl border p-10 text-center text-sm text-muted-foreground">
          No active listings for this token.
        </div>
      </>
    );
  }

  return (
    <>
      <LoaderModal />
      {/* 1 / 2 / 3 / 4 columns */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {safeItems.map((it) => {
          const img = it.nft?.image || "/placeholder.svg";
          const name =
            it.nft?.name || `${it.nft.contract.slice(0, 6)}…${it.nft.contract.slice(-4)} #${it.nft.tokenId}`;
          const qty = Number(it.quantity || 1);

          const dbUnitHuman =
            it.price?.unit ??
            (it.price?.total ? String(Number(it.price.total) / Math.max(1, qty)) : null) ??
            (it.price?.current ? String(Number(it.price.current) / Math.max(1, qty)) : null) ??
            null;

          const dbTotalWei =
            it.price?.totalWei ??
            it.price?.currentWei ??
            (it.price?.unitWei && qty ? (BigInt(it.price.unitWei) * BigInt(qty)).toString() : null) ??
            null;

          return (
            <li
              key={it.id}
              className="rounded-xl border bg-card text-card-foreground overflow-hidden w-full"
            >
              <div className="aspect-square relative bg-muted/40">
                <Image src={img} alt={name} fill className="object-cover" unoptimized />
              </div>

              <div className="p-4 space-y-3">
                {/* Title */}
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{it.nft.standard ?? "ERC721"}</div>
                  <div className="font-semibold truncate" title={name}>
                    {name}
                  </div>
                </div>

                {/* Seller + Price — stack on mobile, row on sm+ */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 min-w-0">
                  <div className="text-sm min-w-0">
                    <div className="opacity-70">Seller</div>
                    <Link
                      className="font-mono hover:underline break-words"
                      href={`/profile/${it.sellerAddress}`}
                      title={it.sellerAddress}
                    >
                      {it.sellerAddress.slice(0, 6)}…{it.sellerAddress.slice(-4)}
                    </Link>
                  </div>

                  <div className="min-w-0 sm:min-w-[160px]">
                    <PriceCellIsland
                      contract={it.nft.contract}
                      tokenId={it.nft.tokenId}
                      standard={it.nft.standard}
                      sellerAddress={it.sellerAddress}
                      qty={qty}
                      dbSymbol={it.currency?.symbol}
                      dbPriceHuman={dbUnitHuman}
                      dbPriceWei={dbTotalWei}
                    />
                  </div>
                </div>

                {/* Times — wrap safely */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <div className="min-w-0">Start: {fmtDateTime(it.startTime)}</div>
                  <div className="min-w-0">End: {fmtDateTime(it.endTime)}</div>
                </div>

                {/* Actions — stack on mobile, row on sm+; no overflow */}
                <BuyNowIsland
                  contract={it.nft.contract}
                  tokenId={it.nft.tokenId}
                  standard={it.nft.standard}
                  sellerAddress={it.sellerAddress}
                  currencyAddress={it.currency?.tokenAddress ?? null}
                  amountWei={dbTotalWei}
                  startTimeISO={it.startTime}
                  endTimeISO={it.endTime ?? undefined}
                  className="w-full sm:flex-1"
                  onDone={({ sellerAddress }) => handleCardDone(sellerAddress)}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
