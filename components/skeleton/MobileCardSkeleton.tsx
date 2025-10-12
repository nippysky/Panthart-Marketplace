"use client";

import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function MobileCardSkeleton() {
  return (
    <Card className="w-full border p-3">
      <CardContent className="p-0">
        <div className="flex w-full items-center justify-between gap-5">
          <div className="flex w-[90%] items-center gap-3">
            <Skeleton className="h-[50px] w-[50px] rounded-md" />
            <Skeleton className="h-4 w-[60%]" />
          </div>
        </div>

        <div className="my-5 flex items-center justify-between gap-5">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-[40px]" />
            <Skeleton className="h-5 w-[70px]" />
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-[40px]" />
            <Skeleton className="h-5 w-[70px]" />
          </div>
        </div>
      </CardContent>

      <CardFooter className="p-0">
        <Skeleton className="h-10 w-full rounded-md" />
      </CardFooter>
    </Card>
  );
}
