// components/profile/my-profile-component.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { useActiveAccount } from "thirdweb/react";
import Image from "next/image";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Share2, Slash, Globe } from "lucide-react";
import { BsTwitterX } from "react-icons/bs";
import { FiInstagram } from "react-icons/fi";
import { FaTelegramPlane } from "react-icons/fa";

import { formatNumber, shortenAddress } from "@/lib/utils";
import TabView from "@/components/shared/tab-view";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

import type { UserProfile } from "@/lib/types/types";
import { useLoaderStore } from "@/lib/store/loader-store";
import { useWalletStore } from "@/lib/hooks/useWallet";
import EditProfileSheet from "./edit-profile";
import ProfileItemsTab from "./profile-items-tab";

/** NEW: Collections tab (infinite scroll) */
import ProfileCollectionsTab from "./profile-collections-tab";

// ✅ Badge utils + chip
import BadgeChip from "@/components/legends/badge-chip";
import { getBadgeForCount, getNextBadge } from "@/lib/legends/badges";
import WithdrawRefundsDialog from "./withdraw-refunds-dialog";

/** Extend with itemsTotal + optional bio + legendsComrades (NFC owned) */
type ProfileWithTotal = UserProfile & {
  itemsTotal?: number;
  bio?: string | undefined;
  legendsComrades?: number;
};

type LegendsBootstrap = { comradesHeld: number };

