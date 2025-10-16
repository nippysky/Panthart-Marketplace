"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  ColumnDef,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table";
import { makeLegendsColumns } from "./columns";
import type { LegendRow } from "../index";
import { useActiveAccount } from "thirdweb/react";

export default function LegendsTable({
  data,
  currencySymbol,
}: {
  data: LegendRow[];
  currencySymbol: string;
}) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  // ✅ hooks used inside a React component — legal
  const currentAccountLower =
    (useActiveAccount()?.address || "").toLowerCase();

  // ✅ pass the active account into the column factory
  const columns = React.useMemo<ColumnDef<LegendRow, any>[]>(
    () => makeLegendsColumns(currencySymbol, currentAccountLower),
    [currencySymbol, currentAccountLower]
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-black/[0.02] dark:bg-white/[0.04]">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="text-xs uppercase tracking-wide">
              {hg.headers.map((header) => (
                <th key={header.id} className="py-3 px-4 text-left whitespace-nowrap">
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t border-black/5 dark:border-white/5">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="py-4 px-4 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
