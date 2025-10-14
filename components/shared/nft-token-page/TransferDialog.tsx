"use client";

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { toast } from "sonner";
import { getBrowserSigner } from "@/lib/evm/getSigner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type Standard = "ERC721" | "ERC1155";

const ERC721_TX = [
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function safeTransferFrom(address from, address to, uint256 tokenId) external",
] as const;

const ERC1155_TX = [
  "function balanceOf(address account, uint256 id) view returns (uint256)",
  "function safeTransferFrom(address from, address to, uint256 id, uint256 value, bytes data) external",
] as const;

function isAddr(s: string) {
  try {
    return ethers.isAddress(s);
  } catch {
    return false;
  }
}

export type TransferDialogProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  standard: Standard;
  contract: `0x${string}`;
  tokenId: string | number | bigint;
  /** Pass the holder’s current 1155 balance if known; we also recheck on open */
  your1155Balance?: number | null;
  /** Called after a successful on-chain transfer */
  onTransferred?: (params: {
    to: string;
    quantity: number;
    txHash: string;
    blockNumber?: number | null;
    timestampISO?: string | null;
  }) => void | Promise<void>;
};

export default function TransferDialog(props: TransferDialogProps) {
  const {
    open,
    onOpenChange,
    standard,
    contract,
    tokenId,
    your1155Balance = null,
    onTransferred,
  } = props;

  const [to, setTo] = useState<string>("");
  const [qty, setQty] = useState<string>("1");
  const [loading, setLoading] = useState(false);
  const [addrErr, setAddrErr] = useState<string | null>(null);
  const [qtyErr, setQtyErr] = useState<string | null>(null);
  const [myBalance1155, setMyBalance1155] = useState<number>(your1155Balance ?? 0);

  const is1155 = standard === "ERC1155";
  const tokenIdBig = useMemo(() => BigInt(String(tokenId)), [tokenId]);

  // Re-validate when inputs change
  useEffect(() => {
    if (!to) {
      setAddrErr("Recipient is required");
    } else if (!isAddr(to)) {
      setAddrErr("Invalid address");
    } else {
      setAddrErr(null);
    }
  }, [to]);

  useEffect(() => {
    if (!is1155) {
      setQty("1");
      setQtyErr(null);
      return;
    }
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      setQtyErr("Enter a positive quantity");
    } else if (myBalance1155 != null && n > myBalance1155) {
      setQtyErr(`You only own ${myBalance1155} of this token`);
    } else if (!Number.isInteger(n)) {
      setQtyErr("Quantity must be an integer");
    } else {
      setQtyErr(null);
    }
  }, [qty, is1155, myBalance1155]);

  // On open, for ERC1155, re-check live balance via signer provider
  useEffect(() => {
    let cancelled = false;
    async function checkBal() {
      if (!open || !is1155) return;
      try {
        const { signer } = await getBrowserSigner();
        const fromAddr = await signer.getAddress();
        const provider = signer.provider!;
        const c = new ethers.Contract(contract, ERC1155_TX, provider);
        const bn: bigint = await c.balanceOf(fromAddr, tokenIdBig);
        if (!cancelled) setMyBalance1155(Number(bn));
      } catch {
        // keep previous
      }
    }
    checkBal();
    return () => { cancelled = true; };
  }, [open, is1155, contract, tokenIdBig]);

  async function submit() {
    if (addrErr || (is1155 && qtyErr)) return;

    try {
      setLoading(true);
      const { signer } = await getBrowserSigner();
      const fromAddr = await signer.getAddress();

      if (is1155) {
        // final preflight
        try {
          const provider = signer.provider!;
          const c = new ethers.Contract(contract, ERC1155_TX, provider);
          const bn: bigint = await c.balanceOf(fromAddr, tokenIdBig);
          const have = Number(bn);
          const n = Number(qty);
          if (n > have) {
            setLoading(false);
            return toast.error(`Insufficient balance: you have ${have}, tried to send ${n}`);
          }
        } catch {}

        const tx = await new ethers.Contract(contract, ERC1155_TX, signer).safeTransferFrom(
          fromAddr,
          to,
          tokenIdBig,
          BigInt(Number(qty)),
          "0x"
        );
        const rec = await tx.wait();
        toast.success("Transfer sent");
        onOpenChange(false);

        const block = rec?.blockNumber ?? null;
        const h = tx?.hash ?? "";
        const tsISO = null; // (optional) fill via a block lookup elsewhere if you need
        if (onTransferred) {
          await onTransferred({ to, quantity: Number(qty), txHash: h, blockNumber: block, timestampISO: tsISO });
        }
      } else {
        // ERC-721
        const tx = await new ethers.Contract(contract, ERC721_TX, signer).safeTransferFrom(
          fromAddr,
          to,
          tokenIdBig
        );
        const rec = await tx.wait();
        toast.success("Transfer sent");
        onOpenChange(false);

        const block = rec?.blockNumber ?? null;
        const h = tx?.hash ?? "";
        const tsISO = null;
        if (onTransferred) {
          await onTransferred({ to, quantity: 1, txHash: h, blockNumber: block, timestampISO: tsISO });
        }
      }
    } catch (e: any) {
      const msg = e?.reason || e?.message || "Transfer failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !loading && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer {is1155 ? "Tokens" : "NFT"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label htmlFor="to">Recipient address</Label>
            <Input
              id="to"
              placeholder="0x…"
              value={to}
              onChange={(e) => setTo(e.target.value.trim())}
              spellCheck={false}
              autoComplete="off"
            />
            {addrErr && <p className="text-xs text-destructive">{addrErr}</p>}
          </div>

          {is1155 && (
            <div className="grid gap-2">
              <Label htmlFor="qty">Quantity</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                step={1}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Owned: {myBalance1155 ?? 0}</span>
                <button
                  type="button"
                  className="underline"
                  onClick={() => setQty(String(myBalance1155 ?? 1))}
                >
                  Max
                </button>
              </div>
              {qtyErr && <p className="text-xs text-destructive">{qtyErr}</p>}
            </div>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={loading || !!addrErr || (!!qtyErr && is1155)}>
            {loading ? "Sending…" : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
