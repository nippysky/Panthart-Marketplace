"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber, shortenAddress } from "@/lib/utils";

/* API shape now includes currency meta */
export type DirectoryCollection = {
  id: string;
  name: string;
  contract: string;
  logoUrl: string | null;
  coverUrl: string | null;
  volume: number;
  floorPrice: number | null;
  items: number;
  owners: number;
  isFullyIndexed: boolean;
  sale: { isActive: boolean; activePhase: "presale" | "public" | null };
  windowVolume: number;
  windowChange: number | null;
  windowLabel: string;
  standard?: string | null;
  currency?: { id?: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" };
};

function Trend({ change, label }: { change: number | null; label?: string }) {
  if (change == null) return <span className="text-xs text-muted-foreground">{label ?? ""}</span>;
  const sign = change > 0 ? "+" : "";
  const tone =
    change > 0 ? "text-emerald-500" : change < 0 ? "text-rose-500" : "text-muted-foreground";
  return (
    <span className={`text-xs ${tone}`}>
      {label ? `${label}: ` : ""}
      {sign}
      {change.toFixed(1)}%
    </span>
  );
}

export default function CollectionCard({ collection }: { collection: DirectoryCollection }) {
  const isMintingLive = Boolean(collection.sale?.isActive);
  const href = isMintingLive ? `/minting-now/${collection.contract}` : `/collections/${collection.contract}`;
  const aria = isMintingLive ? "Mint now" : "View collection";

  const sym = collection.currency?.symbol ?? "ETN";

  return (
    <Link href={href} aria-label={aria} className="block group">
      {/* Remove any top padding so the cover touches edge */}
      <Card className="overflow-hidden transition hover:shadow-lg border-border/70 p-0">
        {/* Cover — flush to edges */}
        <div className="relative h-36 w-full">
          {collection.coverUrl ? (
            <Image
              src={collection.coverUrl}
              alt={collection.name}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 33vw"
              unoptimized
              priority={false}
            />
          ) : (
            <div className="h-full w-full bg-muted" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent" />
          {collection.sale?.isActive && (
            <div className="absolute left-3 top-3">
              <Badge className="bg-emerald-600/90 hover:bg-emerald-600">
                {collection.sale.activePhase === "presale" ? "Presale live" : "Public sale live"}
              </Badge>
            </div>
          )}
        </div>

        {/* Header */}
        <CardHeader className="pt-3 px-4 flex items-center gap-3">
          <div className="relative h-10 w-10 rounded-md overflow-hidden bg-muted ring-1 ring-border">
            {collection.logoUrl ? (
              <Image src={collection.logoUrl} alt={collection.name} fill className="object-cover" sizes="40px" unoptimized />
            ) : (
              <div className="h-full w-full bg-muted" />
            )}
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{collection.name}</CardTitle>
            <div className="text-[11px] text-muted-foreground truncate">
              {shortenAddress(collection.contract)}
            </div>
          </div>
          {!collection.isFullyIndexed && (
            <div className="ml-auto">
              <Badge variant="secondary" className="text-[11px]">syncing</Badge>
            </div>
          )}
        </CardHeader>

        {/* Metrics */}
        <CardContent className="px-4 pb-4">
          <div className="flex items-center justify-between gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">{collection.windowLabel} Vol</div>
              <div className="font-semibold">
                {formatNumber(collection.windowVolume || 0)} <span className="text-xs align-[1px]">{sym}</span>
              </div>
              <Trend change={collection.windowChange} />
            </div>

            <div className="text-right">
              <div className="text-xs text-muted-foreground">Floor</div>
              <div className="font-semibold">
                {collection.floorPrice != null ? formatNumber(collection.floorPrice) : "—"}{" "}
                <span className="text-xs align-[1px]">{sym}</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <div>
              Items: <span className="font-medium text-foreground">{formatNumber(collection.items)}</span>
            </div>
            <div>
              Owners: <span className="font-medium text-foreground">{formatNumber(collection.owners)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

/* Skeleton mirrors layout */
function CardSkeleton() {
  return (
    <div className="w-full">
      <Skeleton className="h-36 w-full rounded-xl mb-3" />
      <div className="flex items-center gap-3 mb-2">
        <Skeleton className="h-10 w-10 rounded-md" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-5 w-16 rounded" />
      </div>
      <div className="flex items-center justify-between mb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  );
}
CollectionCard.Skeleton = CardSkeleton;
