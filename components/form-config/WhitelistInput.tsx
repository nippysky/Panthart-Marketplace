"use client";

import * as React from "react";
import { ethers } from "ethers";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Info,
  Download,
  Upload as UploadIcon,
  FileText,
  CheckCircle2,
  XCircle,
  Wand2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useActiveAccount } from "thirdweb/react";
import DateTimePicker from "../shared/date-time-picker";
import { AllowlistState, PrepareResult } from "@/lib/types/dropCollection";

/** Server still appends qualifying Comrades holders on prepare. */
const MIN_COMRADES_THRESHOLD = 100;

/** Parse raw text -> AllowlistState, checksum without lowercasing. */
function parseAddresses(raw: string): AllowlistState {
  const ordered = raw.split(/[\s,]+/g).map((s) => s.trim()).filter(Boolean);
  const lowers = new Set<string>();
  const dupLowers = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const r of ordered) {
    if (ethers.isAddress(r)) {
      const c = ethers.getAddress(r);
      const l = c.toLowerCase();
      if (lowers.has(l)) dupLowers.add(l);
      else {
        lowers.add(l);
        valid.push(c);
      }
    } else invalid.push(r);
  }
  const duplicates = Array.from(dupLowers).map(
    (l) => valid.find((v) => v.toLowerCase() === l) || l
  );
  const previewFirst3 = ordered.slice(0, 3);
  const previewRemain = Math.max(0, ordered.length - 3);
  return {
    raw,
    ordered,
    validChecksummed: valid,
    invalid,
    duplicates,
    previewFirst3,
    previewRemain,
  };
}

function downloadSampleCsv() {
  const sample = [
    "address",
    "0xabc0000000000000000000000000000000000001",
    "0xabc0000000000000000000000000000000000002",
    "0xdef0000000000000000000000000000000000003",
  ].join("\n");
  const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "whitelist-sample.csv";
  a.click();
  URL.revokeObjectURL(url);
}

type Props = {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  onAllowlistChange: (state: AllowlistState) => void;
  onPrepared: (res: PrepareResult) => void;
  invalidatePrepared: () => void;
  initialRaw?: string;

  // Presale inputs (controlled by parent, rendered here)
  presaleStart: string;
  onChangePresaleStart: (v: string) => void;
  presaleEnd: string;
  onChangePresaleEnd: (v: string) => void;
  presalePriceEtn: string;
  onChangePresalePriceEtn: (v: string) => void;
  presaleSupplyStr: string;
  onChangePresaleSupplyStr: (v: string) => void;

  // Optional field error messages to show under inputs
  presaleFieldErrors?: {
    start?: string | null;
    end?: string | null;
    price?: string | null;
    supply?: string | null;
  };

  /** NEW: cap the Presale Supply spinner to total supply (UI only). */
  totalSupplyMax?: number;
};

