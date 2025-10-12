"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import useSWR from "swr";
import { toast } from "sonner";
import { ethers } from "ethers";
import { ERC1155_SINGLE_ABI } from "@/lib/abis/ERC1155SingleDropABI";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Card } from "@/components/ui/card";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Minus,
  Plus,
  Slash,
  X,
} from "lucide-react";
import { shortenAddress } from "@/lib/utils";
import { ERC1155MintDetails } from "@/lib/server/erc1155-details";

import LoaderModal from "@/components/shared/loader-modal";
import { useLoaderStore } from "@/lib/store/loader-store";

/* Tell TS about window.ethereum */
declare global {
  interface Window {
    ethereum?: unknown;
  }
}

const PUBLIC_RPC = process.env.NEXT_PUBLIC_RPC_URL || "";
const EXPLORER_BASE = process.env.NEXT_PUBLIC_BLOCK_EXPLORER || ""; // e.g. https://explorer.electroneum.com

/* ---------- helpers ---------- */
function ipfsToHttp(u?: string | null) {
  if (!u) return "";
  return u.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7)}` : u;
}
function formatEtnFromWei(wei: string | number | bigint) {
  const b = BigInt(wei.toString());
  const whole = b / 10n ** 18n;
  const frac = b % 10n ** 18n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole}.${fracStr}`;
}
function multiplyWei(aWei: string | bigint, qty: number): string {
  const a = BigInt(aWei.toString());
  return (a * BigInt(qty)).toString();
}
function isVideo(url: string) {
  if (!url) return false;
  const clean = url.split("?")[0].toLowerCase();
  return [".mp4", ".webm", ".ogg", ".mov", ".m4v"].some((ext) => clean.endsWith(ext));
}
function prettyNumber(n?: number | null) {
  if (n == null) return "—";
  return n.toLocaleString();
}

/* Connected wallet */
function useConnectedAddress() {
  const [addr, setAddr] = React.useState<string | null>(null);
  React.useEffect(() => {
    const eth: any = (window as any).ethereum;
    async function load() {
      try {
        let a = eth?.selectedAddress || null;
        if (!a && eth?.request) {
          const arr = await eth.request({ method: "eth_accounts" });
          a = arr?.[0] ?? null;
        }
        setAddr(a);
      } catch {
        setAddr(null);
      }
    }
    load();
    if (eth?.on) {
      const handler = (accounts: string[]) => setAddr(accounts?.[0] ?? null);
      eth.on("accountsChanged", handler);
      return () => eth.removeListener?.("accountsChanged", handler);
    }
  }, []);
  return addr;
}

async function getReadProvider(): Promise<ethers.Provider | null> {
  try {
    if (PUBLIC_RPC) return new ethers.JsonRpcProvider(PUBLIC_RPC);
    if (typeof window !== "undefined" && (window as any).ethereum) {
      return new ethers.BrowserProvider((window as any).ethereum);
    }
  } catch {}
  return null;
}

/* On-chain reads */
async function fetchOnchainProgress(contract: string) {
  const provider = await getReadProvider();
  if (!provider) return null;
  try {
    const c = new ethers.Contract(contract, ERC1155_SINGLE_ABI, provider);
    const [totalMinted, maxSupply, mintPrice, maxPerWallet] = await Promise.all([
      c.totalMinted() as Promise<bigint>,
      c.maxSupply() as Promise<bigint>,
      c.mintPrice() as Promise<bigint>,
      c.maxPerWallet() as Promise<bigint>,
    ]);
    const supply = Number(maxSupply);
    const minted = Number(totalMinted);
    const mintedPct = supply > 0 ? Math.min(100, Math.round((minted / supply) * 100)) : 0;
    return {
      supply,
      minted,
      mintedPct,
      priceEtnWei: mintPrice.toString(),
      maxPerWallet: Number(maxPerWallet),
    };
  } catch {
    return null;
  }
}

async function fetchWalletMinted(contract: string, wallet: string) {
  const provider = await getReadProvider();
  if (!provider) return null;
  try {
    const c = new ethers.Contract(contract, ERC1155_SINGLE_ABI, provider);
    const mw: bigint = await c.mintedPerWallet(wallet);
    return Number(mw);
  } catch {
    return null;
  }
}

