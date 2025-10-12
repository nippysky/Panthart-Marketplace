"use client";
import React from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "sonner";

export function RawMetadataBlock({ raw }: { raw?: Record<string, any> | null }) {
  return (
    <div className="rounded-2xl border border-border p-3 md:p-4 bg-card text-card-foreground">
      {raw ? (
        <div className="relative">
          <pre className="text-xs md:text-sm whitespace-pre-wrap break-all">
            {JSON.stringify(raw, null, 2)}
          </pre>
          <Button
            variant="outline"
            size="icon"
            className="absolute top-2 right-2"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(raw, null, 2));
                toast.success("Raw metadata copied");
              } catch {
                toast.error("Copy failed");
              }
            }}
            aria-label="Copy raw metadata"
            title="Copy raw metadata"
          >
            <Copy size={16} />
          </Button>
        </div>
      ) : (
        <div className="text-sm opacity-70">No raw metadata stored.</div>
      )}
    </div>
  );
}
