"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

type ActiveResp = { items?: any[] } | null;

async function getJson<T>(url: string): Promise<T | null> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return null;
  try {
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function useMarketplaceLive(opts: {
  contract: string;
  tokenId: string | number;
  account?: string | null;
}) {
  const { contract, tokenId, account } = opts;
  const qc = useQueryClient();

  /* ---- API: any listings? ---- */
  const listingsQ = useQuery({
    queryKey: ["activeListings", contract, String(tokenId)],
    queryFn: () =>
      getJson<ActiveResp>(
        `/api/listing/active?contract=${encodeURIComponent(
          contract
        )}&tokenId=${encodeURIComponent(String(tokenId))}&limit=1`
      ),
    refetchInterval: 20_000,
  });

  /* ---- API: any auctions? ---- */
  const auctionsQ = useQuery({
    queryKey: ["activeAuctions", contract, String(tokenId)],
    queryFn: () =>
      getJson<ActiveResp>(
        `/api/auction/active?contract=${encodeURIComponent(
          contract
        )}&tokenId=${encodeURIComponent(String(tokenId))}&limit=1`
      ),
    refetchInterval: 20_000,
  });

  const hasAnyListings = Boolean(listingsQ.data?.items?.length);
  const hasAnyAuctions = Boolean(auctionsQ.data?.items?.length);

  /* ---- Optimistic flags ---- */
  const setHasAnyListingsOptimistic = useCallback(
    (value: boolean) => {
      qc.setQueryData<ActiveResp>(
        ["activeListings", contract, String(tokenId)],
        (prev) => {
          if (value) return { items: [{}] };
          return { items: [] };
        }
      );
    },
    [qc, contract, tokenId]
  );

  const setHasAnyAuctionsOptimistic = useCallback(
    (value: boolean) => {
      qc.setQueryData<ActiveResp>(
        ["activeAuctions", contract, String(tokenId)],
        (_) => {
          if (value) return { items: [{}] };
          return { items: [] };
        }
      );
    },
    [qc, contract, tokenId]
  );

  const invalidateAll = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["activeListings", contract, String(tokenId)] }),
      qc.invalidateQueries({ queryKey: ["activeAuctions", contract, String(tokenId)] }),
    ]);
  }, [qc, contract, tokenId]);

  return {
    hasAnyListings,
    hasAnyAuctions,
    setHasAnyListingsOptimistic,
    setHasAnyAuctionsOptimistic,
    invalidateAll,
  };
}
