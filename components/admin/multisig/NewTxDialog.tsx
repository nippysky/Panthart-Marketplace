"use client";

import * as React from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

const schema = z.object({
  to: z.string().trim().regex(/^0x[a-fA-F0-9]{40}$/, "Must be a valid EVM address."),
  // Keep required string; default comes from RHF defaultValues (not zod .default)
  valueEtn: z
    .string()
    .trim()
    .min(1, "Enter a number.")
    .refine((v) => /^\d*\.?\d*$/.test(v), "Enter a number."),
  // Accept empty "" or a 0x-hex string
  data: z
    .union([z.literal(""), z.string().trim()])
    .refine((v) => v === "" || /^0x([a-fA-F0-9]{2})*$/.test(v), "Data must be 0x-hex."),
});

export type NewTxDraft = z.infer<typeof schema>;

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit?: (draft: NewTxDraft) => Promise<void> | void;
};

export default function NewTxDialog({ open, onOpenChange, onSubmit }: Props) {
  const form = useForm<NewTxDraft>({
    resolver: zodResolver(schema),
    defaultValues: { to: "", valueEtn: "0", data: "" },
    mode: "onSubmit",
  });

  const [submitting, setSubmitting] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New transaction</DialogTitle>
          <DialogDescription>
            Propose a transaction from the multisig. We’ll submit on-chain in Step 4.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-5"
          onSubmit={form.handleSubmit(async (values: NewTxDraft) => {
            try {
              setSubmitting(true);
              await onSubmit?.(values);
            } finally {
              setSubmitting(false);
            }
          })}
        >
          <div className="space-y-2">
            <Label htmlFor="to">To</Label>
            <Input id="to" placeholder="0x…" {...form.register("to")} />
            {form.formState.errors.to && (
              <p className="text-xs text-red-500">{form.formState.errors.to.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="valueEtn">Value (ETN)</Label>
            <Input id="valueEtn" placeholder="0.0" {...form.register("valueEtn")} />
            {form.formState.errors.valueEtn && (
              <p className="text-xs text-red-500">{form.formState.errors.valueEtn.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="data">Data (optional, 0x-hex)</Label>
            <Textarea id="data" rows={4} placeholder="0x…" {...form.register("data")} />
            {form.formState.errors.data && (
              <p className="text-xs text-red-500">{form.formState.errors.data.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Save draft"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
