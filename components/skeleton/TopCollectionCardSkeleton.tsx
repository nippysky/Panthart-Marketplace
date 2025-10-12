"use client";

import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export default function TopCollectionCardSkeleton() {
  return (
    <section className="w-full flex justify-between items-center gap-10 my-5 p-5 border-b">
      {/* Left - index, image, name, floor */}
      <div className="w-[70%] flex gap-3 items-center">
        <span className="w-[10px]">
          <Skeleton className="h-3 w-5" />
        </span>
        <div className="flex-1 flex gap-2 items-center">
          {/* image */}
          <Skeleton className="w-[60px] h-[60px] rounded-md" />
          {/* name + floor */}
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-[100px]" />
            <div className="flex gap-2 items-center">
              <Skeleton className="h-3 w-[30px]" />
              <Skeleton className="h-3 w-[20px] rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Right - % and volume */}
      <div className="w-[30%] flex justify-end">
        <div className="flex flex-col gap-2 items-end">
          <Skeleton className="h-4 w-[40px]" />
          <div className="flex gap-2 items-center">
            <Skeleton className="h-3 w-[30px]" />
            <Skeleton className="h-3 w-[20px] rounded-full" />
          </div>
        </div>
      </div>
    </section>
  );
}
