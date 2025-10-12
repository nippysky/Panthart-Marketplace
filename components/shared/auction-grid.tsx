"use client";

import React from "react";
import AuctionCardSkeleton from "@/components/skeleton/AuctionCardSkeleton";
import AuctionCard from "./action-card";

type Item = {
  id: string; // DB auction id
  nft: {
    contract: string;
    tokenId: string;
    name: string;
    image: string | null;
    standard: "ERC721" | "ERC1155" | string;
  };
  startTime: string;
  endTime: string;
  currency: {
    id: string | null;
    kind: "NATIVE" | "ERC20";
    symbol: string;
    decimals: number;
    tokenAddress: string | null;
  };
  price: { currentWei?: string; current?: string };
};

export default function AuctionGrid() {
  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<Item[]>([]);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auction/active?limit=30", { cache: "no-store" });
      const json = await res.json();
      setItems(json.items || []);
    } catch (e) {
      console.error("[AuctionGrid] load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = setInterval(load, 7000); // light polling to keep the grid fresh
    return () => clearInterval(id);
  }, [load]);

  return (
    <section className="w-full grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 mt-10 mb-20">
      {loading
        ? Array.from({ length: 10 }).map((_, i) => <AuctionCardSkeleton key={i} />)
        : items.map((it) => (
            <AuctionCard
              key={it.id}
              nftAddress={it.nft.contract}
              tokenId={it.nft.tokenId}
              name={it.nft.name}
              image={it.nft.image || "/opengraph-image.png"}
              endTime={it.endTime}
              href={`/auction/${it.id}`} // <-- new route uses DB auction id
              subtitle={`${it.price.current ?? "—"} ${it.currency.symbol}`}
            />
          ))}
    </section>
  );
}
