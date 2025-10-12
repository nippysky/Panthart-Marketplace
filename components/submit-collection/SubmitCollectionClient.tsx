"use client";

import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { useActiveAccount } from "thirdweb/react";
import { ethers, type Eip1193Provider } from "ethers";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useLoaderStore } from "@/lib/store/loader-store";
import LoaderModal from "@/components/shared/loader-modal";
import { cn, formatNumber } from "@/lib/utils";
import { CheckCircle2, Copy } from "lucide-react";
import { useRouter } from "next/navigation";

/* ----------------- ABIs / constants ----------------- */
const ERC165_ABI = [
  "function supportsInterface(bytes4 interfaceId) external view returns (bool)",
];
const ERC721_META_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
];
const ERC721_SUPPLY_ABI = ["function totalSupply() view returns (uint256)"];
const OWNABLE_ABI = ["function owner() view returns (address)"];
const ACCESSCONTROL_ABI = [
  "function hasRole(bytes32 role, address account) view returns (bool)",
];
const READ_ABI = [
  ...ERC165_ABI,
  ...ERC721_META_ABI,
  ...ERC721_SUPPLY_ABI,
  ...OWNABLE_ABI,
  ...ACCESSCONTROL_ABI,
];
const IFACE_ERC721 = "0x80ac58cd";
const DEFAULT_ADMIN_ROLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

/* ----------------- helpers ----------------- */
const IPFS_GATEWAY =
  (process.env.NEXT_PUBLIC_IPFS_PRIMARY_GATEWAY as string) ||
  "https://ipfs.io/ipfs/";
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014);

function trimSlashes(s: string) {
  return s.replace(/^\/+/, "").replace(/\/+$/, "");
}
function normalizeIpfsToHttp(uri: string): string {
  const gateway = IPFS_GATEWAY.replace(/\/+$/, "");
  const u = uri.trim();
  if (u.startsWith("ipfs://ipfs/")) return `${gateway}/${trimSlashes(u.slice(12))}`;
  if (u.startsWith("ipfs://")) return `${gateway}/${trimSlashes(u.slice(7))}`;
  if (/^https?:\/\//i.test(u)) return u;
  return `${gateway}/${trimSlashes(u)}`;
}
function ensureTrailingSlash(u: string) {
  return u.endsWith("/") ? u : `${u}/`;
}
function candidatesForBaseUri(baseUri: string, id: number): string[] {
  const httpBase = normalizeIpfsToHttp(baseUri);
  const base = ensureTrailingSlash(httpBase);
  const idStr = String(id);
  const s = new Set<string>();
  s.add(`${base}${idStr}`);
  s.add(`${base}${idStr}.json`);
  if (/\{id\}|\{tokenId\}/i.test(baseUri)) {
    const r = httpBase.replace(/\{id\}|\{tokenId\}/gi, idStr);
    s.add(r);
    s.add(r.endsWith(".json") ? r : `${r}.json`);
  }
  return Array.from(s);
}
async function fetchJsonWithTimeout(url: string, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
type Media = { kind: "image"; url: string } | { kind: "video"; url: string };
function detectMediaFromMeta(meta: any): Media | undefined {
  const rawAnim =
    meta?.animation_url ||
    meta?.animationUrl ||
    meta?.properties?.animation_url ||
    meta?.properties?.animation;
  const rawImg =
    meta?.image ||
    meta?.image_url ||
    meta?.imageUrl ||
    meta?.properties?.image ||
    meta?.properties?.image_url;

  const toUrl = (u?: string) =>
    u && typeof u === "string" ? normalizeIpfsToHttp(u) : undefined;
  const isVideo = (url: string) => {
    const p = (() => {
      try {
        return new URL(url).pathname.toLowerCase();
      } catch {
        return url.toLowerCase();
      }
    })();
    return p.endsWith(".mp4") || p.endsWith(".webm") || p.endsWith(".mov");
  };

  const anim = toUrl(rawAnim);
  if (anim)
    return isVideo(anim) ||
      String(meta?.mime_type || "").startsWith("video")
      ? { kind: "video", url: anim }
      : { kind: "image", url: anim };

  const img = toUrl(rawImg);
  if (img) return isVideo(img) ? { kind: "video", url: img } : { kind: "image", url: img };
  return undefined;
}
function short(addr?: string) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Copied");
  } catch {
    toast.error("Copy failed");
  }
}

