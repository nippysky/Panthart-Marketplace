// components/home/featured-collection.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { BsPatchCheckFill } from "react-icons/bs";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

/* ── types (unchanged) ── */
type CollectionHeader = {
  contract: string;
  name: string | null;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  itemsCount: number;
  floorPrice: number;
  volume: number;
  currencySymbol?: string;
  currencyId?: string;
};
type TopItem = {
  tokenId: string;
  name: string | null;
  imageUrl: string | null;
  rarityScore: number | null;
  volumeInCurrency?: number | null;
};
type ApiPayload = { ok: boolean; collection: CollectionHeader; topItems: TopItem[] };
type CurrencyMeta = { id: string; symbol: string; decimals: number; kind: "NATIVE" | "ERC20" | string };
type MediaKind = "image" | "video" | "unknown";

/* ── helpers (unchanged) ── */
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
  const ref = React.useRef<T | null>(null);
  const [visible, setVisible] = React.useState(false);
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const obs = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "200px" });
    obs.observe(node);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}
function useScrollRef<T extends HTMLElement>() {
  const ref = React.useRef<T | null>(null);
  const scrollBy = (delta: number) => ref.current?.scrollBy({ left: delta, behavior: "smooth" });
  return { ref, scrollBy };
}

const FILTERS = [
  { key: "rarity", label: "Rarity" },
  { key: "volume", label: "Top Volume" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

/* ── component ── */
export default function FeaturedCollection({ className }: { className?: string }) {
  const [filter, setFilter] = React.useState<FilterKey>("rarity");
  const [loading, setLoading] = React.useState(true);
  const [payload, setPayload] = React.useState<ApiPayload | null>(null);

  const [currencyId, setCurrencyId] = React.useState<string>("native");
  const [currencies, setCurrencies] = React.useState<CurrencyMeta[]>([
    { id: "native", symbol: "ETN", decimals: 18, kind: "NATIVE" },
  ]);

  const { ref } = useScrollRef<HTMLDivElement>();
  const [descOpen, setDescOpen] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/currencies/active", { cache: "no-store" });
        const data = await res.json();
        const active = (data?.items ?? []).filter(
          (c: any) =>
            String(c.symbol).toUpperCase() !== "ETN" ||
            String(c.kind).toUpperCase() !== "NATIVE"
        );
        setCurrencies([{ id: "native", symbol: "ETN", decimals: 18, kind: "NATIVE" }, ...active]);
      } catch {}
    })();
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const qs = new URLSearchParams({ by: filter, limit: "10", currency: currencyId }).toString();
        const res = await fetch(`/api/featured-collection?${qs}`, { cache: "no-store" });
        const data = (await res.json()) as ApiPayload;
        if (!cancelled) setPayload(data);
      } catch {
        if (!cancelled) setPayload(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filter, currencyId]);

  const col = payload?.collection;
  const items = payload?.topItems ?? [];
  const symbol = col?.currencySymbol || "ETN";

  React.useEffect(() => {
    items.forEach((it) => {
      if (!it.imageUrl) return;
      const url = ipfsToHttp(it.imageUrl);
      if (inferKind(url) === "image" && typeof window !== "undefined") {
        const img = new window.Image();
        img.src = url;
      }
    });
  }, [items]);

  return (
    <section className={cn("w-full", className)}>
      <div className="flex items-center gap-3 my-10">
        <h1 className="font-bold text-[1.2rem] lg:text-[2rem]">Featured Collection</h1>
      </div>

      <div className="relative">
        <div
          className={cn(
            "mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-8",
            "rounded-3xl border border-white/10 backdrop-blur-xl",
            "bg-white/5 dark:bg-white/5 ring-1 ring-black/5",
            "shadow-[0_10px_40px_-10px_rgba(0,0,0,0.35)]"
          )}
        >
          {/* cover */}
          {col?.coverUrl ? (
            <div className="absolute inset-0 overflow-hidden rounded-3xl -z-10">
              <Image
                src={ipfsToHttp(col.coverUrl)}
                alt={col.name ?? "cover"}
                fill
                unoptimized
                className="object-cover opacity-[0.15] blur-[1px]"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/10" />
            </div>
          ) : null}

          {/* header grid */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto] items-start">
            {/* avatar + title */}
            <div className="flex items-start gap-4 min-w-0">
              {loading ? (
                <Skeleton className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl" />
              ) : (
                <div className="relative h-12 w-12 sm:h-14 sm:w-14 md:h-16 md:w-16 rounded-2xl overflow-hidden border border-white/15 bg-black/20 shrink-0">
                  {col?.logoUrl ? (
                    <Image
                      src={ipfsToHttp(col.logoUrl)}
                      alt={col?.name ?? "logo"}
                      fill
                      unoptimized
                      className="object-cover"
                    />
                  ) : null}
                </div>
              )}

              <div className="min-w-0">
                {loading ? (
                  <Skeleton className="h-7 w-[220px] sm:w-[280px] md:w-[320px] rounded-md" />
                ) : (
                  <div className="text-xl sm:text-2xl md:text-3xl font-semibold leading-tight break-words flex items-center gap-2 min-w-0">
                    <span className="truncate">{col?.name ?? "Collection"}</span>
                    <BsPatchCheckFill className="text-brandsec dark:text-brand text-base sm:text-lg align-middle translate-y-[1px] shrink-0" />
                  </div>
                )}

                {/* stats pills */}
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  {loading ? (
                    <>
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <Skeleton className="h-6 w-28 rounded-full" />
                      <Skeleton className="h-6 w-28 rounded-full" />
                    </>
                  ) : (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/10 dark:bg-black/20 px-2.5 py-1 backdrop-blur">
                        Items <b className="ml-1">{col?.itemsCount ?? 0}</b>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/10 dark:bg-black/20 px-2.5 py-1 backdrop-blur">
                        Floor <b className="ml-1">{(col?.floorPrice ?? 0).toFixed(3)} {symbol}</b>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-black/10 dark:bg-black/20 px-2.5 py-1 backdrop-blur">
                        Volume <b className="ml-1">{(col?.volume ?? 0).toFixed(3)} {symbol}</b>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* actions — wraps nicely on mobile */}
            <div className="sm:col-span-2 lg:col-span-1 lg:ml-auto">
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                {/* currency select */}
                <div className="w-full sm:w-36 md:w-44">
                  <Select value={currencyId} onValueChange={setCurrencyId}>
                    <SelectTrigger className="w-full h-9 sm:h-10">
                      <SelectValue placeholder="Currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {c.symbol}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* primary actions */}
                {loading ? (
                  <>
                    <Skeleton className="h-10 w-full sm:w-40 rounded-xl" />
                    <Skeleton className="h-10 w-full sm:w-48 rounded-xl" />
                  </>
                ) : (
                  <>
                    <Link
                      href={col ? `/collections/${col.contract}` : "#"}
                      className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl px-4 py-2 font-semibold border border-white/15 bg-white/10 hover:bg-white/15 transition"
                    >
                      View collection
                    </Link>
                    <Link
                      href="/bid-featured-collection"
                      className="inline-flex w-full sm:w-auto items-center justify-center rounded-xl px-4 py-2 font-medium border border-white/15 bg-black/5 hover:bg-black/10 dark:bg-transparent dark:hover:bg-white/10 text-foreground transition"
                    >
                      Bid to be featured
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* description */}
          {loading ? (
            <div className="mt-3 space-y-2 max-w-3xl">
              <Skeleton className="h-4 w-[80%]" />
              <Skeleton className="h-4 w-[65%]" />
            </div>
          ) : col?.description ? (
            <div className="mt-3 max-w-3xl text-sm text-muted-foreground">
              <span className={descOpen ? "" : "line-clamp-3"}>{col.description}</span>
              {col.description.length > 180 && (
                <button
                  type="button"
                  onClick={() => setDescOpen((v) => !v)}
                  className="ml-2 font-semibold text-brandsec dark:text-brand hover:underline"
                >
                  {descOpen ? "Show less" : "Read more"}
                </button>
              )}
            </div>
          ) : null}

          {/* filters */}
          <div className="mt-6">
            {loading ? (
              <Skeleton className="h-9 w-48 rounded-xl" />
            ) : (
              <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm font-medium transition",
                      filter === f.key ? "bg-white/15" : "hover:bg-white/10 text-muted-foreground"
                    )}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* carousel */}
          <div
            ref={ref}
            className={cn(
              "mt-3 -mx-2 px-2 pb-2",
              "flex gap-3 overflow-x-auto scroll-smooth snap-x snap-mandatory",
              "[-ms-overflow-style:none] [scrollbar-width:none]",
              "[&::-webkit-scrollbar]:hidden"
            )}
          >
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <div key={`sk-${i}`} className="snap-start shrink-0 w-[82%] sm:w-[48%] md:w-[32%] lg:w-[24%] xl:w-[19%]">
                    <Skeleton className="aspect-[4/5] rounded-2xl" />
                  </div>
                ))
              : items.map((it) => <FeaturedItemCard key={it.tokenId} col={col!} item={it} />)}
            <div className="shrink-0 w-2" />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── item card (unchanged logic) ── */
