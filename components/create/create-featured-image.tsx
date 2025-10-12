"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */
type FeaturedOwner = {
  walletAddress: string;
  username: string;
  profileAvatar: string;
  updatedAt?: string;
};

type FeaturedItem = {
  contract: string;
  tokenId: string;
  name: string;
  description: string;
  image: string; // ipfs://... or https://... (png/gif/mp4/webm/etc.)
  owner: FeaturedOwner;
};

/* ------------------------------------------------------------------ */
/* Helpers (match ArtDisplay behavior)                                */
/* ------------------------------------------------------------------ */
type MediaKind = "image" | "video" | "unknown";

const INTERVAL_MS = 30_000;

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

function useVisibility<T extends HTMLElement>(threshold = 0.25) {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold,
    });
    io.observe(node);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

/* ------------------------------------------------------------------ */
/* Data source                                                        */
/* ------------------------------------------------------------------ */
function useFeaturedPool() {
  const [items, setItems] = useState<FeaturedItem[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        // API: latest FINALIZED winner’s items (falls back if none)
        const res = await fetch(`/api/featured-nfts`, { cache: "no-store" });
        const data = (await res.json()) as { items: FeaturedItem[] };
        if (!cancelled) setItems((data?.items || []).slice(0, 60));
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { items, loading };
}

/* ------------------------------------------------------------------ */
/* Component                                                          */
/* ------------------------------------------------------------------ */
export default function CreateFeaturedImage() {
  const { items, loading } = useFeaturedPool();

  const [index, setIndex] = useState(0);
  const [descOpen, setDescOpen] = useState(false);

  // visibility for slideshow + pausing videos
  const { ref: rootRef, visible } = useVisibility<HTMLDivElement>(0.25);

  // advance slideshow only when visible
  useEffect(() => {
    if (!items?.length || !visible) return;
    const id = window.setInterval(() => {
      setIndex((prev) => {
        const len = items.length;
        if (len <= 1) return 0;
        let next = Math.floor(Math.random() * len);
        if (next === prev) next = (prev + 1) % len;
        return next;
      });
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [items?.length, visible]);

  // warm image (skip videos)
  useEffect(() => {
    if (!items?.length) return;
    const nextIdx = (index + 1) % items.length;
    const raw = items[nextIdx]?.image;
    const url = ipfsToHttp(raw || "");
    if (!url || inferKind(url) === "video") return;
    const img = new window.Image();
    img.src = url;
  }, [index, items]);

  const current = useMemo(
    () => (items?.length ? items[index % items.length] : null),
    [items, index]
  );

  const mediaUrl = ipfsToHttp(current?.image || "");
  const mediaKind = inferKind(mediaUrl);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = useState(false);

  // play/pause by visibility or when media changes
  useEffect(() => {
    const v = videoRef.current;
    setVideoReady(false);
    if (!v) return;
    if (visible) v.play().catch(() => {});
    else v.pause();
  }, [visible, mediaUrl]);

  if (loading && !current) {
    return (
      <div className="relative h-full w-full flex flex-col">
        <div className="relative aspect-square w-full animate-pulse bg-muted/30 rounded-2xl" />
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 h-28 animate-pulse" />
      </div>
    );
  }
  if (!current) {
    return (
      <div className="relative h-full w-full flex flex-col">
        <div className="relative aspect-square w-full bg-muted/20 rounded-2xl grid place-items-center">
          <div className="text-center text-sm text-muted-foreground px-6">
            No featured NFTs yet.
          </div>
        </div>
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="text-sm text-muted-foreground">
            Once items are available, you’ll see them here.
          </div>
        </div>
      </div>
    );
  }

  const href = `/collections/${current.contract}/${current.tokenId}`;
  const ownerHref = `/profile/${current.owner.walletAddress}`;
  const avatarSrc =
    current.owner.profileAvatar +
    (current.owner.updatedAt ? `?v=${encodeURIComponent(current.owner.updatedAt)}` : "");

  const hasLongDesc = (current.description?.length || 0) > 180;

  return (
    <div ref={rootRef} className="relative h-full w-full flex flex-col">
      {/* MEDIA */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-black/10">
        {mediaKind === "video" && mediaUrl ? (
          <>
            <video
              key={`${current.contract}:${current.tokenId}`}
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-contain"
              src={mediaUrl}
              playsInline
              muted
              loop
              preload="metadata"
              onCanPlay={() => setVideoReady(true)}
              onError={() => setVideoReady(false)}
            />
            {!videoReady && <div className="absolute inset-0 animate-pulse bg-neutral-800/30" />}
          </>
        ) : (
          <Image
            key={`${current.contract}:${current.tokenId}`}
            src={mediaUrl}
            alt={current.name || "NFT image"}
            fill
            unoptimized
            className="object-contain"
            sizes="(min-width: 1024px) 680px, 100vw"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        )}

        {/* gentle glass grain overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_60%_at_50%_-10%,rgba(255,255,255,0.25),transparent_60%),radial-gradient(120%_60%_at_50%_110%,rgba(0,0,0,0.06),transparent_60%)]" />
      </div>

      {/* INFO */}
      <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-start gap-3">
          <Link href={ownerHref} className="shrink-0" aria-label="Owner profile">
            <Avatar className="w-9 h-9 border border-white/15">
              <AvatarImage src={avatarSrc} alt={current.owner.username} className="object-cover" />
              <AvatarFallback>0x</AvatarFallback>
            </Avatar>
          </Link>

          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted-foreground">Owner</div>
            <Link href={ownerHref} className="font-medium truncate hover:underline">
              {current.owner.username}
            </Link>
          </div>

          <Link
            href={href}
            className="text-xs font-semibold text-brandsec dark:text-brand hover:underline underline-offset-4"
          >
            View NFT →
          </Link>
        </div>

        <div className="mt-3">
          <div className="font-semibold leading-tight line-clamp-1">
            {current.name || `Token #${current.tokenId}`}
          </div>

          {current.description ? (
            <p className={!descOpen ? "mt-1 text-sm text-muted-foreground line-clamp-3" : "mt-1 text-sm text-muted-foreground"}>
              {current.description}
            </p>
          ) : null}

          {hasLongDesc && (
            <button
              type="button"
              onClick={() => setDescOpen((v) => !v)}
              className="mt-1 text-xs font-semibold text-brandsec dark:text-brand hover:underline"
            >
              {descOpen ? "Read less" : "Read more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
