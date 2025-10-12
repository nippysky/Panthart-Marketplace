// components/shared/mint-card.tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatEtnFromWei, MintingNowItem } from "@/lib/types/minting-now";


export default function MintingCard({ item }: { item: MintingNowItem }) {
  const priceWei =
    item.status === "presale"
      ? item.presale!.priceEtnWei
      : item.publicSale.priceEtnWei;

  const price = formatEtnFromWei(priceWei);

  const statusLabel = item.status === "presale" ? "Presale" : "Public";
  const badge = item.kind === "erc1155" ? " • ERC1155" : "";

  return (
    <Link href={item.href} className="block group">
      <Card className="h-full p-3 cursor-pointer rounded-xl border-white/10 bg-white/5 backdrop-blur-xl ring-1 ring-black/10 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xl hover:bg-white/10">
        <div className="relative w-full aspect-square mb-3 rounded-lg overflow-hidden ring-1 ring-white/10">
          <Image
            src={item.logoUrl || item.coverUrl}
            alt={item.name}
            fill
            unoptimized
            className="object-cover object-center transition-transform duration-300 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/40 to-transparent" />
          <div className="absolute top-3 left-3 text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/50 backdrop-blur text-white/90 ring-1 ring-white/20">
            {statusLabel} Live{badge}
          </div>
        </div>

        <div className="mt-1 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-sm font-semibold truncate">{item.name}</h2>
            <div className="text-xs text-muted-foreground shrink-0">
              {price} ETN
            </div>
          </div>
          <Progress value={item.mintedPct} className="h-2" />
          <p className="text-[11px] text-muted-foreground">
            {item.minted} / {item.supply} minted
          </p>
        </div>
      </Card>
    </Link>
  );
}
