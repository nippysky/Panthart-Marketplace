// components/skeleton/MintingCardSkeleton.tsx
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MintingCardSkeleton() {
  return (
    <Card className="h-full p-3">
      <CardContent className="flex flex-col p-0">
        {/* Image area with status chip */}
        <div className="relative w-full aspect-square mb-3">
          {/* hero/media */}
          <Skeleton className="absolute inset-0 rounded-md" />
          {/* status chip (e.g., PUBLIC LIVE / PRESALE) */}
          <div className="absolute left-2 top-2">
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>

        {/* Title + price row */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <Skeleton className="h-4 w-2/3 rounded-md" />
          <div className="flex items-center gap-2">
            {/* ETN icon placeholder */}
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-10 rounded-md" />
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full">
          <div className="h-2 w-full rounded-md bg-black/5 dark:bg-white/5 overflow-hidden">
            {/* fill */}
            <Skeleton className="h-full w-1/2" /> {/* width just a visual placeholder */}
          </div>
        </div>

        {/* Minted counter */}
        <div className="mt-2 flex items-center justify-between">
          <Skeleton className="h-3 w-20 rounded-md" />
          {/* optional tiny badge/cta placeholder at far right */}
          <Skeleton className="h-6 w-14 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}
