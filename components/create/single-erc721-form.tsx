// components/create/single-erc721/SingleERC721Wizard.tsx
"use client";

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

import { useLoaderStore } from "@/lib/store/loader-store";
import { cn, formatNumber, shortenAddress } from "@/lib/utils";

import { ensureChain, getBrowserSigner, getRequiredChainId } from "@/lib/chain/client";
import { prettyEthersError } from "@/lib/chain/errors";
import { NFT_FACTORY_ABI } from "@/lib/abis/NFTFactoryABI";
import SingleDeploySuccessModal from "./single-deploy-success-modal";
import { SuccessDialog } from "../drop/success-dialog";
import { useRouter } from "next/navigation";

// ===== ENV & constants =====
const UPLOAD_BASE = process.env.NEXT_PUBLIC_UPLOAD_BASE ?? "";
const ACCEPT_MEDIA = ".png,.jpg,.jpeg,.gif,.webp,.avif,.svg,.mp4";
const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS ?? "";

// ===== helpers =====
function percentToBps(pct: number) {
  return Math.round(pct * 100);
}
function isVideoMime(m: string) {
  return (m || "").toLowerCase().startsWith("video/");
}
function toHttp(ipfsUri: string) {
  return ipfsUri?.startsWith("ipfs://")
    ? `https://ipfs.io/ipfs/${ipfsUri.slice(7)}`
    : ipfsUri;
}
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
      const body =
        zeros >= 0 ? digits + "0".repeat(zeros) : digits.slice(0, digits.length + zeros);
      return (sign ? "-" : "") + (body.replace(/^0+(?=\d)/, "") || "0");
    }
    return "0";
  }
  return s.replace(/[^\d-]/g, "");
}
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
function friendlyRpcError(e: any): string {
  return (
    prettyEthersError(e) ||
    e?.data?.message ||
    e?.error?.data?.message ||
    e?.error?.message ||
    e?.shortMessage ||
    e?.reason ||
    e?.message ||
    "Transaction failed"
  );
}

/** Try hard to discover the implementation address from event or factory reads */
async function resolveImplementationAddress(
  factory: ethers.Contract,
  receipt: ethers.TransactionReceipt
): Promise<string> {
  // 1) The event often has it
  try {
    for (const log of receipt.logs ?? []) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed?.name === "ERC721SingleCloneCreated") {
          const candidates = [
            parsed.args?.implementation,
            parsed.args?.impl,
            parsed.args?.implementationAddr,
            parsed.args?.implementationAddress,
          ];
          for (const c of candidates) {
            const s = String(c ?? "");
            if (s && ethers.isAddress(s)) return ethers.getAddress(s);
          }
        }
      } catch {}
    }
  } catch {}

  // 2) Fallback to reading from factory (cover common method names)
  const methodCandidates = [
    "erc721SingleImplementation",
    "implementation721Single",
    "erc721Implementation",
    "erc721SingleImpl",
    "implementation",
    "getImplementation",
  ];
  for (const m of methodCandidates) {
    try {
      // @ts-ignore dynamic
      const fn = factory[m];
      if (typeof fn === "function") {
        const addr = await fn();
        if (addr && ethers.isAddress(addr)) return ethers.getAddress(String(addr));
      }
    } catch {}
  }
  return "";
}

// ===== types =====
type Step = 1 | 2 | 3;
type InitResponse = { jobId: string; token?: string | null };
type AssetPinRes = { cid: string; ipfsUri: string; gatewayUrl: string; mime?: string };
type MetaPinRes = { cid: string; ipfsUri: string; gatewayUrl: string };

