"use client";

import React, { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatNumber, shortenAddress } from "@/lib/utils";
import { useNFTCartStore } from "@/lib/store/add-to-cart";
import { ShoppingCart, Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

interface CartSheetItemsProps {
  closeSheet: () => void;
}

function ETNPill() {
  return (
    <span className="inline-flex items-center rounded-md border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-[2px] text-[10px] font-semibold text-emerald-600">
      ETN
    </span>
  );
}

export default function CartSheetItems({ closeSheet }: CartSheetItemsProps) {
  const cart = useNFTCartStore((s) => s.cart);
  const remove = useNFTCartStore.getState().removeFromCart;
  const clear = useNFTCartStore.getState().clearCart;

  const total = useMemo(
    () => cart.reduce((sum, item) => sum + (item.listingPrice ?? 0), 0),
    [cart]
  );

  if (cart.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6">
        <ShoppingCart size={48} className="text-muted-foreground mb-4" />
        <p className="mb-6">Your cart is empty</p>
        <Link href="/explore" onClick={closeSheet}>
          <Button>Explore Marketplace</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {cart.map((item) => (
        <div
          key={`${item.nftAddress}-${item.tokenId}`}
          className="flex items-center gap-3 border rounded-lg p-2"
        >
          {/* Thumbnail */}
          <div className="relative w-14 h-14 rounded-md overflow-hidden bg-muted shrink-0">
            <Image
              src={(item.image as string) || "/placeholder.svg"}
              alt={item.name || `${item.tokenId}`}
              fill
              unoptimized
              className="object-cover"
            />
          </div>

          {/* Meta */}
          <div className="min-w-0 flex-1">
            <Link
              href={`/collections/${item.nftAddress}/${item.tokenId}`}
              className="block font-medium hover:underline break-words line-clamp-2"
              title={item.name || `#${item.tokenId}`}
              onClick={closeSheet}
            >
              {item.name || `#${item.tokenId}`}
            </Link>

            {/* Contract short + copy */}
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <code className="font-mono">{shortenAddress(item.nftAddress)}</code>
              <button
                type="button"
                className="inline-flex items-center opacity-80 hover:opacity-100"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(item.nftAddress);
                    toast.success("Contract copied");
                  } catch {
                    toast.error("Copy failed");
                  }
                }}
                aria-label="Copy contract"
                title="Copy contract"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Price */}
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base font-semibold leading-none">
                {formatNumber(item.listingPrice ?? 0)}
              </span>
              <ETNPill />
            </div>
          </div>

          {/* Remove */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => remove(item.nftAddress, item.tokenId)}
            aria-label="Remove from cart"
          >
            <Trash2 className="w-4 h-4 mr-1" />
            Remove
          </Button>
        </div>
      ))}

      <div className="mt-2 border-t pt-4 flex items-center justify-between">
        <span className="font-semibold">Total</span>
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">
            {formatNumber(total)}
          </span>
          <ETNPill />
        </div>
      </div>

      <div className="flex flex-col gap-2 mt-4">
        <Button
          variant="destructive"
          disabled={cart.length === 0}
          onClick={() => {
            clear();
            closeSheet();
          }}
        >
          Clear Cart
        </Button>
        <Button
          disabled={cart.length === 0}
          onClick={() => {
            // your checkout flow here
            closeSheet();
          }}
        >
          Proceed to Checkout
        </Button>
      </div>
    </div>
  );
}
