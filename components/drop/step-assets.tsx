"use client";

import React, { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  /** existing selection coming from the wizard store (optional) */
  initialFile?: File | null;
  /** called when a valid .zip is chosen */
  onSelect: (file: File | null) => void;
  /** continue to next step */
  onNext: () => void;
  /** go back to previous screen */
  onBack?: () => void;
  /** disable interactions while an upload is in progress */
  busy?: boolean;
};

const MAX_ASSETS_ZIP_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

export default function StepAssets({ initialFile = null, onSelect, onNext, onBack, busy }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(initialFile);

  const fileLabel = useMemo(() => {
    if (!file) return "No file selected";
    return `${file.name} • ${(file.size / (1024 * 1024)).toFixed(1)} MB`;
  }, [file]);

  function validateZip(f: File): boolean {
    const isZip =
      f.name.toLowerCase().endsWith(".zip") ||
      f.type === "application/zip" ||
      f.type === "application/x-zip-compressed" ||
      f.type === "application/x-zip";
    if (!isZip) {
      toast.error("Only .zip files are accepted.");
      return false;
    }
    if (f.size > MAX_ASSETS_ZIP_BYTES) {
      toast.error("File exceeds 2 GB. Please split it and try again.");
      return false;
    }
    return true;
  }

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!validateZip(f)) {
      // reset so the same file can be re-picked after fixing
      e.currentTarget.value = "";
      return;
    }
    setFile(f);
    onSelect(f);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (busy) return;
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (!validateZip(f)) return;
    setFile(f);
    onSelect(f);
  }

  return (
    <div className="max-w-3xl w-full mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        {onBack ? (
          <button
            type="button"
            className="text-sm opacity-80 hover:opacity-100"
            onClick={onBack}
            disabled={busy}
          >
            ← Back
          </button>
        ) : null}
        <h1 className="text-2xl font-semibold">Create</h1>
      </div>

      <div className="text-center space-y-2 mb-6">
        <p className="text-sm opacity-80">Step 1 of 3 — Upload Assets</p>
        <h2 className="text-lg font-medium">Upload Assets (.zip, ≤ 2 GB)</h2>
        <p className="text-sm opacity-70">
          The .zip may contain images, GIFs, and light MP4s.
        </p>
      </div>

      {/* Guidance OUTSIDE the box */}
      <div className="text-sm opacity-70 mb-2">
        Accepted file type: <span className="font-medium">.zip</span> (max 2 GB)
      </div>

      {/* Clickable drop area */}
      <div
        className={cn(
          "relative w-full rounded-lg border border-dashed",
          "border-[#2a2a2a] hover:border-[#3a3a3a]",
          "transition-colors",
          "bg-muted/10",
          "p-6",
          "cursor-pointer select-none"
        )}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        aria-label="Upload .zip"
        role="button"
      >
        <div className="pointer-events-none flex flex-col items-center justify-center gap-2 py-10">
          <div className="text-sm font-medium">
            Click to choose a .zip or drag & drop
          </div>
          <div className="text-xs opacity-70">{fileLabel}</div>
        </div>

        {/* Invisible file input covering the entire box */}
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed,application/x-zip"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          onChange={handlePick}
          disabled={busy}
          aria-hidden
          tabIndex={-1}
        />
      </div>

      <div className="flex items-center justify-end gap-2 mt-6">
        <Button
          onClick={() => onSelect(null)}
          variant="ghost"
          disabled={busy || !file}
        >
          Clear
        </Button>
        <Button onClick={onNext} disabled={busy || !file}>
          {busy ? "Uploading…" : "Continue"}
        </Button>
      </div>
    </div>
  );
}
