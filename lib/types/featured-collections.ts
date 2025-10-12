export type FeaturedInitial = {
  active: {
    id: string;
    cycleId: string;
    startAt: string; // ISO
    endAt: string;   // ISO
    minBidWei: string;
    minBidETN: string;
    status: "UPCOMING" | "ACTIVE" | "FINALIZED";
    leader: string;
    leaderAmountWei: string;
    leaderAmountETN: string;
    leaderUser: {
      id: string;
      username: string | null;
      profileAvatar: string | null;
      walletAddress: string;
    } | null;
  } | null;
  fx: { lastPriceUsd: string; lastPriceAt: string | null } | null;
  now: number;
  contract: string;
};
