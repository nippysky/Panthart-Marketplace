"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MoveLeft, MoveRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useLoaderStore } from "@/lib/store/loader-store";
import { SuccessDialog } from "./success-dialog";
import ConfigForm from "../form-config";
import {
  ensureChain,
  getBrowserSigner,
  getFactoryAddress,
  getRequiredChainId,
  percentToBps,
} from "@/lib/chain/client";
import { NFT_FACTORY_ABI } from "@/lib/abis/NFTFactoryABI";
import { ethers } from "ethers";
import { prettyEthersError } from "@/lib/chain/errors";
import DeploySuccessModal from "./deploy-success-modal";

/**
 * ENV (frontend)
 * NEXT_PUBLIC_UPLOAD_BASE is the VM origin, e.g. https://ops.panth.art  (no trailing slash)
 */
const UPLOAD_BASE = process.env.NEXT_PUBLIC_UPLOAD_BASE ?? ""; // required for uploads
const MAX_ASSETS_BYTES = 2 * 1024 * 1024 * 1024; // 2GB
const MAX_METADATA_BYTES = 385 * 1024 * 1024; // 385MB

type Mode = "upload" | "external";

type InitResponse = {
  jobId: string;
  token?: string;
  expiresIn?: number | null;
};

type DeploySuccessInfo = {
  name: string;
  logoUrl?: string;
  contract: string;
  txHash?: string; // include tx hash for explorer link when address is not parsed yet
};

