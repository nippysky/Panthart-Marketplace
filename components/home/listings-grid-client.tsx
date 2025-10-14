"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import MediaThumb from "@/components/shared/media-thumb";
import { Skeleton } from "@/components/ui/skeleton";

function shorten(addr: string) {
  const a = addr?.toLowerCase?.() ?? "";
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

type Item = {
  id: string;
  createdAt: string;
  href: string;
  title: string | null;
  media: string | null;
  standard: string | null; // "ERC721" | "ERC1155"
  quantity?: number | null; // for badge when ERC1155
  seller: string;
  priceLabel: string;
};

export default function ListingsGridClient({
  initialItems,
  initialCursor,
}: {
  initialItems: Item[];
  initialCursor: string | null;
}) {
  const [items, setItems] = useState<Item[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);

  // infinite scroll sentinel
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!cursor) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading) void loadMore();
    });
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, sentinelRef.current, loading]);

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/listings/fixed?cursor=${encodeURIComponent(cursor)}&take=24`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (data?.ok) {
        const next = (data.items || []).map((d: any) => ({
          id: d.id,
          createdAt: d.createdAt,
          href: d.href,
          title: d.name || d.title,
          media: d.media,
          standard: d.standard ?? "ERC721",
          quantity: d.quantity ?? 1,
          seller: d.seller,
          priceLabel: `${d.price} ${d.currency?.symbol ?? ""}`.trim(),
        }));
        setItems((prev) => [...prev, ...next]);
        setCursor(data.nextCursor || null);
      }
    } finally {
      setLoading(false);
    }
  }

  if (!items.length) {
    return <div className="text-sm text-muted-foreground">No active fixed-price listings.</div>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
        {items.map((v) => {
          const is1155 = v.standard === "ERC1155";
          return (
            <Link key={`${v.id}-${v.createdAt}`} href={v.href} prefetch={false} className="group block">
              <Card className="overflow-hidden rounded-2xl bg-card/50 backdrop-blur-sm border-border/50 transition-all duration-200 hover:shadow-lg hover:-translate-y-[2px] pt-0">
                <div className="relative w-full aspect-square bg-muted/30">
                  {/* media touches the top edge */}
                  <MediaThumb src={v.media || undefined} alt={v.title || "NFT"} />

                  {/* Badge (top-left) */}
                  <div className="absolute left-3 top-3 z-10">
                    <Badge className="rounded-full px-2.5 py-1 text-[10px] sm:text-xs backdrop-blur border-border/50 bg-black/65 text-white">
                      {is1155 ? `ERC-1155${v.quantity && v.quantity > 1 ? ` × ${v.quantity}` : ""}` : "ERC-721"}
                    </Badge>
                  </div>
                </div>

                <CardContent className="p-3 sm:p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{v.title || "Untitled"}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        Seller {shorten(v.seller)}
                      </div>
                    </div>
                    <div className="text-right text-sm font-semibold shrink-0">{v.priceLabel}</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}

        {/* loading skeletons */}
        {loading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={`sk-${i}`} className="overflow-hidden rounded-2xl">
              <Skeleton className="w-full aspect-square" />
              <CardContent className="p-3 sm:p-4">
                <Skeleton className="h-4 w-3/5 mb-2" />
                <Skeleton className="h-3 w-2/5" />
              </CardContent>
            </Card>
          ))}
      </div>

      {/* infinite scroll sentinel + fallback button */}
      <div ref={sentinelRef} className="h-10" />
      {cursor && (
        <div className="flex items-center justify-center mt-6">
          <Button onClick={loadMore} disabled={loading} variant="outline">
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </>
  );
}
