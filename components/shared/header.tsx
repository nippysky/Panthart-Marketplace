"use client";

import { BrandLogo } from "@/lib/images";
import Image from "next/image";
import React, { useMemo, useRef, useState, useEffect } from "react";
import ConnectWallet from "./connect-wallet";
import { Input } from "../ui/input";
import Link from "next/link";
import { Button } from "../ui/button";
import { Plus, X as XIcon } from "lucide-react";
import SearchResultsPopover from "./search-results-popover";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { useActiveAccount } from "thirdweb/react";
import MobileMenuSheet from "./mobile-menu-sheet";
import { useUserByWallet } from "@/lib/hooks/useUserByWallet";

const TOOLTIP_MESSAGES = {
  create: "Create a new NFT",
  profile: "View & Edit your profile",
  menu: "Menu",
};

// Utility to append a cache-busting param using updatedAt.
function withCacheBust(url?: string, stamp?: string) {
  if (!url) return undefined;
  if (url.startsWith("data:")) return url;
  try {
    const base =
      typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const u = new URL(url, base);
    if (stamp) u.searchParams.set("v", stamp);
    return u.toString();
  } catch {
    const glue = url.includes("?") ? "&" : "?";
    return stamp ? `${url}${glue}v=${encodeURIComponent(stamp)}` : url;
  }
}

export default function Header() {
  const [searchTerm, setSearchTerm] = useState("");
  const [openResults, setOpenResults] = useState(false);

  const account = useActiveAccount();
  const { user } = useUserByWallet(account?.address);

  // Cache-busted avatar (updates immediately when profile changes)
  const avatarSrc = useMemo(
    () => withCacheBust(user?.profileAvatar, user?.updatedAt),
    [user?.profileAvatar, user?.updatedAt]
  );

  // Outer area (for layout only)
  const outerSearchRef = useRef<HTMLDivElement | null>(null);
  // Inner anchor around the input — used to position the ✖️ and the popover
  const inputAnchorRef = useRef<HTMLDivElement | null>(null);

  // Open the popover when focusing in; close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenResults(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const hasQuery = searchTerm.trim().length > 0;

  return (
    <TooltipProvider>
      <header
        style={{ zIndex: 85 }}
        className="w-full flex items-center justify-between py-2 bg-background/80 dark:bg-background/80 backdrop-blur-sm sticky top-0 gap-10"
      >
        {/* Left: Logo & Search */}
        <div className="flex items-center gap-5 flex-1">
          <Link href="/">
            <Image
              src={BrandLogo}
              alt="Decentroneum Logo"
              width={40}
              height={40}
              priority
            />
          </Link>

          {/* Outer search row (flex for layout only) */}
          <div ref={outerSearchRef} className="flex-1 hidden lg:flex">
            {/* Inner, width-bound anchor for input + clear + popover */}
            <div ref={inputAnchorRef} className="relative w-full max-w-[600px]">
              <Input
                className="w-full pr-9" /* space for clear button */
                placeholder="Search for NFT, collections, and users"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  if (!openResults) setOpenResults(true);
                }}
                onFocus={() => hasQuery && setOpenResults(true)}
              />

              {/* Clear / Cancel (now truly inside the input width) */}
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

              {/* Results popover — positioned against the same anchor */}
              <SearchResultsPopover
                open={openResults && hasQuery}
                onClose={() => setOpenResults(false)}
                searchTerm={searchTerm}
                anchorRef={inputAnchorRef}
              />
            </div>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center lg:gap-5 gap-2">
          {account && (
            <>
              <nav className="hidden xl:flex xl:gap-5 items-center">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/create" passHref>
                      <Button className="flex items-center gap-2">
                        <Plus size={18} />
                        Create NFT
                      </Button>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>{TOOLTIP_MESSAGES.create}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href={`/profile/${account.address}`} passHref>
                      <Avatar className="w-9 h-9 cursor-pointer">
                        <AvatarImage
                          key={avatarSrc /* force refresh if src changes */}
                          src={avatarSrc}
                          alt="Profile"
                          className="object-cover"
                        />
                        <AvatarFallback>0x</AvatarFallback>
                      </Avatar>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>{TOOLTIP_MESSAGES.profile}</TooltipContent>
                </Tooltip>
              </nav>
            </>
          )}

          <div className="block">
            <ConnectWallet />
          </div>

          {account && (
            <div className="inline-flex items-center gap-2 xl:hidden">
              <MobileMenuSheet account={account} />
            </div>
          )}
        </div>
      </header>
    </TooltipProvider>
  );
}