export default function DropWizard() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialMode = (sp.get("mode") as Mode | null) ?? null;

  const [mode, setMode] = useState<Mode | null>(initialMode);
  const [step, setStep] = useState<number>(0);

  // session from /api/uploads/init
  const [jobId, setJobId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);

  // Upload results
  const [assetsCid, setAssetsCid] = useState<string | null>(null);
  const [metadataCid, setMetadataCid] = useState<string | null>(null);
  const [finalBaseUri, setFinalBaseUri] = useState<string>("");

  // Detected count (prefer metadata count; fall back to assets)
  const [detectedSupply, setDetectedSupply] = useState<number | null>(null);

  // Success modals (guided flow)
  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [showMetadataModal, setShowMetadataModal] = useState(false);

  // Post-deploy success modal
  const [deploySuccessOpen, setDeploySuccessOpen] = useState(false);
  const [deploySuccess, setDeploySuccess] = useState<DeploySuccessInfo | null>(null);

  const { show, hide } = useLoaderStore();

  function goSelect(next: Mode) {
    setMode(next);
    setStep(next === "upload" ? 1 : 3);

    // Reflect mode in URL for refresh/share
    const url = new URL(window.location.href);
    url.searchParams.set("mode", next);
    router.push(url.toString());

    // UX: if user chose "Upload", proactively init the upload session
    if (next === "upload") {
      // fire & forget; handlers also await ensureSession() before using it
      ensureSession().catch(() => {});
    }
  }

  /**
   * Ensure a live upload session exists.
   * - Returns the current/created {jobId, token} immediately to avoid races with setState.
   * - Also sets component state so subsequent calls can skip the fetch.
   */
  async function ensureSession(): Promise<{ jobId: string; token?: string | null }> {
    if (jobId && token !== undefined) return { jobId, token };
    try {
      const res = await fetch("/api/uploads/init", { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as InitResponse;
      if (!json?.jobId) throw new Error("Failed to start upload session");
      setJobId(json.jobId);
      setToken(json.token ?? null);
      return { jobId: json.jobId, token: json.token ?? null };
    } catch (err: any) {
      toast.error(err?.message || "Could not initialize upload session");
      throw err;
    }
  }

  /** XHR upload (so we get progress events) */
  function uploadWithProgress(
    url: string,
    form: FormData,
    headers: Record<string, string>,
    onProgress: (pct: number) => void
  ) {
    return new Promise<any>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", url);

      Object.entries(headers).forEach(([k, v]) => {
        if (v) xhr.setRequestHeader(k, v);
      });

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) onProgress((evt.loaded / evt.total) * 100);
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
      xhr.timeout = 1000 * 60 * 30; // 30 minutes
      xhr.send(form);
    });
  }

  // --- Prefetch upload session on mount if the URL already had ?mode=upload
  useEffect(() => {
    if (initialMode === "upload") {
      ensureSession().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Also make sure session exists whenever user is on step 1 or 2 of upload mode
  useEffect(() => {
    if (mode === "upload" && (step === 1 || step === 2)) {
      ensureSession().catch(() => {});
    }
  }, [mode, step]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deploy a new ERC721 drop
  async function deploy(payload: any) {
    const FACTORY_ADDRESS = getFactoryAddress();
    const REQUIRED_CHAIN_ID = getRequiredChainId();

    try {
      // 1) Fee snapshot (DB)
      show("Preparing deployment…");
      const feeRes = await fetch("/api/fees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractType: "ERC721_DROP",
          metadataOption: payload.metadataOption, // "UPLOAD" | "EXTERNAL"
        }),
      });
      if (!feeRes.ok) {
        const er = await feeRes.json().catch(() => ({}));
        throw new Error(er?.error || "Failed to fetch fee config");
      }
      const feeJson = (await feeRes.json()) as {
        feeRecipient: string;
        feeAmountEtnWei: string;
      };
      const feeRecipient = feeJson.feeRecipient;
      const feeAmount = BigInt(feeJson.feeAmountEtnWei);

      // 2) Wallet + chain
      show("Connecting wallet…");
      await ensureChain(REQUIRED_CHAIN_ID);
      const signer = await getBrowserSigner();
      const provider = signer.provider as ethers.BrowserProvider;
      const from = await signer.getAddress();

      // 3) Build args for factory call
      show("Validating configuration…");
      const royaltyBps = percentToBps(Number(payload.royaltyPercent || 0));
      const baseURI = String(payload.baseURI || "").replace(/\/+$/, "");

      if (!baseURI.startsWith("ipfs://")) {
        throw new Error("Base URI must start with ipfs://<CID>");
      }

      const cfg = {
        name: payload.name,
        symbol: payload.symbol,
        baseURI,
        maxSupply: BigInt(payload.totalSupply),
        feeRecipient,
        feeAmount,
        royaltyRecipient: payload.royaltyRecipient,
        royaltyBps,
        // Defensive: set a non-zero initial owner (factory also uses msg.sender)
        initialOwner: from,
      };

      // Include maxPerTx (new contract)
      const pubConfig = {
        startTimestamp: BigInt(Math.floor(new Date(payload.publicStartISO).getTime() / 1000)),
        price: BigInt(payload.publicPriceWei),
        maxPerWallet: BigInt(payload.maxPerWallet),
        maxPerTx: BigInt(payload.maxPerTx),
      };

      const presaleEnabled = !!payload.presale;
      const presaleConfig = presaleEnabled
        ? {
            startTimestamp: BigInt(Math.floor(new Date(payload.presale.startISO).getTime() / 1000)),
            endTimestamp: BigInt(Math.floor(new Date(payload.presale.endISO).getTime() / 1000)),
            price: BigInt(payload.presale.priceWei),
            maxSupply: BigInt(payload.presale.maxSupply),
            merkleRoot: payload.presale.merkleRoot as `0x${string}`,
          }
        : {
            startTimestamp: 0n,
            endTimestamp: 0n,
            price: 0n,
            maxSupply: 0n,
            merkleRoot:
              "0x0000000000000000000000000000000000000000000000000000000000000000" as const,
          };

      const factory = new ethers.Contract(FACTORY_ADDRESS, NFT_FACTORY_ABI, signer);

      // 4) Sanity checks: factory + impl are deployed
      show("Checking factory…");
      const [factoryCode, impl721] = await Promise.all([
        provider.getCode(FACTORY_ADDRESS),
        factory.erc721DropImpl(),
      ]);
      if (!factoryCode || factoryCode === "0x") {
        throw new Error("Factory address has no code. Check FACTORY_ADDRESS env.");
      }
      const implCode = await provider.getCode(impl721);
      if (!ethers.isAddress(impl721) || implCode === "0x") {
        throw new Error("Factory misconfigured: erc721DropImpl is not a contract.");
      }

      // 5) Balance check (ETN must cover platform fee + gas)
      show("Checking balance…");
      const [bal, feeData] = await Promise.all([
        provider.getBalance(from),
        provider.getFeeData().catch(() => null),
      ]);
      const gasPriceWei = feeData?.gasPrice ?? feeData?.maxFeePerGas ?? 1n;
      const gasBuffer = 300_000n;
      const minNeeded = feeAmount + gasBuffer * gasPriceWei;
      if (bal < minNeeded) {
        hide();
        throw new Error(
          `Insufficient ETN for fee + gas. Need ≈ ${(Number(minNeeded) / 1e18).toFixed(3)} ETN.`
        );
      }

      // 6) Best-effort simulation — now treated as a blocker for better UX
      show("Simulating…");
      try {
        await factory.createERC721Drop.staticCall(cfg, pubConfig, presaleConfig, {
          value: feeAmount,
        });
      } catch (err: any) {
        const msg = prettyEthersError(err);
        hide();
        toast.error(msg || "Simulation failed. Check fee amount, base URI, or owner.");
        throw err; // stop here
      }

      // 7) Gas estimate with fallback
      show("Estimating gas…");
      let overrides: any = { value: feeAmount };
      try {
        const est: bigint = await factory.createERC721Drop.estimateGas(
          cfg,
          pubConfig,
          presaleConfig,
          { value: feeAmount }
        );
        overrides.gasLimit = (est * 120n) / 100n; // +20%
      } catch {
        overrides.gasLimit = 1_800_000n; // safe ceiling
      }

      // 8) Send tx
      show("Awaiting your wallet approval…");
      const tx = await factory.createERC721Drop(cfg, pubConfig, presaleConfig, overrides);

      show("Transaction submitted. Waiting for confirmation…");
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        hide();
        throw new Error("Deployment failed on-chain.");
      }

      // 9) Parse event → cloneAddress
      let cloneAddress: string | null = null;
      const iface = new ethers.Interface(NFT_FACTORY_ABI as any);
      for (const log of receipt.logs ?? []) {
        if (log.address.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()) continue;
        try {
          const parsed = iface.parseLog(log);
          if (parsed?.name === "ERC721DropCloneCreated") {
            cloneAddress = parsed.args?.[1] as string;
            break;
          }
        } catch {}
      }

      // 10) Persist to DB
      show("Finalizing on server…");
      const post = await fetch("/api/drop/postdeploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          txHash: receipt.hash,
          payload,
        }),
      });
      if (!post.ok) {
        hide();
        const err = await post.json().catch(() => ({}));
        throw new Error(err?.error || "Server failed to finalize");
      }
      const done = await post.json();

      // 11) Success — show rich modal
      hide();
      const finalAddress: string = cloneAddress ?? done?.cloneAddress ?? "";
      if (!finalAddress) {
        toast.success("Deployment complete");
      }

      setDeploySuccess({
        name: payload.name,
        logoUrl: payload.logoUrl,
        contract: finalAddress,
        txHash: receipt.hash,
      });
      setDeploySuccessOpen(true);
    } catch (e: any) {
      hide();
      const msg =
        prettyEthersError(e) ||
        (e?.shortMessage || e?.reason || e?.message) ||
        (e?.receipt?.status === 0 ? "Transaction reverted (status 0)." : null) ||
        "Transaction failed.";
      toast.error(msg);
      console.error("createERC721Drop failed:", e);
    }
  }

  // --- Render ---

  if (mode === null) {
    return (
      <div className="w-full">
        <div className="text-center mb-8">
          <h1 className="text-2xl md:text-3xl font-semibold">Create</h1>
          <p className="text-sm text-muted-foreground mt-2">
            Pick how you want to supply metadata for your ERC-721 drop.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-4">
          <Card className="cursor-pointer hover:shadow-md transition" onClick={() => goSelect("upload")}>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-semibold text-lg">Upload via Panth.art</h2>
                <p className="text-sm text-muted-foreground">
                  Upload a ZIP of assets (≤ 2 GB) and a ZIP of metadata (≤ 385 MB). We’ll pin to IPFS and return a Base URI.
                </p>
              </div>
              <MoveRight />
            </CardContent>
          </Card>

          <Card className="cursor-pointer hover:shadow-md transition" onClick={() => goSelect("external")}>
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="font-semibold text-lg">Use External Base URI</h2>
                <p className="text-sm text-muted-foreground">
                  Provide a Base URI you manage (ipfs://CID or HTTPS). We’ll deploy using it directly.
                </p>
              </div>
              <MoveRight />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // External mode (mount modal here too)
  if (mode === "external") {
    return (
      <>
        <ConfigForm
          mode="external"
          onBack={() => {
            setMode(null);
            setStep(0);
          }}
          onDeploy={deploy}
          detectedSupply={detectedSupply ?? undefined}
        />

        <DeploySuccessModal
          open={deploySuccessOpen}
          name={deploySuccess?.name ?? ""}
          logoUrl={deploySuccess?.logoUrl}
          contract={deploySuccess?.contract ?? ""}
          txHash={deploySuccess?.txHash}
          onViewCollection={() => {
            if (deploySuccess?.contract) {
              setDeploySuccessOpen(false);
              router.push(`/collections/${deploySuccess.contract}`);
            }
          }}
          onGoToCollections={() => {
            setDeploySuccessOpen(false);
            router.push(`/collections`);
          }}
          onClose={() => setDeploySuccessOpen(false)}
        />
      </>
    );
  }

  // mode === "upload": Step 1 -> assets, Step 2 -> metadata, Step 3 -> config
  return (
    <div className="w-full">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 px-0"
          onClick={() => {
            if (step === 1) {
              setMode(null);
              setStep(0);
            } else {
              setStep(step - 1);
            }
          }}
        >
          <MoveLeft className="w-4 h-4" /> Back
        </Button>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-2xl md:text-3xl font-semibold">Create</h1>
        <p className="text-sm text-muted-foreground mt-2">
          Step {step} of 3 — {step === 1 ? "Upload Assets" : step === 2 ? "Upload Metadata" : "Configure & Deploy"}
        </p>
      </div>

      {step === 1 && (
        <UploadPanel
          title="Upload Assets (.zip, ≤ 2 GB)"
          note="ZIP should contain your images/GIFs/webp/svg/light MP4s."
          accept=".zip,application/zip,application/x-zip-compressed,application/x-zip"
          maxBytes={MAX_ASSETS_BYTES}
          disabled={false}
          onUpload={async (file, onProgress) => {
            if (!UPLOAD_BASE) {
              toast.error("NEXT_PUBLIC_UPLOAD_BASE not configured");
              return null;
            }

            // Make sure a session exists and use the *returned* ids to avoid races
            const sess = await ensureSession();
            const jid = sess.jobId;
            const jwt = sess.token;

            const form = new FormData();
            form.append("kind", "assets");
            form.append("file", file);

            const headers: Record<string, string> = { "x-job-id": jid };
            if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

            const json = await uploadWithProgress(`${UPLOAD_BASE}/upload/assets`, form, headers, onProgress);

            // normalize optional count the server might return
            const raw = json?.count ?? json?.itemCount ?? json?.items ?? json?.total;
            const n = typeof raw === "number" ? raw : Number(raw);
            const itemCount = Number.isFinite(n) && n > 0 ? Number(n) : undefined;

            const result =
              json?.cid
                ? itemCount !== undefined
                  ? { cid: String(json.cid), itemCount }
                  : { cid: String(json.cid) }
                : null;

            return result;
          }}
          onDone={(res) => {
            if (res?.cid) {
              setAssetsCid(res.cid);
              if (typeof (res as any)?.itemCount === "number") {
                setDetectedSupply((res as any).itemCount);
              }
              setShowAssetsModal(true);
            }
          }}
        />
      )}

      {step === 2 && (
        <UploadPanel
          title="Upload Metadata (.zip, ≤ 385 MB)"
          note="ZIP must contain `{tokenId}.json` files. We’ll rewrite `image` to the correct ipfs:// path."
          accept=".zip,application/zip,application/x-zip-compressed,application/x-zip"
          maxBytes={MAX_METADATA_BYTES}
          disabled={!assetsCid}
          extraDisabledNote={!assetsCid ? "Upload assets first to continue." : undefined}
          onUpload={async (file, onProgress) => {
            if (!assetsCid) {
              toast.error("Upload assets first.");
              return null;
            }
            if (!UPLOAD_BASE) {
              toast.error("NEXT_PUBLIC_UPLOAD_BASE not configured");
              return null;
            }

            // Ensure/obtain session values on demand
            const sess = await ensureSession();
            const jid = sess.jobId;
            const jwt = sess.token;

            const form = new FormData();
            form.append("kind", "metadata");
            form.append("file", file);

            const headers: Record<string, string> = {
              "x-job-id": jid,
              "x-assets-cid": assetsCid,
            };
            if (jwt) headers["Authorization"] = `Bearer ${jwt}`;

            const json = await uploadWithProgress(`${UPLOAD_BASE}/upload/metadata`, form, headers, onProgress);

            const raw = json?.count ?? json?.itemCount ?? json?.items ?? json?.total;
            const n = typeof raw === "number" ? raw : Number(raw);
            const itemCount = Number.isFinite(n) && n > 0 ? Number(n) : undefined;

            if (json?.cid && json?.baseUri) {
              return itemCount !== undefined
                ? { cid: String(json.cid), baseUri: String(json.baseUri), itemCount }
                : { cid: String(json.cid), baseUri: String(json.baseUri) };
            }
            return null;
          }}
          onDone={(res) => {
            if ((res as any)?.itemCount) {
              setDetectedSupply((res as any).itemCount);
            }
            if ((res as any)?.cid && (res as any)?.baseUri) {
              setMetadataCid((res as any).cid);
              setFinalBaseUri((res as any).baseUri);
              setShowMetadataModal(true);
            }
          }}
        />
      )}

      {step === 3 && (
        <ConfigForm
          mode="upload"
          baseUriFromUploads={finalBaseUri}
          detectedSupply={detectedSupply ?? undefined}
          onBack={() => setStep(2)}
          onDeploy={deploy}
        />
      )}

      {/* Guided success modals for uploads */}
      <SuccessDialog
        open={showAssetsModal}
        title="Assets uploaded & pinned"
        description="Copy the CID for your records."
        items={[
          {
            label: "Assets CID",
            value: assetsCid ?? "",
            display: assetsCid ?? "",
            href: assetsCid ? `https://ipfs.io/ipfs/${assetsCid}` : undefined,
          },
          ...(detectedSupply
            ? [
                {
                  label: "Detected items",
                  value: String(detectedSupply),
                  display: String(detectedSupply),
                } as const,
              ]
            : []),
        ]}
        proceedLabel="Proceed to Metadata"
        onProceed={() => {
          setShowAssetsModal(false);
          setStep(2);
        }}
      />

      <SuccessDialog
        open={showMetadataModal}
        title="Metadata uploaded & validated"
        description="Copy your references. Next, complete collection details."
        items={[
          {
            label: "Metadata CID",
            value: metadataCid ?? "",
            display: metadataCid ?? "",
            href: metadataCid ? `https://ipfs.io/ipfs/${metadataCid}` : undefined,
          },
          {
            label: "Base URI",
            value: finalBaseUri,
            display: finalBaseUri,
            href: metadataCid ? `https://ipfs.io/ipfs/${metadataCid}` : undefined,
          },
          ...(detectedSupply
            ? [
                {
                  label: "Detected items",
                  value: String(detectedSupply),
                  display: String(detectedSupply),
                } as const,
              ]
            : []),
        ]}
        proceedLabel="Proceed to Collection Details"
        onProceed={() => {
          setShowMetadataModal(false);
          setStep(3);
        }}
      />

      {/* Post-deploy success modal */}
      <DeploySuccessModal
        open={deploySuccessOpen}
        name={deploySuccess?.name ?? ""}
        logoUrl={deploySuccess?.logoUrl}
        contract={deploySuccess?.contract ?? ""}
        txHash={deploySuccess?.txHash}
        onViewCollection={() => {
          if (deploySuccess?.contract) {
            setDeploySuccessOpen(false);
            router.push(`/collections/${deploySuccess.contract}`);
          }
        }}
        onGoToCollections={() => {
          setDeploySuccessOpen(false);
          router.push(`/collections`);
        }}
        onClose={() => setDeploySuccessOpen(false)}
      />
    </div>
  );
}

/** Reusable, fully-clickable upload panel with drag & drop + progress + retry */
function UploadPanel(props: {
  title: string;
  note?: string;
  accept: string; // extensions and/or MIME types
  maxBytes: number;
  disabled: boolean;
  extraDisabledNote?: string;
  onUpload: (file: File, onProgress: (pct: number) => void) => Promise<{ cid: string; baseUri?: string; itemCount?: number } | null>;
  onDone: (result: { cid: string; baseUri?: string; itemCount?: number } | null) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [sizeErr, setSizeErr] = useState<string | null>(null);
  const [typeErr, setTypeErr] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readableMax = useMemo(() => {
    const gb = props.maxBytes / (1024 * 1024 * 1024);
    const mb = props.maxBytes / (1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(0)} GB` : `${mb.toFixed(0)} MB`;
  }, [props.maxBytes]);

  const acceptLabel = useMemo(() => {
    const parts = props.accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const hasZip = parts.some((p) => p.includes(".zip"));
    const hasJson = parts.some((p) => p.includes(".json"));
    if (hasZip && hasJson) return ".json or .zip";
    if (hasZip) return ".zip";
    if (hasJson) return ".json";
    return parts.join(", ");
  }, [props.accept]);

  function validate(f: File): boolean {
    if (f.size > props.maxBytes) {
      setSizeErr(`File too large. Max allowed: ${readableMax}.`);
      return false;
    }

    const allowed = props.accept
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    const ext = `.${(f.name.split(".").pop() || "").toLowerCase()}`;
    const mime = (f.type || "").toLowerCase();

    const ok =
      allowed.includes(ext) ||
      allowed.includes(mime) ||
      allowed.some((a) => a.endsWith("/*") && mime.startsWith(a.slice(0, -2)));

    if (!ok) {
      setTypeErr(`Invalid file type. Allowed: ${acceptLabel}`);
      return false;
    }

    setSizeErr(null);
    setTypeErr(null);
    return true;
  }

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!validate(f)) {
      e.currentTarget.value = "";
      setFile(null);
      return;
    }
    setFile(f);
  }

  function reset() {
    setFile(null);
    setSizeErr(null);
    setTypeErr(null);
    setProgress(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  // simple retry with backoff: 3 tries, 0.5s, 1s, 2s
  async function startUpload() {
    if (!file) return;
    setBusy(true);
    setProgress(0);
    const tries = 3;
    let lastErr: any;
    for (let i = 0; i < tries; i++) {
      try {
        const res = await props.onUpload(file, (p) => setProgress(p));
        props.onDone(res);
        setBusy(false);
        return;
      } catch (e: any) {
        lastErr = e;
        if (i < tries - 1) {
          await new Promise((r) => setTimeout(r, 500 * Math.pow(2, i)));
          setProgress(0);
          continue;
        }
      }
    }
    setBusy(false);
    toast.error(lastErr?.message || "Upload failed");
    props.onDone(null);
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (props.disabled || busy) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!validate(f)) return;
    setFile(f);
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6 text-center">
        <h2 className="text-xl font-semibold">{props.title}</h2>
        {props.note && <p className="text-sm text-muted-foreground mt-1">{props.note}</p>}
      </div>

      <div className="text-sm text-muted-foreground mb-2">
        Accepted: <span className="font-medium">{acceptLabel}</span> (max {readableMax})
      </div>

      <div
        className={`relative rounded-lg border border-dashed p-6 bg-muted/10 transition-colors ${
          props.disabled ? "opacity-60 pointer-events-none" : "hover:border-[#3a3a3a] border-[#2a2a2a] cursor-pointer"
        }`}
        role="button"
        aria-label="File upload dropzone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        <div className="pointer-events-none flex flex-col items-center justify-center gap-2 py-10">
          <div className="text-sm font-medium">Click to choose a file or drag & drop</div>
          <div className="text-xs opacity-70">
            {file ? `${file.name} • ${(file.size / (1024 * 1024)).toFixed(1)} MB` : "No file selected"}
          </div>
        </div>

        <input
          ref={inputRef}
          type="file"
          accept={props.accept}
          className="absolute inset-0 w-full h-full opacity-0"
          style={{ pointerEvents: "none" }}
          onChange={pick}
          tabIndex={-1}
          aria-hidden
        />
      </div>

      {sizeErr && <p className="text-sm text-red-500 mt-2">{sizeErr}</p>}
      {typeErr && <p className="text-sm text-red-500 mt-2">{typeErr}</p>}

      {file && (
        <div className="mt-4 space-y-3">
          <Progress value={progress} className="h-2" />
          <div className="text-xs text-muted-foreground">{progress.toFixed(0)}%</div>

          <div className="flex gap-2">
            <Button onClick={startUpload} disabled={busy}>
              {busy ? "Uploading…" : "Start Upload"}
            </Button>
            <Button variant="outline" onClick={reset} disabled={busy}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {props.disabled && props.extraDisabledNote && (
        <p className="text-sm text-muted-foreground mt-4">{props.extraDisabledNote}</p>
      )}
    </div>
  );
}
