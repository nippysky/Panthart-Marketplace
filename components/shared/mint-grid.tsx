// components/shared/mint-grid.tsx
"use client";

import React, { useEffect, useMemo, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import MintingCard from "@/components/shared/mint-card";
import MintingCardSkeleton from "@/components/skeleton/MintingCardSkeleton";
import { MintingNowItem } from "@/lib/types/minting-now";

type PagePayload = { items: MintingNowItem[]; nextCursor: string | null };

const fetcher = (url: string): Promise<PagePayload> =>
  fetch(url).then((r) => r.json());

const PAGE_SIZE = 20;

function keyOf(item: MintingNowItem) {
  return `${item.kind}:${item.id}`;
}

export default function MintGrid({
  className = "",
  initialPage,
  excludeKeys = [],
}: {
  className?: string;
  initialPage?: PagePayload;
  /** Deduplicate against hero or any externally-featured items */
  excludeKeys?: string[];
}) {
  const getKey = (pageIndex: number, previousPageData: PagePayload | null) => {
    if (previousPageData && !previousPageData.nextCursor) return null; // end of list
    const params = new URLSearchParams();
    params.set("limit", String(PAGE_SIZE));
    if (pageIndex > 0 && previousPageData?.nextCursor) {
      params.set("cursorISO", previousPageData.nextCursor);
    }
    return `/api/minting-now?${params.toString()}`;
  };

  const { data, isLoading, size, setSize, isValidating } =
    useSWRInfinite<PagePayload>(getKey, fetcher, {
      revalidateFirstPage: true,
      persistSize: true,
      refreshInterval: 30_000,
      ...(initialPage ? { fallbackData: [initialPage] } : {}),
    });

  const excludeSet = useMemo(() => new Set(excludeKeys), [excludeKeys]);

  const pages = data ?? [];
  const rawItems: MintingNowItem[] = pages.flatMap((p) => p.items ?? []);

  // 🔧 tweak #1: cross-page dedup (by kind:id)
  const deduped: MintingNowItem[] = Array.from(
    new Map(rawItems.map((it) => [keyOf(it), it])).values()
  );

  // apply external exclusions (e.g., featured/hero)
  const items = deduped.filter((it) => !excludeSet.has(keyOf(it)));

  const hasMore =
    pages.length === 0 ? false : Boolean(pages[pages.length - 1]?.nextCursor);

  // infinite scroll
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!hasMore) return;
    const el = moreRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setSize((s) => s + 1);
      },
      { rootMargin: "600px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, setSize]);

  // 🔧 tweak #2: avoid "Nothing..." flash during background refreshes
  const showSkeleton = (isLoading || isValidating) && items.length === 0;
  if (showSkeleton) {
    return (
      <section
        className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 ${className}`}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <MintingCardSkeleton key={i} />
        ))}
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <div
        className={`rounded-xl border border-white/10 p-6 text-center text-sm text-muted-foreground ${className}`}
      >
        Nothing is minting right now. New drops appear here the moment they go
        live.
      </div>
    );
  }

  return (
    <>
      <section
        className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-5 ${className}`}
      >
        {items.map((item) => (
          <MintingCard key={keyOf(item)} item={item} />
        ))}
      </section>

      <div className="flex justify-center mt-6">
        {hasMore ? (
          <>
            <button
              className="px-4 py-2 rounded-md border border-black/10 dark:border-white/10 text-sm"
              onClick={() => setSize(size + 1)}
              disabled={isValidating}
            >
              {isValidating ? "Loading…" : "Load more"}
            </button>
            {/* sentinel for auto-load */}
            <div ref={moreRef} className="h-10 w-10" />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No more results.</p>
        )}
      </div>
    </>
  );
}
