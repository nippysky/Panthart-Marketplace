"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Copy, Slash, CalendarDays, Flame, CheckCircle2, Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import Countdown from "@/components/shared/countdown";
import NFTItemsTab from "./nft-items-tab";
import { FiInstagram } from "react-icons/fi";
import { BsTwitterX } from "react-icons/bs";
import { FaGlobeAfrica, FaDiscord, FaTelegramPlane } from "react-icons/fa";
import { MintDetails } from "@/lib/server/mint-details";
import { formatNumber, shortenAddress } from "@/lib/utils";
import { ethers } from "ethers";
import { useActiveAccount } from "thirdweb/react";

import {
  ensureChain,
  getBrowserSigner,
  getRequiredChainId,
} from "@/lib/chain/client";
import { prettyEthersError } from "@/lib/chain/errors";
import { ERC721_DROP_ABI } from "@/lib/abis/ERC721DropABI";
import { formatEtnFromWei } from "@/lib/types/minting-now";

/* ---------- helpers ---------- */
function ipfsToHttp(uri?: string | null) {
  if (!uri) return "";
  return uri.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${uri.slice(7)}` : uri;
}
function formatInTZ(iso: string, tz = "Africa/Lagos") {
  const d = new Date(iso);
  const dt = new Intl.DateTimeFormat("en-NG", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const parts: Record<string, string> = {};
  for (const p of dt) parts[p.type] = p.value;
  return `${parts.month} ${parts.day}, ${parts.year} ${parts.hour}:${parts.minute} WAT`;
}
function WATText({ iso }: { iso: string }) {
  return <span className="text-white font-bold" suppressHydrationWarning>{formatInTZ(iso)}</span>;
}

type Props = { address: string; details: MintDetails };

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "";

/** Get the best available read provider (RPC first, then browser). */
async function getReadProvider(): Promise<ethers.AbstractProvider | null> {
  try {
    if (RPC_URL) return new ethers.JsonRpcProvider(RPC_URL);
  } catch {}
  try {
    const eth = (globalThis as any)?.ethereum;
    if (eth) return new ethers.BrowserProvider(eth);
  } catch {}
  return null;
}

export default function NFTMintPageComponent({ address, details }: Props) {
  const {
    name,
    description,
    logoUrl,
    coverUrl,
    supply,
    minted: mintedInitial,
    mintedPct: mintedPctInitial,
    publicSale,
    presale,
    social,
    creator,
  } = details;

  /* ---------------- live clock to drive phase changes ---------------- */
  const [nowMs, setNowMs] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const presaleStartMs = presale ? new Date(presale.startISO).getTime() : Number.POSITIVE_INFINITY;
  const presaleEndMs   = presale ? new Date(presale.endISO).getTime()   : Number.NEGATIVE_INFINITY;
  const publicStartMs  = new Date(publicSale.startISO).getTime();

  const timePresaleLive = !!presale && nowMs >= presaleStartMs && nowMs < presaleEndMs;
  const timePublicLive  = nowMs >= publicStartMs;

  /* ---------------- overall minted stats ---------------- */
  const [liveMinted, setLiveMinted] = React.useState<number>(mintedInitial);
  const [liveMintedPct, setLiveMintedPct] = React.useState<number>(mintedPctInitial);
  const supplyLeft = Math.max(0, supply - liveMinted);
  const liveSoldOut = liveMinted >= supply;

  /* ---------------- presale counters (from chain) ---------------- */
  const [presaleMax, setPresaleMax] = React.useState<number>(presale?.maxSupply ?? 0);
  const [presaleMinted, setPresaleMinted] = React.useState<number>(0);
  const presaleLeft = Math.max(0, presaleMax - presaleMinted);

  const [copied, setCopied] = React.useState(false);

  // final booleans, computed purely from time + live presaleLeft
  const presaleLive = timePresaleLive && presaleLeft > 0 && !timePublicLive;
  const publicLive  = timePublicLive && !liveSoldOut;

  const priceWei = presaleLive
    ? (presale?.priceEtnWei ?? publicSale.priceEtnWei)
    : publicSale.priceEtnWei;
  const price = formatEtnFromWei(priceWei);

  /* ---------------- cross-tab channel ---------------- */
  const bc = React.useRef<BroadcastChannel | null>(null);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    bc.current = new BroadcastChannel("panthart-mints");
    return () => bc.current?.close();
  }, []);
  React.useEffect(() => {
    if (liveSoldOut) {
      bc.current?.postMessage({ type: "soldOut", contract: address });
      try {
        window.dispatchEvent(new CustomEvent("sale:state-changed", { detail: { contract: address, soldOut: true } }));
      } catch {}
    }
  }, [liveSoldOut, address]);

  /* ---------------- wallet (Thirdweb only) ---------------- */
  const twAccount = useActiveAccount();
  const connected = twAccount?.address ?? null;

  /* ---------------- per-wallet minted ---------------- */
  const [walletMintedCount, setWalletMintedCount] = React.useState<number>(0);
  const walletRemainingPresale = Math.max(
    0,
    (publicSale?.maxPerWallet ?? 0) - walletMintedCount
  );

  /* ---------------- on-chain reads ---------------- */
  const readOnchainProgress = React.useCallback(async () => {
    try {
      const provider = await getReadProvider();
      if (!provider) return false;

      const c = new ethers.Contract(address, ERC721_DROP_ABI as any, provider);

      // total minted
      try {
        const tm: bigint = await c.totalMinted();
        const minted = Number(tm);
        setLiveMinted(minted);
        setLiveMintedPct(supply > 0 ? Math.min(100, Math.round((minted / supply) * 100)) : 0);
      } catch {}

      // presale caps
      try {
        const ps = await c.presale();
        const maxSupply = Number(ps?.maxSupply ?? 0);
        setPresaleMax(maxSupply);
      } catch {}

      try {
        const pm: bigint = await c.presaleMinted();
        setPresaleMinted(Number(pm));
      } catch {}

      return true;
    } catch {
      return false;
    }
  }, [address, supply]);

  const readWalletMinted = React.useCallback(async () => {
    try {
      if (!connected) return;
      const provider = await getReadProvider();
      if (!provider) return;
      const c = new ethers.Contract(address, ERC721_DROP_ABI as any, provider);
      const mw: bigint = await c.mintedPerWallet(connected);
      setWalletMintedCount(Number(mw));
    } catch {}
  }, [address, connected]);

  async function refreshLiveDetails() {
    const ok = await readOnchainProgress();
    if (ok) return;
    try {
      const r = await fetch(`/api/minting-now/${address}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (typeof j?.minted === "number" && typeof j?.supply === "number") {
          setLiveMinted(j.minted);
          setLiveMintedPct(j.supply > 0 ? Math.min(100, Math.round((j.minted / j.supply) * 100)) : 0);
        }
      }
    } catch {}
  }

  React.useEffect(() => {
    let t: any;
    // read whenever any sale window is relevant
    if (publicLive || timePresaleLive) {
      readOnchainProgress();
      readWalletMinted();
      t = setInterval(() => {
        readOnchainProgress();
        readWalletMinted();
      }, 7_500);
    } else {
      // still refresh occasionally while waiting
      readOnchainProgress();
    }
    return () => clearInterval(t);
  }, [publicLive, timePresaleLive, readOnchainProgress, readWalletMinted]);

  React.useEffect(() => {
    function vis() {
      if (document.visibilityState === "visible") refreshLiveDetails();
    }
    document.addEventListener("visibilitychange", vis);
    return () => document.removeEventListener("visibilitychange", vis);
  }, []); // eslint-disable-line

  /* ---------------- eligibility (presale whitelist) ---------------- */
  const [eligible, setEligible] = React.useState(true);
  const [eligibilityLoaded, setEligibilityLoaded] = React.useState(false);

  React.useEffect(() => {
    let active = true;
    async function check() {
      try {
        if (!connected) {
          setEligible(!timePresaleLive); // no “not whitelisted” when no wallet
          setEligibilityLoaded(true);
          return;
        }
        const res = await fetch(`/api/minting-now/${address}/eligibility?wallet=${connected}`, { cache: "no-store" });
        const json = await res.json();
        if (!active) return;
        setEligible(!!json.eligible);
        setEligibilityLoaded(true);
      } catch {
        if (!active) return;
        setEligible(!timePresaleLive);
        setEligibilityLoaded(true);
      }
    }
    check();
    const id = setInterval(check, 15_000);
    return () => { active = false; clearInterval(id); };
  }, [address, connected, timePresaleLive]);

  /* ---------------- gating booleans ---------------- */
  const baseCanMint =
    (publicLive || (timePresaleLive && presaleLeft > 0)) &&
    eligible &&
    !liveSoldOut;
  const canMint = baseCanMint && !!connected;

  const saleBadge =
    liveSoldOut
      ? "Sold Out"
      : presaleLive
      ? "Presale Live"
      : publicLive
      ? "Public Sale Live"
      : "Upcoming";

  const buttonLabel = liveSoldOut
    ? "Sold Out"
    : !connected
    ? "Mint"
    : baseCanMint
    ? "Mint"
    : !eligibilityLoaded
    ? "Checking..."
    : publicLive || !timePresaleLive
    ? "Mint"
    : "Not Whitelisted";

  /* ---------------- mint modal state ---------------- */
  const [openMint, setOpenMint] = React.useState(false);
  const [qty, setQty] = React.useState(1);
  const [minting, setMinting] = React.useState(false);
  const [lastError, setLastError] = React.useState<string | null>(null);

  const [showSuccess, setShowSuccess] = React.useState(false);
  const [mintedQty, setMintedQty] = React.useState(0);

  const [mintedPreviews, setMintedPreviews] = React.useState<
    { tokenId: string; url: string; isVideo: boolean; poster?: string }[]
  >([]);

  const maxPerTx = publicSale.maxPerTx;
  const maxPerWallet = publicSale.maxPerWallet;

  function openMintFlow() {
    setQty(1);
    setLastError(null);
    setOpenMint(true);
  }

  // Presale UI only when presale time active AND there’s presale supply left
  const isPresalePhaseUI = timePresaleLive && !publicLive && presaleMax > 0 && presaleLeft > 0;

  // Waiting-for-public cases:
  const waitBecausePresaleSoldOut = timePresaleLive && presaleLeft <= 0 && !publicLive;
  const waitBetweenPresaleAndPublic =
    !!presale && !timePresaleLive && !timePublicLive && nowMs >= presaleEndMs && nowMs < publicStartMs;

  const showPublicCountdown = waitBecausePresaleSoldOut || waitBetweenPresaleAndPublic;

  function validateQty(n: number) {
    if (!Number.isFinite(n) || n < 1) return "Enter a valid amount";
    if (n > maxPerTx) return `Max per transaction is ${maxPerTx}`;
    if (timePresaleLive && !publicLive) {
      if (n > presaleLeft) return `Only ${presaleLeft} left in presale`;
    } else {
      if (n > supplyLeft) return `Only ${supplyLeft} left`;
    }
    return null;
  }

  async function fetchPresaleProof(addr: string, wallet: string): Promise<string[]> {
    try {
      const r = await fetch(`/api/minting-now/${addr}/eligibility?wallet=${wallet}&includeProof=1`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j?.proof)) return j.proof as string[];
      }
    } catch {}
    try {
      const r = await fetch(`/api/minting-now/${addr}/eligibility?wallet=${wallet}`, { cache: "no-store" });
      if (r.ok) {
        const j = await r.json();
        if (Array.isArray(j?.proof)) return j.proof as string[];
      }
    } catch {}
    return [];
  }

  function inferIsVideo(url: string) {
    if (!url) return false;
    const clean = url.split("?")[0].split("#")[0].toLowerCase();
    return [".mp4", ".webm", ".ogg", ".mov", ".m4v"].some((ext) => clean.endsWith(ext));
  }

  async function handleMintConfirm() {
    setLastError(null);

    const err = validateQty(qty);
    if (err) {
      setLastError(err);
      toast.error(err);
      return;
    }

    try {
      const required = getRequiredChainId();
      await ensureChain(required);
      const signer = await getBrowserSigner();
      const from = await signer.getAddress();

      const contract = new ethers.Contract(address, ERC721_DROP_ABI as any, signer);
      const value = BigInt(priceWei) * BigInt(qty);

      let method: "mint" | "presaleMint" = "mint";
      let args: any[] = [qty];
      const isPresalePhase = timePresaleLive && !publicLive;
      if (isPresalePhase) {
        method = "presaleMint";
        const proof = await fetchPresaleProof(address, from);
        if (!proof.length) {
          const msg = "Not whitelisted or proof unavailable yet.";
          setLastError(msg);
          toast.error(msg);
          return;
        }
        args = [qty, proof];
      }

      setMinting(true);

      try {
        // @ts-ignore
        await contract[method].staticCall(...args, { value });
      } catch (e: any) {
        const msg = prettyEthersError(e);
        setLastError(msg);
        setMinting(false);
        toast.error(msg);
        return;
      }

      let overrides: any = { value };
      try {
        // @ts-ignore
        const est: bigint = await contract[method].estimateGas(...args, { value });
        overrides.gasLimit = (est * 120n) / 100n;
      } catch {
        overrides.gasLimit = 500_000n;
      }

      // @ts-ignore
      const tx = await contract[method](...args, overrides);
      toast.message("Transaction submitted", { description: "Waiting for confirmation…" });

      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        const msg = "Mint failed on-chain (no success status).";
        setLastError(msg);
        setMinting(false);
        toast.error(msg);
        return;
      }

      const iface = new ethers.Interface(ERC721_DROP_ABI as any);
      const mintedEvents: { tokenId: string; uri: string }[] = [];
      for (const log of receipt.logs ?? []) {
        if (log.address.toLowerCase() !== address.toLowerCase()) continue;
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "DropMinted") {
            const tokenId = (parsed.args?.tokenId as bigint)?.toString?.() ?? String(parsed.args?.tokenId);
            const uri = String(parsed.args?.uri ?? "");
            mintedEvents.push({ tokenId, uri });
          }
        } catch {}
      }

      async function fetchMedia(uri: string) {
        const url = ipfsToHttp(uri);
        try {
          const res = await fetch(url, { cache: "no-store" });
          const json = await res.json();
          const anim = ipfsToHttp(json?.animation_url || "");
          const img = ipfsToHttp(json?.image || "");
          const mediaUrl = anim || img || "";
          const isVideo = inferIsVideo(anim || "");
          const poster = isVideo ? (img || undefined) : undefined;
          return { url: mediaUrl, isVideo, poster };
        } catch {
          return { url: "", isVideo: false, poster: undefined as string | undefined };
        }
      }
      const firstThree = mintedEvents.slice(0, 3);
      const media = await Promise.all(firstThree.map((e) => fetchMedia(e.uri)));
      const previews = firstThree.map((e, i) => ({
        tokenId: e.tokenId,
        url: media[i].url,
        isVideo: media[i].isVideo,
        poster: media[i].poster,
      }));
      setMintedPreviews(previews);

      setLiveMinted((prev) => {
        const next = prev + qty;
        setLiveMintedPct(supply > 0 ? Math.min(100, Math.round((next / supply) * 100)) : 0);
        return next;
      });
      if (isPresalePhase) setPresaleMinted((pm) => pm + qty);

      try {
        await fetch("/api/index/minted", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contract: address,
            mints: mintedEvents.map((m) => ({ tokenId: m.tokenId, uri: m.uri })),
            txHash: receipt.hash,
            minter: from,
          }),
        });
      } catch {}

      setOpenMint(false);
      setMintedQty(qty);
      setShowSuccess(true);
      setMinting(false);
      toast.success("Mint successful!");

      try {
        window.dispatchEvent(new CustomEvent("nft:minted", { detail: { contract: address } }));
      } catch {}
      bc.current?.postMessage({ type: "minted", contract: address });

      await readOnchainProgress();
      setTimeout(readOnchainProgress, 2500);
      setTimeout(readOnchainProgress, 6000);
      readWalletMinted();
    } catch (e: any) {
      const msg = prettyEthersError(e);
      setLastError(msg);
      setMinting(false);
      toast.error(msg);
    }
  }

  const SuccessPreview = () => {
    if (!mintedPreviews.length) return null;
    const extra = Math.max(0, mintedQty - mintedPreviews.length);
    return (
      <div className="mt-3">
        <div className="relative h-36 w-full max-w-sm">
          {mintedPreviews.map((p, i) => (
            <div
              key={`${p.tokenId}-${i}`}
              className="absolute top-0 rounded-xl overflow-hidden shadow-lg ring-1 ring-black/20 bg-black"
              style={{
                left: `${i * 34}px`,
                width: "140px",
                height: "140px",
                transform: `rotate(${i === 1 ? -2 : i === 2 ? 2 : 0}deg)`,
              }}
              title={`#${p.tokenId}`}
            >
              {p.url ? (
                p.isVideo ? (
                  <video
                    src={p.url}
                    poster={p.poster}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={p.url}
                    alt={`Token #${p.tokenId}`}
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="w-full h-full grid place-items-center text-xs text-white/70">
                  #{p.tokenId}
                </div>
              )}
            </div>
          ))}
        </div>
        {extra > 0 && <div className="mt-2 text-xs text-muted-foreground">+{extra} more</div>}
      </div>
    );
  };

  /* --------------------- RENDER --------------------- */

  return (
    <section className="flex-1 mt-10 mb-20">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-5">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator><Slash className="h-4 w-4" /></BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink href="/minting-now">Minting Now</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator><Slash className="h-4 w-4" /></BreadcrumbSeparator>
          <BreadcrumbItem>
            <span className="text-muted-foreground">{name}</span>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Cover + Glass header */}
      <div className="relative overflow-hidden rounded-2xl border border-white/10">
        <div className="absolute inset-0">
          <Image
            src={coverUrl || logoUrl}
            alt={name}
            fill
            unoptimized
            sizes="100vw"
            className="object-cover opacity-50"
          />
          <div className="absolute inset-0 [background:linear-gradient(180deg,rgba(0,0,0,.58),rgba(0,0,0,.42),rgba(0,0,0,.58))] dark:[background:linear-gradient(180deg,rgba(0,0,0,.65),rgba(0,0,0,.45),rgba(0,0,0,.65))]" />
          <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_20%_-10%,rgba(56,189,248,0.16),transparent_70%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(600px_200px_at_80%_110%,rgba(168,85,247,0.16),transparent_60%)]" />
        </div>

        <div className="relative p-4 md:p-6 backdrop-blur-xl bg-black/35 dark:bg-black/40 text-white">
          <div className="grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-[auto,1fr] items-center">
            <div className="relative w-24 h-24 md:w-28 md:h-28 rounded-xl overflow-hidden ring-1 ring-white/25">
              <Image
                src={logoUrl || coverUrl}
                alt={`${name} logo`}
                fill
                unoptimized
                sizes="112px"
                className="object-cover"
              />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/30 px-3 py-1 text-[11px] md:text-xs bg-white/10">
                  <Flame className="w-3.5 h-3.5" />
                  <span className="uppercase tracking-wide">{saleBadge}</span>
                </div>
                <span className="text-[11px] md:text-xs/5 opacity-85 flex items-center">
                  Contract: {shortenAddress(address)}
                      <Button
      type="button"
      variant="ghost"
      size="icon"
    
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(address);
          setCopied(true);
          toast.success("Copied");
          setTimeout(() => setCopied(false), 1200);
        } catch {
          toast.error("Failed to copy");
        }
      }}
      title="Copy"
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
    </Button>
                </span>
              </div>

              <h1 className="mt-5 text-2xl md:text-3xl font-semibold tracking-tight truncate drop-shadow-[0_1px_1px_rgba(0,0,0,.75)]">
                {name}
              </h1>

              {description ? (
                <p className="mt-1 text-sm text-white/85 line-clamp-2 md:line-clamp-3 drop-shadow-[0_1px_1px_rgba(0,0,0,.7)]">
                  {description}
                </p>
              ) : null}

              {/* Meta */}
              <div className="mt-5 flex flex-wrap items-center gap-4 text-xs md:text-sm opacity-95">
                <div className="text-white/75">Price</div>
                <div className="font-semibold">{formatNumber(Number(price))} ETN</div>
                <div className="h-4 w-px bg-white/30" />
                <div className="text-white/75">Max / wallet</div>
                <div className="font-semibold">{formatNumber(Number(publicSale.maxPerWallet))} ETN</div>
                <div className="h-4 w-px bg-white/30" />
                <div className="text-white/75">Max / tx</div>
                <div className="font-semibold">{formatNumber(Number(publicSale.maxPerTx))} ETN</div>
                <div className="h-4 w-px bg-white/30" />
                <div className="flex items-center gap-1 text-white/85">
                  <CalendarDays className="w-4 h-4" />
                  <span>Public: <WATText iso={publicSale.startISO} /></span>
                </div>
                {presale ? (
                  <>
                    <div className="h-4 w-px bg-white/30" />
                    <div className="flex items-center gap-1 text-white/85">
                      <CalendarDays className="w-4 h-4" />
                      <span>
                        Presale: <WATText iso={presale.startISO} /> → <WATText iso={presale.endISO} />
                      </span>
                    </div>
                  </>
                ) : null}
              </div>

              {/* Creator */}
              <div className="mt-4 pt-4 border-t border-white/15 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-10 h-10 rounded-full overflow-hidden ring-1 ring-white/20 flex-shrink-0">
                    <Image
                      src={
                        creator.profileAvatar ||
                        `https://api.dicebear.com/7.x/identicon/svg?seed=${creator.walletAddress}`
                      }
                      alt={creator.username}
                      fill
                      unoptimized
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    <Link
                      href={`/profile/${creator.walletAddress}`}
                      className="font-medium leading-tight truncate block"
                      title={creator.username}
                    >
                      {creator.username}
                    </Link>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(creator.walletAddress);
                        toast.success("Creator address copied");
                      }}
                      className="mt-0.5 inline-flex items-center gap-2 bg-white/10 hover:bg-white/15 px-2 py-0.5 rounded-md text-[11px]"
                      title="Copy creator address"
                    >
                      <span className="font-medium">{shortenAddress(creator.walletAddress)}</span>
                      <Copy size={12} />
                    </button>
                  </div>
                </div>

                <TooltipProvider>
                  <div className="flex items-center gap-4">
                    {social.x && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={social.x} target="_blank" className="opacity-85 hover:opacity-100">
                            <BsTwitterX size={18} />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>X</TooltipContent>
                      </Tooltip>
                    )}
                    {social.instagram && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={social.instagram} target="_blank" className="opacity-85 hover:opacity-100">
                            <FiInstagram size={18} />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>Instagram</TooltipContent>
                      </Tooltip>
                    )}
                    {social.website && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={social.website} target="_blank" className="opacity-85 hover:opacity-100">
                            <FaGlobeAfrica size={18} />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>Website</TooltipContent>
                      </Tooltip>
                    )}
                    {social.discord && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={social.discord} target="_blank" className="opacity-85 hover:opacity-100">
                            <FaDiscord size={18} />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>Discord</TooltipContent>
                      </Tooltip>
                    )}
                    {social.telegram && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a href={social.telegram} target="_blank" className="opacity-85 hover:opacity-100">
                            <FaTelegramPlane size={18} />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent>Telegram</TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ----------- COUNTDOWN-ONLY view while awaiting public ---------- */}
      {showPublicCountdown && (
        <section className="w-full mt-8 flex justify-center">
          <Card className="w-full max-w-2xl p-6 border-white/10 bg-white/5">
            <div className="text-center space-y-4">
              <div className="text-sm md:text-base text-muted-foreground">
                {waitBecausePresaleSoldOut
                  ? "Presale maximum supply has been reached."
                  : "Presale has ended."}
              </div>
              <div className="text-2xl md:text-4xl font-extrabold tracking-tight">
                <p className="mb-3">

                Public sale starts in{" "}
                </p>
                <span className="inline-block">
                  <Countdown targetISO={publicSale.startISO} className="dark:text-brand text-brandsec text-[2rem] uppercase tracking-wider font-bold" />
                </span>
              </div>
              <div className="text-xs md:text-sm text-muted-foreground max-w-md mx-auto">
                This view will switch to Public Sale automatically once it goes live.
              </div>
            </div>
          </Card>
        </section>
      )}

      {/* Mint section — hidden while waiting for public */}
      {!showPublicCountdown && (
        <section className="w-full mt-8 flex justify-center">
          <Card className="w-full max-w-2xl p-5 backdrop-blur-xl bg-white/5 dark:bg-white/5 border-white/10">
            <CardHeader className="p-0 mb-3">
              <CardTitle className="text-lg font-bold">Mint</CardTitle>
            </CardHeader>

            <CardContent className="p-0 space-y-5">
              {/* Progress */}
              <div className="space-y-1">
                <div className="flex justify-between text-sm font-medium">
                  {isPresalePhaseUI ? (
                    <>
                      <span>Presale Minted</span>
                      <span>{presaleMinted} / {presaleMax}</span>
                    </>
                  ) : (
                    <>
                      <span>Minted</span>
                      <span>{liveMinted} / {supply}</span>
                    </>
                  )}
                </div>
                <Progress
                  value={
                    isPresalePhaseUI
                      ? presaleMax > 0
                        ? Math.min(100, Math.round((presaleMinted / presaleMax) * 100))
                        : 0
                      : liveMintedPct
                  }
                  className="h-2"
                />
                <div className="text-[12px] text-white/80 mt-1">
                  {isPresalePhaseUI ? (
                    <>Presale: <b>{presaleMinted}</b> / <b>{presaleMax}</b> • <b>{presaleLeft}</b> remaining</>
                  ) : (
                    <>Total: <b>{liveMinted}</b> / <b>{supply}</b> • <b>{supplyLeft}</b> remaining</>
                  )}
                </div>
                {!isPresalePhaseUI && presaleMinted > 0 && presaleMax > 0 && (
                  <div className="text-[11px] text-white/60">
                    Presale sold: {presaleMinted} (of {presaleMax})
                  </div>
                )}
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md border border-white/10 p-3">
                  <div className="text-muted-foreground">Price</div>
                  <div className="mt-1 font-semibold">{price} ETN</div>
                </div>
                <div className="rounded-md border border-white/10 p-3">
                  <div className="text-muted-foreground">Max / wallet</div>
                  <div className="mt-1 font-semibold">{publicSale.maxPerWallet}</div>
                </div>
                <div className="rounded-md border border-white/10 p-3">
                  <div className="text-muted-foreground">Max / tx</div>
                  <div className="mt-1 font-semibold">{publicSale.maxPerTx}</div>
                </div>
                <div className="rounded-md border border-white/10 p-3">
                  <div className="text-muted-foreground">Status</div>
                  <div className="mt-1 font-semibold">
                    {liveSoldOut
                      ? "Sold Out"
                      : isPresalePhaseUI
                      ? "Presale Live"
                      : publicLive
                      ? "Public Sale Live"
                      : "Upcoming"}
                  </div>
                </div>

                {isPresalePhaseUI && (
                  <>
                    <div className="rounded-md border border-white/10 p-3">
                      <div className="text-muted-foreground">Presale cap</div>
                      <div className="mt-1 font-semibold">{presaleMax}</div>
                    </div>
                    <div className="rounded-md border border-white/10 p-3">
                      <div className="text-muted-foreground">Presale remaining</div>
                      <div className="mt-1 font-semibold">{presaleLeft}</div>
                    </div>
                  </>
                )}
              </div>

              {/* Presale gating + wallet guidance */}
              {timePresaleLive && !publicLive && (
                <>
                  {!connected ? (
                    <div className="rounded-md border p-3 text-sm dark:bg-blue-500/10 bg-blue-500/25 border-blue-500/25 dark:text-blue-200 text-blue-950">
                      Connect your wallet to check whitelist status and mint.
                    </div>
                  ) : !eligibilityLoaded ? (
                    <div className="rounded-md border p-3 text-sm bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20">
                      Checking presale eligibility…
                    </div>
                  ) : !eligible ? (
                    <div className="rounded-md border p-3 text-sm bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-500/10 dark:text-amber-200 dark:border-amber-500/20">
                      You’re <span className="font-semibold">not whitelisted</span> for the presale.
                      Public sale starts in{" "}
                      <Countdown targetISO={publicSale.startISO} className="font-semibold" />.
                    </div>
                  ) : null}
                </>
              )}

              {!connected && (publicLive || timePresaleLive) && (
                <div className="rounded-md border p-3 text-sm dark:bg-blue-500/10 bg-blue-500/25 border-blue-500/25 dark:text-blue-200 text-blue-950 flex items-center justify-between gap-3">
                  <span>Connect your wallet to mint.</span>
                </div>
              )}

              {isPresalePhaseUI && connected && (
                <div className="text-xs text-muted-foreground">
                  You can mint <b>{walletRemainingPresale}</b> more in presale (per-wallet cap).
                </div>
              )}

              <Button className="w-full" disabled={!canMint} onClick={() => openMintFlow()}>
                {buttonLabel}
              </Button>

              {!canMint && !liveSoldOut && !publicLive && (
                <p className="text-xs text-muted-foreground">
                  Minting opens at <WATText iso={publicSale.startISO} />.
                </p>
              )}

              {lastError && <p className="text-sm mt-2 text-red-500">{lastError}</p>}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Items */}
      <section className="flex-1 mt-10">
        <div className="mb-2 font-semibold">Items</div>
        <NFTItemsTab contract={address} collectionName={name} />
      </section>

      {/* Mint modal */}
      <Dialog open={openMint} onOpenChange={(o) => !minting && setOpenMint(o)}>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Mint {name}</DialogTitle>
            <DialogDescription>
              Enter how many you want to mint. Respect max per wallet/transaction.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              Price per mint: <span className="font-semibold">{price} ETN</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-md border border-white/10 p-3">
                <div className="text-muted-foreground">Max / wallet</div>
                <div className="mt-1 font-semibold">{maxPerWallet}</div>
              </div>
              <div className="rounded-md border border-white/10 p-3">
                <div className="text-muted-foreground">Max / tx</div>
                <div className="mt-1 font-semibold">{maxPerTx}</div>
              </div>
            </div>

            <div>
              <label className="text-sm mb-1 block">Amount</label>
              <Input
                type="number"
                min={1}
                max={
                  timePresaleLive && !publicLive
                    ? Math.min(maxPerTx, presaleLeft)
                    : Math.min(maxPerTx, supplyLeft)
                }
                value={qty}
                onChange={(e) => {
                  const limit =
                    timePresaleLive && !publicLive
                      ? Math.min(maxPerTx, presaleLeft)
                      : Math.min(maxPerTx, supplyLeft);
                  setQty(Math.max(1, Math.min(Math.floor(+e.target.value || 1), limit)));
                }}
              />
              <div className="mt-1 text-xs text-muted-foreground">
                {timePresaleLive && !publicLive
                  ? `${presaleLeft} remaining (presale)`
                  : `${supplyLeft} remaining`}
              </div>
            </div>

            {lastError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 text-red-400 px-3 py-2 text-xs">
                {lastError}
              </div>
            )}
          </div>

          <DialogFooter className="mt-6 flex gap-2">
            <Button variant="ghost" disabled={minting} onClick={() => setOpenMint(false)}>
              Cancel
            </Button>
            <Button onClick={handleMintConfirm} disabled={minting}>
              {minting ? "Minting…" : "Confirm Mint"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success modal */}
      <Dialog open={showSuccess} onOpenChange={(o) => setShowSuccess(o)}>
        <DialogTitle className="hidden">Mint {name}</DialogTitle>
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-400 w-6 h-6" />
            <div className="text-lg font-semibold">Mint Successful</div>
          </div>
          <p className="text-sm text-muted-foreground">
            You minted <span className="font-semibold">{mintedQty}</span> from{" "}
            <span className="font-semibold">{name}</span>.
          </p>

          {/* small preview fan */}
          <div className="mt-2">
            <SuccessPreview />
          </div>

          <div className="flex gap-2 justify-end mt-4">
            <Link href={`/collections/${address}`}>
              <Button variant="outline">View collection</Button>
            </Link>
            <DialogClose asChild>
              <Button>Close</Button>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
