"use client";

import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type Props = {
  currencyLabel: string;
  minRequiredLabel?: string; // e.g. "≥ 25.1 ETN"
  disabled?: boolean;
  onPlaceBid: (amountHuman: string) => Promise<void>;
};

export default function BidForm({
  currencyLabel,
  minRequiredLabel,
  disabled,
  onPlaceBid,
}: Props) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const buttonText = useMemo(() => {
    if (busy) return "Placing bid…";
    return `Place Bid (${currencyLabel})`;
  }, [busy, currencyLabel]);

  return (
    <div className="rounded-xl border p-4">
      <div className="text-sm font-medium mb-2">Your Bid</div>
      <div className="flex gap-2">
        <Input
          placeholder={`Amount in ${currencyLabel}`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={disabled || busy}
          inputMode="decimal"
        />
        <Button
          onClick={async () => {
            if (!amount || Number(amount) <= 0) {
              return toast.error("Enter a valid amount.");
            }
            try {
              setBusy(true);
              await onPlaceBid(amount);
              setAmount("");
              toast.success("Bid placed");
            } catch (e: any) {
              toast.error(e?.reason || e?.message || "Bid failed");
            } finally {
              setBusy(false);
            }
          }}
          disabled={disabled || busy}
        >
          {buttonText}
        </Button>
      </div>
      {minRequiredLabel && (
        <p className="text-xs text-muted-foreground mt-2">Minimum required: {minRequiredLabel}</p>
      )}
    </div>
  );
}
