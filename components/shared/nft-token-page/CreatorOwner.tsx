"use client";
import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import type { NFTItem } from "@/lib/types/types";
import type { Profile } from "@/lib/types/nft-page";
import { shortenAddress } from "@/lib/utils";

export function CreatorOwnerBlock({
  nft,
  creator,
  owner,
  listingSeller,
  auctionSeller,
  isListedLive,
  isAuctionLive,
  /** lowercased marketplace core address for escrow detection */
  marketplaceAddress,
  /** NEW: total unique holders for ERC1155 */
  erc1155OwnerCount,
  /** NEW: open the holders modal */
  onOpenOwners,
}: {
  nft: NFTItem;
  creator: Profile;
  owner: Profile;
  listingSeller?: `0x${string}` | string | null;
  auctionSeller?: `0x${string}` | string | null;
  isListedLive: boolean;
  isAuctionLive?: boolean;
  marketplaceAddress?: string;
  erc1155OwnerCount?: number | null;
  onOpenOwners?: () => void;
}) {
  const ownerIsEscrow =
    (owner?.walletAddress || "").toLowerCase() === (marketplaceAddress || "");

  const effectiveSeller = (isAuctionLive ? auctionSeller : listingSeller) || null;

  return (
    <div className="flex flex-wrap gap-10 text-sm">
      {/* Creator */}
      <div className="flex items-center gap-3">
        <Image
          src={(creator.imageUrl as string) || "/placeholder.svg"}
          alt="Creator"
          width={36}
          height={36}
          className="rounded-full object-cover"
          unoptimized
        />
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Creator</div>
          <Link
            href={`/profile/${creator.walletAddress}`}
            className="font-medium hover:underline break-all"
          >
            {creator.username ?? creator.walletAddress.slice(0, 6)}
          </Link>
        </div>
      </div>

      {/* Owner (ERC721) OR Owners (ERC1155) */}
      {nft.standard === "ERC1155" ? (
        <button
          type="button"
          onClick={() => onOpenOwners?.()}
          className="flex items-center gap-3 rounded-md border border-border/60 bg-card px-2 py-1.5 hover:bg-accent/30 transition-colors"
          title="View holders"
        >
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
            <Users className="w-4 h-4 opacity-70" />
          </div>
          <div className="text-left">
            <div className="text-xs text-muted-foreground">Owners</div>
            <div className="font-medium">
              {erc1155OwnerCount ?? 0} holder{(erc1155OwnerCount ?? 0) === 1 ? "" : "s"}
            </div>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-3">
          <Image
            src={(owner.imageUrl as string) || "/placeholder.svg"}
            alt="Owner"
            width={36}
            height={36}
            className="rounded-full object-cover"
            unoptimized
          />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">
              Owner{" "}
              {ownerIsEscrow && (
                <span className="ml-1 inline-block rounded bg-amber-500/20 text-amber-600 px-2 py-[2px] text-[10px]">
                  Escrow
                </span>
              )}
            </div>
            <Link
              href={`/profile/${owner.walletAddress}`}
              className="font-medium hover:underline break-all"
            >
              {owner.username ?? owner.walletAddress.slice(0, 6)}
            </Link>
          </div>
        </div>
      )}

      {/* Seller (only when listed or on auction) */}
      {(isListedLive || isAuctionLive) && effectiveSeller && (
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs">
            🛡️
          </div>
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">Seller</div>
            <Link
              href={`/profile/${effectiveSeller}`}
              className="font-medium hover:underline break-all"
            >
              {shortenAddress(effectiveSeller)}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