// ========== Wizard ==========
export default function SingleERC721Wizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<Step>(1);

  // uploader session
  const sessionRef = React.useRef<{ jobId: string; token?: string } | null>(null);
  async function ensureSession(): Promise<{ jobId: string; token?: string }> {
    if (sessionRef.current?.jobId) return sessionRef.current;
    const res = await fetch("/api/uploads/init", { method: "POST", cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const json = (await res.json()) as InitResponse;
    if (!json?.jobId) throw new Error("Could not initialize upload session");
    sessionRef.current = { jobId: json.jobId, token: json.token ?? undefined };
    return sessionRef.current;
  }
  React.useEffect(() => {
    ensureSession().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== Step 1: media =====
  const [file, setFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const objectUrlRef = React.useRef<string | null>(null);
  const [dragActive, setDragActive] = React.useState(false);

  const [progress, setProgress] = React.useState(0);
  const [busy, setBusy] = React.useState(false);

  const [assetCid, setAssetCid] = React.useState("");
  const [assetUri, setAssetUri] = React.useState("");
  const [assetPreview, setAssetPreview] = React.useState(""); // blob: then https://
  const [assetMime, setAssetMime] = React.useState("");

  const [showAssetModal, setShowAssetModal] = React.useState(false);

  // ===== Step 2: metadata =====
  const [name, setName] = React.useState("");
  const [symbol, setSymbol] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [royaltyPercent, setRoyaltyPercent] = React.useState(5);
  const [customFields, setCustomFields] = React.useState<Array<{ key: string; value: string }>>([
    { key: "", value: "" },
  ]);
  const [attributes, setAttributes] = React.useState<Array<{ trait_type: string; value: string }>>(
    []
  );

  const [metaCid, setMetaCid] = React.useState("");
  const [tokenUri, setTokenUri] = React.useState("");
  const [metaPreview, setMetaPreview] = React.useState("");

  const [showMetaModal, setShowMetaModal] = React.useState(false);

  // ===== Step 3: deploy (UI state only) =====
  const [feeRecipient, setFeeRecipient] = React.useState("");
  const [feeAmountWei, setFeeAmountWei] = React.useState("0");
  const [targetUsdCents, setTargetUsdCents] = React.useState<number | undefined>(undefined);
  const [lastPriceUsd, setLastPriceUsd] = React.useState<string | undefined>(undefined);
  const [feeLoading, setFeeLoading] = React.useState(false);

  const [royaltyRecipientAddr, setRoyaltyRecipientAddr] = React.useState("");
  const [deploying, setDeploying] = React.useState(false);

  const [deployOpen, setDeployOpen] = React.useState(false);
  const [deployed, setDeployed] = React.useState<{ contract: string; tx: string }>({
    contract: "",
    tx: "",
  });

  const { show, hide } = useLoaderStore();

  // ----- fees (reusable) -----
  async function fetchFees() {
    const res = await fetch("/api/fees", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contractType: "ERC721_SINGLE", metadataOption: "UPLOAD" }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j?.error || "Failed to fetch fee config");
    return {
      feeRecipient: j.feeRecipient as string,
      feeAmountWei: toPlainIntegerWeiString(String(j.feeAmountEtnWei ?? j.feeAmountWei)),
      targetUsdCents: typeof j.targetUsdCents === "number" ? j.targetUsdCents : undefined,
      lastPriceUsd: typeof j.lastPriceUsd === "string" ? j.lastPriceUsd : undefined,
    };
  }
  async function loadFees() {
    try {
      setFeeLoading(true);
      const f = await fetchFees();
      setFeeRecipient(f.feeRecipient);
      setFeeAmountWei(f.feeAmountWei);
      setTargetUsdCents(f.targetUsdCents);
      setLastPriceUsd(f.lastPriceUsd);
    } catch (e: any) {
      toast.error(e?.message || "Could not load fees");
    } finally {
      setFeeLoading(false);
    }
  }

  // preview behavior
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
    setAssetPreview(url); // use blob: URL directly
    setAssetMime(f.type || "");
  }
  React.useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  // upload helper
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
          const json = JSON.parse(xhr.responseText || "{}");
          if (xhr.status >= 200 && xhr.status < 300) resolve(json);
          else reject(new Error(json?.error || `Upload failed (${xhr.status})`));
        } catch {
          reject(new Error("Bad response from upload server"));
        }
      };
      xhr.onerror = () => reject(new Error("Network error"));
      xhr.ontimeout = () => reject(new Error("Upload timed out"));
      xhr.timeout = 1000 * 60 * 30;
      xhr.send(form);
    });
  }

  // step 1 handlers
  function handleChooseClick() {
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
  async function startAssetUpload() {
    try {
      if (!UPLOAD_BASE) throw new Error("NEXT_PUBLIC_UPLOAD_BASE not configured");
      if (!file) throw new Error("Select a file first");
      setBusy(true);
      setProgress(0);

      const { jobId, token } = await ensureSession();

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
      setAssetPreview(json.gatewayUrl); // https gateway
      setAssetMime(json.mime || file.type || "");
      setShowAssetModal(true);
    } catch (e: any) {
      toast.error(e?.message || "Asset upload failed");
    } finally {
      setBusy(false);
    }
  }

  // step 2 actions
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
  async function pinMetadata() {
    try {
      if (!UPLOAD_BASE) throw new Error("NEXT_PUBLIC_UPLOAD_BASE not configured");
      if (!assetUri) throw new Error("Upload media first");
      if (!name || !symbol) throw new Error("Name and symbol are required");
      if (royaltyPercent < 0 || royaltyPercent > 10) throw new Error("Royalties must be 0–10%");

      setBusy(true);
      setProgress(0);

      const { jobId } = await ensureSession();
      const headers: Record<string, string> = {
        "x-job-id": jobId,
        "Content-Type": "application/json",
      };
      if (sessionRef.current?.token) headers["Authorization"] = `Bearer ${sessionRef.current.token}`;

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

      const body = {
        name,
        description: description || undefined,
        imageUri: isVideoMime(assetMime) ? undefined : assetUri,
        animationUri: isVideoMime(assetMime) ? assetUri : undefined,
        attributes: attrs.length ? attrs : undefined,
        extra: Object.keys(extra).length ? extra : undefined,
      };

      const res = await fetch(`${UPLOAD_BASE}/single/build-json`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const j: MetaPinRes = await res.json();
      if (!res.ok) throw new Error((j as any)?.error || "Metadata pin failed");

      setMetaCid(j.cid);
      setTokenUri(j.ipfsUri);
      setMetaPreview(j.gatewayUrl);
      setShowMetaModal(true);
    } catch (e: any) {
      toast.error(e?.message || "Metadata pin failed");
    } finally {
      setBusy(false);
    }
  }

  // derived fee display
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

  // deploy
  async function deploy() {
    try {
      if (!FACTORY_ADDRESS) throw new Error("Factory address not set");
      if (!ethers.isAddress(FACTORY_ADDRESS)) throw new Error("Factory address is invalid");
      if (!tokenUri) throw new Error("tokenURI missing");
      if (!name || !symbol) throw new Error("Name & symbol required");

      // fresh fees for the tx
      const fresh = await fetchFees();
      const feeRecipientForTx = fresh.feeRecipient;
      const feeWeiPlain = toPlainIntegerWeiString(fresh.feeAmountWei);
      const feeBig = BigInt(feeWeiPlain || "0");
      if (!ethers.isAddress(feeRecipientForTx)) throw new Error("Fee recipient is invalid");
      if (feeBig <= 0n) throw new Error("Deployment fee is zero — refresh and try again");

      setDeploying(true);
      const required = getRequiredChainId();

      show("Connecting wallet…");
      await ensureChain(required);
      const signer = await getBrowserSigner();
      const from = await signer.getAddress();

      // ---- balance preflight ----
      const balance = await signer.provider!.getBalance(from);
      if (balance < feeBig) {
        const need = Number(ethers.formatEther(feeBig)).toFixed(4);
        const have = Number(ethers.formatEther(balance)).toFixed(4);
        throw new Error(`Insufficient ETN for deployment fee. Need ${need} ETN (plus gas), you have ${have} ETN.`);
      }

      const royaltyRecipient = (royaltyRecipientAddr || from).trim();
      const royaltyBps = percentToBps(royaltyPercent);

      const factory = new ethers.Contract(FACTORY_ADDRESS, NFT_FACTORY_ABI, signer);
      const cfg = [name, symbol, tokenUri, feeRecipientForTx, feeWeiPlain, royaltyRecipient, royaltyBps, from];

      show("Simulating…");
      try {
        // @ts-ignore v6
        await factory.createERC721Single.staticCall(cfg, { value: feeBig });
      } catch (e: any) {
        hide();
        throw new Error(friendlyRpcError(e) || "Simulation failed");
      }

      show("Awaiting your wallet approval…");
      const tx = await factory.createERC721Single(cfg, { value: feeBig });

      show("Transaction submitted. Waiting for confirmation…");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        hide();
        throw new Error("Deployment failed on-chain");
      }

      // parse clone from event
      let clone = "";
      try {
        const iface = factory.interface;
        for (const log of receipt.logs ?? []) {
          try {
            const parsed = iface.parseLog(log);
            if (parsed?.name === "ERC721SingleCloneCreated") {
              const addr = String(parsed.args?.cloneAddress ?? "");
              if (ethers.isAddress(addr)) {
                clone = ethers.getAddress(addr);
                break;
              }
            }
          } catch {}
        }
      } catch {}
      if (!clone) throw new Error("Could not detect collection address from events");

      // resolve implementation address
      const implAddr = await resolveImplementationAddress(factory, receipt);

      show("Finalizing on server…");
      const post = await fetch("/api/index/single-erc721", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract: clone,
          txHash: receipt.hash,
          implementationAddr: implAddr || "",
          factoryAddress: FACTORY_ADDRESS,
          deployerAddress: from,
          feeRecipient: feeRecipientForTx,
          feeAmountEtnWei: feeWeiPlain,
          royaltyRecipient,
          royaltyBps,
          tokenUri,
          name,
          symbol,
          description,
          imageUrl: toHttp(assetUri),
          creatorWalletAddress: from,
          ownerAddress: from,
          assetCid,
          jsonCid: metaCid,
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
      toast.error(friendlyRpcError(e) || "Deploy failed");
    } finally {
      setDeploying(false);
    }
  }

  // ===== render =====
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
            <div>
              <h3 className="font-semibold">1) Upload media (image, GIF, or video)</h3>
              <p className="text-sm text-muted-foreground">Accepted: {ACCEPT_MEDIA.split(",").join(", ")} • Max 200MB</p>
            </div>

            <div className="grid sm:grid-cols-[360px_1fr] gap-6">
              <div className="space-y-3">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!busy) setDragActive(true);
                  }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={onDrop}
                  className={cn(
                    "rounded-lg border border-dashed p-5 cursor-pointer transition",
                    dragActive ? "border-primary bg-primary/5" : "border-white/15 hover:bg-white/5"
                  )}
                  onClick={handleChooseClick}
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

                {file ? (
                  <div className="text-xs text-muted-foreground truncate">
                    Selected: <span className="font-mono">{file.name}</span>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground">No file chosen</div>
                )}

                <div className="flex gap-2">
                  <Button variant="secondary" onClick={handleChooseClick}>Change media</Button>
                  <Button onClick={startAssetUpload} disabled={!file || busy}>
                    {busy ? "Uploading…" : "Pin media to IPFS"}
                  </Button>
                </div>

                {busy && (
                  <div className="space-y-2">
                    <Progress value={progress} className="h-2" />
                    <div className="text-xs text-muted-foreground">{progress.toFixed(0)}%</div>
                  </div>
                )}
              </div>

              {/* preview */}
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
              onProceed={() => {
                setShowAssetModal(false);
                setStep(2);
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* STEP 2 — Metadata */}
      {step === 2 && (
        <Card>
          <CardContent className="p-5 md:p-6 space-y-6">
            <div>
              <h3 className="font-semibold">2) Metadata</h3>
              <p className="text-sm text-muted-foreground">Fill in the details. We’ll pin a JSON that references your pinned media.</p>
            </div>

            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Symbol</Label>
                  <Input value={symbol} onChange={(e) => setSymbol(e.target.value)} />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Royalties (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={royaltyPercent}
                    onChange={(e) => setRoyaltyPercent(Math.max(0, Math.min(10, Math.floor(+e.target.value || 0))))}
                  />
                  <p className="text-xs text-muted-foreground">0–10%</p>
                </div>
              </div>

              {/* Custom fields */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Custom Metadata Fields (Optional)</Label>
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

              {/* Attributes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Attributes / Traits (Optional) </Label>
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

              <div className="flex gap-2">
                <Button onClick={pinMetadata} disabled={!assetUri || busy}>
                  {busy ? "Pinning…" : "Pin metadata to IPFS"}
                </Button>
              </div>
            </div>

            <SuccessDialog
              open={showMetaModal}
              title="Metadata pinned & validated"
              description="Copy your references. Continue to deployment."
              items={[
                { label: "Metadata CID", value: metaCid, display: metaCid, href: metaCid ? `https://ipfs.io/ipfs/${metaCid}` : undefined },
                { label: "tokenURI (ipfs)", value: tokenUri, display: tokenUri, href: tokenUri ? toHttp(tokenUri) : undefined },
                { label: "Preview", value: metaPreview, display: metaPreview, href: toHttp(metaPreview) },
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
              {usdLine && <div className="mt-1 text-xs text-muted-foreground">{usdLine}</div>}
              <div className="mt-1 text-[11px] text-muted-foreground">
                <span className="opacity-70">Raw:</span>{" "}
                <code className="break-all">{toPlainIntegerWeiString(feeAmountWei)} wei</code>
              </div>
            </div>

            <div className="grid gap-6">
              <div className="space-y-2">
                <Label>Royalty recipient</Label>
                <Input
                  placeholder="Leave blank to use the connected wallet"
                  value={royaltyRecipientAddr}
                  onChange={(e) => setRoyaltyRecipientAddr(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button onClick={deploy} disabled={deploying}>
                {deploying ? "Deploying…" : "Deploy Single"}
              </Button>
              <p className="text-xs text-muted-foreground">
                You’ll sign a transaction that pays the one-time deployment fee to the marketplace.
              </p>
            </div>

            <SingleDeploySuccessModal
              open={deployOpen}
              name={name}
              mediaUrl={isVideoMime(assetMime) ? undefined : toHttp(assetUri)}
              contract={deployed.contract}
              txHash={deployed.tx}
              tokenId={1}
              onViewNft={() => {
                setDeployOpen(false);
                if (deployed.contract) {
                  window.location.href = `/collections/${deployed.contract}/1`;
                }
              }}
              onOpenContract={() => {
                const url = `https://blockexplorer.electroneum.com/address/${deployed.contract}`;
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
