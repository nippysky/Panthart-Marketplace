"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function UserCardSkeleton() {
  return (
    <Card className="w-full p-3">
      {/* Cover Image */}
      <div className="relative h-36 w-full rounded-md overflow-hidden">
        <Skeleton className="absolute inset-0 w-full h-full rounded-md" />
      </div>

      <CardContent className="mt-1 p-0">
        <div className="flex items-center justify-between gap-3 mt-3">
          {/* Avatar + Name */}
          <div className="flex items-center gap-3">
            <Skeleton className="h-[40px] w-[40px] rounded-full" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-[100px]" />
              <Skeleton className="h-3 w-[80px]" />
            </div>
          </div>

          {/* Follow Button */}
          <Skeleton className="h-9 w-[80px] rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}
