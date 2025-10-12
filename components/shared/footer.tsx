// components/shared/footer.tsx
"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/lib/images";
import { ThemeToggle } from "./theme-toggler";
import { FaTelegramPlane } from "react-icons/fa";
import { FaXTwitter } from "react-icons/fa6";
import { IoNewspaperOutline } from "react-icons/io5";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* -------------------------- content config -------------------------- */

const NAV = {
  directory: [
    { label: "Collections", href: "/collections" },
    { label: "Minting Now", href: "/minting-now" },
    { label: "Live Auctions", href: "/auctions" },
    { label: "Bid Collection Of The Month", href: "/bid-featured-collection" },
  ],
  explore: [
    { label: "Explore Panthart", href: "/explore" },
    { label: "Create a Collection", href: "/create" },
    { label: "Submit a Collection", href: "/submit-collection" },
  ],
  resources: [
    { label: "Documentation", href: "/docs" },
    { label: "Terms & Conditions", href: "/terms-conditions" },
  ],
} as const;

const SOCIAL = [
  {
    title: "Decent Paper",
    href: "/DECENT-PAPER.pdf",
    icon: <IoNewspaperOutline className="size-4" />,
    external: false,
  },
  {
    title: "X (Twitter)",
    href: "https://x.com/decentroneum",
    icon: <FaXTwitter className="size-4" />,
    external: true,
  },
  {
    title: "Telegram",
    href: "https://t.me/DecentroneumGroupChat",
    icon: <FaTelegramPlane className="size-4" />,
    external: true,
  },
] as const;

/* ----------------------------- helpers ------------------------------ */

function NavColumn({
  title,
  items,
}: {
  title: string;
  items: { label: string; href: string }[];
}) {
  return (
    <div className="min-w-[12rem]">
      <h4 className="text-sm font-bold tracking-wide text-primary uppercase">
        {title}
      </h4>
      <ul className="mt-3 space-y-2.5">
        {items.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              className="text-sm text-foreground/80 hover:text-foreground transition-colors underline-offset-4 hover:underline"
            >
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SocialIcon({
  title,
  href,
  icon,
  external,
  className,
}: {
  title: string;
  href: string;
  icon: React.ReactNode;
  external?: boolean;
  className?: string;
}) {
  const props = external
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            href={href}
            {...props}
            aria-label={title}
            className={cn(
              "inline-flex items-center justify-center rounded-full border bg-card text-foreground/90",
              "h-9 w-9 hover:bg-muted hover:text-foreground transition-colors shadow-sm",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              className
            )}
          >
            {icon}
          </Link>
        </TooltipTrigger>
        <TooltipContent sideOffset={6}>
          <p className="text-xs">{title}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ------------------------------- UI -------------------------------- */

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="w-full border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      {/* Top grid */}
      <div className="mx-auto w-full py-8 md:py-10">
        <div className="grid gap-8 md:gap-10 lg:gap-12 grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.2fr_1fr_1fr_1fr] items-start">
          {/* Brand + short blurb */}
          <div className="flex flex-col gap-4">
            <Link href="/" className="inline-flex items-center gap-3">
              <Image
                src={BrandLogo}
                alt="Decentroneum Logo"
                width={40}
                height={40}
                priority
                className="rounded-md"
              />
              <span className="text-base font-bold tracking-wide">
                Panthart
              </span>
            </Link>

            <p className="text-sm text-muted-foreground leading-relaxed max-w-prose">
              The NFT marketplace of the Electroneum ecosystem. Mint, trade, and discover digital
              assets with speed, clarity, and trust.
            </p>

            {/* Socials + theme */}
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              {SOCIAL.map((s) => (
                <SocialIcon
                  key={s.href}
                  title={s.title}
                  href={s.href}
                  icon={s.icon}
                  external={s.external}
                />
              ))}
              <div className="ml-1">
                <ThemeToggle />
              </div>
            </div>
          </div>

          {/* Directory */}
          <NavColumn title="Directory" items={NAV.directory as any} />
          {/* Create */}
          <NavColumn title="Explore" items={NAV.explore as any} />
          {/* Resources */}
          <NavColumn title="Resources" items={NAV.resources as any} />
        </div>
      </div>

      {/* Bottom strip */}
      <div className="border-t">
        <div className="mx-auto w-full py-4 flex flex-col-reverse gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            © {year} Decentroneum. All rights reserved.
          </p>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <Link
              href="https://decentroneum.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Visit Decentroneum
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
