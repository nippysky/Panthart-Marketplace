// components/create/single-erc1155/CreateSingleERC1155Form.tsx
"use client";

/**
 * Create Single (ERC-1155)
 * - Calls the correct init route: /api/uploads/init (plural)
 * - Graceful error messages (short, user-friendly)
 * - Upload-session countdown with auto-expire → shows refresh actions
 * - Upload disabled when session inactive
 * - Name/Symbol validation only after focus
 */

import * as React from "react";
import { ethers } from "ethers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, UploadCloud } from "lucide-react";
import { cn, formatNumber, shortenAddress } from "@/lib/utils";
import { useLoaderStore } from "@/lib/store/loader-store";

import { ensureChain, getBrowserSigner, getRequiredChainId } from "@/lib/chain/client";
import { prettyEthersError } from "@/lib/chain/errors";
import { NFT_FACTORY_ABI } from "@/lib/abis/NFTFactoryABI";
import Single1155DeploySuccessModal from "./single1155-deploy-success-modal";
import { SuccessDialog } from "../drop/success-dialog";
import { useRouter } from "next/navigation";

// ===== ENV / constants =====
const UPLOAD_BASE = process.env.NEXT_PUBLIC_UPLOAD_BASE ?? "";
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "";
const ACCEPT_MEDIA = ".png,.jpg,.jpeg,.gif,.webp,.avif,.svg,.mp4";

// Correct API route (plural)
const SESSION_INIT_PATH = "/api/uploads/init";

// Fallback TTL in case upstream doesn’t send one
const DEFAULT_SESSION_TTL_MS = 15 * 60 * 1000;

// ===== types =====
type Step = 1 | 2 | 3;
type InitResponse = {
  jobId: string;
  token?: string | null;
  expiresIn?: number | null;
  expiresAt?: string | number | null;
  exp?: string | number | null;
  ttlSec?: number | null;
};

type AssetPinRes = {
  cid: string;
  ipfsUri: string;
  gatewayUrl: string;
  mime?: string;
};

type S1155BuildRes = {
  cid: string;
  baseUri: string;
  tokenUri: string;
  gatewayTokenUrl: string;
};

type SessionStatus = "initializing" | "active" | "expired" | "error";

