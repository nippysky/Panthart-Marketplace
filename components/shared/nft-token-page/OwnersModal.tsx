"use client";
import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { shortenAddress } from "@/lib/utils";

export function OwnersModal({
  open,
  onOpenChange,
  contract,
  tokenId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: string;
  tokenId: string;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<Array<{ ownerAddress: string; balance: number; profile?: { username?: string; profileAvatar?: string } }>>([]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/nft/${contract}/${tokenId}/holders`, { cache: "no-store" });
        if (!res.ok) throw new Error("Failed to load holders");
        const data = await res.json();
        setRows(data.holders ?? []);
      } catch (e: any) {
        toast.error(e?.message || "Failed to fetch owners");
      } finally {
        setLoading(false);
      }
    })();
  }, [open, contract, tokenId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Owners</DialogTitle>
          <DialogDescription>All addresses holding this token.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto space-y-3">
          {loading ? (
            <div className="text-sm opacity-70">Loading holders…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm opacity-70">No holders found.</div>
          ) : (
            rows.map((r) => (
              <div key={r.ownerAddress} className="flex items-center justify-between gap-3 border rounded-lg p-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Image
                    src={r.profile?.profileAvatar || `https://api.dicebear.com/7.x/identicon/svg?seed=${r.ownerAddress}`}
                    alt={r.ownerAddress}
                    width={28}
                    height={28}
                    className="rounded-full object-cover"
                    unoptimized
                  />
                  <Link href={`/profile/${r.ownerAddress}`} className="font-medium hover:underline truncate" title={r.ownerAddress}>
                    {r.profile?.username ?? shortenAddress(r.ownerAddress)}
                  </Link>
                </div>
                <div className="text-xs text-muted-foreground shrink-0">x{r.balance}</div>
              </div>
            ))
          )}
        </div>
        <DialogFooter className="mt-2">
          <Button onClick={() => onOpenChange(false)} className="w-full">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
