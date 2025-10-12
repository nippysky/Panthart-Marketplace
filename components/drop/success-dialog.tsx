"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, Check, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type KV = {
  label: string;
  value: string;
  display?: string;      // optional pretty value to show (defaults to value)
  href?: string;         // optional link (e.g., IPFS gateway)
};

type SuccessDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  items: KV[];
  proceedLabel?: string;
  onProceed: () => void;
  className?: string;
};

export function SuccessDialog({
  open,
  title,
  description,
  items,
  proceedLabel = "Proceed",
  onProceed,
  className,
}: SuccessDialogProps) {
  const [copiedIdx, setCopiedIdx] = React.useState<number | null>(null);

  async function handleCopy(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1200);
    } catch {
      // optional: add a toast error if you prefer
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => { /* locked dialog: ignore external toggles */ }}>
      <DialogContent
        className={cn(
          "sm:max-w-lg rounded-2xl border border-white/10 bg-background/70 backdrop-blur-2xl shadow-xl",
          "ring-1 ring-black/5",
          className
        )}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()} // Radix v2
        // onInteractOutside={(e) => e.preventDefault()}  // (uncomment if you're on Radix v1/shadcn older)
      >
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">{title}</DialogTitle>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="mt-4 space-y-3">
          {items.map((item, idx) => {
            const visible = item.display ?? item.value;
            return (
              <div
                key={`${item.label}-${idx}`}
                className="rounded-xl border border-white/10 bg-white/5 p-3 flex items-start gap-3"
              >
                <div className="min-w-[7rem] text-xs uppercase tracking-wide text-muted-foreground pt-1">
                  {item.label}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-sm break-all">{visible}</code>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleCopy(visible, idx)}
                      aria-label={`Copy ${item.label}`}
                    >
                      {copiedIdx === idx ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                    {item.href && (
                      <a
                        href={item.href}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-white/10 transition"
                        aria-label={`Open ${item.label}`}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onProceed} className="px-6">
            {proceedLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
