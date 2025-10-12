"use client";

import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function ExploreCollectionTableSkeleton() {
  const headers = ["#", "Collection", "Floor Price", "24h Volume", "24h Change", "Items", "Owners"];
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h) => (
              <TableHead key={h} className={h === "#" ? "pl-6" : ""}>
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              {Array.from({ length: headers.length }).map((__, j) => (
                <TableCell key={j} className={j === 0 ? "pl-6" : ""}>
                  <Skeleton className="h-4 w-full" />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
