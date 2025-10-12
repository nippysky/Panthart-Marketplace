// components/admin/stolen/ReportedQueue.tsx
"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AddressChip from "@/components/common/AddressChip";
import { toast } from "sonner";
import { ethers } from "ethers";
import { getAddress } from "viem";
import { getBrowserSigner, ZERO_ADDRESS } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const EXPLORER = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || "";
const REGISTRY = process.env.NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS as `0x${string}`;
const MULTISIG = process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS as `0x${string}`;

export type ReportRow = {
  id: string;
  contract: string;
  tokenId: string;
  reporterAddress: string | null;
  reporterUserId: string | null;
  evidenceUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  onChainActive: boolean;
};

function reasonHashFrom(id: string) {
  // deterministic, short & auditable
  return ethers.id(`USER_REPORT:${id}`) as `0x${string}`;
}

export default function ReportedQueue({ allowedWallets }: { allowedWallets: string[] }) {
  const [rows, setRows] = React.useState<ReportRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/governance/stolen/reports").then((r) => r.json());
      if (res?.ok) setRows(res.data || []);
      else toast.error(res?.error || "Failed to load reports");
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const guard = async () => {
    const { signer, chainId } = await getBrowserSigner();
    const wallet = (await signer.getAddress()).toLowerCase();
    if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
      throw new Error("This wallet is not in the allowed admin list.");
    }
    if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");
    return signer;
  };

  const proposeFlag = async (r: ReportRow) => {
    try {
      const signer = await guard();
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("flag", [
        getAddress(r.contract),
        BigInt(r.tokenId),
        reasonHashFrom(r.id),
        r.evidenceUrl || "",
      ]);

      const ms = new ethers.Contract(MULTISIG, MULTI_SIG_ABI as any, signer);
      const resp = await ms.submitAndConfirm(ZERO_ADDRESS, REGISTRY, 0n, data);
      toast.message("Submitting on-chain flag proposal…");
      await resp.wait();
      toast.success("Flag proposal submitted (and confirmed by you).");
      load();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  const proposeClear = async (r: ReportRow) => {
    try {
      const signer = await guard();
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("clear", [getAddress(r.contract), BigInt(r.tokenId)]);

      const ms = new ethers.Contract(MULTISIG, MULTI_SIG_ABI as any, signer);
      const resp = await ms.submitAndConfirm(ZERO_ADDRESS, REGISTRY, 0n, data);
      toast.message("Submitting on-chain clear proposal…");
      await resp.wait();
      toast.success("Clear proposal submitted (and confirmed by you).");
      load();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium">Reported Queue (users)</h3>
        <Button variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[340px]">NFT</TableHead>
              <TableHead>Reporter</TableHead>
              <TableHead>Evidence</TableHead>
              <TableHead>On-chain</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-6 text-muted-foreground">
                  No user reports found.
                </TableCell>
              </TableRow>
            )}

            {rows.map((r) => {
              const nftLink = EXPLORER
                ? `${EXPLORER}/token/${r.contract}?a=${r.tokenId}`
                : undefined;
              const contractLink = EXPLORER ? `${EXPLORER}/address/${r.contract}` : undefined;

              return (
                <TableRow key={r.id} className="align-top">
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        {contractLink ? (
                          <a className="underline" href={contractLink} target="_blank" rel="noreferrer">
                            <AddressChip address={r.contract} showCopy />
                          </a>
                        ) : (
                          <AddressChip address={r.contract} showCopy />
                        )}
                        <span className="text-xs text-muted-foreground">#{r.tokenId}</span>
                      </div>
                      {nftLink && (
                        <a
                          href={nftLink}
                          className="text-xs underline text-muted-foreground"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View token
                        </a>
                      )}
                    </div>
                  </TableCell>

                  <TableCell>
                    {r.reporterAddress ? (
                      <AddressChip address={r.reporterAddress} />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                    {r.notes && (
                      <div className="text-xs text-muted-foreground mt-1 max-w-xs break-words">
                        {r.notes}
                      </div>
                    )}
                  </TableCell>

                  <TableCell>
                    {r.evidenceUrl ? (
                      <a className="underline break-all" href={r.evidenceUrl} target="_blank" rel="noreferrer">
                        {r.evidenceUrl}
                      </a>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>

                  <TableCell>{r.onChainActive ? "Yes" : "No"}</TableCell>

                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => proposeClear(r)}
                        title="Propose clear on-chain"
                        disabled={!r.onChainActive}
                      >
                        Propose Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => proposeFlag(r)}
                        title="Propose flag on-chain"
                        disabled={r.onChainActive}
                      >
                        Propose Flag
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {loading && <div className="text-sm text-muted-foreground mt-3">Loading…</div>}
      </div>
    </Card>
  );
}
