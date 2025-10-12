"use client";

import React, { useState, useRef } from "react";
import Image from "next/image";
import { useLoaderStore } from "@/lib/store/loader-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  currentBanner: string | null;
  currentAvatar: string;
  instagram: string;
  x: string;
  website: string;
  telegram: string;
  bio: string; // ✅ new
  onSave: (data: {
    username: string;
    banner: string | null;
    avatar: string;
    instagram: string;
    x: string;
    website: string;
    telegram: string;
    bio: string; // ✅
  }) => Promise<void>;
};

function normalizeWebsite(raw: string) {
  const val = raw.trim();
  if (!val) return "";
  if (/^https?:\/\//i.test(val)) return val;
  return `https://${val}`;
}

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3MB

export default function EditProfileSheet({
  open,
  onOpenChange,
  username: initialUsername,
  currentBanner,
  currentAvatar,
  instagram: initialInsta,
  x: initialX,
  website: initialWebsite,
  telegram: initialTelegram,
  bio: initialBio,
  onSave,
}: Props) {
  const [username, setUsername] = useState(initialUsername);
  const [banner, setBanner] = useState<string | null>(currentBanner);
  const [avatar, setAvatar] = useState<string>(currentAvatar);
  const [instagram, setInstagram] = useState(initialInsta);
  const [x, setX] = useState(initialX);
  const [website, setWebsite] = useState(initialWebsite);
  const [telegram, setTelegram] = useState(initialTelegram);
  const [bio, setBio] = useState(initialBio);

  const bannerRef = useRef<HTMLInputElement>(null!);
  const avatarRef = useRef<HTMLInputElement>(null!);

  const { show, hide } = useLoaderStore();
  const [loading, setLoading] = useState(false);

  function validateFile(file: File): string | null {
    if (!file.type?.startsWith("image/")) return "Please choose an image file (including GIF).";
    if (file.size > MAX_FILE_BYTES) return "Image is larger than 3MB. Please upload up to 3MB.";
    return null;
    // (We accept all image subtypes, including GIF)
  }

  /** Centralized uploader with pre-checks */
  async function handleFileUpload(
    file: File,
    setter: (url: string) => void,
    inputRef: React.RefObject<HTMLInputElement>
  ) {
    const err = validateFile(file);
    if (err) {
      toast.error(err);
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    show("Uploading image…");
    setLoading(true);

    const form = new FormData();
    form.append("file", file);
    const res = await fetch("/api/upload-image", {
      method: "POST",
      body: form,
    });
    const json = await res.json();

    hide();
    setLoading(false);

    if (res.ok && json.success && json.data.secure_url) {
      setter(json.data.secure_url);
      if (inputRef.current) inputRef.current.value = "";
    } else {
      toast.error(json.error || "Upload failed");
    }
  }

  /** Validate & submit updated profile */
  async function handleSubmit() {
    if (!username.trim()) {
      toast.error("Username cannot be empty");
      return;
    }
    show("Saving profile…");
    setLoading(true);
    try {
      await onSave({
        username,
        banner,
        avatar,
        instagram: instagram.trim(),
        x: x.trim(),
        website: normalizeWebsite(website),
        telegram: telegram.trim(),
        bio: bio.trim(), // ✅
      });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save");
    } finally {
      hide();
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-[40vw] overflow-y-auto px-5"
        // ❌ prevent closing via outside click or Esc; user must click buttons
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Edit Profile</SheetTitle>
        </SheetHeader>

        <div className="space-y-8 py-5">
          {/* Cover Photo */}
          <div>
            <Label className="block mb-2">Cover Photo</Label>
            <div className="relative w-full h-36 rounded-lg bg-muted overflow-hidden">
              {banner ? (
                <>
                  <Image
                    src={banner}
                    alt="Cover"
                    fill
                    className="object-cover object-center z-0"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center text-white font-medium">
                    Click to replace cover photo
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground z-10">
                  Click to upload cover photo
                </div>
              )}
              <Input
                ref={bannerRef}
                type="file"
                accept="image/*"
                disabled={loading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleFileUpload(file, setBanner, bannerRef);
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Accepts JPG/PNG/GIF and other image types. <strong>Max 3MB.</strong>
            </p>
          </div>

          {/* Profile Photo */}
          <div>
            <Label className="block mb-2">Profile Photo</Label>
            <div className="relative w-24 h-24 rounded-full bg-muted overflow-hidden">
              {avatar ? (
                <>
                  <Image
                    src={avatar}
                    alt="Avatar"
                    fill
                    className="object-cover object-center z-0"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center text-white text-xs text-center px-2">
                    Click to replace
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground z-10">
                  Click to upload
                </div>
              )}
              <Input
                ref={avatarRef}
                type="file"
                accept="image/*"
                disabled={loading}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (file) await handleFileUpload(file, setAvatar, avatarRef);
                }}
              />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Accepts JPG/PNG/GIF and other image types. <strong>Max 3MB.</strong>
            </p>
          </div>

          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label className="mb-2" htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>

            {/* Bio */}
            <div>
              <Label className="mb-2" htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Tell people a bit about you…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={5}
                disabled={loading}
                className="resize-y"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Markdown not supported. Keep it concise for best display.
              </p>
            </div>
          </div>

          {/* Social Links */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-2" htmlFor="instagram">Instagram</Label>
                <Input
                  id="instagram"
                  placeholder="https://instagram.com/username"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <Label className="mb-2" htmlFor="x">X (Twitter)</Label>
                <Input
                  id="x"
                  placeholder="https://x.com/username"
                  value={x}
                  onChange={(e) => setX(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <Label className="mb-2" htmlFor="website">Website</Label>
                <Input
                  id="website"
                  placeholder="https://yourdomain.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  disabled={loading}
                />
              </div>

              <div>
                <Label className="mb-2" htmlFor="telegram">Telegram</Label>
                <Input
                  id="telegram"
                  placeholder="https://t.me/username"
                  value={telegram}
                  onChange={(e) => setTelegram(e.target.value)}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        </div>

        <SheetFooter className="flex justify-end gap-2">
          <SheetClose asChild>
            <Button variant="outline" disabled={loading}>
              Cancel
            </Button>
          </SheetClose>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Saving…" : "Save Changes"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