export default function WhitelistInput({
  enabled,
  onEnabledChange,
  onAllowlistChange,
  onPrepared,
  invalidatePrepared,
  initialRaw = "",

  presaleStart,
  onChangePresaleStart,
  presaleEnd,
  onChangePresaleEnd,
  presalePriceEtn,
  onChangePresalePriceEtn,
  presaleSupplyStr,
  onChangePresaleSupplyStr,

  presaleFieldErrors,
  totalSupplyMax,
}: Props) {
  const account = useActiveAccount();
  const { address } = account || {};

  const [useCsvUpload, setUseCsvUpload] = React.useState(false);
  const [raw, setRaw] = React.useState(initialRaw);
  const [state, setState] = React.useState<AllowlistState>(() => parseAddresses(initialRaw));

  const [busy, setBusy] = React.useState(false);
  const [prepareOk, setPrepareOk] = React.useState(false);
  const [draftId, setDraftId] = React.useState<string | undefined>(undefined);
  const [merkleRoot, setMerkleRoot] = React.useState<string | undefined>(undefined);
  const [commit, setCommit] = React.useState<string | undefined>(undefined);

  // Hidden, always-on auto-include behavior (server side)
  const [autoIncludeComrades] = React.useState(true);
  const [appendedFromComrades, setAppendedFromComrades] = React.useState<number>(0);

  // local "touched" flags for presale fields
  const [touched, setTouched] = React.useState<{
    start?: boolean;
    end?: boolean;
    price?: boolean;
    supply?: boolean;
  }>({});
  const markTouched = (k: "start" | "end" | "price" | "supply") =>
    setTouched((prev) => (prev[k] ? prev : { ...prev, [k]: true }));

  // Re-parse user input → reset prepared metadata when list changes
  React.useEffect(() => {
    const s = parseAddresses(raw);
    setState(s);
    onAllowlistChange(s);
    setPrepareOk(false);
    setDraftId(undefined);
    setMerkleRoot(undefined);
    setCommit(undefined);
    setAppendedFromComrades(0);
    invalidatePrepared();
  }, [raw]); // eslint-disable-line

  // Auto-generate merkle when clean + enabled + not CSV flow
  React.useEffect(() => {
    if (!enabled) return;
    if (useCsvUpload) return;
    if (state.invalid.length || state.duplicates.length || state.validChecksummed.length === 0)
      return;
    const t = setTimeout(() => {
      void generateMerkle();
    }, 600);
    return () => clearTimeout(t);
  }, [state.raw, enabled, useCsvUpload]); // eslint-disable-line

  async function onCsvPicked(file?: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const cleaned = text.replace(/\r/g, "").trim();
      const lines = cleaned.split("\n");
      let body = cleaned;
      if (lines.length > 0 && /^address\s*$/i.test(lines[0].trim())) body = lines.slice(1).join("\n");
      setUseCsvUpload(true);
      setRaw(body);
      toast.success("CSV parsed.");
      const soon = parseAddresses(body);
      if (
        !soon.invalid.length &&
        !soon.duplicates.length &&
        soon.validChecksummed.length > 0 &&
        enabled
      ) {
        await generateMerkle(soon.raw);
      }
    } catch {
      toast.error("Failed to read CSV.");
    }
  }

  /** Generate Merkle server-side. */
  async function generateMerkle(sourceRaw?: string) {
    if (!enabled) {
      toast.error("Enable presale first.");
      return;
    }
    const s = sourceRaw ? parseAddresses(sourceRaw) : state;
    if (s.invalid.length || s.duplicates.length || s.validChecksummed.length === 0) {
      toast.error("Fix invalid or duplicate addresses before generating Merkle root.");
      return;
    }
    try {
      setBusy(true);
      const res = await fetch("/api/presale/prepare", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-address": address || "",
        },
        body: JSON.stringify({
          addressesText: s.raw,
          includeComrades: !!autoIncludeComrades,
          minComrades: MIN_COMRADES_THRESHOLD,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Preparation failed");

      setPrepareOk(true);
      setDraftId(json.draftId);
      setMerkleRoot(json.merkleRoot);
      setCommit(json.commit);
      setAppendedFromComrades(
        Number.isFinite(Number(json?.counts?.appendedFromComrades))
          ? Number(json.counts.appendedFromComrades)
          : 0
      );

      onPrepared({
        ok: true,
        draftId: json.draftId,
        merkleRoot: json.merkleRoot,
        commit: json.commit,
        count:
          s.validChecksummed.length +
          (Number.isFinite(Number(json?.counts?.appendedFromComrades))
            ? Number(json.counts.appendedFromComrades)
            : 0),
      });

      toast.success("Allowlist validated.");
    } catch (e: any) {
      setPrepareOk(false);
      setDraftId(undefined);
      setMerkleRoot(undefined);
      setCommit(undefined);
      setAppendedFromComrades(0);
      onPrepared({ ok: false, error: e?.message || "Failed to generate Merkle root" });
      toast.error(e?.message || "Failed to generate Merkle root.");
    } finally {
      setBusy(false);
    }
  }

  const TinyError = ({ text }: { text?: string | null }) =>
    text ? <p className="mt-1 text-[11px] leading-snug text-red-500">{text}</p> : null;

  return (
    <div className="space-y-5">
      {/* master toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={(v) => {
            onEnabledChange(v);
            if (!v) {
              setPrepareOk(false);
              setDraftId(undefined);
              setMerkleRoot(undefined);
              setCommit(undefined);
              setAppendedFromComrades(0);
              onPrepared({ ok: false });
              setTouched({});
            }
          }}
        />
        <span className="text-sm">Enable presale (allowlist)</span>
      </div>

      {!enabled ? null : (
        <>
          {/* Presale timing / price / supply */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>Presale start (your timezone)</Label>
              <DateTimePicker
                label=""
                value={presaleStart}
                onChange={(v) => {
                  onChangePresaleStart(v);
                  markTouched("start");
                }}
                minNow
              />
              <TinyError text={touched.start ? presaleFieldErrors?.start : null} />
            </div>
            <div className="space-y-2">
              <Label>Presale end (your timezone)</Label>
              <DateTimePicker
                label=""
                value={presaleEnd}
                onChange={(v) => {
                  onChangePresaleEnd(v);
                  markTouched("end");
                }}
                minNow
              />
              <TinyError text={touched.end ? presaleFieldErrors?.end : null} />
            </div>
            <div className="space-y-2">
              <Label>Presale price (ETN)</Label>
              <Input
                value={presalePriceEtn}
                onChange={(e) => onChangePresalePriceEtn(e.target.value)}
                onBlur={() => markTouched("price")}
              />
              <TinyError text={touched.price ? presaleFieldErrors?.price : null} />
            </div>
            <div className="space-y-2">
              <Label>Presale supply</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                /* NEW: cap the spinner to the collection's total supply (UI only) */
                max={typeof totalSupplyMax === "number" && totalSupplyMax > 0 ? totalSupplyMax : undefined}
                value={presaleSupplyStr}
                onChange={(e) => onChangePresaleSupplyStr(e.target.value)}
                onBlur={() => markTouched("supply")}
              />
              <TinyError text={touched.supply ? presaleFieldErrors?.supply : null} />
            </div>
          </div>

          {/* Whitelist input + CSV */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label>Whitelist addresses</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7">
                        <Info className="h-4 w-4" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80 rounded-xl border border-white/10 bg-background/80 backdrop-blur-xl">
                      <div className="text-sm mb-2 font-medium">CSV / Text format</div>
                      <ul className="list-disc pl-5 text-sm space-y-1">
                        <li>
                          Comma-separated: <code>0xabc..., 0xdef..., 0x123...</code>
                        </li>
                        <li>
                          Or one per line (CSV header <code>address</code> is OK).
                        </li>
                        <li>No per-wallet allocations — all use the presale price.</li>
                      </ul>
                      <div className="mt-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={downloadSampleCsv}
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" /> Download Sample CSV
                        </Button>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Use CSV upload</span>
                  <Switch checked={useCsvUpload} onCheckedChange={setUseCsvUpload} />
                </div>
              </div>

              {/* (Auto-include Comrades toggle UI remains removed) */}

              {!useCsvUpload ? (
                <Textarea
                  rows={5}
                  placeholder="0xabc..., 0xdef..., 0x123... (commas or new lines)"
                  value={raw}
                  onChange={(e) => setRaw(e.target.value)}
                />
              ) : (
                <div className="rounded-lg border border-dashed p-4 bg-muted/10">
                  <div className="text-sm mb-2">
                    Upload CSV (single <code>address</code> column or plain list)
                  </div>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <Input
                      type="file"
                      accept=".csv,text/csv,.txt"
                      className="hidden"
                      onChange={(e) => onCsvPicked(e.target.files?.[0] ?? null)}
                    />
                    <span className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-white/5">
                      <UploadIcon className="h-4 w-4" /> Choose CSV
                    </span>
                  </label>

                  {raw ? (
                    <div className="mt-3 rounded-md bg-white/5 border border-white/10 p-3 text-xs">
                      <div className="flex items-center gap-2 mb-2">
                        <FileText className="h-4 w-4" />
                        <span className="font-medium">Parsed preview (first 3 rows)</span>
                      </div>
                      <div className="space-y-1">
                        {state.previewFirst3.map((row, i) => {
                          const valid = ethers.isAddress(row);
                          const dup = state.duplicates.some(
                            (d) => d.toLowerCase() === row.toLowerCase()
                          );
                          return (
                            <div key={`${row}-${i}`} className="flex items-center gap-2">
                              {valid && !dup ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              ) : (
                                <XCircle className="h-3.5 w-3.5 text-red-500" />
                              )}
                              <code className="break-all">{row}</code>
                              {dup && <span className="text-red-500 ml-1">(duplicate)</span>}
                              {!valid && <span className="text-red-500 ml-1">(invalid)</span>}
                            </div>
                          );
                        })}
                        {state.previewRemain > 0 && (
                          <div className="text-muted-foreground">+{state.previewRemain} more</div>
                        )}
                      </div>
                    </div>
                  ) : null}

                  <p className="text-[11px] text-muted-foreground mt-2">
                    We’ll append qualifying Comrades holders server-side when you generate your allowlist.
                  </p>
                </div>
              )}

              {/* stats */}
              <div className="text-xs text-muted-foreground">
                <span className="mr-3">
                  Valid: <span className="text-foreground">{state.validChecksummed.length}</span>
                </span>
                <span className="mr-3">
                  Invalid: <span className="text-red-500">{state.invalid.length}</span>
                </span>
                <span>
                  Duplicates:{" "}
                  <span
                    className={state.duplicates.length ? "text-red-500" : "text-foreground"}
                  >
                    {state.duplicates.length}
                  </span>
                </span>
                {state.duplicates.length > 0 && (
                  <div className="mt-1 text-red-500">
                    Duplicates detected. Please remove duplicates and re-upload.
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                Tip: all whitelist addresses use the presale price; no per-address allocation needed.
              </p>
            </div>
          </div>

          {/* prepare bar */}
          <div className="flex items-center justify-between rounded-md border border-white/10 p-3 bg-white/5">
            <div className="text-sm flex items-center gap-2">
              {busy ? (
                <>
                  <Skeleton className="h-4 w-4 rounded-full" />
                  <span>Validating allowlist…</span>
                </>
              ) : prepareOk ? (
                <>
                  <Check className="h-4 w-4 text-emerald-500" />
                  <span>Allowlist processed</span>
                  {draftId ? <span className="opacity-70">· draft {draftId.slice(0, 6)}…</span> : null}
                  {appendedFromComrades > 0 ? (
                    <span className="opacity-70">· appended {appendedFromComrades} Comrades</span>
                  ) : null}
                </>
              ) : (
                <span>Generate Merkle root when your allowlist is clean</span>
              )}
            </div>
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              disabled={
                busy ||
                state.invalid.length > 0 ||
                state.duplicates.length > 0 ||
                state.validChecksummed.length === 0
              }
              onClick={() => generateMerkle()}
              title={
                state.invalid.length || state.duplicates.length
                  ? "Fix invalid/duplicate addresses first"
                  : state.validChecksummed.length === 0
                  ? "Add at least one address"
                  : undefined
              }
            >
              <Wand2 className="h-4 w-4" />
              {busy ? "Generating…" : "Generate from allowlist"}
            </Button>
          </div>

          {/* read-only merkle */}
          {prepareOk && merkleRoot ? (
            <div className="space-y-2">
              <Label>Merkle root (read-only)</Label>
              <div className="flex items-center gap-2">
                <Input value={merkleRoot} readOnly className="font-mono text-xs" />
              </div>
              {commit ? (
                <p className="text-[11px] text-muted-foreground">
                  Commit: <code className="break-all">{commit}</code>
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
