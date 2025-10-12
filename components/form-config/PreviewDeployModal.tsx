"use client";

import * as React from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/utils";

/**
 * Utility formatters kept local to the modal to avoid cross-file coupling.
 * No address/contract strings are modified (no lowercasing, etc).
 */
function formatUsd(n: number | null | undefined) {
  if (n == null || !isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Very defensive fallback
    return `$${n.toFixed(2)}`;
  }
}

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diffMs = Date.now() - t;
  if (diffMs < 0) return "just now";
  const sec = Math.floor(diffMs / 1000);
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  // Fallback to a readable timestamp for older data
  return new Date(t).toLocaleString();
}

/* ------------------------------------------------------------------ */
/*                                Props                                */
/* ------------------------------------------------------------------ */

type PresalePreview = {
  startISO: string;
  endISO: string;
  priceEtn: string;
  maxSupply: number;
  merkleRoot: string;
  allowlistCount: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;

  // Core collection preview
  baseUri: string;
  name: string;
  symbol: string;
  description: string;
  totalSupply: number;
  royaltyRecipient: string;
  royaltyPercent: number;

  // Public sale preview
  publicStartISO: string;
  publicPriceEtn: string;
  maxPerWallet: number;
  maxPerTx: number;

  // Presale preview
  enablePresale: boolean;
  presale?: PresalePreview;

  // Optional warning surfaced by ConfigForm about Base URI fetchability
  baseUriWarning?: string | null;

  /**
   * Platform fee block (now enriched):
   * - platformFeeEtn: human-readable ETN amount (e.g., "2.500123")
   * - platformFeeRecipient: address (left as provided, no lowercasing)
   * - fxUsdPerEtn: USD per 1 ETN (from /api/fees -> lastPriceUsd)
   * - fxLastPriceAt: ISO timestamp of the price snapshot (from /api/fees -> lastPriceAt)
   * - fxSource: pricing source name ("CRYPTOCOMPARE", "FALLBACK_ENV", ...)
   * - fxPair: pricing pair string ("ETNUSD")
   *
   * NOTE: The modal stays UI-only; it doesn't fetch. These values should be
   *       passed in from ConfigForm, which calls /api/fees already.
   */
  platformFeeEtn: string;
  platformFeeRecipient: string;
  fxUsdPerEtn?: string | number;
  fxLastPriceAt?: string;
  fxSource?: string;
  fxPair?: string;
};

export default function PreviewDeployModal({
  open,
  onClose,
  onConfirm,
  baseUri,
  name,
  symbol,
  description,
  totalSupply,
  royaltyRecipient,
  royaltyPercent,
  publicStartISO,
  publicPriceEtn,
  maxPerWallet,
  maxPerTx,
  enablePresale,
  presale,
  baseUriWarning,

  platformFeeEtn,
  platformFeeRecipient,
  fxUsdPerEtn,
  fxLastPriceAt,
  fxSource,
  fxPair,
}: Props) {
  // Compute USD equivalent defensively (no NaN leaks)
  const feeEtnNum = (() => {
    const n = Number(String(platformFeeEtn).trim());
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  const usdPerEtnNum = (() => {
    if (fxUsdPerEtn == null) return null;
    const n = Number(fxUsdPerEtn);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();

  const feeUsd = usdPerEtnNum == null ? null : feeEtnNum * usdPerEtnNum;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review &amp; confirm</DialogTitle>
        </DialogHeader>

        {/* Optional Base URI warning */}
        {baseUriWarning ? (
          <div className="rounded-md border border-yellow-600/40 bg-yellow-600/10 text-yellow-300 p-3 text-sm mb-3">
            {baseUriWarning}
          </div>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        {/*                       Platform Fee (rich summary)                  */}
        {/* ------------------------------------------------------------------ */}
        <div className="rounded-lg border border-black/10 dark:border-white/10 p-3 mb-4 bg-background/60 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-sm font-medium">Platform Fee (one-time at deploy)</div>
              <div className="text-xs text-muted-foreground">
                Recipient: <span className="font-mono">{platformFeeRecipient || "—"}</span>
              </div>

              {/* Secondary line with FX details, pair & last updated */}
              <div className="text-[11px] text-muted-foreground">
                {usdPerEtnNum == null ? (
                  <span>USD conversion unavailable</span>
                ) : (
                  <>
                    Pair: <span className="font-mono">{fxPair || "ETNUSD"}</span>
                    {" · "}Source: <span className="font-mono">{fxSource || "—"}</span>
                    {" · "}Last updated: {timeAgo(fxLastPriceAt)}
                  </>
                )}
              </div>
            </div>

            <div className="text-right">
              <div className="text-base font-semibold inline-flex items-center gap-2 justify-end">
          {formatNumber(Number(platformFeeEtn))}
                <Image src="/ETN_LOGO.png" alt="ETN" width={16} height={16} />
              </div>

              {/* USD equivalent (approx) */}
              <div className="text-xs text-muted-foreground">
                {usdPerEtnNum == null ? "—" : `≈ ${formatUsd(feeUsd)}`}
              </div>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/*                           Core Summary                             */}
        {/* ------------------------------------------------------------------ */}
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-muted-foreground">Base URI</div>
              <div className="font-medium break-words">{baseUri || "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Collection</div>
              <div className="font-medium break-words">
                {name || "—"} &middot; {symbol || "—"}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Supply</div>
              <div className="font-medium">{Number.isFinite(totalSupply) ? totalSupply : "—"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Royalties</div>
              <div className="font-medium">
                {Number.isFinite(royaltyPercent) ? royaltyPercent : "—"}% &middot;{" "}
                <span className="break-all">{royaltyRecipient || "—"}</span>
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-muted-foreground">Public sale</div>
              <div className="font-medium">
                {new Date(publicStartISO).toLocaleString()} &middot; {publicPriceEtn || "—"} ETN
                {" · "}
                {Number.isFinite(maxPerWallet) ? maxPerWallet : "—"} per wallet{" · "}
                {Number.isFinite(maxPerTx) ? maxPerTx : "—"} per txn
              </div>
            </div>
          </div>

          {description ? (
            <div>
              <div className="text-muted-foreground">Description</div>
              <div className="font-medium whitespace-pre-wrap">{description}</div>
            </div>
          ) : null}

          {/* ---------------------------------------------------------------- */}
          {/*                           Presale Block                           */}
          {/* ---------------------------------------------------------------- */}
          {enablePresale && presale ? (
            <div className="rounded-lg border border-white/10 p-3">
              <div className="font-semibold mb-2">Presale</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Window</div>
                  <div className="font-medium">
                    {new Date(presale.startISO).toLocaleString()} →{" "}
                    {new Date(presale.endISO).toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Price</div>
                  <div className="font-medium">{presale.priceEtn || "—"} ETN</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Reserved supply</div>
                  <div className="font-medium">
                    {Number.isFinite(presale.maxSupply) ? presale.maxSupply : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Allowlist size</div>
                  <div className="font-medium">
                    {Number.isFinite(presale.allowlistCount) ? presale.allowlistCount : "—"}
                  </div>
                </div>
                <div className="col-span-2">
                  <div className="text-muted-foreground">Merkle root</div>
                  <div className="font-mono text-xs break-all">
                    {presale.merkleRoot || "—"}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>
            Back
          </Button>
          <Button onClick={onConfirm}>Confirm &amp; deploy</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
