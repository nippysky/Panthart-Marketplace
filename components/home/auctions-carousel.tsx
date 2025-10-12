"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MoveRight } from "lucide-react";
import AuctionCardSkeleton from "@/components/skeleton/AuctionCardSkeleton";
import { useIsMobile } from "@/lib/use-is-mobile";
import AuctionCard from "@/components/shared/action-card";

/** API types coming from /api/auction/active */
type ApiActiveItem = {
  id: string; // DB auction id
  nft: {
    contract: string;
    tokenId: string;
    name?: string | null;
    image?: string | null;
    standard?: "ERC721" | "ERC1155" | string | null;
  };
  startTime: string;
  endTime: string;
  currency: {
    id: string | null;
    kind: "NATIVE" | "ERC20";
    symbol: string;
    decimals: number;
    tokenAddress: string | null;
  };
  price: {
    currentWei?: string | null;
    current?: string | null; // human (string)
  };
};

type ApiActiveResponse = {
  items: ApiActiveItem[];
  nextCursor: string | null;
};

// Very safe image fallback (non-empty so Next/Image won't crash)
const FALLBACK_IMG = "/opengraph-image.png";

export default function AuctionsCarousel() {
  const isMobile = useIsMobile();
  const carouselRef = React.useRef<HTMLDivElement>(null);

  const [loading, setLoading] = React.useState(true);
  const [items, setItems] = React.useState<ApiActiveItem[]>([]);

  const handleScroll = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    const scrollAmount = carouselRef.current.offsetWidth * 0.8;
    carouselRef.current.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  async function fetchActive(signal?: AbortSignal) {
    try {
      const r = await fetch("/api/auction/active?limit=12", {
        cache: "no-store",
        signal,
      });
      if (!r.ok) throw new Error("Failed to load active auctions");
      const j = (await r.json()) as ApiActiveResponse;

      // Keep only rows with required identity; fill image fallback so AuctionCard never gets empty src
      const clean = (j.items || [])
        .filter((a) => a?.id && a?.nft?.contract && a?.nft?.tokenId)
        .map((a) => ({
          ...a,
          nft: {
            ...a.nft,
            image:
              typeof a.nft.image === "string" && a.nft.image.trim().length > 0
                ? a.nft.image
                : FALLBACK_IMG,
          },
        }));

      setItems(clean);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fetchActive(ctrl.signal);
    const id = window.setInterval(() => fetchActive(ctrl.signal), 30_000);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  // Hide whole section if there's nothing to show
  if (!loading && items.length === 0) return null;

  // Render one card. We still pass contract/tokenId for the card’s subtitle/name,
  // but the href now targets the new /auction/:auctionId route.
  const renderCard = (a: ApiActiveItem) => {
    const contract = a.nft.contract;
    const tokenId = a.nft.tokenId;

    return (
      <AuctionCard
        key={a.id}
        nftAddress={contract}
        tokenId={tokenId}
        name={
          a.nft.name ??
          `${contract.slice(0, 6)}…${contract.slice(-4)} #${tokenId}`
        }
        image={a.nft.image || FALLBACK_IMG}
        endTime={a.endTime}
        href={`/auction/${a.id}`}
      />
    );
  };

  return (
    <section className="w-full mb-20">
      <div className="flex w-full items-center justify-between px-2 lg:px-0">
        <h1 className="font-bold text-[1.2rem] lg:text-[2rem]">Live Auctions</h1>
        {!isMobile && (
          <Link href="/auction">
            <Button variant="link" className="flex items-center gap-2 font-bold">
              More Auctions
              <MoveRight />
            </Button>
          </Link>
        )}
      </div>

      {isMobile ? (
        <div className="relative my-10 w-full px-4">
          <button
            onClick={() => handleScroll("left")}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 shadow hover:bg-gray-100"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div
            ref={carouselRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth touch-pan-x [&::-webkit-scrollbar]:hidden"
          >
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 snap-center w-[85%]">
                    <AuctionCardSkeleton />
                  </div>
                ))
              : items.map((a) => (
                  <div
                    key={a.id}
                    className="flex-shrink-0 snap-center w-[85%]"
                    style={{ scrollSnapAlign: "center" }}
                  >
                    {renderCard(a)}
                  </div>
                ))}
          </div>

          <button
            onClick={() => handleScroll("right")}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 shadow hover:bg-gray-100"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div className="mt-6 w-full">
            <Link href="/auction" className="w-full">
              <Button className="w-full px-6 py-2 text-sm rounded-md">More Auctions</Button>
            </Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 mt-10">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => <AuctionCardSkeleton key={i} />)
            : items.map((a) => renderCard(a))}
        </div>
      )}
    </section>
  );
}
