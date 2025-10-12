"use client";

import * as React from "react";
import Image from "next/image";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Copy, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  name: string;
  /** Thumbnail or image for the NFT (optional) */
  mediaUrl?: string;
  /** Deployed contract address */
  contract: string;
  /** Optional, shown as a reference + explorer link */
  txHash?: string;
  /** Token ID (defaults to 1 for single mints) */
  tokenId?: number | string;

  /** Primary CTA: view the NFT details page */
  onViewNft: () => void;

  /** Secondary CTA: open the contract page within your app */
  onOpenContract: () => void;

  /** Optional extra CTA: list/sell flow (hidden if not provided) */
  onListForSale?: () => void;

  /** Close handler (kept for parity with other modals) */
  onClose: () => void;
};

export default function SingleDeploySuccessModal({
  open,
  name,
  mediaUrl,
  contract,
  txHash,
  tokenId = 1,
  onViewNft,
  onOpenContract,
  onListForSale,
  onClose,
}: Props) {
  const [copied, setCopied] = React.useState(false);

  async function copyAddr() {
    try {
      if (contract) {
        await navigator.clipboard.writeText(contract);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }
    } catch {}
  }

  return (
    // Lock the dialog so it only closes via explicit buttons
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className={cn(
          "sm:max-w-md rounded-3xl border border-white/10",
          "bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(56,189,248,0.12),transparent_60%)]",
          "backdrop-blur-2xl shadow-2xl ring-1 ring-black/10 p-0 overflow-hidden"
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="relative">
          {/* Header stripe */}
          <div className="h-1 w-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400" />

          {/* Accessible title (visually hidden) */}
          <DialogHeader>
            <DialogTitle className="sr-only">NFT minted</DialogTitle>
          </DialogHeader>

          <div className="p-6">
            {/* Success icon */}
            <div className="flex justify-center">
              <div className="h-16 w-16 rounded-full bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </div>

            {/* Media + name */}
            <div className="mt-4 flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-xl overflow-hidden border border-white/10 bg-white/5">
                {mediaUrl ? (
                  <Image
                    src={mediaUrl}
                    alt={name || "NFT"}
                    width={64}
                    height={64}
                    className="h-16 w-16 object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="h-16 w-16 flex items-center justify-center text-xs text-muted-foreground">
                    No media
                  </div>
                )}
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight">
                {name || "NFT Minted"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Your single NFT is live on-chain{typeof tokenId !== "undefined" ? ` (Token #${tokenId})` : ""}.
              </p>
            </div>

            {/* Contract row */}
            {contract ? (
              <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  Contract address
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-sm break-all">{contract}</code>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={copyAddr}
                    aria-label="Copy address"
                  >
                    {copied ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                  <a
                    href={`https://blockexplorer.electroneum.com/address/${contract}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10 transition"
                    aria-label="Open contract in explorer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ) : null}

            {/* Tx row */}
            {txHash ? (
              <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                  Transaction
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-sm break-all">{txHash}</code>
                  <a
                    href={`https://blockexplorer.electroneum.com/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10 transition"
                    aria-label="Open tx in explorer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </div>
            ) : null}

            {/* Actions */}
            <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Button onClick={onViewNft} className="w-full" disabled={!contract}>
                View NFT
              </Button>
              <Button variant="outline" onClick={onOpenContract} className="w-full" disabled={!contract}>
                Open contract
              </Button>

              {onListForSale ? (
                <Button variant="secondary" onClick={onListForSale} className="w-full sm:col-span-2">
                  List for sale
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
