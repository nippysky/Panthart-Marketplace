"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MdEdit } from "react-icons/md";

export default function EditProfileDialog() {
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [instagram, setInstagram] = useState("");
  const [twitter, setTwitter] = useState("");
  const [website, setWebsite] = useState("");

  const handleImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    setImage: React.Dispatch<React.SetStateAction<string | null>>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default">
          <MdEdit className="mr-2" /> Edit Profile
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Profile</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Cover Photo Upload */}
          <div>
            <Label className="block mb-2">Cover Photo</Label>
            <div className="relative w-full h-40 rounded-lg bg-muted overflow-hidden flex items-center justify-center text-sm text-muted-foreground">
              {coverImage ? (
                <>
                  <Image
                    src={coverImage}
                    alt="Cover"
                    fill
                    className="object-cover object-center z-0"
                  />
                  <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center text-white font-medium">
                    Click to replace cover photo
                  </div>
                </>
              ) : (
                <span className="z-10">Click to upload cover photo</span>
              )}
              <Input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                onChange={(e) => handleImageChange(e, setCoverImage)}
              />
            </div>
          </div>

          {/* Profile Photo Upload */}
          <div>
            <Label className="block mb-2">Profile Photo</Label>
            <div className="relative w-24 h-24 rounded-md bg-muted overflow-hidden flex items-center justify-center text-xs text-muted-foreground">
              {profileImage ? (
                <>
                  <Image
                    src={profileImage}
                    alt="Profile"
                    fill
                    className="object-cover object-center z-0"
                  />
                  <div className="absolute inset-0 bg-black/40 z-10 flex items-center justify-center text-white text-[10px] text-center px-2">
                    Click to replace
                  </div>
                </>
              ) : (
                <span className="z-10 text-center px-2">Click to upload</span>
              )}
              <Input
                type="file"
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20 rounded-full"
                onChange={(e) => handleImageChange(e, setProfileImage)}
              />
            </div>
          </div>

          {/* Social Links */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="instagram">Instagram</Label>
              <div className="mt-2">
                <Input
                  type="text"
                  id="instagram"
                  placeholder="https://instagram.com/yourhandle"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="x">X</Label>
              <div className="mt-2">
                <Input
                  type="text"
                  id="x"
                  placeholder="https://x.com/yourhandle"
                  value={twitter}
                  onChange={(e) => setTwitter(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="website">Website</Label>
              <div className="mt-2">
                <Input
                  type="text"
                  id="website"
                  placeholder="https://yourwebsite.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button type="submit">Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
