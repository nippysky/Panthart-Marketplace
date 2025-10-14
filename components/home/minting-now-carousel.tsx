"use client";

import * as React from "react";
import useSWR from "swr";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, MoveRight } from "lucide-react";
import { useIsMobile } from "@/lib/use-is-mobile";
import MintingCardSkeleton from "@/components/skeleton/MintingCardSkeleton";
import MintingCard from "@/components/shared/mint-card";

import { MintingNowItem } from "@/lib/types/minting-now";
import MintHero from "../shared/mint-hero";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function MintingNowCarousel() {
  const isMobile = useIsMobile();
  const carouselRef = React.useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<{ items: MintingNowItem[] }>(
    "/api/minting-now?limit=8",
    fetcher,
    {
      refreshInterval: 30_000,
      revalidateOnFocus: true,
      // keep this if you prefer no flash on first paint; note it means no skeleton initially
      fallbackData: { items: [] },
    }
  );

  const items: MintingNowItem[] = data?.items ?? [];
  const topFive = items.slice(0, 5);

  // 👉 If we have finished loading and there are no minting items, hide the whole section.
  if (!isLoading && items.length === 0) return null;

  const handlePrev = () => {
    if (!carouselRef.current) return;
    const scrollAmount = carouselRef.current.offsetWidth * 0.8;
    carouselRef.current.scrollBy({ left: -scrollAmount, behavior: "smooth" });
  };

  const handleNext = () => {
    if (!carouselRef.current) return;
    const scrollAmount = carouselRef.current.offsetWidth * 0.8;
    carouselRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
  };

  return (
    <section className="w-full my-20">
      <div className="flex w-full items-center justify-between px-2 lg:px-0">
        <h1 className="font-bold text-[1.2rem] lg:text-[2rem]">Minting Now</h1>
        {!isMobile && (

                  <Button asChild variant="secondary" size="sm">
          <Link href="/minting-now">View all</Link>
        </Button>  
 
        )}
      </div>

      {/* MOBILE: keep the swipe carousel for all counts */}
      {isMobile ? (
        <div className="relative my-10 w-full px-4">
          <button
            onClick={handlePrev}
            className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 shadow hover:bg-gray-100 focus:outline-none"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>

          <div
            ref={carouselRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth touch-pan-x [&::-webkit-scrollbar]:hidden"
          >
            {isLoading && items.length === 0
              ? Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 snap-center w-[85%]">
                    <MintingCardSkeleton />
                  </div>
                ))
              : topFive.map((item) => (
                  <div
                    key={`${item.kind}:${item.id}`}
                    className="flex-shrink-0 snap-center w-[85%]"
                    style={{ scrollSnapAlign: "center" }}
                  >
                    <MintingCard item={item} />
                  </div>
                ))}
          </div>

          <button
            onClick={handleNext}
            className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full p-2 shadow hover:bg-gray-100 focus:outline-none"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>

          <div className="mt-6 w-full">
            <Link href="/minting-now" className="w-full">
              <Button className="w-full px-6 py-2 text-sm rounded-md">
                More Minting Now
              </Button>
            </Link>
          </div>
        </div>
      ) : (
        // DESKTOP / TABLET: adaptive layouts by item count
        <div className="mt-8">
          {isLoading && items.length === 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <MintingCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <>
              {/* removed the "Nothing is minting…" empty state */}
              {items.length === 1 && (
                <div className="rounded-xl overflow-hidden">
                  <MintHero item={items[0]} />
                </div>
              )}

              {items.length === 2 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="rounded-xl overflow-hidden">
                    <MintHero item={items[0]} />
                  </div>
                  <div className="rounded-xl overflow-hidden">
                    <MintHero item={items[1]} />
                  </div>
                </div>
              )}

              {items.length === 3 && (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
                  <div className="xl:col-span-2 rounded-xl overflow-hidden">
                    <MintHero item={items[0]} />
                  </div>
                  <div className="flex flex-col gap-5">
                    <MintingCard item={items[1]} />
                    <MintingCard item={items[2]} />
                  </div>
                </div>
              )}

              {items.length === 4 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  <div className="rounded-xl overflow-hidden">
                    <MintHero item={items[0]} />
                  </div>
                  <div className="rounded-xl overflow-hidden">
                    <MintHero item={items[1]} />
                  </div>
                  <div className="rounded-xl overflow-hidden">
                    <MintHero item={items[2]} />
                  </div>
                  <div className="rounded-xl overflow-hidden">
                    <MintHero item={items[3]} />
                  </div>
                </div>
              )}

              {items.length >= 5 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {topFive.map((item) => (
                    <MintingCard key={`${item.kind}:${item.id}`} item={item} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
