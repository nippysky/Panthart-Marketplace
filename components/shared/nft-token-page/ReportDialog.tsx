"use client";
import React, { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ReportDialog({
  open,
  onOpenChange,
  contract,
  tokenId,
  reporterAddress,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contract: string;
  tokenId: string;
  reporterAddress?: string;
  onSuccess: () => void;
}) {
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [working, setWorking] = useState(false);
  const [successOpen, setSuccessOpen] = useState(false);

  const submit = async () => {
    if (!reporterAddress) return toast.info("Connect wallet to report.");
    if (!notes.trim()) return toast.error("Please provide a reason / notes.");

    setWorking(true);
    try {
      const res = await fetch("/api/stolen/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ contract, tokenId, reporterAddress, evidenceUrl: evidenceUrl.trim(), notes }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to submit report");
      setSuccessOpen(true);
    } catch (e: any) {
      toast.error(e?.message || "Submit failed");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent onInteractOutside={(e) => e.preventDefault()} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Report NFT</DialogTitle>
            <DialogDescription>Tell us why this item should be flagged. Only admins can act on-chain.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label className="block text-xs mb-1 opacity-70">Evidence URL (optional)</label>
              <Input placeholder="Link to tweet, explorer, tx, document…" value={evidenceUrl} onChange={(e) => setEvidenceUrl(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1 opacity-70">Reason / Notes</label>
              <Textarea placeholder="Explain clearly why this NFT should be flagged…" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>Close</Button>
            <Button onClick={submit} disabled={working}>{working ? "Submitting…" : "Submit report"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Success */}
      <Dialog open={successOpen} onOpenChange={(v) => {
        setSuccessOpen(v);
        if (!v) {
          onOpenChange(false);
          onSuccess();
        }
      }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Report submitted</DialogTitle>
            <DialogDescription>Thank you. Our team will review it shortly.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => {
              setSuccessOpen(false);
              onOpenChange(false);
              onSuccess();
            }}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