function FeaturedItemCard({ col, item }: { col: CollectionHeader; item: TopItem }) {
  const mediaUrl = React.useMemo(() => ipfsToHttp(item.imageUrl || ""), [item.imageUrl]);
  const mediaKind = React.useMemo<MediaKind>(() => inferKind(mediaUrl), [mediaUrl]);

  const { ref: rootRef, visible } = useVisibility<HTMLDivElement>();
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [videoReady, setVideoReady] = React.useState(false);

  React.useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (visible) vid.play().catch(() => {});
    else vid.pause();
  }, [visible, mediaUrl]);

  const symbol = col.currencySymbol || "ETN";

  return (
    <Link href={`/collections/${col.contract}/${item.tokenId}`} className="snap-start shrink-0 w-[82%] sm:w-[48%] md:w-[32%] lg:w-[24%] xl:w-[19%]">
      <div ref={rootRef} className="group relative aspect-[4/5] rounded-2xl overflow-hidden border border-white/10 bg-black/20">
        {(mediaKind === "image" || mediaKind === "unknown") && mediaUrl ? (
          <Image
            src={mediaUrl}
            alt={item.name ?? `#${item.tokenId}`}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            onError={(e) => ((e.currentTarget as any).style.display = "none")}
          />
        ) : null}

        {mediaKind === "video" && mediaUrl ? (
          <>
            <video
              key={mediaUrl}
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover rounded-none transition-transform duration-300 group-hover:scale-[1.03]"
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
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              <span>Video</span>
              <span className="mx-1">•</span>
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12a4.5 4.5 0 0 0-7.5-3.5l1.4 1.4A2.5 2.5 0 0 1 14.5 12a2.5 2.5 0 0 1-4.1 1.9l-1.4 1.4A4.5 4.5 0 0 0 16.5 12z"/><path d="m2 2 20 20-1.5 1.5L.5 3.5z"/></svg>
              <span>Muted</span>
            </div>
          </>
        ) : null}

        {/* overlay meta */}
        <div className="absolute inset-x-0 bottom-0 p-3">
          <div className="rounded-2xl bg-black/55 dark:bg-black/40 backdrop-blur border border-white/10 p-2">
            <div className="text-sm font-semibold truncate text-white">
              {item.name ?? `#${item.tokenId}`}
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-white">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                Rarity <b className="ml-1">{item.rarityScore != null ? item.rarityScore.toFixed(2) : "—"}</b>
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                Volume{" "}
                <b className="ml-1">
                  {item.volumeInCurrency != null ? `${item.volumeInCurrency.toFixed(2)} ${symbol}` : "—"}
                </b>
              </span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