/** Expand scientific-notation (e.g. "1.23e+5") into a plain integer decimal string for wei */
function toPlainIntegerWeiString(x?: string) {
  if (!x) return "";
  const s = x.trim();
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

/** Safe ETN parsing that never returns NaN/throws */
function toEtnStringFromWei(wei?: string) {
  try {
    if (!wei) return "";
    const plain = toPlainIntegerWeiString(wei);
    if (!plain) return "";
    const asStr = ethers.formatEther(plain);
    const n = Number.parseFloat(asStr);
    if (!Number.isFinite(n)) return "";
    return formatNumber(Number(n.toFixed(2)));
  } catch {
    return "";
  }
}

/* ----------------- Component ----------------- */
export default function SubmitCollectionClient() {
  const account = useActiveAccount();
  const { show, hide } = useLoaderStore();
  const router = useRouter();

  // success modal
  const [successOpen, setSuccessOpen] = useState(false);
  const [successData, setSuccessData] = useState<{
    id: string;
    name: string;
    contract: string;
    owner: string;
  } | null>(null);

  // stepper
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // step 1
  const [contract, setContract] = useState("");
  const [isErc721, setIsErc721] = useState<boolean | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [supply, setSupply] = useState("");
  const [owner, setOwner] = useState("");
  const [ownerMatch, setOwnerMatch] = useState<boolean | null>(null);
  const [probeError, setProbeError] = useState("");

  // step 2
  const [logoUrl, setLogoUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const logoRef = useRef<HTMLInputElement | null>(null);
  const coverRef = useRef<HTMLInputElement | null>(null);
  const [baseUri, setBaseUri] = useState("");
  const [baseValid, setBaseValid] = useState(false);
  const [baseError, setBaseError] = useState("");
  const [previewMeta, setPreviewMeta] = useState<any | null>(null);
  const [previewMedia, setPreviewMedia] = useState<Media | undefined>(undefined);
  const [previewTriedUrls, setPreviewTriedUrls] = useState<string[]>([]);

  // step 3 (fee)
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState("");
  const [x, setX] = useState("");
  const [instagram, setInstagram] = useState("");
  const [telegram, setTelegram] = useState("");
  const [agree, setAgree] = useState(false);

  const [feeRecipient, setFeeRecipient] = useState<string>("");
  const [feeAmountWei, setFeeAmountWei] = useState<string>("");
  const [feeLoading, setFeeLoading] = useState<boolean>(false);
  const [targetUsdCents, setTargetUsdCents] = useState<number | undefined>(undefined);
  const [lastPriceUsd, setLastPriceUsd] = useState<string | undefined>(undefined);

  // read-only provider
  const provider = useMemo(() => {
    const url =
      (process.env.NEXT_PUBLIC_RPC_URL as string) ||
      (process.env.RPC_URL as string) ||
      "https://rpc.ankr.com/electroneum";
    return new ethers.JsonRpcProvider(url);
  }, []);
  const connected = Boolean(account?.address);

  // fetch fee when Step 3 shows
  useEffect(() => {
    (async () => {
      if (step !== 3) return;
      setFeeLoading(true);
      try {
        const resp = await fetch("/api/fees", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contractType: "ERC721_DROP",
            metadataOption: "EXTERNAL",
          }),
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json?.error || "Failed to load fee");
        setFeeRecipient(json.feeRecipient);
        // normalize any scientific-notation wei to plain integer string
        setFeeAmountWei(toPlainIntegerWeiString(json.feeAmountEtnWei ?? json.feeAmountWei));
        setTargetUsdCents(typeof json.targetUsdCents === "number" ? json.targetUsdCents : undefined);
        setLastPriceUsd(typeof json.lastPriceUsd === "string" ? json.lastPriceUsd : undefined);
      } catch (e: any) {
        toast.error(e?.message || "Failed to load fee");
      } finally {
        setFeeLoading(false);
      }
    })();
  }, [step]);

  // uploads (shared)
  async function handleFileUpload(
    file: File,
    setter: (url: string) => void,
    inputRef: React.RefObject<HTMLInputElement | null>
  ) {
    try {
      show("Uploading image…");
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.success || !json?.data?.secure_url) {
        throw new Error(json?.error || "Upload failed");
      }
      setter(json.data.secure_url);
      if (inputRef.current) inputRef.current.value = "";
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      hide();
    }
  }

  // on-chain probe
  const probeContract = useCallback(
    async (addr: string) => {
      setProbeError("");
      setIsErc721(null);
      setName("");
      setSymbol("");
      setSupply("");
      setOwner("");
      setOwnerMatch(null);

      if (!ethers.isAddress(addr)) {
        setProbeError("Enter a valid contract address.");
        return;
      }

      try {
        show("Fetching contract data…");
        const c = new ethers.Contract(addr, READ_ABI, provider);

        let is721 = false;
        try {
          is721 = await c.supportsInterface(IFACE_ERC721);
        } catch {
          is721 = true; // fallback
        }
        setIsErc721(is721);
        if (!is721) {
          setProbeError("This contract is not ERC-721. We only accept ERC-721 collections.");
          return;
        }

        try {
          setName(await c.name());
        } catch {}
        try {
          setSymbol(await c.symbol());
        } catch {}
        try {
          const ts: bigint = await c.totalSupply();
          setSupply(ts.toString());
        } catch {
          setSupply("");
        }

        let own = "";
        try {
          own = await c.owner();
        } catch {
          try {
            const acct = account?.address ?? ethers.ZeroAddress;
            const has = await c.hasRole(DEFAULT_ADMIN_ROLE, acct);
            if (has && acct !== ethers.ZeroAddress) own = acct;
          } catch {}
        }
        if (own) setOwner(own);
        if (own && account?.address) {
          setOwnerMatch(own.toLowerCase() === account.address.toLowerCase());
        } else setOwnerMatch(null);
      } catch (e: any) {
        setProbeError(e?.message || "Failed to read contract.");
      } finally {
        hide();
      }
    },
    [provider, account?.address, show, hide]
  );

  // base URI validation + preview
  const validateBase = useCallback(
    async (raw: string) => {
      setBaseError("");
      setBaseValid(false);
      setPreviewMeta(null);
      setPreviewMedia(undefined);
      setPreviewTriedUrls([]);

      const val = raw.trim();
      if (!val) return;

      try {
        show("Validating Base URI…");
        const tried: string[] = [];
        const ids = [1, 0];
        let success: { meta: any; media?: Media } | null = null;

        for (const id of ids) {
          const urls = candidatesForBaseUri(val, id);
          for (const u of urls) {
            tried.push(u);
            const json = await fetchJsonWithTimeout(u, 12000);
            if (json && typeof json === "object") {
              success = { meta: json, media: detectMediaFromMeta(json) };
              break;
            }
          }
          if (success) break;
        }

        setPreviewTriedUrls(tried);
        if (!success) {
          setBaseError(
            "We couldn’t fetch valid JSON for token #1 or #0 (with and without .json)."
          );
          setBaseValid(false);
          return;
        }

        setPreviewMeta(success.meta);
        setPreviewMedia(success.media);
        setBaseValid(true);
      } catch (e: any) {
        setBaseError(e?.message || "Validation failed.");
      } finally {
        hide();
      }
    },
    [show, hide]
  );

  // pay fee + submit
  const handleSubmit = useCallback(async () => {
    try {
      if (!connected) return toast.error("Connect wallet to submit.");
      if (!ethers.isAddress(contract)) return toast.error("Invalid contract address.");
      if (!isErc721) return toast.error("Contract must be ERC-721.");
      if (!ownerMatch) return toast.error("Connected wallet must match the collection owner.");
      if (!logoUrl || !coverUrl) return toast.error("Logo and cover are required.");
      if (!baseValid) return toast.error("Please validate the Base URI before proceeding.");
      if (!agree) return toast.error("You must agree to the Terms.");

      // 1) fetch the latest fee again (freshness)
      show("Fetching submission fee…");
      const feeResp = await fetch("/api/fees", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contractType: "ERC721_DROP",
          metadataOption: "EXTERNAL",
        }),
        cache: "no-store",
      });
      const feeJson = await feeResp.json();
      if (!feeResp.ok) throw new Error(feeJson?.error || "Failed to load fee.");
      const freshRecipient = String(feeJson.feeRecipient);
      const freshAmountWei = toPlainIntegerWeiString(
        String(feeJson.feeAmountEtnWei ?? feeJson.feeAmountWei)
      );

      // 2) pay fee (native transfer via injected wallet)
      const eth = (window as any).ethereum as Eip1193Provider | undefined;
      if (!eth) throw new Error("Wallet provider not found.");
      const browserProvider = new ethers.BrowserProvider(eth);
      const network = await browserProvider.getNetwork();
      if (Number(network.chainId) !== CHAIN_ID) {
        throw new Error(`Wrong network. Please switch to chain ${CHAIN_ID}.`);
      }
      const signer = await browserProvider.getSigner();
      const fromAddr = await signer.getAddress();
      if (account?.address && fromAddr.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error("Connected wallet mismatch.");
      }

      show("Waiting for wallet to confirm payment…");
      const tx = await signer.sendTransaction({
        to: freshRecipient,
        value: BigInt(freshAmountWei),
      });

      show("Paying fee…");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) throw new Error("Payment failed on-chain.");

      // 3) submit payload with fee hash
      show("Submitting collection…");

      const payload = {
        contract,
        standard: "ERC721",
        name,
        symbol,
        supply: supply ? Number(supply) : 0,
        ownerAddress: owner || account?.address,
        baseUri,
        logoUrl,
        coverUrl,
        description: description.trim() || null,
        website: website.trim() || null,
        x: x.trim() || null,
        instagram: instagram.trim() || null,
        telegram: telegram.trim() || null,
        submitterAddress: account?.address,
        feeTxHash: receipt.hash,
      };

      const res = await fetch("/api/collection-submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const ct = res.headers.get("content-type") || "";
      if (!ct.includes("application/json")) {
        const txt = await res.text();
        throw new Error(
          `HTTP ${res.status} ${res.statusText}. Non-JSON response: ${txt.slice(0, 160)}`
        );
      }

      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Submission failed.");
      }

      setSuccessData({
        id: data.data.id,
        name: data.data.name,
        contract: data.data.contract,
        owner: owner || account?.address || "",
      });
      setSuccessOpen(true);
      toast.success("Submission received!");
    } catch (e: any) {
      toast.error(e?.message || "Submission failed");
    } finally {
      hide();
    }
  }, [
    connected,
    contract,
    isErc721,
    ownerMatch,
    logoUrl,
    coverUrl,
    baseValid,
    baseUri,
    name,
    symbol,
    supply,
    description,
    website,
    x,
    instagram,
    telegram,
    agree,
    owner,
    account?.address,
    show,
    hide,
  ]);

  // reset
  const routerRef = router;
  const resetAndGoHome = useCallback(() => {
    setStep(1);
    setContract("");
    setIsErc721(null);
    setName("");
    setSymbol("");
    setSupply("");
    setOwner("");
    setOwnerMatch(null);
    setProbeError("");

    setLogoUrl("");
    setCoverUrl("");
    setBaseUri("");
    setBaseValid(false);
    setBaseError("");
    setPreviewMeta(null);
    setPreviewMedia(undefined);
    setPreviewTriedUrls([]);

    setDescription("");
    setWebsite("");
    setX("");
    setInstagram("");
    setTelegram("");
    setAgree(false);

    setSuccessOpen(false);
    router.replace("/");
  }, [routerRef, router]);

  const feeHuman = useMemo(() => toEtnStringFromWei(feeAmountWei), [feeAmountWei]);

  // ✅ SAFE title for the fee amount (avoid formatEther on empty string)
  const feeTitle = useMemo(() => {
    const wei = toPlainIntegerWeiString(feeAmountWei);
    if (!wei) return "";
    try {
      return `${ethers.formatEther(wei)} ETN`;
    } catch {
      return "";
    }
  }, [feeAmountWei]);

  // Derive "$X worth of ETN" (muted line)
  const usdLine = useMemo(() => {
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

  /* ----------------- Render ----------------- */
  return (
    <>
      <LoaderModal />

      {/* Success modal — non-dismissable */}
      <Dialog open={successOpen} onOpenChange={(open) => setSuccessOpen(open)}>
        <DialogContent
          className="sm:max-w-md"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader className="text-center">
            <div className="mx-auto mb-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
            </div>
            <DialogTitle className="text-xl">Submission received</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Your collection is pending admin review. We’ll notify you when it’s approved.
            </p>
          </DialogHeader>

          {successData && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">Submission ID</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs">{successData.id}</code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(successData.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">Name</div>
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate max-w-[200px]">
                    {successData.name || "—"}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(successData.name || "")}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">Contract</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs truncate max-w-[200px]">
                    {successData.contract}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(successData.contract)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                <div className="text-xs text-muted-foreground">Owner</div>
                <div className="flex items-center gap-2">
                  <code className="text-xs truncate max-w-[200px]">
                    {successData.owner}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(successData.owner)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="mt-4 sm:justify-center">
            <Button onClick={resetAndGoHome} className="min-w-32">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Main */}
      <div className="max-w-5xl mx-auto px-4 py-10 space-y-8">
        {!connected ? (
          <div className="max-w-3xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle>Submit Collection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Connect your wallet to submit a collection.
                </p>
              </CardContent>
            </Card>
          </div>
        ) : (
          <>
            {/* stepper */}
            <div className="flex items-center gap-3">
              {[1, 2, 3].map((n) => (
                <div
                  key={n}
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                    n === step
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {n}
                </div>
              ))}
            </div>

            {/* STEP 1 */}
            <Card hidden={step !== 1}>
              <CardHeader>
                <CardTitle>Contract</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="contract" className="mb-1.5">
                      Contract Address
                    </Label>
                    <Input
                      id="contract"
                      placeholder="0x…"
                      value={contract}
                      onChange={(e) => setContract(e.target.value)}
                      onBlur={(e) => probeContract(e.target.value)}
                    />
                    {probeError && (
                      <p className="text-sm text-destructive">{probeError}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label className="mb-1.5">Name</Label>
                    <Input value={name} readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="mb-1.5">Symbol</Label>
                    <Input value={symbol} readOnly />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="mb-1.5">Supply (max or current)</Label>
                    <Input value={supply || "—"} readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="mb-1.5">Owner (on-chain)</Label>
                    <Input value={owner || "—"} readOnly />
                    {owner && account?.address && ownerMatch === false && (
                      <p className="text-xs text-destructive">
                        Connected wallet ({short(account.address)}) does not match
                        on-chain owner ({short(owner)}). You can’t proceed.
                      </p>
                    )}
                    {ownerMatch && (
                      <p className="text-xs text-emerald-500">Owner verified ✅</p>
                    )}
                  </div>

                  <div className="sm:col-span-2 space-y-1.5">
                    <Label className="mb-1.5">Standard</Label>
                    <Input
                      value={
                        isErc721 === null ? "—" : isErc721 ? "ERC-721" : "Not ERC-721"
                      }
                      readOnly
                    />
                    {isErc721 === false && (
                      <p className="text-xs text-destructive">
                        This contract is not ERC-721. We only accept ERC-721
                        collections.
                      </p>
                    )}
                  </div>
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!ethers.isAddress(contract) || !isErc721 || !ownerMatch}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* STEP 2 */}
            <Card hidden={step !== 2}>
              <CardHeader>
                <CardTitle>Branding & Base URI</CardTitle>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                  {/* COVER */}
                  <div className="lg:col-span-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="coverFile" className="mb-1.5">
                        Cover Photo <span className="text-destructive">*</span>
                      </Label>

                      <label htmlFor="coverFile" className="block">
                        <div
                          className={cn(
                            "relative w-full rounded-lg bg-muted overflow-hidden cursor-pointer focus-within:ring-2 focus-within:ring-primary",
                            "h-40 sm:h-48 md:h-56"
                          )}
                        >
                          {coverUrl ? (
                            <>
                              <Image
                                src={coverUrl}
                                alt="Cover"
                                fill
                                className="object-cover object-center"
                                unoptimized
                              />
                              <div className="absolute inset-0 bg-black/30 text-white text-sm flex items-center justify-center pointer-events-none">
                                Click to replace cover photo
                              </div>
                            </>
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground pointer-events-none">
                              Click to upload
                            </div>
                          )}
                        </div>
                      </label>

                      <input
                        id="coverFile"
                        ref={coverRef}
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f) await handleFileUpload(f, setCoverUrl, coverRef);
                        }}
                      />

                      <p className="text-xs text-muted-foreground">
                        Recommended ~1600×400. JPG/PNG/GIF.
                      </p>
                    </div>
                  </div>

                  {/* LOGO */}
                  <div className="space-y-1.5">
                    <Label htmlFor="logoFile" className="mb-1.5">
                      Logo <span className="text-destructive">*</span>
                    </Label>

                    <label htmlFor="logoFile" className="block">
                      <div className="relative w-28 h-28 rounded-xl bg-muted overflow-hidden cursor-pointer focus-within:ring-2 focus-within:ring-primary">
                        {logoUrl ? (
                          <>
                            <Image
                              src={logoUrl}
                              alt="Logo"
                              fill
                              className="object-cover"
                              unoptimized
                            />
                            <div className="absolute inset-0 bg-black/30 text-white text-xs flex items-center justify-center text-center px-1 pointer-events-none">
                              Click to replace
                            </div>
                          </>
                        ) : (
                          <div className="absolute inset-0 text-xs text-muted-foreground flex items-center justify-center text-center px-1 pointer-events-none">
                            Click to upload
                          </div>
                        )}
                      </div>
                    </label>

                    <input
                      id="logoFile"
                      ref={logoRef}
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) await handleFileUpload(f, setLogoUrl, logoRef);
                      }}
                    />

                    <p className="text-xs text-muted-foreground">
                      Recommended ≥ 400×400. JPG/PNG/GIF.
                    </p>
                  </div>
                </div>

                {/* Base URI + Preview */}
                <div className="space-y-2">
                  <Label htmlFor="baseuri" className="mb-1.5">
                    Base URI <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="baseuri"
                    placeholder="ipfs://bafy.../  or  https://ipfs.io/ipfs/<cid>/"
                    value={baseUri}
                    onChange={(e) => setBaseUri(e.target.value)}
                    onBlur={(e) => validateBase(e.target.value)}
                    className="w-full"
                  />
                  {baseError && (
                    <p className="text-sm text-destructive">{baseError}</p>
                  )}

                  {previewMeta && (
                    <div className="mt-3">
                      <Label className="block mb-2">Preview (token #1 or #0)</Label>
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        <div className="relative w-32 h-32 rounded-lg overflow-hidden bg-muted shrink-0">
                          {previewMedia?.kind === "video" ? (
                            <video
                              src={previewMedia.url}
                              className="w-full h-full object-cover"
                              playsInline
                              muted
                              loop
                              controls
                            />
                          ) : previewMedia?.kind === "image" ? (
                            <Image
                              src={previewMedia.url}
                              alt="Preview"
                              fill
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                              No media
                            </div>
                          )}
                        </div>

                        <div className="text-sm w-full min-w-0">
                          <div className="font-medium mb-1">
                            {previewMeta?.name || "Untitled"}
                          </div>
                          {previewMeta?.description && (
                            <p className="text-muted-foreground mb-2 break-words">
                              {previewMeta.description}
                            </p>
                          )}
                          {Array.isArray(previewMeta?.attributes) &&
                            previewMeta.attributes.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                {previewMeta.attributes
                                  .slice(0, 6)
                                  .map((a: any, i: number) => (
                                    <div
                                      key={i}
                                      className="rounded-md border px-2 py-1"
                                    >
                                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                        {String(a.trait_type ?? "Trait")}
                                      </div>
                                      <div className="text-sm">
                                        {String(a.value ?? "—")}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                        </div>
                      </div>

                      <details className="mt-3">
                        <summary className="text-xs text-muted-foreground cursor-pointer">
                          Debug: tried URLs
                        </summary>
                        <div className="mt-2 max-h-40 overflow-auto">
                          <ul className="space-y-1 text-xs text-muted-foreground break-all">
                            {previewTriedUrls.map((u) => (
                              <li key={u} className="whitespace-pre-wrap">
                                {u}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </details>
                    </div>
                  )}
                </div>

                <div className="pt-2 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(3)}
                    disabled={!logoUrl || !coverUrl || !baseValid}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* STEP 3 */}
            <Card hidden={step !== 3}>
              <CardHeader>
                <CardTitle>Details, Fee & Terms</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Fee card */}
                <div className="rounded-md border p-4 bg-muted/20">
                  <div className="text-sm text-muted-foreground mb-1">Submission Fee</div>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div
                      title={feeTitle || undefined}
                      className="text-lg font-medium"
                    >
                      {feeLoading ? "Loading…" : feeHuman ? `${feeHuman} ETN` : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Recipient: <code>{feeRecipient ? short(feeRecipient) : "—"}</code>
                    </div>
                  </div>
                  {usdLine && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {usdLine}
                    </div>
                  )}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="description" className="mb-1.5">
                      Description
                    </Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Tell collectors what makes this collection special…"
                      rows={5}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="website" className="mb-1.5">
                      Website URL
                    </Label>
                    <Input
                      id="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      placeholder="https://yourdomain.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="x" className="mb-1.5">
                      X
                    </Label>
                    <Input
                      id="x"
                      value={x}
                      onChange={(e) => setX(e.target.value)}
                      placeholder="https://x.com/username"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="instagram" className="mb-1.5">
                      Instagram
                    </Label>
                    <Input
                      id="instagram"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="https://instagram.com/username"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="telegram" className="mb-1.5">
                      Telegram
                    </Label>
                    <Input
                      id="telegram"
                      value={telegram}
                      onChange={(e) => setTelegram(e.target.value)}
                      placeholder="https://t.me/username"
                    />
                  </div>
                </div>

                {/* Agreement */}
                <div className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    id="agree"
                    checked={agree}
                    onCheckedChange={(c) => setAgree(c === true)}
                  />
                  <label htmlFor="agree" className="cursor-pointer">
                    I agree to the
                  </label>
                  <Link
                    href="/terms"
                    className="underline underline-offset-4 hover:text-primary"
                  >
                    Terms & Conditions
                  </Link>
                </div>

                <div className="pt-2 flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button onClick={handleSubmit} disabled={!agree || !feeRecipient || !feeAmountWei}>
                    Pay & Submit
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
