// components/admin/AdminReconcileDeployClient.tsx
"use client";

import * as React from "react";
import { useActiveAccount } from "thirdweb/react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ConnectWallet from "@/components/shared/connect-wallet";
import LoaderModal from "@/components/shared/loader-modal";
import { useLoaderStore } from "@/lib/store/loader-store";

import { ShieldAlert } from "lucide-react";

type Props = {
  allowedWallets: string[];
};

type ApiPreviewOk = {
  ok: false;
  preview: true;
  kind?: "ERC1155_SINGLE" | "ERC721_SINGLE";
  derived?: Record<string, any>;
  missing?: string[];
  hint?: string;
};

type ApiWriteOk = {
  ok: true;
  kind: "ERC1155_SINGLE" | "ERC721_SINGLE";
  contract: string;
  singleId: string;
  nftId: string;
  tokenUri: string;
};

type ApiErr = { error: string; [k: string]: any };

function isAllowed(allowed: string[], addr?: string | null) {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return allowed.map((w) => w.toLowerCase()).includes(a);
}

function short(addr?: string | null) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AdminReconcileDeployClient({ allowedWallets }: Props) {
  const account = useActiveAccount();
  const connected = Boolean(account?.address);
  const permitted = isAllowed(allowedWallets, account?.address);

  const { show, hide } = useLoaderStore();

  const [txHash, setTxHash] = React.useState("");
  const [factory, setFactory] = React.useState("");
  const [loading, setLoading] = React.useState<"idle" | "preview" | "write">("idle");
  const [preview, setPreview] = React.useState<ApiPreviewOk | null>(null);
  const [result, setResult] = React.useState<ApiWriteOk | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const callApi = async (body: any) => {
    const res = await fetch("/api/admin/reconcile-deploy", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(account?.address ? { "x-admin-wallet": account.address } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Request failed");
    return json;
  };

  const doPreview = async () => {
    setError(null);
    setResult(null);
    setPreview(null);

    if (!txHash.trim()) {
      setError("Please enter a transaction hash.");
      return;
    }

    setLoading("preview");
    show("Previewing…");
    try {
      const data: ApiPreviewOk | ApiErr = await callApi({
        txHash: txHash.trim(),
        preview: true,
        ...(factory.trim() ? { factoryAddress: factory.trim() } : {}),
      });
      if ("preview" in data && data.preview === true) {
        setPreview(data as ApiPreviewOk);
        toast.success("Preview OK");
      } else {
        // if API decides everything is derivable already
        setPreview({
          ok: false,
          preview: true,
          hint: "Looks good. You can proceed to Write.",
        });
        toast.success("Preview OK");
      }
    } catch (e: any) {
      setError(e?.message || "Preview error");
      toast.error(e?.message || "Preview error");
    } finally {
      hide();
      setLoading("idle");
    }
  };

  const doWrite = async () => {
    setError(null);
    setResult(null);

    if (!txHash.trim()) {
      setError("Please enter a transaction hash.");
      return;
    }

    setLoading("write");
    show("Reconciling & writing…");
    try {
      const data: ApiWriteOk | ApiErr = await callApi({
        txHash: txHash.trim(),
        ...(factory.trim() ? { factoryAddress: factory.trim() } : {}),
      });
      if ("ok" in data && data.ok === true) {
        setResult(data as ApiWriteOk);
        toast.success("Reconcile write complete");
      } else {
        // safety: if API sent preview again, surface it
        setPreview(data as any);
        toast.message("Preview returned, please review");
      }
    } catch (e: any) {
      setError(e?.message || "Write error");
      toast.error(e?.message || "Write error");
    } finally {
      hide();
      setLoading("idle");
    }
  };

  // ── Gates ────────────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="border rounded-lg p-10 text-center flex flex-col items-center gap-5">
        <LoaderModal />
        <p className="text-muted-foreground">Connect your wallet to access this admin tool.</p>
        <ConnectWallet />
      </div>
    );
  }

  if (!permitted) {
    return (
      <div className="border rounded-lg p-10 text-center flex flex-col items-center gap-5">
        <LoaderModal />
        <ShieldAlert className="w-8 h-8 text-yellow-500" />
        <p className="text-lg font-medium">Access Denied</p>
        <p className="text-muted-foreground">
          The connected wallet <span className="font-mono">{short(account?.address)}</span> is not
          allowed to use this tool.
        </p>
        <ConnectWallet />
      </div>
    );
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <>
      <LoaderModal />

      {/* Top-right persistent Thirdweb chip */}
      <div className="flex justify-end mb-4">
        <ConnectWallet />
      </div>

      <div className="space-y-6">
        {/* Inputs */}
        <div className="grid grid-cols-1 gap-4">
          <label className="block">
            <span className="text-sm font-medium">Transaction hash</span>
            <Input
              className="mt-1"
              placeholder="0x..."
              value={txHash}
              onChange={(e) => setTxHash(e.target.value)}
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium">
              Factory address <span className="text-xs text-muted-foreground">(optional)</span>
            </span>
            <Input
              className="mt-1"
              placeholder="0x... (speeds up detection)"
              value={factory}
              onChange={(e) => setFactory(e.target.value)}
            />
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Button
            onClick={doPreview}
            disabled={loading !== "idle"}
            variant="outline"
          >
            {loading === "preview" ? "Previewing…" : "Preview"}
          </Button>
          <Button
            onClick={doWrite}
            disabled={loading !== "idle"}
          >
            {loading === "write" ? "Writing…" : "Write to DB"}
          </Button>
        </div>

        {/* Errors */}
        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div className="rounded-md border p-4">
            <div className="mb-2 text-sm font-semibold">Preview</div>
            {preview.kind && (
              <div className="text-xs mb-2">
                Kind: <span className="font-mono">{preview.kind}</span>
              </div>
            )}
            {preview.derived && (
              <pre className="mt-2 overflow-auto rounded bg-muted p-3 text-xs">
{JSON.stringify(preview.derived, null, 2)}
              </pre>
            )}
            {preview.missing?.length ? (
              <div className="mt-3 text-xs">
                <div className="font-medium mb-1">Missing fields:</div>
                <ul className="list-disc pl-5">
                  {preview.missing.map((m) => (
                    <li key={m} className="font-mono">{m}</li>
                  ))}
                </ul>
                <div className="mt-2 text-muted-foreground">
                  {preview.hint || "Some fields could not be derived; contract may not expose standard getters."}
                </div>
              </div>
            ) : (
              preview.hint && <div className="mt-3 text-xs text-muted-foreground">{preview.hint}</div>
            )}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-md border p-4">
            <div className="mb-2 text-sm font-semibold">Write Result</div>
            <div className="text-xs grid gap-1">
              <div>
                Kind: <span className="font-mono">{result.kind}</span>
              </div>
              <div className="truncate">
                Contract: <span className="font-mono">{result.contract}</span>
              </div>
              <div className="truncate">
                Single ID: <span className="font-mono">{result.singleId}</span>
              </div>
              <div className="truncate">
                NFT ID: <span className="font-mono">{result.nftId}</span>
              </div>
              <div className="truncate">
                Token URI: <span className="font-mono">{result.tokenUri}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
