"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AuctionCardSkeleton() {
  return (
    <Card className="h-full p-3">
      <CardContent className="flex flex-col p-0">
        <div className="relative w-full aspect-square mb-2">
          <Skeleton className="absolute w-full h-full rounded-md" />
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <Skeleton className="h-4 w-3/4 rounded-md" />
          <div className="flex justify-between items-center">
            <Skeleton className="h-3 w-1/3 rounded-md" />
            <Skeleton className="h-6 w-10 rounded-md" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