// ===== helpers (shared with submit-collection style) =====
function ensureHttps(u: string) {
  if (!u) return u;
  if (/^https?:\/\//i.test(u)) return u;
  return `https://${u.replace(/^\/+/, "")}`;
}
function toHttp(ipfsUri: string) {
  return ipfsUri?.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${ipfsUri.slice(7)}` : ipfsUri;
}
function isVideoMime(m: string) {
  return (m || "").toLowerCase().startsWith("video/");
}
function clampInt(n: number, lo: number, hi: number) {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
function ipfsCidFromUri(u: string) {
  if (!u?.startsWith("ipfs://")) return "";
  const rest = u.slice(7);
  return rest.split("/")[0] || "";
}
function isValidPriceStr(s: string) {
  if (s === "") return false;
  if (!/^\d*\.?\d*$/.test(s)) return false;
  if (Number.isNaN(Number(s))) return false;
  if (Number(s) < 0) return false;
  const [, frac] = s.split(".");
  if (frac && frac.length > 18) return false;
  return true;
}
function isPositiveIntStr(s: string) {
  if (!/^\d+$/.test(s)) return false;
  const n = Number(s);
  return Number.isInteger(n) && n >= 1;
}
function parseExpiryFromInit(j: InitResponse): number {
  const now = Date.now();
  if (typeof j.expiresIn === "number" && j.expiresIn > 0) return now + j.expiresIn * 1000;
  if (j.expiresAt != null) {
    const v = j.expiresAt;
    if (typeof v === "string") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    } else if (typeof v === "number") {
      return v < 1e12 ? v * 1000 : v;
    }
  }
  if (j.exp != null) {
    const v = j.exp;
    if (typeof v === "string") {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    } else if (typeof v === "number") {
      return v < 1e12 ? v * 1000 : v;
    }
  }
  if (j.ttlSec && j.ttlSec > 0) return now + j.ttlSec * 1000;
  return now + DEFAULT_SESSION_TTL_MS;
}
function mmss(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function shortError(e: any, fallback = "Something went wrong") {
  const raw = typeof e === "string" ? e : e?.message || e?.error || e?.toString?.() || fallback;
  if (!raw) return fallback;
  if (/<html/i.test(raw) || /<!DOCTYPE/i.test(raw)) return fallback;
  return raw.length > 220 ? `${raw.slice(0, 220)}…` : raw;
}

/** Expand scientific-notation into a plain integer decimal string for wei */
function toPlainIntegerWeiString(x?: string) {
  if (!x) return "";
  const s = String(x).trim();
  if (!s) return "";
  if (/^[+-]?\d+$/.test(s)) return s.replace(/^\+/, "");
  if (/^[+-]?\d+\.\d+$/.test(s)) return s.split(".")[0].replace(/^\+/, "");
  const m = s.match(/^([+-]?\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (m) {
    const sign = m[1].startsWith("-") ? "-" : "";
    const intPart = m[1].replace(/^[+-]/, "");
    const frac = m[2] || "";
    const exp = parseInt(m[3], 10);
    if (exp >= 0) {
      const digits = intPart + frac;
      const zeros = exp - frac.length;
      const body = zeros >= 0 ? digits + "0".repeat(zeros) : digits.slice(0, digits.length + zeros);
      return (sign ? "-" : "") + (body.replace(/^0+(?=\d)/, "") || "0");
    } else {
      return "0";
    }
  }
  return s.replace(/[^\d-]/g, "");
}

/** Safe ETN parsing that never returns NaN/throws (returns compact string like "10.8k") */
function toEtnStringFromWei(wei?: string) {
  try {
    if (!wei) return "";
    const plain = toPlainIntegerWeiString(wei);
    if (!plain) return "";
    const asStr = ethers.formatEther(plain); // decimal string
    const n = Number.parseFloat(asStr);
    if (!Number.isFinite(n)) return "";
    return formatNumber(Number(n.toFixed(2)));
  } catch {
    return "";
  }
}

// ===== component =====
export default function CreateSingleERC1155Form() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);

  // ── Upload session state ─────────────────────────────────────────────────
  const sessionRef = React.useRef<{ jobId: string; token?: string; expiresAtMs: number } | null>(null);
  const [sessionStatus, setSessionStatus] = React.useState<SessionStatus>("initializing");
  const [sessionExpiresAtMs, setSessionExpiresAtMs] = React.useState<number | null>(null);
  const [nowMs, setNowMs] = React.useState<number>(Date.now());
  const expiredToastShownRef = React.useRef(false);

  React.useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remainingSec =
    sessionExpiresAtMs != null ? Math.max(0, Math.floor((sessionExpiresAtMs - nowMs) / 1000)) : null;
  const isSessionActive =
    sessionStatus === "active" && !!sessionRef.current?.jobId && (remainingSec ?? 0) > 0;

  // 🔔 auto-switch to "expired" when countdown hits 0
  React.useEffect(() => {
    if (sessionStatus === "active" && (remainingSec ?? 0) <= 0 && sessionRef.current) {
      setSessionStatus("expired");
      if (!expiredToastShownRef.current) {
        expiredToastShownRef.current = true;
        toast.error("Upload session expired. Refresh to get a new token.");
      }
    }
  }, [sessionStatus, remainingSec]);

  async function ensureSession(): Promise<{ jobId: string; token?: string }> {
    if (sessionRef.current?.jobId && isSessionActive) {
      return { jobId: sessionRef.current.jobId, token: sessionRef.current.token };
    }
    try {
      setSessionStatus("initializing");
      const res = await fetch(SESSION_INIT_PATH, { method: "POST", cache: "no-store" });
      if (!res.ok) {
        let msg = "Could not start upload session.";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {}
        throw new Error(msg);
      }
      const j = (await res.json()) as InitResponse;
      if (!j?.jobId) throw new Error("Init did not return a job id.");
      const exp = parseExpiryFromInit(j);
      sessionRef.current = { jobId: j.jobId, token: j.token ?? undefined, expiresAtMs: exp };
      setSessionExpiresAtMs(exp);
      setSessionStatus("active");
      expiredToastShownRef.current = false; // reset
      return { jobId: j.jobId, token: j.token ?? undefined };
    } catch (e: any) {
      setSessionStatus("error");
      throw new Error(shortError(e, "Could not start upload session."));
    }
  }

  async function refreshSession() {
    try {
      sessionRef.current = null;
      await ensureSession();
      toast.success("Upload session refreshed");
    } catch (e: any) {
      toast.error(shortError(e, "Refresh failed. Try hard refresh."));
    }
  }

  // Initial session
  React.useEffect(() => {
    ensureSession().catch((e) => toast.error(shortError(e, "Uploader is unreachable right now.")));
  }, []);

  // ── Step 1: media upload ────────────────────────────────────────────────
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const objectUrlRef = React.useRef<string | null>(null);

  const [assetCid, setAssetCid] = React.useState("");
  const [assetUri, setAssetUri] = React.useState("");
  const [assetPreview, setAssetPreview] = React.useState("");
  const [assetMime, setAssetMime] = React.useState("");

  const [dragActive, setDragActive] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [progress, setProgress] = React.useState(0);

  const [showAssetModal, setShowAssetModal] = React.useState(false);

  function setLocalPreview(f: File | null) {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (!f) {
      setAssetPreview("");
      setAssetMime("");
      return;
    }
    const url = URL.createObjectURL(f);
    objectUrlRef.current = url;
    setAssetPreview(url);
    setAssetMime(f.type || "");
  }
  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  function pickFile() {
    fileInputRef.current?.click();
  }
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setLocalPreview(f);
  }
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (busy) return;
    const f = e.dataTransfer.files?.[0] || null;
    setFile(f);
    setLocalPreview(f);
  }

  function xhrUpload(url: string, form: FormData, headers: Record<string, string>) {
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);
      Object.entries(headers).forEach(([k, v]) => xhr.setRequestHeader(k, v));
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) setProgress((evt.loaded / evt.total) * 100);
      };
      xhr.onload = () => {
        try {
          const txt = xhr.responseText || "{}";
          const json = JSON.parse(txt);
          if (xhr.status >= 200 && xhr.status < 300) resolve(json);
          else reject(new Error(json?.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error("Bad response from upload server"));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));
      xhr.timeout = 1000 * 60 * 30; // 30m
      xhr.send(form);
    });
  }

  async function uploadAsset() {
    try {
      if (!UPLOAD_BASE) throw new Error("Uploads service not configured.");
      if (!file) throw new Error("Select a file first.");
      if (!isSessionActive) throw new Error("Upload session expired. Refresh the session and try again.");
      setBusy(true);
      setProgress(0);

      const { jobId, token } = await ensureSession(); // keep it fresh

      const form = new FormData();
      form.append("kind", "single-asset");
      form.append("file", file);

      const headers: Record<string, string> = { "x-job-id": jobId };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const json: AssetPinRes = await xhrUpload(`${UPLOAD_BASE}/single/upload/asset`, form, headers);

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setAssetCid(json.cid);
      setAssetUri(json.ipfsUri);
      setAssetPreview(ensureHttps(json.gatewayUrl));
      setAssetMime(json.mime || file.type || "");

      setShowAssetModal(true);
    } catch (e: any) {
      toast.error(shortError(e, "Asset upload failed."));
    } finally {
      setBusy(false);
    }
  }

  // ── Step 2: metadata/config ─────────────────────────────────────────────
  const [name, setName] = React.useState("");
  const [symbol, setSymbol] = React.useState("");
  const [description, setDescription] = React.useState("");

  const [maxSupply, setMaxSupply] = React.useState<string>("100");
  const [mintPriceEtn, setMintPriceEtn] = React.useState<string>("0.01");
  const [maxPerWallet, setMaxPerWallet] = React.useState<string>("1");
  const [royaltyPct, setRoyaltyPct] = React.useState<number>(5);

  const [customFields, setCustomFields] = React.useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);
  const [attributes, setAttributes] = React.useState<Array<{ trait_type: string; value: string }>>([]);

  const [touchedName, setTouchedName] = React.useState(false);
  const [touchedSymbol, setTouchedSymbol] = React.useState(false);

  const [showMetaModal, setShowMetaModal] = React.useState(false);

  const [baseUri, setBaseUri] = React.useState("");
  const [tokenUri, setTokenUri] = React.useState("");
  const [tokenPreview, setTokenPreview] = React.useState("");

  const step2Errors = React.useMemo(() => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Contract name is required.";
    if (!symbol.trim()) errs.symbol = "Symbol is required.";
    if (!isPositiveIntStr(maxSupply)) errs.maxSupply = "Enter a whole number ≥ 1.";
    if (!isValidPriceStr(mintPriceEtn)) errs.mintPriceEtn = "Enter a valid non-negative price (up to 18 decimals).";
    if (!isPositiveIntStr(maxPerWallet)) {
      errs.maxPerWallet = "Enter a whole number ≥ 1.";
    } else if (isPositiveIntStr(maxSupply)) {
      const mpw = Number(maxPerWallet);
      const ms = Number(maxSupply);
      if (mpw > ms) errs.maxPerWallet = "Max per wallet cannot be greater than max supply.";
    }
    if (!(royaltyPct >= 0 && royaltyPct <= 10)) errs.royaltyPct = "Royalties must be between 0% and 10%.";
    if (!assetUri) errs.asset = "Upload media before generating metadata.";
    return errs;
  }, [name, symbol, maxSupply, mintPriceEtn, maxPerWallet, royaltyPct, assetUri]);

  const isStep2Valid = Object.keys(step2Errors).length === 0;

  function addCustom() {
    setCustomFields((a) => [...a, { key: "", value: "" }]);
  }
  function setCustom(i: number, key: "key" | "value", v: string) {
    setCustomFields((a) => a.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));
  }
  function delCustom(i: number) {
    setCustomFields((a) => a.filter((_, idx) => idx !== i));
  }

  function addAttr() {
    setAttributes((a) => [...a, { trait_type: "", value: "" }]);
  }
  function setAttr(i: number, key: "trait_type" | "value", v: string) {
    setAttributes((a) => a.map((row, idx) => (idx === i ? { ...row, [key]: v } : row)));
  }
  function delAttr(i: number) {
    setAttributes((a) => a.filter((_, idx) => idx !== i));
  }

  async function pinS1155Json() {
    try {
      if (!isStep2Valid) {
        toast.error("Please fix the highlighted fields.");
        return;
      }
      if (!UPLOAD_BASE) throw new Error("Uploads service not configured.");

      const ms = clampInt(parseInt(maxSupply || "0", 10), 1, 10_000_000);
      const mpWei = ethers.parseEther((mintPriceEtn || "0") as `${number}`);
      const mpw = clampInt(parseInt(maxPerWallet || "1", 10), 1, ms);

      setMaxSupply(String(ms));
      setMintPriceEtn(ethers.formatEther(mpWei));
      setMaxPerWallet(String(mpw));

      const extra: Record<string, any> = {};
      for (const row of customFields) {
        const k = (row.key || "").trim();
        if (!k) continue;
        if (["name", "description", "image", "animation_url", "attributes"].includes(k)) continue;
        extra[k] = row.value;
      }
      const attrs =
        attributes
          .filter((r) => r.trait_type || r.value)
          .map((r) => ({ trait_type: r.trait_type, value: r.value })) || [];

      const { jobId } = await ensureSession();
      const headers: Record<string, string> = {
        "x-job-id": jobId,
        "Content-Type": "application/json",
      };
      if (sessionRef.current?.token) headers["Authorization"] = `Bearer ${sessionRef.current.token}`;

      const res = await fetch(`${UPLOAD_BASE}/single1155/build-json`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          description: description || undefined,
          imageUri: isVideoMime(assetMime) ? undefined : assetUri,
          animationUri: isVideoMime(assetMime) ? assetUri : undefined,
          attributes: attrs.length ? attrs : undefined,
          extra: Object.keys(extra).length ? extra : undefined,
        }),
      });
      const j: S1155BuildRes = await res.json();
      if (!res.ok) throw new Error((j as any)?.error || "Pin failed.");

      setBaseUri(j.baseUri);
      setTokenUri(j.tokenUri);
      setTokenPreview(ensureHttps(j.gatewayTokenUrl));

      setShowMetaModal(true);
    } catch (e: any) {
      toast.error(shortError(e, "Pinning failed."));
    }
  }

  // ── Step 3: fees & deploy ───────────────────────────────────────────────
  const [feeRecipient, setFeeRecipient] = React.useState("");
  const [feeAmountWei, setFeeAmountWei] = React.useState("0");
  const [targetUsdCents, setTargetUsdCents] = React.useState<number | undefined>(undefined);
  const [lastPriceUsd, setLastPriceUsd] = React.useState<string | undefined>(undefined);
  const [feeLoading, setFeeLoading] = React.useState(false);

  const [royaltyRecipientAddr, setRoyaltyRecipientAddr] = React.useState("");
  const [deploying, setDeploying] = React.useState(false);
  const [deployOpen, setDeployOpen] = React.useState(false);
  const [deployed, setDeployed] = React.useState<{ contract: string; tx: string }>({ contract: "", tx: "" });

  const { show, hide } = useLoaderStore();

  async function loadFees() {
    try {
      setFeeLoading(true);
      const res = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractType: "ERC1155_SINGLE", metadataOption: "UPLOAD" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || "Failed to fetch fee config");
      setFeeRecipient(j.feeRecipient);
      // normalize any sci-notation to a plain integer string
      setFeeAmountWei(toPlainIntegerWeiString(String(j.feeAmountEtnWei ?? j.feeAmountWei)));
      setTargetUsdCents(typeof j.targetUsdCents === "number" ? j.targetUsdCents : undefined);
      setLastPriceUsd(typeof j.lastPriceUsd === "string" ? j.lastPriceUsd : undefined);
    } catch (e: any) {
      toast.error(shortError(e, "Could not load fees."));
    } finally {
      setFeeLoading(false);
    }
  }

  const step3Errors = React.useMemo(() => {
    const errs: Record<string, string> = {};
    if (!royaltyRecipientAddr.trim()) {
      errs.royaltyRecipientAddr = "Royalty recipient is required.";
    } else if (!ethers.isAddress(royaltyRecipientAddr.trim())) {
      errs.royaltyRecipientAddr = "Enter a valid wallet address.";
    }
    if (!feeRecipient || !feeAmountWei || toPlainIntegerWeiString(feeAmountWei) === "0") {
      errs.fee = "Deployment fee not loaded yet.";
    }
    if (!baseUri) errs.baseUri = "Pin metadata first.";
    if (!name || !symbol) errs.identity = "Name & symbol are required.";
    return errs;
  }, [royaltyRecipientAddr, feeRecipient, feeAmountWei, baseUri, name, symbol]);

  const canDeploy = Object.keys(step3Errors).length === 0 && !deploying && FACTORY_ADDRESS;

  // Derived fee display values
  const feeHuman = React.useMemo(() => toEtnStringFromWei(feeAmountWei), [feeAmountWei]);

  const usdLine = React.useMemo(() => {
    if (typeof targetUsdCents === "number" && targetUsdCents > 0) {
      const dollars = (targetUsdCents / 100).toFixed(2);
      return `You’re paying $${dollars} worth of ETN.`;
    }
    if (lastPriceUsd && feeAmountWei) {
      const etn = parseFloat(ethers.formatEther(toPlainIntegerWeiString(feeAmountWei)));
      const px = parseFloat(lastPriceUsd);
      if (Number.isFinite(etn) && Number.isFinite(px) && px > 0) {
        const dollars = (etn * px).toFixed(2);
        return `You’re paying ~$${dollars} worth of ETN.`;
      }
    }
    return "";
  }, [targetUsdCents, lastPriceUsd, feeAmountWei]);

  async function deploy() {
    try {
      if (!FACTORY_ADDRESS) throw new Error("Factory address not set");
      if (!baseUri) throw new Error("baseURI missing — pin 1.json first");
      if (!name || !symbol) throw new Error("Name & symbol required");
      if (!ethers.isAddress(royaltyRecipientAddr)) throw new Error("Enter a valid royalty recipient");

      const ms = clampInt(parseInt(maxSupply || "0", 10), 1, 10_000_000);
      const mpw = clampInt(parseInt(maxPerWallet || "1", 10), 1, ms);
      const mpWei = ethers.parseEther((mintPriceEtn || "0") as `${number}`);
      const royaltyBps = Math.round(clampInt(royaltyPct, 0, 10) * 100);

      setDeploying(true);
      const required = getRequiredChainId();

      show("Connecting wallet…");
      await ensureChain(required);
      const signer = await getBrowserSigner();
      const from = await signer.getAddress();

      const royaltyRecipient = royaltyRecipientAddr.trim();

      const factory = new ethers.Contract(FACTORY_ADDRESS, NFT_FACTORY_ABI, signer);
      const cfg = {
        name,
        symbol,
        baseURI: baseUri,
        maxSupply: BigInt(ms),
        mintPrice: BigInt(mpWei.toString()),
        maxPerWallet: BigInt(mpw),
        feeRecipient,
        feeAmount: BigInt(toPlainIntegerWeiString(feeAmountWei)),
        royaltyRecipient,
        royaltyBps,
        initialOwner: from,
      };

      show("Simulating…");
      try {
        // @ts-ignore ethers v6
        await factory.createERC1155Drop.staticCall(cfg, { value: BigInt(toPlainIntegerWeiString(feeAmountWei)) });
      } catch (e: any) {
        hide();
        throw new Error(prettyEthersError(e) || "Simulation failed");
      }

      show("Awaiting your wallet approval…");
      const tx = await factory.createERC1155Drop(cfg, { value: BigInt(toPlainIntegerWeiString(feeAmountWei)) });

      show("Transaction submitted. Waiting for confirmation…");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        hide();
        throw new Error("Deployment failed on-chain");
      }

      let clone = "";
      try {
        const iface = factory.interface;
        for (const log of receipt.logs ?? []) {
          let parsed: any = null;
          try {
            parsed = iface.parseLog(log);
          } catch {}
          if (parsed?.name === "ERC1155DropCloneCreated") {
            const addr = String(parsed.args?.cloneAddress ?? "");
            if (ethers.isAddress(addr)) {
              clone = ethers.getAddress(addr);
              break;
            }
          }
        }
      } catch {}

      if (!clone) throw new Error("Could not detect contract address from events");

      show("Finalizing on server…");
      const jsonCid = ipfsCidFromUri(tokenUri);
      const post = await fetch("/api/index/single-erc1155", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: receipt.hash,
          blockNumber: Number(receipt.blockNumber || 0),
          contract: clone,
          implementationAddr: "",
          factoryAddress: FACTORY_ADDRESS,
          deployerAddress: from,

          feeRecipient,
          feeAmountEtnWei: toPlainIntegerWeiString(feeAmountWei),

          royaltyRecipient,
          royaltyBps,

          name,
          symbol,
          baseUri,
          maxSupply: ms,
          mintPriceEtnWei: mpWei.toString(),
          maxPerWallet: mpw,

          creatorWalletAddress: from,
          ownerAddress: from,

          description,
          imageUrl: !isVideoMime(assetMime) ? assetPreview : undefined,

          assetCid,
          jsonCid,
          uploaderUserId: null,
        }),
      });
      const pj = await post.json();
      if (!post.ok) {
        hide();
        throw new Error(pj?.error || "Indexing failed");
      }

      hide();
      setDeployed({ contract: clone, tx: receipt.hash });
      setDeployOpen(true);
    } catch (e: any) {
      hide();
      toast.error(shortError(e, "Deploy failed."));
    } finally {
      setDeploying(false);
    }
  }

  // ===== UI =====
  return (
    <div className="w-full space-y-8">
      {/* Stepper */}
      <div className="flex items-center gap-6 text-sm">
        <div className={cn("flex items-center gap-2", step >= 1 && "text-foreground")}>
          <div className={cn("h-7 w-7 rounded-full grid place-items-center border", step >= 1 ? "bg-primary/10 border-primary/40" : "border-white/10")}>1</div>
          <span className="font-medium">Upload</span>
        </div>
        <Separator className="w-24 hidden sm:block" />
        <div className={cn("flex items-center gap-2", step >= 2 && "text-foreground")}>
          <div className={cn("h-7 w-7 rounded-full grid place-items-center border", step >= 2 ? "bg-primary/10 border-primary/40" : "border-white/10")}>2</div>
          <span className="font-medium">Metadata</span>
        </div>
        <Separator className="w-24 hidden sm:block" />
        <div className={cn("flex items-center gap-2", step >= 3 && "text-foreground")}>
          <div className={cn("h-7 w-7 rounded-full grid place-items-center border", step >= 3 ? "bg-primary/10 border-primary/40" : "border-white/10")}>3</div>
          <span className="font-medium">Deploy</span>
        </div>
      </div>

      {/* STEP 1 — Upload */}
      {step === 1 && (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">1) Upload media (image, GIF, or video)</h3>
                <p className="text-sm text-muted-foreground">
                  Accepted: {ACCEPT_MEDIA.split(",").join(", ")} • Max 200MB
                </p>
              </div>

              {/* Session chip */}
              <div className="text-right text-xs">
                {sessionStatus === "initializing" && (
                  <div className="inline-flex items-center gap-2 rounded-md border border-white/15 px-2 py-1">
                    <span className="opacity-70">Preparing upload session…</span>
                  </div>
                )}
                {sessionStatus === "active" && (
                  <div className="inline-flex items-center gap-2 rounded-md border border-white/15 px-2 py-1">
                    <span className="opacity-70">Upload session:</span>
                    <span className="font-mono">{mmss(remainingSec ?? 0)}</span>
                  </div>
                )}
                {(sessionStatus === "expired" || sessionStatus === "error") && (
                  <div className="inline-flex items-center gap-2 rounded-md border border-red-500/40 px-2 py-1 text-red-500">
                    <span className="font-medium">Session expired</span>
                  </div>
                )}
              </div>
            </div>

            {/* If expired/error, show guidance right under the header */}
            {(sessionStatus === "expired" || sessionStatus === "error") && (
              <div className="text-xs text-red-400">
                Your temporary upload token has expired. Please refresh to get a new one.
              </div>
            )}

            <div className="grid sm:grid-cols-[360px_1fr] gap-6">
              {/* Left: controls */}
              <div className="space-y-3">
                <div
                  onDragOver={(e) => { e.preventDefault(); if (!busy) setDragActive(true); }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                  className={cn(
                    "rounded-lg border border-dashed p-5 cursor-pointer transition",
                    dragActive ? "border-primary bg-primary/5" : "border-white/15 hover:bg-white/5"
                  )}
                  onClick={pickFile}
                >
                  <div className="flex items-center gap-3 text-sm">
                    <UploadCloud className="h-5 w-5" />
                    <div className="leading-tight">
                      <div className="font-medium">Drag & drop media here</div>
                      <div className="text-muted-foreground">or <span className="underline">click to select</span></div>
                    </div>
                  </div>
                </div>

                <input ref={fileInputRef} type="file" accept={ACCEPT_MEDIA} className="hidden" onChange={onFileChange} />

                <div className="text-xs text-muted-foreground truncate">
                  {file ? <>Selected: <span className="font-mono">{file.name}</span></> : "No file chosen"}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="secondary" onClick={pickFile}>Choose different file</Button>
                  <Button onClick={uploadAsset} disabled={!file || busy || !isSessionActive}>
                    {busy ? "Uploading to IPFS…" : "Upload to IPFS & continue"}
                  </Button>

                  {sessionStatus !== "active" && (
                    <>
                      <Button
                        variant="link"
                        className="px-1"
                        onClick={async () => {
                          try {
                            await refreshSession();
                            setSessionStatus("active");
                          } catch {
                            setSessionStatus("error");
                          }
                        }}
                      >
                        Refresh session
                      </Button>
                      <span className="text-muted-foreground">·</span>
                      <Button variant="link" className="px-1" onClick={() => window.location.reload()}>
                        Hard refresh page
                      </Button>
                    </>
                  )}
                </div>

                {busy && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <div className="text-xs text-muted-foreground">{progress.toFixed(0)}%</div>
                  </div>
                )}
              </div>

              {/* Right: preview */}
              <div className="rounded-lg border bg-muted/10 p-3">
                {assetPreview ? (
                  isVideoMime(assetMime) ? (
                    <video src={assetPreview} controls className="w-full h-[420px] object-contain rounded-md" />
                  ) : (
                    <img src={assetPreview} alt="preview" className="w-full h-[420px] object-contain rounded-md" />
                  )
                ) : (
                  <div className="h-[420px] grid place-items-center text-sm text-muted-foreground">Selected file preview</div>
                )}
              </div>
            </div>

            <SuccessDialog
              open={showAssetModal}
              title="Media pinned"
              description="Copy the references for your records."
              items={[
                { label: "Asset CID", value: assetCid, display: assetCid, href: assetCid ? `https://ipfs.io/ipfs/${assetCid}` : undefined },
                { label: "ipfs://", value: assetUri, display: assetUri, href: assetUri ? toHttp(assetUri) : undefined },
                { label: "Preview", value: assetPreview, display: assetPreview, href: assetPreview || undefined },
              ]}
              proceedLabel="Proceed to Metadata"
              onProceed={() => { setShowAssetModal(false); setStep(2); }}
            />
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Metadata & Config */}
      {step === 2 && (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-6">
            <div>
              <h3 className="font-semibold">2) Metadata &amp; Config</h3>
              <p className="text-sm text-muted-foreground">
                We’ll build <code>1.json</code> referencing your media and pin a folder so your <code>baseURI</code> is stable.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setTouchedName(true)}
                  placeholder="e.g., My Editions"
                />
                {touchedName && !!step2Errors.name && <p className="text-xs text-red-500">{step2Errors.name}</p>}
              </div>
              <div className="space-y-2">
                <Label>Symbol</Label>
                <Input
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value)}
                  onFocus={() => setTouchedSymbol(true)}
                  placeholder="e.g., MYED"
                />
                {touchedSymbol && !!step2Errors.symbol && <p className="text-xs text-red-500">{step2Errors.symbol}</p>}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="(Optional) A short description for marketplaces." />
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Max Supply</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={maxSupply}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") return setMaxSupply("");
                    setMaxSupply(raw.replace(/[^\d]/g, ""));
                  }}
                  onBlur={() => {
                    if (!isPositiveIntStr(maxSupply)) setMaxSupply("1");
                    if (isPositiveIntStr(maxPerWallet) && isPositiveIntStr(maxSupply)) {
                      const mpw = Number(maxPerWallet);
                      const ms = Number(maxSupply);
                      if (mpw > ms) setMaxPerWallet(String(ms));
                    }
                  }}
                  placeholder="100"
                />
                {step2Errors.maxSupply && <p className="text-xs text-red-500">{step2Errors.maxSupply}</p>}
              </div>

              <div className="space-y-2">
                <Label>Mint Price</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0}
                  value={mintPriceEtn}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return setMintPriceEtn("");
                    if (/^\d*\.?\d*$/.test(v)) setMintPriceEtn(v);
                  }}
                  onBlur={() => {
                    if (!isValidPriceStr(mintPriceEtn)) setMintPriceEtn("0");
                  }}
                  placeholder="0.01"
                />
                <p className="text-xs text-muted-foreground">Buyers pay this to mint each edition.</p>
                {step2Errors.mintPriceEtn && <p className="text-xs text-red-500">{step2Errors.mintPriceEtn}</p>}
              </div>

              <div className="space-y-2">
                <Label>Max Per Wallet</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  max={isPositiveIntStr(maxSupply) ? Number(maxSupply) : undefined}
                  value={maxPerWallet}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") return setMaxPerWallet("");
                    setMaxPerWallet(raw.replace(/[^\d]/g, ""));
                  }}
                  onBlur={() => {
                    if (!isPositiveIntStr(maxPerWallet)) setMaxPerWallet("1");
                    if (isPositiveIntStr(maxPerWallet) && isPositiveIntStr(maxSupply)) {
                      const mpw = Number(maxPerWallet);
                      const ms = Number(maxSupply);
                      if (mpw > ms) setMaxPerWallet(String(ms));
                    }
                  }}
                  placeholder="1"
                />
                {step2Errors.maxPerWallet && <p className="text-xs text-red-500">{step2Errors.maxPerWallet}</p>}
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label>Royalties (%)</Label>
                <Input type="number" min={0} max={10} step={1} value={royaltyPct} onChange={(e) => setRoyaltyPct(clampInt(+e.target.value, 0, 10))} />
                <p className="text-xs text-muted-foreground">0–10%</p>
              </div>
            </div>

            {/* Custom fields (optional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Custom MetaData fields (optional)</Label>
                <Button size="sm" variant="outline" onClick={addCustom} className="gap-1">
                  <Plus className="h-4 w-4" /> Add field
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {customFields.map((row, i) => (
                  <div key={`cf-${i}`} className="grid grid-cols-[1fr,1fr,auto] gap-2">
                    <Input placeholder="key (e.g. external_url)" value={row.key} onChange={(e) => setCustom(i, "key", e.target.value)} />
                    <Input placeholder="value" value={row.value} onChange={(e) => setCustom(i, "value", e.target.value)} />
                    <Button variant="ghost" size="icon" onClick={() => delCustom(i)} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Attributes (optional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Attributes / Traits (optional)</Label>
                <Button size="sm" variant="outline" onClick={addAttr} className="gap-1">
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {attributes.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1fr,1fr,auto] gap-2">
                    <Input placeholder="Trait" value={row.trait_type} onChange={(e) => setAttr(i, "trait_type", e.target.value)} />
                    <Input placeholder="Value" value={row.value} onChange={(e) => setAttr(i, "value", e.target.value)} />
                    <Button variant="ghost" size="icon" onClick={() => delAttr(i)} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={pinS1155Json} disabled={!isStep2Valid}>
                {isStep2Valid ? "Build 1.json, pin folder & continue" : "Fix fields to continue"}
              </Button>
              {tokenPreview && (
                <a className="text-xs underline text-muted-foreground" href={tokenPreview} target="_blank" rel="noreferrer">
                  Open preview
                </a>
              )}
            </div>

            <SuccessDialog
              open={showMetaModal}
              title="Metadata pinned & validated"
              description="Copy your references. Continue to deployment."
              items={[
                { label: "Folder CID", value: ipfsCidFromUri(baseUri), display: ipfsCidFromUri(baseUri), href: baseUri ? toHttp(baseUri) : undefined },
                { label: "tokenURI (ipfs)", value: tokenUri, display: tokenUri, href: tokenUri ? toHttp(tokenUri) : undefined },
                { label: "Preview", value: tokenPreview, display: tokenPreview, href: tokenPreview || undefined },
              ]}
              proceedLabel="Proceed to Deploy"
              onProceed={() => {
                setShowMetaModal(false);
                setStep(3);
                loadFees();
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* STEP 3 — Deploy */}
      {step === 3 && (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-6">
            <h3 className="font-semibold">3) Deploy</h3>

            {/* Fee card */}
            <div className="rounded-md border p-4 bg-muted/20">
              <div className="text-sm text-muted-foreground mb-1">Deployment Fee</div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="text-lg font-medium" title={`${ethers.formatEther(toPlainIntegerWeiString(feeAmountWei))} ETN`}>
                  {feeLoading ? "Loading…" : feeHuman ? `${feeHuman} ETN` : "—"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Recipient: <code>{feeRecipient ? shortenAddress(feeRecipient, 6, 4) : "—"}</code>
                </div>
              </div>
              {usdLine && (
                <div className="mt-1 text-xs text-muted-foreground">
                  {usdLine}
                </div>
              )}
              <div className="mt-1 text-[11px] text-muted-foreground">
                <span className="opacity-70">Raw:</span> <code className="break-all">{toPlainIntegerWeiString(feeAmountWei)} wei</code>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="space-y-2">
                <Label>Royalty recipient *</Label>
                <Input
                  placeholder="0x… (must be a valid wallet)"
                  value={royaltyRecipientAddr}
                  onChange={(e) => setRoyaltyRecipientAddr(e.target.value)}
                />
                {step3Errors.royaltyRecipientAddr && (
                  <p className="text-xs text-red-500">{step3Errors.royaltyRecipientAddr}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={deploy} disabled={!canDeploy}>
                {deploying ? "Deploying…" : "Deploy ERC-1155 Single"}
              </Button>
              {!canDeploy && (
                <p className="text-xs text-muted-foreground">
                  Fill required fields and ensure fees are loaded to enable deploy.
                </p>
              )}
            </div>

            <Single1155DeploySuccessModal
              open={deployOpen}
              name={name}
              mediaUrl={!isVideoMime(assetMime) ? assetPreview : undefined}
              contract={deployed.contract}
              txHash={deployed.tx}
              tokenId={1}
              onViewNft={() => {
                setDeployOpen(false);
                if (deployed.contract) window.location.href = `/minting-now/erc1155/${deployed.contract}`;
              }}
             onOpenContract={() => {
  const url = `https://blockexplorer.electroneum.com/address/${deployed.contract}`;
  // open first (prevents popup blockers), then close modal
  window.open(url, "_blank", "noopener,noreferrer");
  setDeployOpen(false);
  router.replace("/");
}}
              onClose={() => {
                setDeployOpen(false);
                router.replace("/");
              }}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
