// components/explore/table/skeleton-row.tsx
"use client";

import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonRow({ rows = 8 }: { rows?: number }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-xs uppercase tracking-wide">
          {["#", "Collection", "Floor Price", "Volume", "Change", "Items", "Owners"].map(
            (h) => (
              <th key={h} className="py-3 px-4 text-left">{h}</th>
            )
          )}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }).map((_, i) => (
          <tr key={i} className="border-t border-black/5 dark:border-white/5">
            {Array.from({ length: 7 }).map((__, j) => (
              <td key={j} className="py-4 px-4">
                <Skeleton className="h-4 w-full" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
