"use client";
export function StatusChips({
  standard,
  royaltyBps,
  isListedLive,
  onAuction,
  rarity,
}: {
  standard: "ERC721" | "ERC1155";
  royaltyBps: number;
  isListedLive: boolean;
  onAuction: boolean;
  rarity: { score: number; rank?: number; population?: number };
}) {
  const royaltyText =
    royaltyBps && royaltyBps > 0 ? `${royaltyBps / 100}%` : "Not implemented";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
        <span className="opacity-70">Type</span>
        <b>{standard}</b>
      </span>
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
        <span className="opacity-70">Royalty</span>
        <b>{royaltyText}</b>
      </span>

      {isListedLive && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2.5 py-1">
          For Sale
        </span>
      )}
      {onAuction && (
        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 px-2.5 py-1">
          On Auction
        </span>
      )}

      {rarity.population ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
            <span className="opacity-70">Rarity Score</span>
            <b>{rarity.score.toFixed(2)}</b>
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
            <span className="opacity-70">Rank</span>
            <b>{rarity.rank ?? "—"}/{rarity.population}</b>
          </span>
        </>
      ) : null}
    </div>
  );
}
