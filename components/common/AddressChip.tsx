"use client";

import * as React from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function short(addr?: string, front = 6, back = 4) {
  if (!addr) return "-";
  return `${addr.slice(0, front)}…${addr.slice(-back)}`;
}

export default function AddressChip({
  address,
  className,
  showCopy = true,
}: {
  address?: `0x${string}` | string;  // ← make optional
  className?: string;
  showCopy?: boolean;
}) {
  const canCopy = !!address;

  const onCopy = async () => {
    if (!canCopy) {
      toast.error("No address to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(String(address));
      toast.success("Copied");
    } catch {
      toast.error("Copy failed");
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-1 rounded bg-muted font-mono text-xs",
        className
      )}
    >
      <span>{short(typeof address === "string" ? address : undefined)}</span>
      {showCopy && (
        <button
          aria-label="Copy address"
          onClick={onCopy}
          className={cn("opacity-70 hover:opacity-100", !canCopy && "pointer-events-none opacity-40")}
          type="button"
        >
          <Copy size={14} />
        </button>
      )}
    </span>
  );
}
