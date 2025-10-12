"use client";

import React from "react";

export type RarityRow = {
  trait_type: string;
  value: string;
  count: number;
  frequency: number; // 0..1
  rarityPercent: number; // %
  rarityScore: number;
};

export default function NFTAttributesTab({
  traitsWithRarity,
  rarityScore,
  rarityRank,
  population,
}: {
  traitsWithRarity: RarityRow[];
  rarityScore: number;
  rarityRank: number | null | undefined;
  population: number;
}) {
  return (
    <div className="space-y-4">
      {/* header strip */}
      <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-slate-900/60 to-sky-900/40 dark:from-white/5 dark:to-white/10">
          <div className="text-sm font-medium">Traits</div>
          <div className="flex items-center gap-4 text-xs sm:text-sm">
            <div className="inline-flex items-center gap-2 rounded-lg bg-black/10 dark:bg-white/10 px-3 py-1.5">
              <span className="opacity-70">Rarity Rank</span>
              <span className="font-semibold">
                {rarityRank ?? "—"}{population ? ` / ${population}` : ""}
              </span>
            </div>
            <div className="inline-flex items-center gap-2 rounded-lg bg-black/10 dark:bg-white/10 px-3 py-1.5">
              <span className="opacity-70">Rarity Score</span>
              <span className="font-semibold">{rarityScore}</span>
            </div>
          </div>
        </div>

        {/* grid */}
        <div className="p-4">
          {traitsWithRarity?.length ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {traitsWithRarity.map((t, i) => (
                <div
                  key={`${t.trait_type}-${t.value}-${i}`}
                  className="rounded-xl border border-black/10 dark:border-white/10 bg-white/50 dark:bg-white/[0.04] px-4 py-3"
                >
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t.trait_type}
                  </div>
                  <div className="text-base font-semibold mt-0.5 break-words">
                    {String(t.value)}
                  </div>
                  <div className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
                    {t.rarityPercent}% have this trait
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No attributes found.</div>
          )}
        </div>
      </div>
    </div>
  );
}
