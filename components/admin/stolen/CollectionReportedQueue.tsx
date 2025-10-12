"use client";

import * as React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import AddressChip from "@/components/common/AddressChip";
import { toast } from "sonner";
import { ethers } from "ethers";
import { getAddress } from "viem";
import { getBrowserSigner, ZERO_ADDRESS } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";
// shadcn table
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const EXPLORER = process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || "";
const REGISTRY = process.env.NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS as `0x${string}`;
const MULTISIG = process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS as `0x${string}`;

type Row = {
  contract: string;
  itemsReported: number;
  latestReportedAt: string | null;
  name: string | null;
  symbol: string | null;
  logoUrl: string | null;
  onChainActive: boolean;
  evidenceUrl: string | null;
  notes: string | null;
};

function reasonHashFromCollection(contract: string): `0x${string}` {
  // deterministic, auditable anchor for collection-level reports
  return ethers.id(`USER_REPORT_COLLECTION:${contract.toLowerCase()}`) as `0x${string}`;
}

export default function CollectionReportedQueue({ allowedWallets }: { allowedWallets: string[] }) {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/governance/stolen/reports/collections").then((r) => r.json());
      if (res?.ok) setRows(res.data || []);
      else toast.error(res?.error || "Failed to load collection reports");
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

  const proposeFlagCollection = async (r: Row) => {
    try {
      const signer = await guard();
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("flagCollection", [
        getAddress(r.contract),
        reasonHashFromCollection(r.contract),
        r.evidenceUrl || "",
      ]);

      const ms = new ethers.Contract(MULTISIG, MULTI_SIG_ABI as any, signer);
      const resp = await ms.submitAndConfirm(ZERO_ADDRESS, REGISTRY, 0n, data);
      toast.message("Submitting flag collection proposal…");
      await resp.wait();
      toast.success("Flag collection proposal submitted (and confirmed by you).");
      load();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  const proposeClearCollection = async (r: Row) => {
    try {
      const signer = await guard();
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData("clearCollection", [getAddress(r.contract)]);

      const ms = new ethers.Contract(MULTISIG, MULTI_SIG_ABI as any, signer);
      const resp = await ms.submitAndConfirm(ZERO_ADDRESS, REGISTRY, 0n, data);
      toast.message("Submitting clear collection proposal…");
      await resp.wait();
      toast.success("Clear collection proposal submitted (and confirmed by you).");
      load();
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium">Reported Collections (users)</h3>
        <Button variant="outline" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Collection</TableHead>
              <TableHead className="whitespace-nowrap">Items Reported</TableHead>
              <TableHead>Latest Report</TableHead>
              <TableHead>On-chain</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-6">
                  No collection reports yet.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const addrLink = EXPLORER ? `${EXPLORER}/address/${r.contract}` : undefined;
              const latest =
                r.latestReportedAt ? new Date(r.latestReportedAt).toLocaleString() : "—";

              return (
                <TableRow key={r.contract} className="align-top">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      {r.logoUrl ? (
                        <Image
                          src={r.logoUrl}
                          alt={r.name || r.symbol || r.contract}
                          width={28}
                          height={28}
                          className="rounded"
                        />
                      ) : null}
                      <div className="flex flex-col">
                        <div className="font-medium">
                          {r.name || r.symbol || "Collection"}
                        </div>
                        <div className="mt-1">
                          {addrLink ? (
                            <a className="underline" href={addrLink} target="_blank" rel="noreferrer">
                              <AddressChip address={r.contract} showCopy />
                            </a>
                          ) : (
                            <AddressChip address={r.contract} showCopy />
                          )}
                        </div>
                        {(r.evidenceUrl || r.notes) && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-md break-words">
                            {r.evidenceUrl ? (
                              <>
                                Evidence:{" "}
                                <a
                                  className="underline"
                                  href={r.evidenceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {r.evidenceUrl}
                                </a>
                              </>
                            ) : null}
                            {r.notes ? (
                              <>
                                {r.evidenceUrl ? " — " : null}
                                {r.notes}
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell className="whitespace-nowrap">{r.itemsReported}</TableCell>
                  <TableCell>{latest}</TableCell>
                  <TableCell>{r.onChainActive ? "Yes" : "No"}</TableCell>

                  <TableCell className="text-right">
                    <div className="inline-flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => proposeClearCollection(r)}
                        disabled={!r.onChainActive}
                        title="Propose clear collection on-chain"
                      >
                        Propose Clear
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => proposeFlagCollection(r)}
                        disabled={r.onChainActive}
                        title="Propose flag collection on-chain"
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
