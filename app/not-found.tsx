// app/not-found.tsx
"use client";

import * as React from "react";
import Link from "next/link";
import { X as XIcon, ArrowRight, Home, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import SearchResultsPopover from "@/components/shared/search-results-popover";
import FeaturedCollection from "@/components/home/featured-collection-hero";

export default function NotFound() {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [openResults, setOpenResults] = React.useState(false);

  // Anchor is the *narrow* wrapper around the input, so the ✕ and popover align correctly
  const inputAnchorRef = React.useRef<HTMLDivElement | null>(null);
  const hasQuery = searchTerm.trim().length > 0;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenResults(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <main className="relative w-full">
      {/* Search FIRST, centered, with popover free of clipping */}
      <section className="px-4 sm:px-6 lg:px-8 pt-10">
        <div className="mx-auto w-full max-w-4xl">
          {/* The anchor defines the input width; ✕ is absolutely positioned inside this box */}
          <div ref={inputAnchorRef} className="relative w-full max-w-[600px] mx-auto">
            <Input
              placeholder="Search for NFT, collections, and users"
              className="w-full pr-9"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (!openResults) setOpenResults(true);
              }}
              onFocus={() => hasQuery && setOpenResults(true)}
            />

            {hasQuery && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => {
                  setSearchTerm("");
                  setOpenResults(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-muted text-muted-foreground"
              >
                <XIcon className="h-4 w-4" />
              </button>
            )}

            <SearchResultsPopover
              open={openResults && hasQuery}
              onClose={() => setOpenResults(false)}
              searchTerm={searchTerm}
              anchorRef={inputAnchorRef}
            />
          </div>
        </div>
      </section>

      {/* 404 Card (no search inside) */}
      <section className="px-4 sm:px-6 lg:px-8 mt-6 pb-12">
        <div
          className={[
            "mx-auto max-w-5xl rounded-3xl",
            "border border-white/10 bg-white/5 dark:bg-white/[0.06]",
            "supports-[backdrop-filter]:backdrop-blur-xl",
            "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)] ring-1 ring-black/5",
            "p-5 sm:p-7 md:p-10",
          ].join(" ")}
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/10 dark:bg-black/20 px-2.5 py-1 text-[11px] text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400" />
            You found a missing page
          </div>

          <h1 className="mt-4 text-[2.2rem] sm:text-[2.6rem] md:text-[3rem] leading-[1.1] font-black tracking-tight">
            404 — Page not found
          </h1>

          <p className="mt-3 max-w-2xl text-sm sm:text-base text-muted-foreground">
            The page you’re looking for doesn’t exist or has moved. Try explore,
            head back home, or use the search above.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Link href="/" className="inline-flex">
              <Button className="gap-2">
                <Home className="h-4 w-4" />
                Go Home
              </Button>
            </Link>
            <Link href="/explore" className="inline-flex">
              <Button variant="secondary" className="gap-2">
                <Compass className="h-4 w-4" />
                Explore Panthart
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured section */}
      <section className="px-4 sm:px-6 lg:px-8 pb-16">
        <div className="mx-auto">
          <FeaturedCollection className="mt-6" />
        </div>
      </section>
    </main>
  );
}
