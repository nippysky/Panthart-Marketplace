"use client";

import * as React from "react";
import { ethers } from "ethers";
import { ShoppingCart, Timer, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";
import { getBrowserSigner, ZERO_ADDRESS } from "@/lib/evm/getSigner";
import { marketplace, type Standard as Std } from "@/lib/services/marketplace";
import { useLoaderStore } from "@/lib/store/loader-store";
import { GrShop } from "react-icons/gr";

type DonePayload = { listingId?: bigint; txHash?: string; sellerAddress?: string };

function parseISO(iso?: string) {
  try {
    return iso ? new Date(iso).getTime() : null;
  } catch {
    return null;
  }
}

export default function BuyNowIsland(props: {
  contract: string;
  tokenId: string;
  standard: "ERC721" | "ERC1155" | string;
  sellerAddress: string;

  currencyAddress: string | null; // null or 0x0 => native ETN
  amountWei: string | null;       // UI hint only; we re-read on-chain

  startTimeISO?: string;
  endTimeISO?: string;

  className?: string;
  onDone?: (info: DonePayload) => void;
}) {
  const {
    contract,
    tokenId,
    standard,
    sellerAddress,
    startTimeISO,
    endTimeISO,
    className,
    onDone,
  } = props;

  const [busy, setBusy] = React.useState(false);
  const [isSeller, setIsSeller] = React.useState(false);
  const [expired, setExpired] = React.useState(false);
  const [notStarted, setNotStarted] = React.useState(false);
  const { show, hide } = useLoaderStore();

  async function computeIsSeller() {
    try {
      const { signer } = await getBrowserSigner();
      const me = (await signer.getAddress())?.toLowerCase?.();
      const isMine = me && sellerAddress && me === sellerAddress.toLowerCase();
      setIsSeller(Boolean(isMine));
    } catch {
      setIsSeller(false);
    }
  }

  function recomputeTimeFlags() {
    const now = Date.now();
    const s = parseISO(startTimeISO);
    const e = parseISO(endTimeISO);
    setNotStarted(Boolean(s && now < s));
    setExpired(Boolean(e && now > e));
  }

  React.useEffect(() => {
    computeIsSeller();
  }, [sellerAddress]);

  React.useEffect(() => {
    const eth = (globalThis as any)?.ethereum;
    if (!eth?.on) return;
    const handler = () => computeIsSeller();
    eth.on("accountsChanged", handler);
    eth.on("chainChanged", handler);
    return () => {
      try {
        eth.removeListener("accountsChanged", handler);
        eth.removeListener("chainChanged", handler);
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sellerAddress]);

  React.useEffect(() => {
    recomputeTimeFlags();
    const id = window.setInterval(recomputeTimeFlags, 10_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTimeISO, endTimeISO]);

  async function onBuy() {
    try {
      if (isSeller) { toast.info("You can't buy your own listing."); return; }
      if (notStarted) { toast.error("Listing has not started yet."); return; }
      if (expired) { toast.error("Listing already ended."); return; }

      const expected = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);
      const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
      if (!mktAddr) throw new Error("Marketplace address not configured.");

      const { signer, chainId } = await getBrowserSigner();
      if (Number(chainId) !== expected) {
        throw new Error("Wrong network. Please switch to Electroneum.");
      }

      const read = await marketplace.readActiveListingForSeller({
        collection: contract as `0x${string}`,
        tokenId: BigInt(tokenId),
        standard: (standard as Std) || "ERC721",
        seller: sellerAddress as `0x${string}`,
      });
      const listingId = read?.id;
      if (!listingId || listingId === 0n) {
        toast.error("Listing unavailable. Please refresh.");
        return;
      }

      const row = await marketplace.readListingById(listingId);
      const onchainCurrency = row?.row?.currency ?? ZERO_ADDRESS;
      const isNative =
        !onchainCurrency || String(onchainCurrency).toLowerCase() === ZERO_ADDRESS.toLowerCase();
      const amount: bigint = (row?.row?.price ?? 0n) as bigint;
      if (amount <= 0n) throw new Error("Invalid price.");

      setBusy(true);
      show("Buying…");

      if (!isNative) {
        const erc20 = new ethers.Contract(
          onchainCurrency as `0x${string}`,
          [
            "function allowance(address owner, address spender) view returns (uint256)",
            "function approve(address spender, uint256 value) returns (bool)",
          ],
          signer
        );
        const owner = await signer.getAddress();
        const allowance: bigint = await erc20.allowance(owner, mktAddr);
        if (allowance < amount) {
          const txA = await erc20.approve(mktAddr, amount);
          await txA.wait();
        }
      }

      const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);
      const tx = isNative ? await mkt.buy(listingId, { value: amount }) : await mkt.buy(listingId);
      const rc = await tx.wait();

      try {
        const buyer = (await signer.getAddress())?.toLowerCase?.();
        await fetch("/api/marketplace/listings/attach-tx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "SOLD",
            contract,
            tokenId,
            sellerAddress,
            buyerAddress: buyer,
            txHash: rc?.hash ?? tx.hash,
          }),
        });
      } catch {}

      setBusy(false);
      hide();
      toast.success("Purchase complete");
      onDone?.({ listingId, txHash: rc?.hash ?? tx.hash, sellerAddress });
    } catch (e: any) {
      setBusy(false);
      hide();
      toast.error(e?.reason || e?.message || "Purchase failed");
    }
  }

  async function onCleanupExpired() {
    try {
      const expected = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);
      const mktAddr = process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as `0x${string}`;
      if (!mktAddr) throw new Error("Marketplace address not configured.");

      const { signer, chainId } = await getBrowserSigner();
      if (Number(chainId) !== expected) {
        throw new Error("Wrong network. Please switch to Electroneum.");
      }

      const read = await marketplace.readActiveListingForSeller({
        collection: contract as `0x${string}`,
        tokenId: BigInt(tokenId),
        standard: (standard as Std) || "ERC721",
        seller: sellerAddress as `0x${string}`,
      });
      const listingId = read?.id;
      if (!listingId || listingId === 0n) {
        toast.error("No active listing to finalize.");
        return;
      }

      setBusy(true);
      show("Finalizing…");

      const mkt = new ethers.Contract(mktAddr, MARKETPLACE_CORE_ABI, signer);
      const tx = await mkt.cleanupExpiredListing(listingId);
      const rc = await tx.wait();

      setBusy(false);
      hide();
      toast.success("Listing finalized");
      onDone?.({ listingId, txHash: rc?.hash ?? tx.hash, sellerAddress });
    } catch (e: any) {
      setBusy(false);
      hide();
      toast.error(e?.reason || e?.message || "Finalize failed");
    }
  }

  const showFinalize = expired === true;

  return (
    // Stack on mobile; row on sm+
    <div className="flex flex-col sm:flex-row gap-2 w-full">
      <Button
        onClick={onBuy}
        disabled={busy || isSeller || notStarted || expired}
        className={`w-full sm:flex-1 ${className || ""}`}
        title={
          isSeller
            ? "You can't buy your own listing"
            : notStarted
            ? "Listing has not started"
            : expired
            ? "Listing already ended"
            : undefined
        }
      >
        <GrShop className="mr-2 h-4 w-4" />
        {isSeller ? "Your listing" : busy ? "Buying…" : "Buy"}
      </Button>

      {showFinalize ? (
        <Button
          variant="outline"
          onClick={onCleanupExpired}
          disabled={busy}
          className="w-full sm:w-auto sm:shrink-0"
          title="Return the NFT(s) to the seller (anyone can finalize after end time)"
        >
          <CheckCircle className="mr-2 h-4 w-4" />
          Finalize
        </Button>
      ) : (
        <Button variant="outline" disabled className="pointer-events-none w-full sm:w-auto sm:shrink-0">
          <Timer className="mr-2 h-4 w-4" />
          {notStarted ? "Not started" : "Live"}
        </Button>
      )}
    </div>
  );
}
