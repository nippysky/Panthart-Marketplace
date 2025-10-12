"use client";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function CollectionArtDisplaySkeleton() {
  return (
    <Card className="w-full border p-4 overflow-hidden">
      <CardContent className="p-0">
        {/* Cover image skeleton */}
        <div className="relative w-full h-[140px] rounded-md overflow-hidden mb-4">
          <Skeleton className="absolute inset-0 w-full h-full" />
        </div>

        {/* Profile image + name */}
        <div className="flex items-center gap-3 mb-4">
          <Skeleton className="w-[50px] h-[50px] rounded-full" />
          <Skeleton className="h-5 w-2/3 rounded-md" />
        </div>

        {/* Side-by-side price + volume blocks */}
        <div className="flex justify-between gap-4">
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-1/2 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
          </div>
          <div className="flex-1 space-y-1">
            <Skeleton className="h-3 w-1/2 rounded-md" />
            <Skeleton className="h-4 w-full rounded-md" />
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-0 mt-4">
        <Skeleton className="h-10 w-full rounded-md" />
      </CardFooter>
    </Card>
  );
}
