// components/shared/mint-hero.tsx
"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CalendarDays, Flame, Play } from "lucide-react";
import { formatEtnFromWei, MintingNowItem } from "@/lib/types/minting-now";

// Deterministic UTC formatter -> 2025-08-16 08:57:00 UTC
function fmtUTC(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    const y = d.getUTCFullYear();
    const m = pad(d.getUTCMonth() + 1);
    const day = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const mm = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${y}-${m}-${day} ${hh}:${mm}:${ss} UTC`;
  } catch {
    return iso;
  }
}

export default function MintHero({
  item,
}: {
  item: MintingNowItem & { description?: string | null };
}) {
  const [expanded, setExpanded] = React.useState(false);

  // Safe price (falls back to public price if presale price is missing)
  const priceWei =
    item.status === "presale"
      ? item.presale?.priceEtnWei ?? item.publicSale.priceEtnWei
      : item.publicSale.priceEtnWei;

  const price = formatEtnFromWei(priceWei);

  // Use startISO fields (presale or public) and format via UTC
  const startsAtISO =
    item.status === "presale"
      ? item.presale?.startISO ?? item.publicSale.startISO
      : item.publicSale.startISO;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10">
      {/* Soft background image + gradients */}
      <div className="absolute inset-0">
        <Image
          src={item.coverUrl || item.logoUrl}
          alt={item.name}
          fill
          unoptimized
          sizes="100vw"
          className="object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_20%_-10%,rgba(56,189,248,0.18),transparent_70%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_80%_110%,rgba(168,85,247,0.18),transparent_60%)]" />
      </div>

      {/* Glass panel (compact banner-style) */}
      <div className="relative p-3 md:p-5 backdrop-blur-xl bg-black/20">
        <div className="grid gap-4 md:gap-6 md:grid-cols-[360px,1fr] items-center">
          {/* Artwork — fixed banner heights for mobile; no awkward stretching */}
          <div className="relative h-[150px] sm:h-[180px] md:h-[210px] lg:h-[240px] xl:h-[260px] max-h-[300px] rounded-xl overflow-hidden ring-1 ring-white/15">
            <Image
              src={item.coverUrl || item.logoUrl}
              alt={item.name}
              fill
              unoptimized
              sizes="(min-width: 1280px) 520px, (min-width: 1024px) 420px, (min-width: 768px) 360px, 100vw"
              className="object-cover"
            />
          </div>

          {/* Info */}
          <div className="flex flex-col justify-center gap-4 p-1">
            {/* Top row — stacks on mobile, splits on md+ */}
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              {/* Left: status + title + description */}
              <div className="min-w-0">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-[11px] md:text-xs backdrop-blur bg-white/5">
                  <Flame className="w-3.5 h-3.5" />
                  <span className="uppercase tracking-wide">
                    {item.status === "presale" ? "Presale Live" : "Public Sale Live"}
                  </span>
                </div>

                <h2 className="mt-2 text-xl md:text-2xl font-semibold tracking-tight truncate text-white">
                  {item.name}
                </h2>

                {item.description ? (
                  <div className="mt-1 text-xs md:text-sm text-white">
                    <p
                      className={[
                        "transition-all",
                        expanded ? "" : "line-clamp-2 md:line-clamp-3",
                      ].join(" ")}
                    >
                      {item.description}
                    </p>
                    {item.description.length > 110 && (
                      <button
                        type="button"
                        onClick={() => setExpanded((v) => !v)}
                        className="mt-1 inline-block text-[11px] md:text-xs underline underline-offset-2 hover:no-underline text-foreground/80"
                      >
                        {expanded ? "Show less" : "Read more"}
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Right: price block — left-aligned on mobile, right-aligned on md+ */}
              <div className="text-left md:text-right min-w-[160px]">
                <div className="text-xs text-white">Price</div>
                <div className="text-lg font-semibold text-white">{price} ETN</div>
                {startsAtISO && (
                  <div className="mt-1 inline-flex items-center gap-1 text-[11px] md:text-xs text-white">
                    <CalendarDays className="w-3.5 h-3.5" />
                    {/* Suppress hydration warning just in case and use deterministic UTC string */}
                    <span suppressHydrationWarning>{fmtUTC(startsAtISO)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress */}
            <div>
              <Progress value={item.mintedPct} className="h-2" />
              <div className="mt-2 text-[11px] md:text-xs text-white">
                {item.minted} / {item.supply} minted
              </div>
            </div>

            {/* Action*/}
            <Link href={item.href}>
                <Button className="gap-2 h-9 px-4">
                  <Play className="w-4 h-4" />
                  Mint now
                </Button>
              </Link>
          </div>
        </div>
      </div>
    </div>
  );
}