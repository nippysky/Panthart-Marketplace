"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LegendRow } from "../index";

function shorten(addr: string) {
  return addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : "";
}

const EXPLORER =
  process.env.NEXT_PUBLIC_BLOCK_EXPLORER ||
  "https://blockexplorer.electroneum.com";

export default function LegendsMobileCards({
  items,
  isLoading,
}: {
  items: LegendRow[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="p-3">
            <div className="flex items-center gap-3">
              <Skeleton className="h-[44px] w-[44px] rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-3 w-1/3 mt-2" />
              </div>
              <Skeleton className="h-6 w-6 rounded-full" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <small className="opacity-70">COMRADES</small>
                <Skeleton className="h-5 w-16 mt-1" />
              </div>
              <div>
                <small className="opacity-70">ACC FEE (ETN)</small>
                <Skeleton className="h-5 w-20 mt-1" />
              </div>
            </div>
          </Card>
        ))}
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-black/10 dark:border-white/10 p-6 text-center text-sm text-muted-foreground">
        No holders yet.
      </div>
    );
  }

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {items.map((u) => (
        <Card
          key={u.userId}
          className="p-3 hover:ring-1 hover:ring-brand/40 transition"
        >
          <CardContent className="p-0">
            <div className="flex items-center gap-3">
              <div className="relative h-[44px] w-[44px] rounded-full overflow-hidden bg-muted">
                {u.profileAvatar ? (
                  <Image
                    src={u.profileAvatar}
                    alt={u.username}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/profile/${u.walletAddress}`}
                  className="font-medium hover:underline block truncate"
                >
                  {u.username}
                </Link>
                <a
                  href={`${EXPLORER}/address/${u.walletAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:underline"
                >
                  {shorten(u.walletAddress)}
                </a>
              </div>
              <div className="w-7 h-7 rounded-full bg-black/5 dark:bg-white/10 flex items-center justify-center text-xs font-semibold">
                {u.rank}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <small className="opacity-70">COMRADES</small>
                <div className="text-base font-semibold mt-1">{u.comrades}</div>
              </div>
              <div>
                <small className="opacity-70">ACC FEE (ETN)</small>
                <div className="text-base font-semibold mt-1 flex items-center gap-1">
                  {Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(
                    u.feeShareEtn
                  )}
                  <Image src="/ETN_LOGO.png" alt="ETN" width={14} height={14} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
