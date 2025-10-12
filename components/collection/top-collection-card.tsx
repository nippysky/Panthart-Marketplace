// components/collection/top-collection-card.tsx
"use client";

import React from "react";
import Image, { StaticImageData } from "next/image";
import Link from "next/link";
import { formatNumber } from "@/lib/utils";

interface TopCollectionCardProps {
  collectionID: number;
  name: string;
  percentage: string;
  percentageStatus: "increase" | "decrease" | "neutral";
  collectionImg: string | null | StaticImageData;
  floorPrice: number;
  volume: number; // window volume
  currencySymbol: string; // NEW: "ETN", "CTS2", etc.
  path: string;
  salePhase?: "presale" | "public" | null; // badge
}

export default function TopCollectionCard({
  name,
  percentage,
  percentageStatus,
  collectionImg,
  collectionID,
  floorPrice,
  volume,
  currencySymbol,
  path,
  salePhase = null,
}: TopCollectionCardProps) {
  const badge =
    salePhase === "presale"
      ? {
          text: "Pre-Sale Live",
          cls: "bg-amber-500/15 text-amber-500 border border-amber-500/30",
        }
      : salePhase === "public"
      ? {
          text: "Public Sale Live",
          cls: "bg-emerald-500/15 text-emerald-500 border border-emerald-500/30",
        }
      : null;

  const Pill = () =>
    badge ? (
      <span
        className={`inline-flex items-center rounded-full px-2 py-[2px] text-[10px] leading-none whitespace-nowrap shrink-0 ${badge.cls}`}
      >
        {badge.text}
      </span>
    ) : null;

  const pctClass =
    percentageStatus === "increase"
      ? "text-emerald-500"
      : percentageStatus === "decrease"
      ? "text-red-500"
      : "text-muted-foreground";

  return (
    <Link href={path}>
      <section className="w-full flex justify-between items-center gap-4 sm:gap-10 my-5 p-5 border-b transition-all duration-200 hover:bg-muted/60 rounded-md">
        {/* LEFT: rank + avatar + name + floor */}
        <div className="w-[70%] flex gap-3 items-center min-w-0">
          <span className="w-5 text-right">
            <p className="font-medium text-[0.75rem]">{collectionID}</p>
          </span>

          <div className="flex-1 flex items-center gap-3 lg:gap-4 min-w-0">
            <div className="relative aspect-square w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-md overflow-hidden bg-muted">
              {collectionImg ? (
                <Image
                  src={collectionImg as string}
                  alt={name}
                  fill
                  sizes="(max-width: 640px) 56px, 64px"
                  unoptimized
                  className="object-cover object-center"
                />
              ) : null}
            </div>

            <div className="min-w-0">
              {/* Row: name + pill (show inline ≥ sm) */}
              <div className="flex items-center gap-2 min-w-0">
                <p className="text-[0.95rem] lg:text-[1rem] font-bold truncate" title={name}>
                  {name}
                </p>
                <span className="hidden sm:inline-flex">
                  <Pill />
                </span>
              </div>

              {/* Pill on its own line on mobile */}
              <div className="mt-1 sm:hidden">
                <Pill />
              </div>

              {/* Floor line */}
              <div className="flex gap-2 items-center mt-1">
                <small className="text-[0.75rem] lg:text-[0.95rem]">Floor:</small>
                <div className="flex gap-1.5 items-center">
                  <small className="text-[0.75rem] lg:text-[0.95rem] font-medium">
                    {formatNumber(floorPrice)}
                  </small>
                  <span className="text-[0.7rem] opacity-70">{currencySymbol}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: % change + window volume */}
        <div className="w-[30%] flex justify-end">
          <div className="text-right">
            <h3 className={cnPct(pctClass)}>{percentage}</h3>

            <div className="flex gap-2 items-center mt-1 justify-end">
              <small className="text-[0.75rem] lg:text-[0.95rem]">Vol:</small>
              <div className="flex gap-1.5 items-center">
                <small className="text-[0.75rem] lg:text-[0.95rem] font-medium">
                  {formatNumber(volume)}
                </small>
                <span className="text-[0.7rem] opacity-70">{currencySymbol}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Link>
  );
}

/** Subtle helper to keep class tidy */
function cnPct(colorClass: string) {
  return `text-[0.7rem] lg:text-[1rem] font-semibold ${colorClass}`;
}
