import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { CollectionWithNFTs } from "@/lib/types/types";
import { useIndexingStore } from "@/lib/store/useIndexingStore";

export const useCollectionDetails = (contract: string) => {
  const queryClient = useQueryClient();
  const { isIndexing } = useIndexingStore();

  // If indexing, keep polling; also kick a manual invalidation every 5s so dependent views refresh.
  useEffect(() => {
    if (!isIndexing) return;
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["collection", contract] });
    }, 5000);
    return () => clearInterval(id);
  }, [isIndexing, contract, queryClient]);

  return useQuery<CollectionWithNFTs>({
    queryKey: ["collection", contract],
    queryFn: async () => {
      const res = await fetch(`/api/collections/${contract}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch collection");
      return res.json();
    },
    refetchInterval: isIndexing ? 5000 : false,
    refetchOnWindowFocus: isIndexing, // nice while indexing
    staleTime: isIndexing ? 0 : 30_000,
    gcTime: 5 * 60_000,
    placeholderData: (prev) => prev, // don’t flash empty while refetching
  });
};
