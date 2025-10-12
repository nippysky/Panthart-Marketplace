"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import AuctionCardCountdown from "./auction-countdown";

/* Detect basic media kind by file extension (querystring-safe) */
function mediaKind(url?: string | null): "video" | "image" | "unknown" {
  if (!url) return "unknown";
  const clean = url.split("?")[0].toLowerCase();
  if (/\.(mp4|webm|ogg|mov)$/i.test(clean)) return "video";
  if (/\.(png|jpg|jpeg|gif|webp|bmp|svg)$/i.test(clean)) return "image";
  return "image"; // default to image if unknown
}

export default function AuctionCard({
  nftAddress,
  tokenId,
  name,
  image,
  endTime,
  href,
  subtitle,
}: {
  nftAddress: string;
  tokenId: string;
  name: string;
  image: string;
  endTime: string;
  href?: string;
  subtitle?: string;
}) {
  const linkHref = href || `/auctions/${nftAddress}/${tokenId}`;
  const kind = mediaKind(image);

  return (
    <Link href={linkHref} className="block">
      <Card className="h-full p-3 cursor-pointer">
        <CardContent className="flex flex-col p-0">
          {/* Media slot */}
          <div className="relative w-full aspect-square mb-2 rounded-md overflow-hidden bg-muted">
            {kind === "video" ? (
              <video
                src={image}
                className="absolute inset-0 w-full h-full object-cover"
                playsInline
                muted
                loop
                autoPlay
                preload="metadata"
              />
            ) : (
              <Image
                src={image}
                alt={name}
                fill
                unoptimized
                className="object-cover object-center"
                onError={(e) => {
                  // simple visual fallback if asset 404s
                  (e.target as HTMLImageElement).style.visibility = "hidden";
                }}
              />
            )}
          </div>

          {/* Meta */}
          <div className="mt-2 flex flex-col gap-3">
            <h2 className="text-sm font-semibold truncate">{name}</h2>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">Starting Price: {subtitle}</p>
            )}
            <AuctionCardCountdown endTime={endTime} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
