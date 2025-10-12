"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Info } from "lucide-react";
import { toast } from "sonner";
import { useLoaderStore } from "@/lib/store/loader-store";
import DateTimePicker from "../shared/date-time-picker";
import WhitelistInput from "./WhitelistInput";
import PreviewDeployModal from "./PreviewDeployModal";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ethers } from "ethers";
import {
  AllowlistState,
  DeployPayload,
  FieldErrors,
  MetaPreview,
  Mode,
  PrepareResult,
} from "@/lib/types/dropCollection";
import { formatNumber } from "@/lib/utils";

/* ----------------------- constants ----------------------- */
const MIN_LEAD_MINUTES = 5;

/* ----------------------- helpers ----------------------- */

function etnToWeiStr(input: string): string {
  const cleaned = input.replace(/etn/i, "").trim();
  if (!/^\d+(\.\d{0,18})?$/.test(cleaned)) throw new Error("Enter a valid ETN amount (max 18 decimals).");
  const [intPart, fracRaw = ""] = cleaned.split(".");
  const frac = (fracRaw + "0".repeat(18)).slice(0, 18);
  const wei = BigInt(intPart || "0") * 10n ** 18n + BigInt(frac || "0");
  return wei.toString();
}
function weiToEtnStr(wei: string | bigint, maxFrac = 6) {
  try {
    const w = typeof wei === "bigint" ? wei : BigInt(wei);
    const int = w / 10n ** 18n;
    const frac = w % (10n ** 18n);
    const fracStr = frac.toString().padStart(18, "0").slice(0, maxFrac).replace(/0+$/, "");
    return fracStr ? `${int.toString()}.${fracStr}` : int.toString();
  } catch {
    return "0";
  }
}
/** Numeric ETN (for USD calc/formatting) */
function weiToEtnNum(wei: string | bigint): number {
  try {
    const w = typeof wei === "bigint" ? wei : BigInt(wei);
    return Number(w) / 1e18;
  } catch {
    return 0;
  }
}
function normalizeBaseUri(uri: string) {
  return uri.trim().replace(/\/+$/, "");
}
function toHttp(url: string) {
  return url?.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${url.slice(7)}` : url;
}
function sniffMediaType(link: string): "video" | "image" {
  const u = link.toLowerCase().split("?")[0];
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov")) return "video";
  return "image";
}
function AssetRenderer({ url }: { url: string }) {
  const resolved = toHttp(url);
  const kind = sniffMediaType(resolved);
  return (
    <div className="relative w-full aspect-square rounded-xl border border-white/10 overflow-hidden bg-muted/20">
      {kind === "video" ? (
        <video className="h-full w-full object-contain bg-black" src={resolved} controls playsInline preload="metadata" />
      ) : resolved.endsWith(".gif") ? (
        <img src={resolved} alt="Preview" className="h-full w-full object-contain" />
      ) : (
        <Image src={resolved} alt="Preview" fill className="object-contain" unoptimized />
      )}
    </div>
  );
}

/** Format USD safely with 2 decimals */
function formatUsd(n?: number | null) {
  if (!n || !isFinite(n)) return "—";
  try {
    return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

/** Relative "last updated" like 2m ago, 3h ago, etc. */
function timeAgo(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "—";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days === 1) return "yesterday";
  return `${days}d ago`;
}

/* ----------------------- component ----------------------- */

type Props = {
  mode: Mode;
  baseUriFromUploads?: string;
  detectedSupply?: number; // count from the VM (assets/metadata)
  onBack: () => void;
  onDeploy: (payload: DeployPayload) => Promise<void>;
};

export default function ConfigForm({
  mode,
  baseUriFromUploads,
  detectedSupply,
  onBack,
  onDeploy,
}: Props) {
  const { show, hide } = useLoaderStore();

  // Basic state
  const [supplyWarning, setSupplyWarning] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");

  // Keep Base URI in sync with parent (important for upload mode)
  const [baseUri, setBaseUri] = useState(baseUriFromUploads ?? "");
  useEffect(() => {
    setBaseUri(baseUriFromUploads ?? "");
  }, [baseUriFromUploads]);

  const [totalSupplyStr, setTotalSupplyStr] = useState("");
  const [royaltyRecipient, setRoyaltyRecipient] = useState("");
  const [royaltyPercentStr, setRoyaltyPercentStr] = useState("5");

  const [publicStart, setPublicStart] = useState("");
  const [publicPriceEtn, setPublicPriceEtn] = useState("");
  const [maxPerWalletStr, setMaxPerWalletStr] = useState("");
  const [maxPerTxStr, setMaxPerTxStr] = useState("");
  const [walletUnlimited, setWalletUnlimited] = useState(false);

  // Images required
  const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
  const [coverUrl, setCoverUrl] = useState<string | undefined>(undefined);
  const logoRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);
  const [uploadingImg, setUploadingImg] = useState(false);
  const logoInputId = useId();
  const coverInputId = useId();

  // Presale (rendered inside WhitelistInput)
  const [enablePresale, setEnablePresale] = useState(false);
  const [presaleStart, setPresaleStart] = useState("");
  const [presaleEnd, setPresaleEnd] = useState("");
  const [presalePriceEtn, setPresalePriceEtn] = useState("");
  const [presaleSupplyStr, setPresaleSupplyStr] = useState("1");

  // Allowlist + merkle
  const [allowState, setAllowState] = useState<AllowlistState | null>(null);
  const [prepared, setPrepared] = useState<PrepareResult | null>(null);

  // Base preview
  const [pvLoading, setPvLoading] = useState(false);
  const [pvError, setPvError] = useState<string | null>(null);
  const [pvErrorCount, setPvErrorCount] = useState(0);
  const [pv, setPv] = useState<MetaPreview | null>(null);
  const [debouncedBase, setDebouncedBase] = useState(baseUri);

  // Supply detection (from Base URI)
  const [detectingSupply, setDetectingSupply] = useState(false);
  const [detectedFromBase, setDetectedFromBase] = useState<number | null>(null);

  // Modal
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Inline errors
  const [errors, setErrors] = useState<FieldErrors>({});

  // Touched tracking
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const markTouched = (key: string) =>
    setTouched((prev) => (prev[key] ? prev : { ...prev, [key]: true }));
  const showIfTouched = (key: keyof FieldErrors) => (touched[key as string] ? errors[key] : null);

  // ---- Platform fee (expanded) ----
  type FeeInfo = {
    feeRecipient: string;
    feeAmountEtnWei: string;
    targetUsdCents?: number;
    lastPriceUsd?: string | number;
    lastPriceAt?: string; // ISO
    pricingSource?: string; // e.g., CRYPTOCOMPARE
    pricingPair?: string;  // e.g., ETNUSD
  };
  const [fee, setFee] = useState<FeeInfo | null>(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [feeErr, setFeeErr] = useState<string | null>(null);

  // Derived UI pieces from fee
  const feeEtnDisplay = weiToEtnStr(fee?.feeAmountEtnWei ?? "0", 6);
  const feeEtnNum = weiToEtnNum(fee?.feeAmountEtnWei ?? "0");
  const mktPrice = fee?.lastPriceUsd != null ? Number(fee.lastPriceUsd) : null;
  const feeUsdApprox = mktPrice ? feeEtnNum * mktPrice : null;
  const lastUpdatedStr = timeAgo(fee?.lastPriceAt);
  const pair = fee?.pricingPair || "ETNUSD";
  const src = fee?.pricingSource || "—";

  async function fetchFee() {
    setFeeLoading(true);
    setFeeErr(null);
    try {
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType: "ERC721_DROP",
          metadataOption: mode === "upload" ? "UPLOAD" : "EXTERNAL",
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.feeRecipient || !json?.feeAmountEtnWei) {
        throw new Error(json?.error || "Failed to fetch fee config");
      }
      setFee(json as FeeInfo);
    } catch (e: any) {
      setFee(null);
      setFeeErr(e?.message || "Could not load fee.");
    } finally {
      setFeeLoading(false);
    }
  }

  // Fetch on mount & whenever mode changes
  useEffect(() => {
    fetchFee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // If wizard passed a detected supply from uploads, prefer it and auto-fill
  useEffect(() => {
    if (typeof detectedSupply === "number" && detectedSupply > 0) {
      setTotalSupplyStr(String(detectedSupply));
      if (walletUnlimited) setMaxPerWalletStr(String(detectedSupply));
    }
  }, [detectedSupply, walletUnlimited]);

  async function uploadToCloudinary(
    file: File,
    setter: (url: string) => void,
    ref?: React.RefObject<HTMLInputElement | null>
  ) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image formats are allowed.");
      return;
    }
    setUploadingImg(true);
    show("Uploading image…");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.success || !json?.data?.secure_url)
        throw new Error(json?.error || "Upload failed");
      setter(json.data.secure_url);
      if (ref?.current) ref.current.value = "";
      toast.success("Uploaded!");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    } finally {
      hide();
      setUploadingImg(false);
    }
  }

  // Debounce base URI changes for preview + counting
  useEffect(() => {
    const t = setTimeout(() => setDebouncedBase(normalizeBaseUri(baseUri)), 450);
    return () => clearTimeout(t);
  }, [baseUri]);

  // Preview metadata sample
  async function fetchPreview() {
    const b = debouncedBase;
    setPv(null);
    if (!b || !b.startsWith("ipfs://")) return;
    setPvLoading(true);
    setPvError(null);
    try {
      const tryUrls = [toHttp(`${b}/1.json`), toHttp(`${b}/0.json`)];
      let got: any = null;
      for (const u of tryUrls) {
        const res = await fetch(u, { cache: "no-store" });
        if (res.ok) {
          got = await res.json();
          break;
        }
      }
      if (!got) throw new Error("Could not fetch metadata (tried 1.json and 0.json).");
      setPv({
        name: got?.name,
        description: got?.description,
        image: got?.image,
        animation_url: got?.animation_url,
        attributes: Array.isArray(got?.attributes) ? got.attributes : [],
      });
      setPvError(null);
      setPvErrorCount(0);
    } catch (e: any) {
      setPv(null);
      setPvError(e?.message || "Failed to fetch preview.");
      setPvErrorCount((c) => c + 1);
    } finally {
      setPvLoading(false);
    }
  }
  useEffect(() => {
    if (debouncedBase && debouncedBase.startsWith("ipfs://")) fetchPreview();
    // eslint-disable-next-line
  }, [debouncedBase]);

  // ---- Base-URI item counting (runs for BOTH modes) ----------------------
  async function existsAt(base: string, id: number): Promise<boolean> {
    const url = toHttp(`${base}/${id}.json`);
    try {
      const h = await fetch(url, { method: "HEAD", cache: "no-store" });
      if (h.ok) return true;
      if (h.status === 405 || h.status === 403) {
        const g = await fetch(url, { cache: "no-store" });
        return g.ok;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function estimateFromBase(base: string): Promise<number | null> {
    const one = await existsAt(base, 1);
    const zero = await existsAt(base, 0);
    if (!one && !zero) return null;
    const start = one ? 1 : 0;

    const CAP = 100_000;
    let lo = start;
    if (!(await existsAt(base, lo))) return null;
    let hi = start === 0 ? 1 : 2;

    while (hi <= CAP) {
      const ok = await existsAt(base, hi);
      if (!ok) break;
      lo = hi;
      hi = hi * 2;
    }
    if (hi > CAP) {
      return start === 0 ? lo + 1 : lo;
    }

    while (lo + 1 < hi) {
      const mid = Math.floor((lo + hi) / 2);
      const ok = await existsAt(base, mid);
      if (ok) lo = mid;
      else hi = mid;
    }
    return start === 0 ? lo + 1 : lo;
  }

  useEffect(() => {
    const b = debouncedBase;
    if (!b || !b.startsWith("ipfs://")) {
      setDetectedFromBase(null);
      return;
    }
    let cancelled = false;
    setDetectingSupply(true);
    estimateFromBase(b)
      .then((count) => {
        if (cancelled) return;
        setDetectedFromBase(count ?? null);
      })
      .finally(() => !cancelled && setDetectingSupply(false));
    return () => {
      cancelled = true;
    };
  }, [debouncedBase]);

  // Choose the best available count and auto-fill Total Supply (read-only).
  useEffect(() => {
    const fromUploads =
      typeof detectedSupply === "number" && detectedSupply > 0 ? detectedSupply : null;
    const fromBase =
      typeof detectedFromBase === "number" && detectedFromBase > 0 ? detectedFromBase : null;

    const chosen = fromUploads ?? fromBase ?? null;

    if (fromUploads && fromBase && fromUploads !== fromBase) {
      setSupplyWarning(
        `Detected ${fromUploads} from uploads, ${fromBase} from Base URI. Using ${fromUploads}.`
      );
    } else {
      setSupplyWarning(null);
    }

    if (chosen && Number(totalSupplyStr) !== chosen) {
      setTotalSupplyStr(String(chosen));
      if (walletUnlimited) setMaxPerWalletStr(String(chosen));
    }
  }, [detectedSupply, detectedFromBase, walletUnlimited, totalSupplyStr]);

  // Helpers
  function mustInt(str: string, label: string) {
    const n = Number(str);
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n))
      throw new Error(`${label} must be a positive integer.`);
    return n;
  }
  function minLeadDate(): Date {
    const d = new Date();
    d.setMinutes(d.getMinutes() + MIN_LEAD_MINUTES);
    d.setSeconds(0);
    d.setMilliseconds(0);
    return d;
  }

  // Core validation
  function validateCore() {
    if (!name.trim()) throw new Error("Name is required.");
    if (!symbol.trim()) throw new Error("Symbol is required.");
    if (!description.trim()) throw new Error("Description is required.");
    if (!logoUrl) throw new Error("Logo is required.");
    if (!coverUrl) throw new Error("Cover photo is required.");
    if (!baseUri.trim()) throw new Error("Base URI is required.");
    if (!baseUri.startsWith("ipfs://"))
      throw new Error("Base URI must start with ipfs://<CID>");

    const totalSupply = mustInt(totalSupplyStr, "Total supply");

    const maxPerWallet = walletUnlimited
      ? totalSupply
      : mustInt(maxPerWalletStr, "Max per wallet");
    const maxPerTx = mustInt(maxPerTxStr, "Max per transaction");

    if (maxPerWallet > totalSupply)
      throw new Error("Max per wallet cannot exceed total supply.");
    if (maxPerTx > totalSupply)
      throw new Error("Max per transaction cannot exceed total supply.");
    if (maxPerTx > 20) throw new Error("Max per transaction cannot exceed 20.");

    if (!royaltyRecipient || !ethers.isAddress(royaltyRecipient))
      throw new Error("Invalid royalty recipient.");
    const rp = Number(royaltyPercentStr);
    if (!Number.isFinite(rp) || rp < 0 || rp > 10)
      throw new Error("Royalty must be between 0 and 10 percent.");

    if (!publicStart) throw new Error("Public sale start is required.");
    const pubStart = new Date(publicStart);
    const threshold = minLeadDate();
    if (!(pubStart > threshold))
      throw new Error("Public sale start must be at least 5 minutes from now.");

    if (!publicPriceEtn.trim()) throw new Error("Public price is required.");
    if (!(Number(publicPriceEtn) > 0))
      throw new Error("Public price must be greater than 0.");

    return { totalSupply, maxPerWallet, maxPerTx, royaltyPercent: rp };
  }

  // Presale validation
  function validatePresale(totalSupply: number) {
    if (!enablePresale) return null;
    if (!presaleStart) throw new Error("Presale start is required.");
    if (!presaleEnd) throw new Error("Presale end is required.");

    const preStart = new Date(presaleStart);
    const preEnd = new Date(presaleEnd);
    const pubStart = new Date(publicStart);
    const threshold = minLeadDate();

    if (!(preStart > threshold))
      throw new Error("Presale start must be at least 5 minutes from now.");
    if (preEnd <= preStart) throw new Error("Presale end must be after start.");
    if (isFinite(pubStart.getTime())) {
      if (!(preStart < pubStart && preEnd < pubStart)) {
        throw new Error("Presale start/end must both be before the public sale start.");
      }
    }

    if (!presalePriceEtn.trim()) throw new Error("Presale price is required.");
    if (!(Number(presalePriceEtn) > 0))
      throw new Error("Presale price must be greater than 0.");
    const pre = Number(presalePriceEtn);
    const pub = Number(publicPriceEtn);
    if (Number.isFinite(pub) && Number.isFinite(pre) && !(pre < pub)) {
      throw new Error("Presale price must be less than public price.");
    }

    const presaleSupply = mustInt(presaleSupplyStr, "Presale supply");
    if (presaleSupply > totalSupply)
      throw new Error("Presale supply cannot exceed total supply.");

    if (
      !allowState ||
      allowState.invalid.length ||
      allowState.duplicates.length ||
      allowState.validChecksummed.length === 0
    ) {
      throw new Error("Allowlist must contain only valid, non-duplicate addresses.");
    }
    if (!prepared?.ok || !prepared?.merkleRoot)
      throw new Error("Generate Merkle root before proceeding.");

    return {
      presaleSupply,
      merkleRoot: prepared.merkleRoot!,
      allowlistCount: allowState.validChecksummed.length,
    };
  }

  // Live validation
  useEffect(() => {
    const next: FieldErrors = {};

    // Base URI (contract uses it)
    if (!baseUri.trim()) next.baseUri = "Base URI is required.";
    else if (!baseUri.startsWith("ipfs://"))
      next.baseUri = "Base URI must start with ipfs://<CID>";
    else next.baseUri = null;

    // Required text fields
    next.name = name.trim() ? null : "Name is required.";
    next.symbol = symbol.trim() ? null : "Symbol is required.";
    next.description = description.trim() ? null : "Description is required.";

    // Total supply
    if (!totalSupplyStr) next.totalSupply = "Total supply is required.";
    else if (!/^\d+$/.test(totalSupplyStr) || Number(totalSupplyStr) <= 0)
      next.totalSupply = "Total supply must be a positive integer.";
    else next.totalSupply = null;

    // Royalty recipient (strict)
    if (!royaltyRecipient.trim()) next.royaltyRecipient = "Royalty recipient is required.";
    else if (!ethers.isAddress(royaltyRecipient))
      next.royaltyRecipient = "Enter a valid wallet address (0x...)";
    else next.royaltyRecipient = null;

    // Royalty percent
    if (royaltyPercentStr === "") next.royaltyPercent = "Royalty percent is required.";
    else if (!/^\d+(\.\d+)?$/.test(royaltyPercentStr))
      next.royaltyPercent = "Enter a valid number.";
    else if (Number(royaltyPercentStr) < 0 || Number(royaltyPercentStr) > 10)
      next.royaltyPercent = "Must be between 0 and 10.";
    else next.royaltyPercent = null;

    // Public sale timing/price
    if (!publicStart) next.publicStart = "Public sale start is required.";
    else {
      const threshold = minLeadDate();
      const d = new Date(publicStart);
      next.publicStart = d > threshold ? null : "Must be at least 5 minutes from now.";
    }

    if (!publicPriceEtn.trim()) next.publicPrice = "Public price is required.";
    else if (!/^\d+(\.\d{0,18})?$/.test(publicPriceEtn.trim()))
      next.publicPrice = "Enter a valid ETN amount (max 18 decimals).";
    else if (!(Number(publicPriceEtn) > 0))
      next.publicPrice = "Must be greater than 0.";
    else next.publicPrice = null;

    // Max per wallet
    const total = Number(totalSupplyStr);
    if (!walletUnlimited) {
      if (!maxPerWalletStr) next.maxPerWallet = "Max per wallet is required.";
      else if (!/^\d+$/.test(maxPerWalletStr) || Number(maxPerWalletStr) <= 0)
        next.maxPerWallet = "Must be a positive integer.";
      else if (Number.isFinite(total) && total > 0 && Number(maxPerWalletStr) > total)
        next.maxPerWallet = "Cannot exceed Total supply.";
      else next.maxPerWallet = null;
    } else {
      next.maxPerWallet = null;
    }

    // Max per transaction
    if (!maxPerTxStr) next.maxPerTx = "Max per transaction is required.";
    else if (!/^\d+$/.test(maxPerTxStr) || Number(maxPerTxStr) <= 0)
      next.maxPerTx = "Must be a positive integer.";
    else if (Number(maxPerTxStr) > 20) next.maxPerTx = "Cannot exceed 20.";
    else {
      const mptx = Number(maxPerTxStr);
      const mpw = walletUnlimited ? total : Number(maxPerWalletStr);
      if (Number.isFinite(total) && total > 0 && mptx > total)
        next.maxPerTx = "Cannot exceed Total supply.";
      else if (Number.isFinite(mpw) && mpw > 0 && mptx > mpw)
        next.maxPerTx = "Cannot exceed Max per wallet.";
      else next.maxPerTx = null;
    }

    // Presale (only when enabled)
    if (enablePresale) {
      if (!presaleStart) next.presaleStart = "Presale start is required.";
      else {
        const d = new Date(presaleStart);
        const threshold = minLeadDate();
        next.presaleStart = d > threshold ? null : "Must be at least 5 minutes from now.";
      }

      if (!presaleEnd) next.presaleEnd = "Presale end is required.";
      else next.presaleEnd = null;

      if (presaleStart && presaleEnd) {
        const preS = new Date(presaleStart);
        const preE = new Date(presaleEnd);
        if (preE <= preS) next.presaleEnd = "Presale end must be after start.";
        const pubS = new Date(publicStart);
        if (publicStart && isFinite(pubS.getTime())) {
          if (!(preS < pubS)) next.presaleStart = "Presale start must be before public sale start.";
          if (!(preE < pubS)) next.presaleEnd = "Presale end must be before public sale start.";
        }
      }

      if (!presalePriceEtn.trim()) next.presalePrice = "Presale price is required.";
      else if (!/^\d+(\.\d{0,18})?$/.test(presalePriceEtn.trim()))
        next.presalePrice = "Enter a valid ETN amount (max 18 decimals).";
      else if (!(Number(presalePriceEtn) > 0))
        next.presalePrice = "Must be greater than 0.";
      else if (publicPriceEtn && /^\d+(\.\d{0,18})?$/.test(publicPriceEtn.trim())) {
        const pre = Number(presalePriceEtn);
        const pub = Number(publicPriceEtn);
        if (!(pre < pub)) next.presalePrice = "Must be less than public price.";
        else next.presalePrice = null;
      } else {
        if (!next.presalePrice) next.presalePrice = null;
      }

      if (!presaleSupplyStr) next.presaleSupply = "Presale supply is required.";
      else if (!/^\d+$/.test(presaleSupplyStr) || Number(presaleSupplyStr) <= 0)
        next.presaleSupply = "Must be a positive integer.";
      else if (Number.isFinite(total) && total > 0 && Number(presaleSupplyStr) > total)
        next.presaleSupply = "Cannot exceed Total supply.";
      else next.presaleSupply = null;
    } else {
      next.presaleStart = null;
      next.presaleEnd = null;
      next.presalePrice = null;
      next.presaleSupply = null;
    }

    setErrors(next);
  }, [
    baseUri,
    name,
    symbol,
    description,
    totalSupplyStr,
    royaltyRecipient,
    royaltyPercentStr,
    publicStart,
    publicPriceEtn,
    maxPerWalletStr,
    maxPerTxStr,
    walletUnlimited,
    enablePresale,
    presaleStart,
    presaleEnd,
    presalePriceEtn,
    presaleSupplyStr,
  ]);

  const canOpenModal = (() => {
    try {
      const { totalSupply } = validateCore();
      if (enablePresale) validatePresale(totalSupply);
      return true;
    } catch {
      return false;
    }
  })();

  async function onConfirmDeploy() {
    try {
      const { totalSupply, maxPerWallet, maxPerTx, royaltyPercent } = validateCore();
      const presale = validatePresale(totalSupply);

      const payload: DeployPayload = {
        metadataOption: mode === "upload" ? "UPLOAD" : "EXTERNAL",
        baseURI: normalizeBaseUri(baseUri),
        name: name.trim(),
        symbol: symbol.trim(),
        description: description.trim(),
        totalSupply,
        publicPriceWei: etnToWeiStr(publicPriceEtn),
        maxPerWallet,
        maxPerTx,
        publicStartISO: new Date(publicStart).toISOString(),
        royaltyPercent,
        royaltyRecipient: royaltyRecipient.trim(),
        logoUrl,
        coverUrl,
      };

      if (enablePresale && presale && prepared?.ok && prepared.merkleRoot) {
        payload.presale = {
          startISO: new Date(presaleStart).toISOString(),
          endISO: new Date(presaleEnd).toISOString(),
          priceWei: etnToWeiStr(presalePriceEtn),
          maxSupply: presale.presaleSupply,
          merkleRoot: prepared.merkleRoot,
          allowlistCount: allowState?.validChecksummed.length ?? undefined,
          allowlistCommit: prepared.commit,
          draftId: prepared.draftId,
        };
      }

      setConfirmOpen(false);
      show("Preparing deployment…");

      await onDeploy(payload);
    } catch (e: any) {
      setConfirmOpen(false);
      hide();
      toast.error(e?.message || "Invalid input.");
    }
  }

  const baseUriWarning =
    pvErrorCount >= 2
      ? "We couldn’t fetch metadata from this Base URI. Please verify your URI before deploying."
      : null;

  const TinyError = ({ text }: { text?: string | null }) =>
    text ? <p className="mt-1 text-[11px] leading-snug text-red-500">{text}</p> : null;

  const Tip = ({ children, tip }: { children: React.ReactNode; tip: React.ReactNode }) => (
    <div className="flex items-center gap-2">
      {children}
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-6 w-6">
            <Info className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 rounded-xl border border-white/10 bg-background/80 backdrop-blur-xl text-sm break-words">
          {tip}
        </PopoverContent>
      </Popover>
    </div>
  );

  // Keep max-per-wallet synced when unlimited
  useEffect(() => {
    if (walletUnlimited) setMaxPerWalletStr(totalSupplyStr || "");
  }, [walletUnlimited, totalSupplyStr]);

  const fromUploads = typeof detectedSupply === "number" && detectedSupply > 0;
  const totalSupplyHint = detectingSupply
    ? "Counting items from Base URI…"
    : fromUploads
      ? `Detected ${detectedSupply} items from your uploads.`
      : typeof detectedFromBase === "number"
        ? `Detected ${detectedFromBase} items from Base URI.`
        : "We’ll detect supply automatically from uploads or Base URI.";

  // Make Total Supply read-only
  const lockSupply = true;

  /* ---------- derived caps for the arrow controls (UI only) ---------- */
  const totalSupplyNum = Number(totalSupplyStr);
  const totalSupplyCap =
    Number.isFinite(totalSupplyNum) && totalSupplyNum > 0 ? totalSupplyNum : undefined;

  const maxPerWalletNum = walletUnlimited
    ? totalSupplyNum
    : Number(maxPerWalletStr);

  const safeMaxPerTx = (() => {
    const caps: number[] = [20];
    if (Number.isFinite(totalSupplyNum) && totalSupplyNum > 0) caps.push(totalSupplyNum);
    if (!walletUnlimited && Number.isFinite(maxPerWalletNum) && maxPerWalletNum > 0)
      caps.push(maxPerWalletNum);
    return Math.max(1, Math.min(...caps));
  })();

  /* ----------------------- render ----------------------- */

  return (
    <div className="space-y-10 w-full max-w-full">
      <div>
        <Button variant="ghost" className="px-0" onClick={onBack}>
          ← Back
        </Button>
      </div>

      <div className="grid gap-8">
        {/* Base URI */}
        <div className="space-y-2">
          <Tip
            tip={
              <div>
                Use <code>ipfs://&lt;CID&gt;</code> with no trailing slash. Contract resolves{" "}
                <code>.../{`{`}tokenId{`}`}.json</code>.
              </div>
            }
          >
            <Label className="text-sm">Base URI</Label>
          </Tip>
          <Input
            placeholder="ipfs://<METADATA_CID>"
            value={baseUri}
            onChange={(e) => setBaseUri(e.target.value)}
            onBlur={() => markTouched("baseUri")}
            disabled={mode === "upload"}
          />
          <p className="text-xs text-muted-foreground">
            Expected: <code>ipfs://&lt;metadata_cid&gt;</code> (no trailing slash). Contract resolves{" "}
            <code>ipfs://&lt;metadata_cid&gt;/&#123;tokenId&#125;.json</code>.
          </p>
          <TinyError text={showIfTouched("baseUri")} />

          {/* Preview */}
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">Preview</span>
              <Button type="button" size="sm" className="h-7 px-2" onClick={fetchPreview}>
                <RefreshCw className="h-3.5 w-3.5 mr-1" /> Retry
              </Button>
            </div>

            {baseUriWarning ? (
              <div className="rounded-md border border-yellow-600/40 bg-yellow-600/10 text-yellow-300 p-2 text-xs mb-2">
                {baseUriWarning}
              </div>
            ) : null}

            <div className="rounded-xl border border-white/10 p-4 bg-background/60 backdrop-blur-xl">
              {pvLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Skeleton className="w-full aspect-square rounded-xl" />
                  <div className="space-y-3">
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <Skeleton className="h-12 rounded-md" />
                      <Skeleton className="h-12 rounded-md" />
                      <Skeleton className="h-12 rounded-md" />
                      <Skeleton className="h-12 rounded-md" />
                    </div>
                  </div>
                </div>
              ) : pvError ? (
                <div className="text-sm text-red-500">{pvError}</div>
              ) : pv ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <AssetRenderer url={pv.animation_url || pv.image || ""} />
                  </div>
                  <div className="space-y-4">
                    <div>
                      <div className="text-lg font-semibold break-words">{pv.name || "Unnamed"}</div>
                      {pv.description && (
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-line break-words">
                          {pv.description}
                        </p>
                      )}
                    </div>
                    {!!pv.attributes?.length && (
                      <div>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                          Attributes
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {pv.attributes!.slice(0, 12).map((a, i) => (
                            <div key={i} className="rounded-lg border border-white/10 bg-white/5 p-2">
                              <div className="text-[11px] uppercase tracking-wide text-muted-foreground break-words">
                                {a.trait_type ?? "Trait"}
                              </div>
                              <div className="text-sm font-medium break-words">
                                {String(a.value ?? "")}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Enter a valid Base URI to preview a sample item.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Name / Symbol and Total supply */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <Tip tip="A human-friendly collection name.">
              <Label>Name</Label>
            </Tip>
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => markTouched("name")} />
            <TinyError text={showIfTouched("name")} />
          </div>

          <div className="space-y-2">
            <Tip tip="Short uppercase ticker, e.g., DECENT.">
              <Label>Symbol</Label>
            </Tip>
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} onBlur={() => markTouched("symbol")} />
            <TinyError text={showIfTouched("symbol")} />
          </div>

          <div className="space-y-2">
            <Tip tip="Total number of NFTs that can ever be minted for this collection. Auto-detected and locked.">
              <Label>Total Supply</Label>
            </Tip>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={totalSupplyStr}
              onChange={() => {}}
              onBlur={() => markTouched("totalSupply")}
              readOnly={true}
              className="bg-muted/40 cursor-not-allowed"
            />
            {totalSupplyHint && (
              <p className="text-[11px] text-muted-foreground mt-1">{totalSupplyHint}</p>
            )}
            {supplyWarning && (
              <div className="mt-1 rounded-md border border-yellow-600/40 bg-yellow-600/10 text-yellow-300 p-2 text-[11px]">
                {supplyWarning}
              </div>
            )}

            <TinyError text={showIfTouched("totalSupply")} />
          </div>
        </div>

        {/* Description */}
        <div className="space-y-2">
          <Tip tip="Tell collectors about this drop. Supports plain text.">
            <Label>Description</Label>
          </Tip>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => markTouched("description")}
            placeholder="Tell collectors about this drop…"
            className="break-words"
          />
          <TinyError text={showIfTouched("description")} />
        </div>

        {/* Cover + Logo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Tip tip="Wide hero image shown on your collection page. Recommended ~1500×400.">
              <Label>Cover Photo</Label>
            </Tip>
            <label
              htmlFor={coverInputId}
              className="relative w-full h-40 rounded-lg border border-dashed flex items-center justify-center overflow-hidden cursor-pointer"
            >
              {coverUrl ? (
                <Image src={coverUrl} alt="Cover" fill className="object-cover rounded-lg" unoptimized />
              ) : (
                <span className="text-sm text-muted-foreground">Click to upload</span>
              )}
            </label>
            <Input
              id={coverInputId}
              ref={coverRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingImg}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) await uploadToCloudinary(f, (u) => setCoverUrl(u), coverRef);
              }}
            />
            <p className="text-xs text-muted-foreground">Recommended ~1600×400. Images only (jpg/png/gif).</p>
          </div>

          <div className="space-y-2">
            <Tip tip="Square logo or avatar for your collection. Recommended ≥ 400×400.">
              <Label>Logo</Label>
            </Tip>
            <label
              htmlFor={logoInputId}
              className="relative w-32 h-32 rounded-md border border-dashed flex items-center justify-center overflow-hidden cursor-pointer"
            >
              {logoUrl ? (
                <Image src={logoUrl} alt="Logo" fill className="object-cover rounded-md" unoptimized />
              ) : (
                <span className="text-sm text-muted-foreground">Click to upload</span>
              )}
            </label>
            <Input
              id={logoInputId}
              ref={logoRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploadingImg}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadToCloudinary(f, (u) => setLogoUrl(u), logoRef);
              }}
            />
            <p className="text-xs text-muted-foreground">Recommended ≥ 400×400. Images only (jpg/png/gif).</p>
          </div>
        </div>

        {/* Royalties */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Tip tip="EVM address to receive secondary-sale royalties. Must be a valid 0x address.">
              <Label>Royalty Recipient</Label>
            </Tip>
            <Input
              placeholder="0x…"
              value={royaltyRecipient}
              onChange={(e) => setRoyaltyRecipient(e.target.value)}
              onBlur={() => markTouched("royaltyRecipient")}
            />
            <TinyError text={showIfTouched("royaltyRecipient")} />
          </div>
          <div className="space-y-2">
            <Tip tip="Percent of sale price (0–10%).">
              <Label>Royalty (percent, max 10)</Label>
            </Tip>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={10}
              step={1}
              value={royaltyPercentStr}
              onChange={(e) => setRoyaltyPercentStr(e.target.value)}
              onBlur={() => markTouched("royaltyPercent")}
            />
            <TinyError text={showIfTouched("royaltyPercent")} />
          </div>
        </div>

        {/* Presale block (rendered inside WhitelistInput) */}
        <WhitelistInput
          enabled={enablePresale}
          onEnabledChange={setEnablePresale}
          onAllowlistChange={(s) => setAllowState(s)}
          onPrepared={(r) => setPrepared(r)}
          invalidatePrepared={() => setPrepared(null)}
          presaleStart={presaleStart}
          onChangePresaleStart={setPresaleStart}
          presaleEnd={presaleEnd}
          onChangePresaleEnd={setPresaleEnd}
          presalePriceEtn={presalePriceEtn}
          onChangePresalePriceEtn={setPresalePriceEtn}
          presaleSupplyStr={presaleSupplyStr}
          onChangePresaleSupplyStr={setPresaleSupplyStr}
          presaleFieldErrors={{
            start: errors.presaleStart ?? null,
            end: errors.presaleEnd ?? null,
            price: errors.presalePrice ?? null,
            supply: errors.presaleSupply ?? null,
          }}
          /* NEW: cap the spinner to total supply */
          totalSupplyMax={totalSupplyStr ? Number(totalSupplyStr) : undefined}
        />

        {/* Public sale */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-1">
            <Tip tip="When the public sale opens. Presale must end before this date/time.">
              <Label>Public sale start (your timezone)</Label>
            </Tip>
            <DateTimePicker
              label=""
              value={publicStart}
              onChange={(v) => {
                setPublicStart(v);
                markTouched("publicStart");
              }}
              minNow
            />
            <TinyError text={showIfTouched("publicStart")} />
          </div>

          <div className="space-y-2">
            <Tip tip="Price per token in ETN. Up to 18 decimal places.">
              <Label>Public price (ETN)</Label>
            </Tip>
            <Input
              placeholder="e.g. 25"
              value={publicPriceEtn}
              onChange={(e) => setPublicPriceEtn(e.target.value)}
              onBlur={() => markTouched("publicPrice")}
            />
            <TinyError text={showIfTouched("publicPrice")} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Tip tip="Max tokens a single wallet can mint across the entire sale. Toggle Unlimited to allow up to total supply.">
                <Label>Max per wallet</Label>
              </Tip>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Unlimited</span>
                <Switch
                  checked={walletUnlimited}
                  onCheckedChange={(v) => {
                    setWalletUnlimited(v);
                    if (v) setMaxPerWalletStr(totalSupplyStr || "");
                    markTouched("maxPerWallet");
                  }}
                />
              </div>
            </div>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              /* NEW: cap spinner to total supply when editable */
              max={walletUnlimited ? undefined : (totalSupplyStr ? Number(totalSupplyStr) : undefined)}
              value={walletUnlimited ? totalSupplyStr || "" : maxPerWalletStr}
              onChange={(e) => setMaxPerWalletStr(e.target.value)}
              onBlur={() => markTouched("maxPerWallet")}
              disabled={walletUnlimited}
              placeholder={walletUnlimited ? "Unlimited (<= Total supply)" : ""}
            />
            <p className="text-xs text-muted-foreground">Cannot exceed Total supply.</p>
            <TinyError text={showIfTouched("maxPerWallet")} />
          </div>

          {/* Max per transaction */}
          <div className="space-y-2 md:col-span-1">
            <Tip tip="Upper bound per mint transaction to keep gas sane. Must be ≤ 20, ≤ Max per wallet, and ≤ Total supply.">
              <Label>Max per transaction</Label>
            </Tip>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              /* NEW: hard cap for the spinner arrows */
              max={safeMaxPerTx}
              value={maxPerTxStr}
              onChange={(e) => setMaxPerTxStr(e.target.value)}
              onBlur={() => markTouched("maxPerTx")}
              placeholder="e.g. 5"
            />
            <p className="text-xs text-muted-foreground">
              Cannot exceed 20, Max per wallet, and Total supply. This prevents gas blowups.
            </p>
            <TinyError text={showIfTouched("maxPerTx")} />
          </div>
        </div>

        {/* ------- Platform fee panel (ETN, USD ≈, last updated) ------- */}
        <div className="rounded-xl border border-black/10 dark:border-white/10 px-4 py-3 bg-background/60 backdrop-blur-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
            <div className="space-y-1 min-w-0">
              <div className="text-sm font-medium">Platform Fee (one-time)</div>

              {feeLoading ? (
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-40" />
                </div>
              ) : fee ? (
                <div className="text-sm text-muted-foreground">
                  Payable to{" "}
                  <span className="font-mono break-all">{fee.feeRecipient}</span>
                </div>
              ) : (
                <div className="text-sm text-red-500">
                  {feeErr || "Fee unavailable."}
                </div>
              )}

              <div className="text-xs text-muted-foreground my-2">
                {feeLoading ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Skeleton className="h-3 w-28" />
                  </div>
                ) : (
                  <>
                    <div>≈ {formatUsd(feeUsdApprox)}</div>
                    <div className="mt-1">Last updated {lastUpdatedStr}</div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 text-base font-semibold">
              {feeLoading ? (
                <Skeleton className="h-6 w-24" />
              ) : (
                <>
                  {formatNumber(Number(feeEtnDisplay))}
                  <Image src="/ETN_LOGO.png" alt="ETN" width={16} height={16} />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end">
          <Button
            onClick={() => {
              try {
                const { totalSupply } = validateCore();
                if (enablePresale) validatePresale(totalSupply);
                setConfirmOpen(true);
              } catch (e: any) {
                toast.error(e?.message || "Please complete required fields.");
              }
            }}
            disabled={!canOpenModal || !totalSupplyStr || detectingSupply}
            title={!canOpenModal ? "Complete required fields before continuing" : undefined}
          >
            Preview & Deploy
          </Button>
        </div>
      </div>

      {/* Modal */}
      <PreviewDeployModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onConfirmDeploy}
        baseUri={normalizeBaseUri(baseUri)}
        name={name}
        symbol={symbol}
        description={description}
        totalSupply={Number(totalSupplyStr || 0)}
        royaltyRecipient={royaltyRecipient}
        royaltyPercent={Number(royaltyPercentStr || 0)}
        publicStartISO={new Date(publicStart || Date.now()).toISOString()}
        publicPriceEtn={publicPriceEtn}
        maxPerWallet={walletUnlimited ? Number(totalSupplyStr || 0) : Number(maxPerWalletStr || 0)}
        maxPerTx={Number(maxPerTxStr || 0)}
        enablePresale={enablePresale}
        presale={
          enablePresale && prepared?.ok && prepared?.merkleRoot
            ? {
                startISO: new Date(presaleStart || Date.now()).toISOString(),
                endISO: new Date(presaleEnd || Date.now()).toISOString(),
                priceEtn: presalePriceEtn,
                maxSupply: Number(presaleSupplyStr || 0),
                merkleRoot: prepared.merkleRoot,
                allowlistCount: allowState?.validChecksummed.length || 0,
              }
            : undefined
        }
        baseUriWarning={baseUriWarning}
        platformFeeEtn={feeEtnDisplay}
        platformFeeRecipient={fee?.feeRecipient ?? ""}
        fxUsdPerEtn={fee?.lastPriceUsd ?? undefined}
        fxLastPriceAt={fee?.lastPriceAt ?? undefined}
        fxSource={fee?.pricingSource ?? undefined}
        fxPair={fee?.pricingPair ?? undefined}
      />
    </div>
  );
}
