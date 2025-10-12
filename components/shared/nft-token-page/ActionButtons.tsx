"use client";

/**
 * Compact, seller-aware action bar.
 *
 * Changes per request:
 *  - Removed "Add to Cart" completely (imports, props, UI).
 *  - Kept "Buy Now", seller controls, cleanup, cancel auction, finalize auction.
 */

import { Button } from "@/components/ui/button";
import { /* ShoppingCart, */ Tag, XCircle, Pencil, CheckCircle2 } from "lucide-react";

export function ActionButtons({
  // Global market state (affects Buy button)
  isListedLive,

  // Per-seller state (affects Sell visibility for ERC1155)
  isListedForMe,          // default falls back to isListedLive
  onAuctionForMe,         // default false

  // Auction existence for finalize button and seller controls
  onAuction,              // kept for compatibility; not used for Sell logic
  canManage,              // listing seller
  canManageAuction,       // auction seller
  canCancelAuction,       // auction seller AND no bids

  onBuyNow,

  onOpenSell,
  onCancelListing,
  onEditListing,
  onCleanupExpired,
  onCancelAuction,

  hasAuctionId,
  isOwnerConnected,

  disabledBuy,
  showEndCleanup,

  showFinalizeAuction,
  onFinalizeAuction,
}: {
  // Global
  isListedLive: boolean;

  // Per-seller (ERC1155). If not provided, defaults to global.
  isListedForMe?: boolean;
  onAuctionForMe?: boolean;

  // Back-compat (not used for Sell)
  onAuction?: boolean;

  canManage: boolean;
  canManageAuction?: boolean;
  canCancelAuction?: boolean;

  onBuyNow: () => void;

  onOpenSell: () => void;
  onCancelListing: () => void;
  onEditListing: () => void;
  onCleanupExpired: () => void;
  onCancelAuction: () => void;

  hasAuctionId: boolean;
  isOwnerConnected: boolean;

  disabledBuy?: boolean;
  showEndCleanup?: boolean;

  showFinalizeAuction?: boolean;
  onFinalizeAuction?: () => void;
}) {
  const listedForMe = isListedForMe ?? isListedLive;
  const auctionForMe = Boolean(onAuctionForMe);

  return (
    <div className="flex flex-wrap gap-2">
      {/* Buy Now (non-seller, global listing visibility) */}
      {isListedLive && !canManage && (
        <Button onClick={onBuyNow} disabled={!!disabledBuy} className="sm:w-36">
          Buy Now
        </Button>
      )}

      {/* Seller can list when THEY don't have a live listing/auction */}
      {!listedForMe && !auctionForMe && isOwnerConnected && (
        <Button variant="secondary" onClick={onOpenSell} className="sm:w-36">
          <Tag className="mr-2 h-4 w-4" /> Sell
        </Button>
      )}

      {/* Seller actions when the seller's listing is live (Edit/Cancel) */}
      {isListedLive && canManage && (
        <>
          <Button variant="outline" onClick={onCancelListing} className="sm:w-40">
            <XCircle className="mr-2 h-4 w-4" /> Cancel Listing
          </Button>
          <Button
            variant="secondary"
            onClick={onEditListing}
            className="sm:w-40"
            title="Cancel then recreate with new values"
          >
            <Pencil className="mr-2 h-4 w-4" /> Edit Listing
          </Button>
        </>
      )}

      {/* Anyone can end an expired listing (when shown by parent) */}
      {showEndCleanup && (
        <Button
          variant="outline"
          onClick={onCleanupExpired}
          className="sm:w-56"
          title="Anyone can end an expired listing and return the NFT"
        >
          <XCircle className="mr-2 h-4 w-4" /> End Listing (return NFT)
        </Button>
      )}

      {/* Auction owner control: show Cancel only if no bids yet */}
      {hasAuctionId && canManageAuction && canCancelAuction === true && (
        <Button
          variant="outline"
          onClick={onCancelAuction}
          className="sm:w-44"
          title="Cancel Auction"
        >
          <XCircle className="mr-2 h-4 w-4" /> Cancel Auction
        </Button>
      )}

      {/* Finalize (anyone) */}
      {hasAuctionId && showFinalizeAuction && onFinalizeAuction && (
        <Button onClick={onFinalizeAuction} className="sm:w-44" title="Finalize Auction">
          <CheckCircle2 className="mr-2 h-4 w-4" /> Finalize Auction
        </Button>
      )}
    </div>
  );
}
