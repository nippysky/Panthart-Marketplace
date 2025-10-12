"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Share2, Copy } from "lucide-react";
import { BsTwitterX } from "react-icons/bs";
import {
  FaFacebookF,
  FaLinkedinIn,
  FaRedditAlien,
  FaTelegramPlane,
  FaWhatsapp,
} from "react-icons/fa";
import Image from "next/image";
import clsx from "clsx";

type ShareButtonProps = {
  title: string;
  text?: string;
  url?: string;
  image?: string | null;
  hashtags?: string[];
  className?: string;
  size?: number;
};

export default function ShareButton({
  title,
  text,
  url,
  image,
  hashtags = ["NFT", "ETN", "Panthart"],
  className,
  size = 20,
}: ShareButtonProps) {
  const [open, setOpen] = React.useState(false);
  const [currentUrl, setCurrentUrl] = React.useState(url ?? "");

  React.useEffect(() => {
    if (!url && typeof window !== "undefined") setCurrentUrl(window.location.href);
  }, [url]);

  const shareText = text?.trim() || title?.trim() || "Check this out";
  const hashtagsCSV = hashtags.filter(Boolean).join(",");
  const enc = (v: string) => encodeURIComponent(v);

  const links = React.useMemo(() => {
    const u = enc(currentUrl || "");
    const t = enc(shareText || "");
    const h = enc(hashtagsCSV || "");
    return {
      x: `https://twitter.com/intent/tweet?text=${t}&url=${u}${h ? `&hashtags=${h}` : ""}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
      telegram: `https://t.me/share/url?url=${u}&text=${t}`,
      whatsapp: `https://wa.me/?text=${t}%20${u}`,
      reddit: `https://www.reddit.com/submit?url=${u}&title=${t}`,
      email: `mailto:?subject=${enc(title)}&body=${t}%0A%0A${u}`,
    };
  }, [currentUrl, shareText, hashtagsCSV, title]);

  async function handlePrimaryShare() {
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share({ title, text: shareText, url: currentUrl });
        return;
      }
    } catch (e: any) {
      if (e?.name === "AbortError") return;
    }
    setOpen(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(currentUrl);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Could not copy link");
    }
  }

  const Action = ({
    href,
    label,
    icon,
    className,
  }: {
    href: string;
    label: string;
    icon: React.ReactNode;
    className?: string;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => setOpen(false)}
      className={clsx(
        "w-full min-w-0 flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium bg-card hover:bg-muted transition shadow-sm",
        className
      )}
      aria-label={label}
    >
      <span className="text-base shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </a>
  );

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className={clsx("rounded-full hover:bg-muted", className)}
        onClick={handlePrimaryShare}
        aria-label="Share"
        title="Share"
      >
        <Share2 size={size} />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Full-screen on mobile; classic centered modal on sm+ */}
        <DialogContent
          className={clsx(
            "max-w-none sm:!max-w-none md:!max-w-none",
            // mobile
            "w-screen h-[100dvh] max-h-[100dvh] m-0 p-0 rounded-none overflow-hidden",
            // desktop/tablet
            "sm:w-[min(94vw,44rem)] sm:h-auto sm:max-h-[85vh] sm:m-auto sm:rounded-2xl"
          )}
        >
          <div className="flex h-full flex-col">
            {/* HEADER */}
            <div className="px-4 py-4 sm:px-6 sm:py-6">
              <DialogHeader className="p-0">
                <DialogTitle>Share this collection</DialogTitle>
                <DialogDescription>Spread the word on your favorite platforms.</DialogDescription>
              </DialogHeader>
            </div>

            {/* BODY (scrollable on mobile) */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-6 sm:pb-6 space-y-4">
              {/* Preview card (fluid, wraps URL on mobile) */}
              <div className="flex items-center gap-3 rounded-lg border p-3 bg-muted/30">
                <div className="relative w-12 h-12 rounded-md overflow-hidden ring-1 ring-border bg-muted shrink-0">
                  {image ? <Image src={image} alt={title} fill className="object-cover" unoptimized /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{title}</div>
                  <div className="text-xs text-muted-foreground break-all sm:break-normal sm:truncate">
                    {currentUrl}
                  </div>
                </div>
              </div>

              {/* Social actions — wrap nicely (2 cols on mobile, auto-fit on sm+) */}
              <div className="grid grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2 sm:gap-3">
                <Action href={links.x} label="Post on X" icon={<BsTwitterX />} className="hover:ring-1 hover:ring-border" />
                <Action href={links.facebook} label="Facebook" icon={<FaFacebookF />} />
                <Action href={links.linkedin} label="LinkedIn" icon={<FaLinkedinIn />} />
                <Action href={links.telegram} label="Telegram" icon={<FaTelegramPlane />} />
                <Action href={links.whatsapp} label="WhatsApp" icon={<FaWhatsapp />} />
                <Action href={links.reddit} label="Reddit" icon={<FaRedditAlien />} />
              </div>

              {/* Copy / Email — stacks on mobile */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row gap-2 min-w-0">
                  <Input
                    value={currentUrl}
                    readOnly
                    className="font-mono text-xs flex-1 min-w-0 break-all"
                  />
                  <Button variant="secondary" onClick={copy} className="w-full sm:w-auto sm:shrink-0">
                    <Copy className="mr-1 h-4 w-4" /> Copy
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  Or <a href={links.email} className="underline">share via email</a>.
                </div>
              </div>
            </div>

            {/* FOOTER (always visible; respects iOS safe area) */}
            <div className="sticky bottom-0 left-0 right-0 border-t bg-background px-4 sm:px-6 pt-3 pb-[max(env(safe-area-inset-bottom),.75rem)]">
              <DialogFooter className="p-0">
                <Button onClick={() => setOpen(false)} className="w-full sm:w-auto">Close</Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
