"use client";

import React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useActiveAccount } from "thirdweb/react";
import { useQueryClient } from "@tanstack/react-query";

import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import LoaderModal from "@/components/shared/loader-modal";
import { useLoaderStore } from "@/lib/store/loader-store";
import { cn } from "@/lib/utils";
import { MdEdit } from "react-icons/md";

/* ------------------------------------------------------------------ */
/* Types                                                              */
/* ------------------------------------------------------------------ */
type CollectionHeaderLike = {
  contract: string;
  name: string;
  ownerAddress: string;

  description?: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;

  website?: string | null;
  instagram?: string | null;
  x?: string | null;
  telegram?: string | null;
  discord?: string | null;
};

function normalizeUrl(u?: string | null) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  return `https://${s}`;
}

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB

export default function EditCollectionSheet({
  collection,
}: {
  collection: CollectionHeaderLike;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const account = useActiveAccount();

  const { show, hide } = useLoaderStore();

  /* ------------------------------ state ------------------------------ */
  const [open, _setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [uploadingCover, setUploadingCover] = React.useState(false);
  const [uploadingLogo, setUploadingLogo] = React.useState(false);

  const [coverUrl, setCoverUrl] = React.useState<string | null>(
    collection.coverUrl || null
  );
  const [logoUrl, setLogoUrl] = React.useState<string | null>(
    collection.logoUrl || null
  );

  const [description, setDescription] = React.useState(collection.description || "");
  const [website, setWebsite] = React.useState(collection.website || "");
  const [instagram, setInstagram] = React.useState(collection.instagram || "");
  const [x, setX] = React.useState(collection.x || "");
  const [telegram, setTelegram] = React.useState(collection.telegram || "");
  const [discord, setDiscord] = React.useState(collection.discord || "");

  const isOwner =
    !!account?.address &&
    account.address.toLowerCase() === collection.ownerAddress.toLowerCase();

  // Only close via our explicit "Cancel" or after save
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (saving) return;
      _setOpen(next);
    },
    [saving]
  );

  /* --------------------------- image upload -------------------------- */
  async function uploadImage(file: File): Promise<string> {
    const form = new FormData();
    form.append("file", file);
    show("Uploading image…");
    try {
      const res = await fetch("/api/upload-image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json?.success || !json?.data?.secure_url) {
        throw new Error(json?.error || "Upload failed");
      }
      return json.data.secure_url as string;
    } finally {
      hide();
    }
  }

  function validateFile(file: File): string | null {
    if (!file.type?.startsWith("image/")) {
      return "Please choose an image file (including GIF).";
    }
    if (file.size > MAX_FILE_BYTES) {
      return "Image is larger than 3MB. Please upload a file up to 3MB.";
    }
    return null;
  }

  // Capture the input BEFORE await; validate before uploading.
  async function onCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    if (!f) return;

    const validation = validateFile(f);
    if (validation) {
      setError(validation);
      try { input.value = ""; } catch {}
      return;
    }

    setUploadingCover(true);
    try {
      const url = await uploadImage(f);
      setCoverUrl(url);
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploadingCover(false);
      try { input.value = ""; } catch {}
    }
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const f = input.files?.[0];
    if (!f) return;

    const validation = validateFile(f);
    if (validation) {
      setError(validation);
      try { input.value = ""; } catch {}
      return;
    }

    setUploadingLogo(true);
    try {
      const url = await uploadImage(f);
      setLogoUrl(url);
    } catch (err: any) {
      setError(err?.message || "Upload failed");
    } finally {
      setUploadingLogo(false);
      try { input.value = ""; } catch {}
    }
  }

  /* ----------------------------- saving ------------------------------ */
  const somethingChanged =
    (coverUrl || "") !== (collection.coverUrl || "") ||
    (logoUrl || "") !== (collection.logoUrl || "") ||
    description !== (collection.description || "") ||
    website !== (collection.website || "") ||
    instagram !== (collection.instagram || "") ||
    x !== (collection.x || "") ||
    telegram !== (collection.telegram || "") ||
    discord !== (collection.discord || "");

  async function saveChanges() {
    setError(null);

    if (!isOwner) {
      setError("Only the collection owner can update details.");
      return;
    }

    const body = {
      description: description.trim(),
      website: normalizeUrl(website),
      instagram: normalizeUrl(instagram),
      x: normalizeUrl(x),
      telegram: normalizeUrl(telegram),
      discord: normalizeUrl(discord),
      logoUrl: logoUrl,
      coverUrl: coverUrl,
    };

    setSaving(true);
    show("Saving changes…");
    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(collection.contract)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-owner-wallet": account!.address!,
          },
          body: JSON.stringify(body),
        }
      );

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Failed to save changes");
      }

      // Invalidate + refresh and then close the sheet
      queryClient.invalidateQueries({
        queryKey: ["collection-header", collection.contract],
      });
      router.refresh();

      _setOpen(false); // auto-close after successful save
    } catch (err: any) {
      setError(err?.message || "Failed to save changes");
    } finally {
      hide();
      setSaving(false);
    }
  }

  /* ------------------------------- UI -------------------------------- */
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <LoaderModal />

      <SheetTrigger asChild>
        <Button variant="secondary" disabled={!isOwner}>
          <MdEdit className="mr-2" /> Edit Collection Details
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className={cn(
          "w-full sm:max-w-[560px] md:max-w-[680px] lg:max-w-[760px]",
          "px-6 pb-0 pt-5 overflow-y-auto"
        )}
        // ❌ Never allow outside press or Esc to close the sheet
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <SheetHeader className="mb-4">
          <SheetTitle>Edit Collection Details</SheetTitle>
          <SheetDescription>
            Update your collection’s images, description and social links.
          </SheetDescription>
        </SheetHeader>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 text-destructive px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {/* Cover */}
        <div className="space-y-2 mb-6">
          <Label className="block">Cover Photo</Label>
          <div className="relative w-full h-40 sm:h-48 md:h-56 rounded-lg bg-muted overflow-hidden">
            {coverUrl ? (
              <>
                <Image
                  src={coverUrl}
                  alt={`${collection.name} cover`}
                  fill
                  className="object-cover object-center"
                  unoptimized
                  priority
                />
                <div className="absolute inset-0 bg-black/35 text-white text-sm flex items-center justify-center pointer-events-none">
                  {uploadingCover ? "Uploading…" : "Click to replace cover photo"}
                </div>
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                {uploadingCover ? "Uploading…" : "Click to upload cover photo"}
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              onChange={onCoverChange}
              disabled={saving || uploadingCover}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Recommended ~1600×400. JPG/PNG/GIF. <strong>Max 3MB.</strong>
          </p>
        </div>

        {/* Logo + text fields */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Logo */}
          <div className="md:col-span-1">
            <Label className="block mb-2">Profile Photo</Label>
            <div className="relative w-28 h-28 rounded-xl bg-muted overflow-hidden">
              {logoUrl ? (
                <>
                  <Image
                    src={logoUrl}
                    alt={`${collection.name} logo`}
                    fill
                    className="object-cover object-center"
                    unoptimized
                    priority
                  />
                  <div className="absolute inset-0 bg-black/40 text-white text-xs flex items-center justify-center px-2 pointer-events-none">
                    {uploadingLogo ? "Uploading…" : "Click to replace"}
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground px-2">
                  {uploadingLogo ? "Uploading…" : "Click to upload"}
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={onLogoChange}
                disabled={saving || uploadingLogo}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Recommended ≥ 400×400. JPG/PNG/GIF. <strong>Max 3MB.</strong>
            </p>
          </div>

          {/* Details */}
          <div className="md:col-span-2 space-y-5">
            <div>
              <Label htmlFor="desc">Description</Label>
              <Textarea
                id="desc"
                rows={5}
                className="mt-2"
                placeholder="Tell collectors what makes this collection special…"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  placeholder="https://instagram.com/username"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  className="mt-2"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="x">X (Twitter)</Label>
                <Input
                  id="x"
                  placeholder="https://x.com/username"
                  value={x}
                  onChange={(e) => setX(e.target.value)}
                  className="mt-2"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://yourdomain.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="mt-2"
                  disabled={saving}
                />
              </div>
              <div>
                <Label htmlFor="telegram">Telegram</Label>
                <Input
                  id="telegram"
                  placeholder="https://t.me/username"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  className="mt-2"
                  disabled={saving}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="discord">Discord</Label>
                <Input
                  id="discord"
                  placeholder="https://discord.gg/your-invite-code"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value)}
                  className="mt-2"
                  disabled={saving}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Sticky footer */}
        <SheetFooter
          className={cn(
            "sticky bottom-0 left-0 right-0",
            "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
            "border-t mt-8 -mx-6 px-6 py-4"
          )}
        >
          <div className="flex w-full justify-between gap-2">
            {/* Only this Cancel button can close the sheet manually */}
            <SheetClose asChild>
              <Button
                variant="secondary"
                className="min-w-28"
                disabled={saving}
                aria-disabled={saving}
              >
                Cancel
              </Button>
            </SheetClose>
            <Button
              className="min-w-32"
              disabled={!isOwner || !somethingChanged || saving}
              aria-busy={saving}
              onClick={saveChanges}
            >
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
