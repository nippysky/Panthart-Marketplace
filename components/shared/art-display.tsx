"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/utils";
import { Play, VolumeX } from "lucide-react";
import { NFTItem } from "@/lib/types/types";
import { ethers } from "ethers";

/* --------------------------- helpers --------------------------- */
type MediaKind = "image" | "video" | "unknown";

function ipfsToHttp(u?: string | null) {
  if (!u) return "";
  return u.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7)}` : u;
}

function getExt(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const filename = u.searchParams.get("filename")?.toLowerCase() || "";
    const byQuery = filename.match(/\.[a-z0-9]+$/i)?.[0] || "";
    const byPath = path.match(/\.[a-z0-9]+$/i)?.[0] || "";
    return (byQuery || byPath || "").replace(/\?.*$/, "");
  } catch {
    return url.toLowerCase().match(/\.[a-z0-9]+$/i)?.[0] || "";
  }
}

function inferKind(url?: string): MediaKind {
  if (!url) return "unknown";
  const ext = getExt(url);
  if ([".mp4", ".webm", ".ogv", ".ogg", ".m4v", ".mov"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif", ".svg"].includes(ext)) return "image";
  return "unknown";
}

function useVisibility<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      rootMargin: "200px",
    });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

/* Tiny pill */
function Pill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide
        bg-black/70 text-white backdrop-blur-sm dark:bg-black/60 ${className}`}
    >
      {children}
    </span>
  );
}

/* --------------------------- component --------------------------- */
type ArtDisplayProps = { nft: NFTItem; balance?: number };

const ArtDisplay: React.FC<ArtDisplayProps> = ({ nft, balance }) => {
  const { name, image, tokenId, isListed, listingPrice, isAuctioned, standard } = nft;

  const mediaUrl = useMemo(() => ipfsToHttp(typeof image === "string" ? image : ""), [image]);
  const mediaKind = useMemo<MediaKind>(() => inferKind(mediaUrl), [mediaUrl]);

  const { ref: rootRef, visible } = useVisibility<HTMLDivElement>();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (visible) vid.play().catch(() => {});
    else vid.pause();
  }, [visible, mediaUrl]);

  const stdLabel =
    standard === "ERC1155" ? "ERC1155" : standard === "ERC721" ? "ERC721" : undefined;

  // currency/price
  const currencySymbol: string =
    (nft as any)?.currencySymbol ??
    (nft as any)?.listingCurrencySymbol ??
    (nft as any)?.currency?.symbol ??
    "ETN";

  const currencyDecimals: number =
    Number((nft as any)?.currencyDecimals ?? (nft as any)?.currency?.decimals ?? 18) || 18;

  let priceHuman: number | null = null;
  if (typeof listingPrice === "number" && Number.isFinite(listingPrice) && listingPrice > 0) {
    priceHuman = listingPrice;
  } else if (typeof (nft as any)?.listingPriceWei === "string") {
    const s = String((nft as any).listingPriceWei);
    if (/^\d+$/.test(s)) {
      try {
        priceHuman = Number(ethers.formatUnits(BigInt(s), currencyDecimals));
      } catch {}
    }
  }

  return (
    <Card
      ref={rootRef}
      // Card has NO padding; inner wrapper provides consistent gutter like the skeleton
      className="relative overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-sm hover:shadow-md transition-shadow"
    >
      {/* Inner content wrapper = the “gutter” that keeps everything off the edges */}
      <div className="flex flex-col gap-3 px-3 sm:px-4">
        {/* Media box with its own rounding/ring; badges live INSIDE this box */}
        <div className="relative w-full aspect-square rounded-xl overflow-hidden bg-muted ring-1 ring-border/40">
          {(mediaKind === "image" || mediaKind === "unknown") && mediaUrl ? (
            <Image
              src={mediaUrl}
              alt={name || `NFT #${tokenId}`}
              fill
              unoptimized
              className="object-cover"
              onError={(e) => ((e.currentTarget as any).style.display = "none")}
              priority={false}
            />
          ) : null}

          {mediaKind === "video" && mediaUrl ? (
            <>
              <video
                key={mediaUrl}
                ref={videoRef}
                className="absolute inset-0 h-full w-full object-cover"
                src={mediaUrl}
                playsInline
                muted
                loop
                preload="metadata"
                onCanPlay={() => setVideoReady(true)}
                onError={() => setVideoReady(false)}
              />
              {!videoReady && <div className="absolute inset-0 animate-pulse bg-neutral-800/30" />}
              <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] uppercase tracking-wide bg-black/70 text-white px-2 py-0.5 rounded">
                <Play className="h-3 w-3" />
                <span>Video</span>
                <span className="mx-1">•</span>
                <VolumeX className="h-3 w-3" />
                <span>Muted</span>
              </div>
            </>
          ) : null}

          {/* Badges are anchored inside the media box, so they never shift layout */}
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
            {isAuctioned && <Pill>Auction</Pill>}
            {stdLabel && <Pill className="uppercase">{stdLabel}</Pill>}
            {standard === "ERC1155" && typeof balance === "number" && balance > 0 && (
              <Pill className="bg-black/80">{`x${balance}`}</Pill>
            )}
          </div>
        </div>

        {/* Meta */}
        <CardContent className="p-0">
          <CardHeader className="p-0">
            <CardTitle className="font-semibold text-[0.92rem] leading-tight line-clamp-1">
              {name || `NFT #${tokenId}`}
            </CardTitle>
          </CardHeader>

          {/* Price / Status row */}
          {isListed && priceHuman !== null ? (
            <div className="w-full flex justify-between items-center gap-2 mt-2 text-sm">
              <span className="text-muted-foreground">Price</span>
              <span className="font-medium whitespace-nowrap">
                {formatNumber(priceHuman)} {currencySymbol}
              </span>
            </div>
          ) : isAuctioned ? (
            <div className="w-full flex justify-between items-center gap-2 mt-2 text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="font-medium">In auction</span>
            </div>
          ) : (
            <div className="w-full flex justify-between items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span>Status</span>
              <span>Not listed</span>
            </div>
          )}
        </CardContent>
      </div>
    </Card>
  );
};

export default ArtDisplay;
