// components/explore/mobile/collections-mobile-cards.tsx
"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiCollection } from "../explore-collections";

function Num({ v }: { v: number | null | undefined }) {
  return <>{v == null ? "-" : Intl.NumberFormat().format(v)}</>;
}
function Pct({ v }: { v: number | null | undefined }) {
  if (v == null || !isFinite(v)) return <span className="text-muted-foreground">-</span>;
  const s = v.toFixed(2) + "%";
  if (v > 0) return <span className="text-green-500">{s}</span>;
  if (v < 0) return <span className="text-red-500">{s}</span>;
  return <span className="text-muted-foreground">{s}</span>;
}

export function CollectionsMobileCards({
  items,
  isLoading,
  windowLabel,
}: {
  items: ApiCollection[];
  isLoading: boolean;
  windowLabel: string;
}) {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-[50px] w-[50px] rounded-md" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <small className="opacity-70">VOLUME</small>
                <Skeleton className="h-5 w-20 mt-1" />
              </div>
              <div>
                <small className="opacity-70">FLOOR</small>
                <Skeleton className="h-5 w-20 mt-1" />
              </div>
              <div>
                <small className="opacity-70">CHANGE</small>
                <Skeleton className="h-5 w-20 mt-1" />
              </div>
              <div>
                <small className="opacity-70">ITEMS / OWNERS</small>
                <Skeleton className="h-5 w-20 mt-1" />
              </div>
            </div>
          </Card>
        ))}
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-6 text-center text-sm text-muted-foreground">
        No collections match your filters.
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {items.map((c) => {
        const isLive = c.sale?.isActive;
        const href = isLive ? `/minting-now/${c.contract}` : `/collections/${c.contract}`;
        const phase = c.sale?.activePhase;
        const sym = c.currency?.symbol ?? "ETN";

        return (
          <Link key={c.id} href={href}>
            <Card className="p-3 hover:ring-1 hover:ring-brand/40 transition">
              <CardContent className="p-0">
                <div className="flex items-center gap-3">
                  <div className="relative h-[50px] w-[50px] rounded-md overflow-hidden ring-1 ring-border/40 bg-muted">
                    {!!c.logoUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logoUrl} alt={c.name} className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-medium truncate">{c.name}</p>
                    {isLive && (
                      <Badge className="bg-muted-foreground text-[10px] uppercase tracking-wide">
                        {phase === "presale" ? "Presale live" : "Public sale live"}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <small className="opacity-70">VOLUME ({windowLabel})</small>
                    <div className="text-base font-semibold gap-1 flex items-center">
                      <Num v={c.windowVolume ?? 0} />
                      <span className="text-[10px] px-1 py-[1px] rounded border border-border text-muted-foreground">{sym}</span>
                    </div>
                  </div>
                  <div>
                    <small className="opacity-70">FLOOR</small>
                    <div className="text-base font-semibold gap-1 flex items-center">
                      <Num v={c.floorPrice} />
                      <span className="text-[10px] px-1 py-[1px] rounded border border-border text-muted-foreground">{sym}</span>
                    </div>
                  </div>
                  <div>
                    <small className="opacity-70">CHANGE</small>
                    <div className="text-base font-semibold">
                      <Pct v={c.windowChange} />
                    </div>
                  </div>
                  <div>
                    <small className="opacity-70">ITEMS / OWNERS</small>
                    <div className="text-base font-semibold">
                      <Num v={c.items} /> / <Num v={c.owners} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </section>
  );
}
