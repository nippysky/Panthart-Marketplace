"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ArtDisplaySkeleton() {
  return (
    <Card className="p-3 overflow-hidden border shadow-lg">
      {/* Image Placeholder */}
      <div className="relative w-full aspect-square rounded-md overflow-hidden">
        <Skeleton className="absolute inset-0 w-full h-full" />
      </div>

      <CardContent className="p-0">
        <CardHeader className="p-0">
          <CardTitle>
            <Skeleton className="h-4 w-3/4 mt-3 rounded" />
          </CardTitle>
        </CardHeader>

        <div className="w-full flex justify-between items-center gap-5 mt-4">
          <Skeleton className="h-4 w-1/4 rounded" />
          <Skeleton className="h-4 w-12 rounded" />
        </div>
      </CardContent>
    </Card>
  );
}