export default function MyProfileComponent({
  profile,
  itemsTotal: bootItemsTotal,
  legendsBootstrap,
}: {
  profile: UserProfile & { bio?: string; legendsComrades?: number };
  itemsTotal?: number;
  /** Optional SSR bootstrap so the badge/progress render immediately */
  legendsBootstrap?: LegendsBootstrap;
}) {
  const account = useActiveAccount();
  const me = account?.address ?? null;

  const syncing = useWalletStore((s) => s.syncing);
  const showLoader = useLoaderStore((s) => s.show);
  const hideLoader = useLoaderStore((s) => s.hide);

  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [bioExpanded, setBioExpanded] = useState(false);

  // 👇 ensure Radix primitives render only after mount
  const [isClient, setIsClient] = useState(false);
  useEffect(() => setIsClient(true), []);

  const addressKey = profile.walletAddress; // keep original casing
  const isMine = !!me && me.toLowerCase() === addressKey.toLowerCase();

  const qc = useQueryClient();

  // Pull live profile (may include legendsComrades)
  const { data, isLoading, isFetching } = useQuery<ProfileWithTotal>({
    queryKey: ["profile", addressKey],
    queryFn: async () => {
      const res = await fetch("/api/profile/me", {
        headers: { "x-user-address": addressKey },
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch profile");
      return (await res.json()) as ProfileWithTotal;
    },
    // Seed with SSR-provided profile
    initialData: profile as ProfileWithTotal,
    placeholderData: (prev) => prev,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Small loader UX
  const hideTimer = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (isLoading) {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      showLoader("Loading profile…");
      return;
    }
    hideTimer.current = setTimeout(() => hideLoader(), 200);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [isLoading, showLoader, hideLoader]);

  const live = data!;
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  const handleCopy = (text: string, msg = "Copied!") => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  // Save profile edits (supports bio)
  const saveMutation = useMutation({
    mutationFn: async (payload: {
      username: string;
      banner: string | null;
      avatar: string;
      instagram: string;
      x: string;
      website: string;
      telegram: string;
      bio: string;
    }) => {
      if (!me) throw new Error("Connect your wallet first.");
      const res = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-user-address": me,
        },
        body: JSON.stringify({
          username: payload.username,
          profileBanner: payload.banner,
          profileAvatar: payload.avatar,
          instagram: payload.instagram || null,
          x: payload.x || null,
          website: payload.website || null,
          telegram: payload.telegram || null,
          bio: payload.bio.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      return (await res.json()) as ProfileWithTotal;
    },
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["profile", addressKey] });
      const prev = qc.getQueryData<ProfileWithTotal>(["profile", addressKey]);
      if (prev) {
        qc.setQueryData<ProfileWithTotal>(["profile", addressKey], {
          ...prev,
          username: payload.username,
          profileBanner: payload.banner ?? prev.profileBanner,
          profileAvatar: payload.avatar || prev.profileAvatar,
          instagram: payload.instagram || undefined,
          x: payload.x || undefined,
          website: payload.website || undefined,
          telegram: payload.telegram || undefined,
          bio: payload.bio || undefined,
        });
      }
      return { prev };
    },
    onError: (_err, _payload, ctx) => {
      if (ctx?.prev) qc.setQueryData(["profile", addressKey], ctx.prev);
      toast.error("Save failed");
    },
    onSuccess: (updated) => {
      qc.setQueryData(["profile", addressKey], updated);
      toast.success("Profile updated!");
      setEditOpen(false);
    },
  });

  // Distinct ERC1155 tokens for fallback
  const distinct1155Count = new Set(
    (live.erc1155Holdings ?? []).map((h) => `${h.nft.nftAddress}:${h.nft.tokenId}`)
  ).size;

  const itemsTotal =
    bootItemsTotal ??
    live.itemsTotal ??
    ((live.ownedNFTs?.length ?? 0) + distinct1155Count);

  // ---------- Badge + Progress (Legends) ----------
  // Prefer live.legendsComrades; fallback to SSR bootstrap (if provided)
  const comrades =
    (typeof live.legendsComrades === "number" ? live.legendsComrades : undefined) ??
    legendsBootstrap?.comradesHeld ??
    0;

  const currentBadge = getBadgeForCount(comrades);
  const nextInfo = getNextBadge(comrades); // { next, progress } | null
  const progressPct = nextInfo ? Math.round(nextInfo.progress * 100) : 100;
  const neededMore = nextInfo ? Math.max(0, nextInfo.next.min - comrades) : 0;

  /* ----------------------- Tabs ----------------------- */
  const ITEMS_TAB = {
    label: "Items",
    content: (
      <div className="space-y-6">
        <ProfileItemsTab address={addressKey} ownerLabel={live.username} />
      </div>
    ),
  };

  /** NEW: Collections tab (infinite scroll, debounced search, role/sort controls) */
  const COLLECTIONS_TAB = {
    label: "Collections",
    content: (
      <div className="space-y-6">
        <ProfileCollectionsTab address={addressKey} username={live.username} />
      </div>
    ),
  };

  // Bio helpers
  const bio = live.bio?.trim() ?? "";
  const BIO_LIMIT = 240;
  const bioTruncated = bio.length > BIO_LIMIT ? `${bio.slice(0, BIO_LIMIT)}…` : bio;

  // BadgeChip prop compatibility (emoji vs icon)
  const badgeIconProp =
    // @ts-expect-error support either key in your chip
    (currentBadge.icon as string) ?? (currentBadge.emoji as string) ?? "🏅";

  return (
    <section className="mt-5 mb-20 mx-auto px-3 sm:px-5">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-5">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
        <BreadcrumbSeparator>
            <Slash className="w-3.5 h-3.5" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>Profile</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Banner */}
      <div className="relative w-full h-28 sm:h-40 md:h-56 lg:h-72 rounded-lg overflow-hidden mb-5">
        <Image
          src={live.profileBanner!}
          alt="Profile banner"
          fill
          className="object-cover"
          unoptimized
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 90vw, 1100px"
          priority
        />
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 sm:gap-6 mb-4">
        {/* Left: avatar + name */}
        <div className="flex items-start sm:items-center gap-4 sm:gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 relative rounded-full overflow-hidden shrink-0">
            <Image
              src={live.profileAvatar}
              alt="Avatar"
              fill
              className="object-cover"
              unoptimized
              sizes="(max-width: 640px) 64px, 80px"
              priority
            />
          </div>

          {/* Username & copy */}
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg sm:text-xl font-bold truncate">{live.username}</h2>

              {/* tiny spinner during background refetch */}
              {isFetching && !isLoading && (
                <span
                  aria-label="Refreshing…"
                  className="inline-block w-3.5 h-3.5 border-2 border-card-foreground/50 border-t-transparent rounded-full animate-spin"
                />
              )}

              {syncing && (
                <div className="w-4 h-4 border-2 border-t-transparent border-gray-600 rounded-full animate-spin" />
              )}
            </div>

            <button
              onClick={() => handleCopy(live.walletAddress)}
              className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground hover:opacity-90"
              title="Copy address"
            >
              <span className="bg-muted px-2 py-1 rounded">
                {shortenAddress(live.walletAddress)}
              </span>
              <Copy size={16} aria-hidden />
            </button>
          </div>
        </div>

        {/* Right: socials + edit + share */}
        <TooltipProvider>
          <div className="flex flex-wrap items-center gap-7">
            {live.instagram && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a aria-label="Instagram" href={live.instagram} target="_blank" rel="noreferrer">
                    <FiInstagram size={20} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Instagram</TooltipContent>
              </Tooltip>
            )}

            {live.x && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a aria-label="X (Twitter)" href={live.x} target="_blank" rel="noreferrer">
                    <BsTwitterX size={20} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>X</TooltipContent>
              </Tooltip>
            )}

            {live.telegram && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a aria-label="Telegram" href={live.telegram} target="_blank" rel="noreferrer">
                    <FaTelegramPlane size={20} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Telegram</TooltipContent>
              </Tooltip>
            )}

            {live.website && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <a aria-label="Website" href={live.website} target="_blank" rel="noreferrer">
                    <Globe size={20} />
                  </a>
                </TooltipTrigger>
                <TooltipContent>Website</TooltipContent>
              </Tooltip>
            )}

            {/* Share: gate Radix until after mount to avoid hydration mismatch */}
            {isClient ? (
              <Dialog open={shareOpen} onOpenChange={setShareOpen}>
                <DialogTrigger asChild>
                  <button aria-label="Share profile">
                    <Share2 size={20} className="cursor-pointer" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-sm mx-auto">
                  <DialogTitle>Share Profile</DialogTitle>
                  <div className="mt-4 flex items-center gap-2">
                    <Input readOnly value={shareUrl} className="flex-1" />
                    <Button onClick={() => handleCopy(shareUrl, "Link copied!")}>Copy</Button>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              // SSR fallback (same button, no dialog)
              <button aria-label="Share profile">
                <Share2 size={20} className="cursor-pointer" />
              </button>
            )}

       {isMine && (
  <div className="flex flex-wrap items-center gap-2">
    <WithdrawRefundsDialog ownerAddress={addressKey} />
    <Button
      variant="outline"
      onClick={() => setEditOpen(true)}
      disabled={saveMutation.isPending}
    >
      {saveMutation.isPending ? "Saving…" : "Edit Profile"}
    </Button>
  </div>
)}

          </div>
        </TooltipProvider>
      </div>

      {/* Legends Badge + Progress (high-visibility, responsive) */}
      <div className="mb-6 rounded-xl border border-black/10 dark:border-white/10 bg-background/60 backdrop-blur-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {/* Left: Badge + label */}
          <div className="flex items-center gap-3">
            {/* BadgeChip supports either `emoji` or `icon` prop */}
            {/* @ts-expect-error support both prop names */}
            <BadgeChip emoji={badgeIconProp} icon={badgeIconProp} name={currentBadge.name} />
            <div className="text-sm text-muted-foreground">
              {formatNumber(comrades)} comrade{comrades === 1 ? "" : "s"} held
            </div>
          </div>

          {/* Right: Progress to next */}
          <div className="w-full sm:max-w-md">
            {nextInfo ? (
              <>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>
                    Progress to <b>{nextInfo.next.name}</b>
                  </span>
                  <span>{progressPct}%</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <div className="text-xs text-muted-foreground mt-1">
                  {neededMore} more comrade{neededMore === 1 ? "" : "s"} to reach{" "}
                  <b>{nextInfo.next.name}</b>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>Top badge achieved</span>
                  <span>100%</span>
                </div>
                <Progress value={100} className="h-2" />
                <div className="text-xs text-muted-foreground mt-1">
                  You’ve reached <b>{currentBadge.name}</b> — respect. 👑
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bio (collapsible) */}
      {bio && (
        <div className="mb-6 text-sm sm:text-base leading-relaxed">
          <p className="whitespace-pre-wrap break-words">
            {bioExpanded ? bio : bioTruncated}
            {bio.length > BIO_LIMIT && (
              <>
                {" "}
                <button
                  className="text-brand font-semibold hover:underline"
                  onClick={() => setBioExpanded((v) => !v)}
                >
                  {bioExpanded ? "Read less" : "Read more"}
                </button>
              </>
            )}
          </p>
        </div>
      )}

      {/* Simple stat row */}
      <div className="mb-6">
        <div className="flex gap-8">
          <div>
            <small className="block text-muted-foreground">Items</small>
            <p className="font-semibold text-base sm:text-lg">{formatNumber(itemsTotal)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <TabView tabs={[ITEMS_TAB, COLLECTIONS_TAB]} />

      {/* Edit sheet */}
      <EditProfileSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        username={live.username}
        currentBanner={live.profileBanner}
        currentAvatar={live.profileAvatar}
        instagram={live.instagram || ""}
        x={live.x || ""}
        website={live.website || ""}
        telegram={live.telegram || ""}
        bio={live.bio || ""}
        onSave={async (payload) => {
          await saveMutation.mutateAsync(payload);
        }}
      />
    </section>
  );
}
