// components/erc1155/erc1155-grid-client.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Item = {
  id: string;
  contract: string;
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
  single1155?: { name?: string | null } | null;
  collection?: { name?: string | null } | null;
};

export default function Erc1155GridClient({
  initialItems,
  initialCursor,
}: {
  initialItems: Item[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState<Item[]>(initialItems || []);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [auto, setAuto] = useState(true); // auto-load near bottom

  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/nfts/erc1155?take=24&cursor=${encodeURIComponent(cursor)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.ok) {
        setItems((prev) => [...prev, ...(json.items || [])]);
        setCursor(json.nextCursor ?? null);
      }
    } catch (e) {
      // keep graceful
      setAuto(false);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading]);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    if (!auto) return;
    const el = sentinelRef.current;
    if (!el) return;

    const obs = new IntersectionObserver((entries) => {
      const en = entries[0];
      if (en.isIntersecting) {
        void loadMore();
      }
    }, { rootMargin: "400px 0px" });

    obs.observe(el);
    return () => obs.disconnect();
  }, [auto, loadMore]);

  const cards = items.map((nft) => {
    const parent = nft.single1155?.name || nft.collection?.name || "ERC-1155 Drop";
    const title = nft.name || `${parent} #${nft.tokenId}`;
    const href = `/collections/${nft.contract}/${nft.tokenId}`;
    return (
      <Link key={`${nft.contract}-${nft.tokenId}`} href={href} prefetch={false} className="group block">
        <Card className="overflow-hidden rounded-2xl bg-card/50 backdrop-blur-sm border-border/50 transition-all duration-200 hover:shadow-lg hover:translate-y-[-2px] pt-0">
          <div className="relative w-full aspect-square">
            {nft.imageUrl ? (
              <Image
                src={nft.imageUrl}
                alt={title}
                fill
                sizes="(max-width:768px) 50vw, (max-width:1200px) 25vw, 20vw"
                className="object-cover"
                unoptimized
              />
            ) : null}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/60 via-transparent to-transparent opacity-70" />
          </div>
          <CardContent className="p-3 sm:p-4">
            <h3 className="text-sm sm:text-base font-medium line-clamp-1">{title}</h3>
            <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{parent}</p>
          </CardContent>
        </Card>
      </Link>
    );
  });

  return (
    <main className="flex-1">
      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
        {cards}
        {loading &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={`sk-${i}`} className="rounded-2xl overflow-hidden">
              <Skeleton className="w-full aspect-square" />
              <div className="p-3 sm:p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        {!loading && items.length === 0 && (
          <div className="col-span-full text-sm text-muted-foreground">No ERC-1155 items found.</div>
        )}
      </div>

      {/* Load more / sentinel */}
      <div className="flex items-center justify-center mt-10">
        {cursor ? (
          <Button
            onClick={() => loadMore()}
            variant="outline"
            className="h-10 px-5"
          >
            {loading ? "Loading…" : "Load more"}
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">You’ve reached the end.</span>
        )}
      </div>

      {/* Invisible sentinel for auto-load */}
      <div ref={sentinelRef} className="h-px w-full" />
    </main>
  );
}