/* Copy button */
function CopyAddr({ value }: { value: string }) {
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value);
        toast.success("Address copied");
      }}
      className="inline-flex items-center justify-center rounded-md px-1.5 py-1 hover:bg-black/5 dark:hover:bg-white/10 cursor-pointer"
      title="Copy"
      type="button"
    >
      <Copy className="w-3.5 h-3.5 opacity-80" />
    </button>
  );
}

/* ---------- Custom success modal (no shadcn) ---------- */
function SuccessModal({
  open,
  onClose,
  name,
  mediaUrl,
  mediaIsVideo,
  qty,
  contract,
  txHash,
  explorerBase,
}: {
  open: boolean;
  onClose: () => void;
  name: string;
  mediaUrl: string;
  mediaIsVideo: boolean;
  qty: number;
  contract: string;
  txHash: string | null;
  explorerBase?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const explorerTxUrl =
    explorerBase && txHash
      ? `${explorerBase.replace(/\/+$/, "")}/tx/${txHash}`
      : null;

  const explorerContractUrl =
    explorerBase && contract
      ? `${explorerBase.replace(/\/+$/, "")}/address/${contract}`
      : null;

  return (
    <div className="fixed inset-0 z-[2000]">
      {/* Backdrop (locked; no outside click close) */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-[92vw] max-w-[600px] rounded-2xl shadow-2xl border border-black/10 dark:border-white/10 bg-card overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-white/5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600/20">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </span>
              <h3 className="text-base font-semibold">Mint Successful</h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Media (robust: any ratio) */}
          <div className="bg-black flex items-center justify-center">
            {/* Limit height so huge portrait/landscape images don’t overflow. Maintain aspect automatically. */}
            {mediaIsVideo ? (
              <video
                src={mediaUrl}
                autoPlay
                muted
                loop
                playsInline
                className="max-h-[380px] w-full h-auto object-contain"
              />
            ) : (
              // Use plain <img> to keep the intrinsic aspect ratio perfectly.
              <img
                src={mediaUrl || "/placeholder.svg"}
                alt={name}
                className="max-h-[380px] w-full h-auto object-contain"
              />
            )}
          </div>

          {/* Body */}
          <div className="px-5 py-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              You minted <b className="text-foreground">{qty}</b> from{" "}
              <b className="text-foreground">{name}</b>.
            </p>

            <div className="text-xs text-muted-foreground">
              Contract:{" "}
              <span className="font-mono">{shortenAddress(contract)}</span>
              {explorerContractUrl && (
                <>
                  {" "}
                  •{" "}
                  <a
                    href={explorerContractUrl}
                    className="underline inline-flex items-center gap-1"
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    View contract <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </>
              )}
            </div>

            {txHash && (
              <div className="text-xs text-muted-foreground">
                Tx:{" "}
                {explorerTxUrl ? (
                  <a
                    href={explorerTxUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline inline-flex items-center gap-1"
                  >
                    {txHash.slice(0, 10)}…{txHash.slice(-8)}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="font-mono">{txHash}</span>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 flex items-center justify-end">
            <Button
              onClick={onClose}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Main page component ---------- */
export default function ERC1155MintClient({ details }: { details: ERC1155MintDetails }) {
  const connected = useConnectedAddress();
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const { show, hide } = useLoaderStore();

  const { data: live, mutate } = useSWR(
    ["erc1155-progress", details.contract],
    () => fetchOnchainProgress(details.contract),
    {
      refreshInterval: 10_000,
      revalidateOnFocus: true,
      fallbackData: {
        supply: details.supply,
        minted: details.minted,
        mintedPct: details.mintedPct,
        priceEtnWei: details.priceEtnWei,
        maxPerWallet: details.maxPerWallet,
      },
    }
  );

  const { data: walletMinted, mutate: mutateWalletMinted } = useSWR(
    connected ? ["erc1155-wallet-minted", details.contract, connected] : null,
    () => fetchWalletMinted(details.contract, connected as string),
    { refreshInterval: 12_000, revalidateOnFocus: true }
  );

  const supply = live?.supply ?? details.supply;
  const minted = live?.minted ?? details.minted;
  const mintedPct = live?.mintedPct ?? details.mintedPct;
  const priceWei = live?.priceEtnWei ?? details.priceEtnWei;
  const maxPerWallet = live?.maxPerWallet ?? details.maxPerWallet;

  const remaining = Math.max(0, supply - minted);
  const soldOut = remaining <= 0;
  const price = formatEtnFromWei(priceWei);

  const MAX_PER_TX = 20;

  const mintedByYou =
    connected && typeof walletMinted === "number" ? Math.max(0, walletMinted) : null;

  const walletRemaining =
    connected && typeof walletMinted === "number"
      ? Math.max(0, (maxPerWallet || 0) - walletMinted)
      : maxPerWallet;

  const maxQtyThisTx = Math.max(
    0,
    Math.min(
      MAX_PER_TX,
      remaining,
      Number.isFinite(walletRemaining) ? (walletRemaining as number) : MAX_PER_TX
    )
  );

  const [qty, setQty] = React.useState(1);
  const [minting, setMinting] = React.useState(false);
  const [showSuccess, setShowSuccess] = React.useState(false);
  const [successQty, setSuccessQty] = React.useState(0);
  const [successTx, setSuccessTx] = React.useState<string | null>(null);
  const [qtyError, setQtyError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setQty((q) => Math.max(1, Math.min(q, maxQtyThisTx || 1)));
  }, [maxQtyThisTx]);

  React.useEffect(() => {
    if (Number.isFinite(walletRemaining) && (walletRemaining as number) <= 0) {
      setQtyError(`You’ve reached the maximum per wallet (${maxPerWallet}).`);
    } else {
      setQtyError(null);
    }
  }, [walletRemaining, maxPerWallet]);

  const mediaUrl = ipfsToHttp(details.imageUrl);
  const mediaIsVideo = isVideo(mediaUrl);

  const totalCostWei = multiplyWei(priceWei, qty);
  const totalCostETN = formatEtnFromWei(totalCostWei);

  /* Mint flow */
  async function handleMint() {
    if (soldOut) return;
    if (!connected || !(window as any).ethereum) {
      toast.error("Connect your wallet to mint.");
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      setQtyError("Enter a valid amount.");
      return;
    }
    if (maxQtyThisTx <= 0) {
      if (Number.isFinite(walletRemaining) && (walletRemaining as number) <= 0) {
        setQtyError(`You’ve reached the maximum per wallet (${maxPerWallet}).`);
      } else {
        setQtyError("Not enough remaining to mint.");
      }
      return;
    }
    if (qty > maxQtyThisTx) {
      setQtyError(`You can mint up to ${maxQtyThisTx} right now.`);
      setQty(Math.max(1, maxQtyThisTx || 1));
      return;
    }

    try {
      setQtyError(null);
      setMinting(true);
      show("Confirm the transaction in your wallet…");

      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      const c = new ethers.Contract(details.contract, ERC1155_SINGLE_ABI, signer);

      const value = BigInt(priceWei) * BigInt(qty);

      try {
        await c.mint.staticCall(qty, { value });
      } catch {
        setMinting(false);
        hide();
        if (Number.isFinite(walletRemaining) && qty > (walletRemaining as number)) {
          setQtyError(
            `You can mint ${walletRemaining} more in total (per-wallet limit ${maxPerWallet}).`
          );
        } else {
          setQtyError("Mint would fail with current amount.");
        }
        return;
      }

      const overrides: any = { value };
      try {
        const est: bigint = await c.mint.estimateGas(qty, { value });
        overrides.gasLimit = (est * 120n) / 100n;
      } catch {
        overrides.gasLimit = 500_000n;
      }

      show("Waiting for on-chain confirmation…");
      const tx = await c.mint(qty, overrides);
      setSuccessTx(tx.hash);
      const rcpt = await tx.wait();

      if (!rcpt || rcpt.status !== 1) {
        setMinting(false);
        hide();
        toast.error("Mint failed on-chain.");
        return;
      }

      setSuccessQty(qty);
      setShowSuccess(true);

      await mutate();
      await mutateWalletMinted();
      setTimeout(() => mutate(), 1400);
      setTimeout(() => mutateWalletMinted(), 2000);
      setTimeout(() => mutate(), 4200);

      hide();
    } catch {
      hide();
      toast.error("Mint failed. Please try again.");
    } finally {
      setMinting(false);
    }
  }

  const explorerContractUrl =
    EXPLORER_BASE && details.contract
      ? `${EXPLORER_BASE.replace(/\/+$/, "")}/address/${details.contract}`
      : undefined;

  return (
    <section className="min-h-[70vh] lg:px-8">
      <LoaderModal />

      {/* Breadcrumb */}
      <Breadcrumb className="mb-5 mt-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>

          {segments.map((seg, i) => {
            const isLast = i === segments.length - 1;
            const href = `/${segments.slice(0, i + 1).join("/")}`;
            const pretty = isLast
              ? details.name
              : seg === "minting-now"
              ? "Minting Now"
              : seg === "erc1155"
              ? "ERC1155"
              : seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            const shouldLink = !isLast && seg !== "erc1155";
            return (
              <React.Fragment key={`${seg}-${i}`}>
                <BreadcrumbSeparator>
                  <Slash className="w-3.5 h-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  {shouldLink ? (
                    <BreadcrumbLink href={href}>{pretty}</BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{pretty}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <Card className="p-4 md:p-6 lg:p-8 border border-black/10 dark:border-white/10 bg-white dark:bg-black/40">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8">
          {/* Media & description */}
          <div className="lg:col-span-6">
            <div className="rounded-2xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 bg-neutral-100 dark:bg-black relative">
              <div className="w-full aspect-[16/9] md:aspect-[3/2] lg:aspect-[4/3]">
                {isVideo(mediaUrl) ? (
                  <video
                    src={mediaUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-contain bg-black"
                  />
                ) : (
                  <Image
                    src={mediaUrl || "/placeholder.svg"}
                    alt={details.name}
                    fill
                    unoptimized
                    className="object-contain"
                  />
                )}
              </div>
            </div>

            <div className="mt-6">
              <div className="text-sm text-muted-foreground">
                By{" "}
                <Link
                  href={`/profile/${details.creator.walletAddress}`}
                  className="font-bold hover:underline dark:text-brand text-brandsec"
                >
                  {details.creator.username || shortenAddress(details.creator.walletAddress)}
                </Link>
              </div>

              {details.description ? (
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground/90">
                  {details.description}
                </p>
              ) : null}
            </div>
          </div>

          {/* Sticky mint panel */}
          <div className="lg:col-span-6">
            <div className="lg:sticky lg:top-20 space-y-6">
              {/* Header row */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                    {details.name}
                  </h1>
                  <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2">
                    <span>Contract:</span>
                    <span className="font-medium">{shortenAddress(details.contract)}</span>
                    <CopyAddr value={details.contract} />
                    {explorerContractUrl && (
                      <Link
                        href={explorerContractUrl}
                        target="_blank"
                        className="inline-flex items-center gap-1 hover:underline"
                      >
                        View <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    )}
                  </div>
                </div>
              </div>

              {/* Progress */}
              <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-neutral-50 dark:bg-white/5">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Minted</span>
                  <span className="text-muted-foreground">
                    {prettyNumber(minted)} / {prettyNumber(supply)}
                  </span>
                </div>
                <Progress value={mintedPct} className="h-2 mt-2" />
                <div className="mt-1 text-[12px] text-muted-foreground">
                  Total: <b>{prettyNumber(minted)}</b> / <b>{prettyNumber(supply)}</b> •{" "}
                  <b>{prettyNumber(Math.max(0, supply - minted))}</b> remaining
                </div>
              </div>

              {/* Price + per-wallet */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-neutral-50 dark:bg-white/5">
                  <div className="text-sm text-muted-foreground">Price</div>
                  <div className="mt-1 text-2xl font-semibold">{price} ETN</div>
                </div>
                <div className="rounded-xl border border-black/10 dark:border-white/10 p-4 bg-neutral-50 dark:bg-white/5">
                  <div className="text-sm text-muted-foreground">Max / wallet</div>
                  <div className="mt-1 text-2xl font-semibold">{maxPerWallet}</div>
                </div>
              </div>

              {/* Mint box */}
              <div className="rounded-2xl border border-black/10 dark:border-white/10 p-4 sm:p-5 bg-white dark:bg-white/5">
                <div className="text-sm font-semibold mb-3">Mint</div>

                {/* Mobile-first: input full width, controls below */}
                <div className="sm:hidden">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={maxQtyThisTx || 1}
                    value={qty}
                    onChange={(e) => {
                      const n = Math.floor(Number(e.target.value) || 1);
                      setQty(Math.max(1, Math.min(n, maxQtyThisTx || 1)));
                      setQtyError(null);
                    }}
                    className="h-12 text-center text-base"
                    placeholder="Amount"
                  />

                  <div className="mt-3 grid grid-cols-5 gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setQty(Math.max(1, qty - 1))}
                      disabled={soldOut || minting || qty <= 1}
                      className="col-span-1"
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setQty(Math.min(Math.max(1, maxQtyThisTx || 1), qty + 1))}
                      disabled={soldOut || minting || maxQtyThisTx <= 1}
                      className="col-span-1"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setQty(1)}
                      disabled={soldOut || minting}
                      className="col-span-1"
                    >
                      Min
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setQty(Math.max(1, Math.ceil((maxQtyThisTx || 1) / 2)))
                      }
                      disabled={soldOut || minting || maxQtyThisTx <= 1}
                      className="col-span-1"
                    >
                      50%
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setQty(Math.max(1, maxQtyThisTx || 1))}
                      disabled={soldOut || minting || maxQtyThisTx <= 1}
                      className="col-span-1"
                    >
                      Max
                    </Button>
                  </div>
                </div>

                {/* Desktop / tablet */}
                <div className="hidden sm:flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-stretch rounded-lg border border-black/10 dark:border-white/10 overflow-hidden bg-background">
                      <button
                        type="button"
                        onClick={() => setQty(Math.max(1, qty - 1))}
                        className="px-3 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                        disabled={soldOut || minting || qty <= 1}
                        aria-label="Decrease"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={maxQtyThisTx || 1}
                        value={qty}
                        onChange={(e) => {
                          const n = Math.floor(Number(e.target.value) || 1);
                          setQty(Math.max(1, Math.min(n, maxQtyThisTx || 1)));
                          setQtyError(null);
                        }}
                        className="w-20 text-center border-0 focus-visible:ring-0"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setQty(Math.min(Math.max(1, maxQtyThisTx || 1), qty + 1))
                        }
                        className="px-3 text-sm hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-50"
                        disabled={soldOut || minting || maxQtyThisTx <= 1}
                        aria-label="Increase"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setQty(1)}
                        disabled={soldOut || minting}
                      >
                        Min
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setQty(Math.max(1, Math.ceil((maxQtyThisTx || 1) / 2)))
                        }
                        disabled={soldOut || minting || maxQtyThisTx <= 1}
                      >
                        50%
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setQty(Math.max(1, maxQtyThisTx || 1))}
                        disabled={soldOut || minting || maxQtyThisTx <= 1}
                      >
                        Max
                      </Button>
                    </div>
                  </div>
                </div>

                <Button
                  className="h-11 w-full mt-3 bg-brandsec dark:bg-brand hover:bg-brandsec/90 dark:hover:bg-brand/90 font-semibold"
                  disabled={soldOut || minting || maxQtyThisTx <= 0}
                  onClick={handleMint}
                >
                  {soldOut
                    ? "Sold Out"
                    : minting
                    ? "Minting…"
                    : `Mint ${qty} for ${totalCostETN} ETN`}
                </Button>

                <div className="mt-2 text-xs text-muted-foreground">
                  {Math.max(0, supply - minted)} remaining • up to{" "}
                  {Math.max(1, maxQtyThisTx)} this transaction
                  {connected && mintedByYou !== null ? (
                    <>
                      {" "}
                      • you can mint {walletRemaining} more in total (minted {mintedByYou} already)
                    </>
                  ) : connected ? (
                    <> • fetching your allowance…</>
                  ) : null}
                </div>

                {qtyError && <div className="mt-1 text-[12px] text-red-500">{qtyError}</div>}

                <div className="pt-2 text-[11px] text-muted-foreground">
                  Tip: You’ll be prompted by your wallet. Network fees apply. Only mint from
                  creators you trust.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Custom success modal (locked) */}
      <SuccessModal
        open={showSuccess}
        onClose={() => setShowSuccess(false)}
        name={details.name}
        mediaUrl={mediaUrl}
        mediaIsVideo={mediaIsVideo}
        qty={successQty}
        contract={details.contract}
        txHash={successTx}
        explorerBase={EXPLORER_BASE}
      />
    </section>
  );
}
