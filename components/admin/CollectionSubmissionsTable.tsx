// components/admin/CollectionSubmissionsTable.tsx
"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { useActiveAccount } from "thirdweb/react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";

import { useLoaderStore } from "@/lib/store/loader-store";
import LoaderModal from "@/components/shared/loader-modal";
import ConnectWallet from "@/components/shared/connect-wallet";

import {
  CheckCircle2, XCircle, Copy, ShieldAlert, RefreshCw, Eye, ExternalLink,
} from "lucide-react";

import {
  ColumnDef, flexRender, getCoreRowModel, getPaginationRowModel,
  RowSelectionState, useReactTable,
} from "@tanstack/react-table";

type AdminSubmissionsClientProps = {
  allowedWallets: string[];
};

type SubmissionRow = {
  id: string;
  logoUrl: string | null;
  coverUrl: string | null;
  name: string | null;
  contract: string;
  symbol: string | null;
  supply: number | null;
  ownerAddress: string | null;
  baseUri: string | null;
  description: string | null;
  website: string | null;
  x: string | null;
  instagram: string | null;
  telegram: string | null;
  createdAt: string;
};

function isAllowed(allowed: string[], addr?: string | null) {
  if (!addr) return false;
  const a = addr.toLowerCase();
  return allowed.map((w) => w.toLowerCase()).includes(a);
}

function short(addr?: string | null) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export default function AdminSubmissionsClient({ allowedWallets }: AdminSubmissionsClientProps) {
  const account = useActiveAccount();
  const { show, hide } = useLoaderStore();

  // Table state
  const [rows, setRows] = React.useState<SubmissionRow[]>([]);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [filter, setFilter] = React.useState("");

  // Reject modal state
  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");
  const [rejectIds, setRejectIds] = React.useState<string[]>([]);

  // View drawer state
  const [viewOpen, setViewOpen] = React.useState(false);
  const [viewItem, setViewItem] = React.useState<SubmissionRow | null>(null);

  // Gates
  const connected = Boolean(account?.address);
  const permitted = isAllowed(allowedWallets, account?.address);

  // Fetch pending rows
  const fetchRows = React.useCallback(async () => {
    if (!connected || !permitted) return;
    try {
      show("Loading submissions…");
      const res = await fetch(`/api/admin/collection-submissions?status=pending`, {
        headers: { "x-admin-wallet": account!.address! },
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Failed to load submissions");
      setRows(json.data as SubmissionRow[]);
    } catch (e: any) {
      toast.error(e?.message || "Failed to load");
    } finally {
      hide();
    }
  }, [connected, permitted, account?.address, show, hide]);

  React.useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Approve one or many
  const approve = React.useCallback(
    async (ids: string[]) => {
      if (!connected || !permitted || ids.length === 0) return;
      try {
        show("Approving…");
        const res = await fetch(`/api/admin/collection-submissions/bulk`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-wallet": account!.address!,
          },
          body: JSON.stringify({ ids, action: "APPROVE" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Approval failed");
        toast.success(`Approved ${json.count} submission(s)`);
        setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
        setRowSelection({});
      } catch (e: any) {
        toast.error(e?.message || "Approval failed");
      } finally {
        hide();
      }
    },
    [connected, permitted, account?.address, show, hide]
  );

  // Reject one or many (API call)
  const reject = React.useCallback(
    async (ids: string[], reason: string) => {
      if (!connected || !permitted || ids.length === 0) return;
      try {
        show("Rejecting…");
        const res = await fetch(`/api/admin/collection-submissions/bulk`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-admin-wallet": account!.address!,
          },
          body: JSON.stringify({ ids, action: "REJECT", reason }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Rejection failed");
        toast.success(`Rejected ${json.count} submission(s)`);
        setRows((prev) => prev.filter((r) => !ids.includes(r.id)));
        setRowSelection({});
      } catch (e: any) {
        toast.error(e?.message || "Rejection failed");
      } finally {
        hide();
      }
    },
    [connected, permitted, account?.address, show, hide]
  );

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success("Copied"));

  // Local filter
  const filtered = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.contract.toLowerCase().includes(q) ||
        (r.name || "").toLowerCase().includes(q) ||
        (r.symbol || "").toLowerCase().includes(q)
    );
  }, [rows, filter]);

  // Columns
  const columns = React.useMemo<ColumnDef<SubmissionRow>[]>(() => {
    return [
      {
        id: "select",
        header: ({ table }) => (
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
            aria-label="Select all"
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            aria-label="Select row"
          />
        ),
        size: 30,
      },
      {
        id: "logo",
        header: () => <span className="sr-only">Logo</span>,
        cell: ({ row }) => (
          <div className="relative w-10 h-10 rounded-md overflow-hidden bg-muted">
            {row.original.logoUrl ? (
              <Image
                src={row.original.logoUrl}
                alt="logo"
                fill
                className="object-cover"
                unoptimized
              />
            ) : null}
          </div>
        ),
        size: 54,
      },
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => <div className="font-medium">{row.original.name || "—"}</div>,
      },
      {
        accessorKey: "contract",
        header: "Contract",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <code className="text-xs">{short(row.original.contract)}</code>
            <button
              className="p-1 hover:text-primary"
              onClick={() => copy(row.original.contract)}
              title="Copy"
            >
              <Copy className="w-4 h-4" />
            </button>
          </div>
        ),
      },
      {
        accessorKey: "supply",
        header: "Total Supply",
        cell: ({ row }) => <span>{row.original.supply ?? "—"}</span>,
      },
      {
        accessorKey: "symbol",
        header: "Symbol",
        cell: ({ row }) => <span>{row.original.symbol || "—"}</span>,
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="inline-flex items-center gap-1"
              title="View"
              onClick={() => {
                setViewItem(row.original);
                setViewOpen(true);
              }}
            >
              <Eye className="w-4 h-4" />
              View
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="text-emerald-600 hover:text-emerald-700"
              onClick={() => approve([row.original.id])}
              title="Approve"
            >
              <CheckCircle2 className="w-4 h-4" />
            </Button>

            <Button
              size="icon"
              variant="outline"
              className="text-red-600 hover:text-red-700"
              onClick={() => {
                setRejectIds([row.original.id]);
                setRejectReason("");
                setRejectOpen(true);
              }}
              title="Reject"
            >
              <XCircle className="w-4 h-4" />
            </Button>
          </div>
        ),
      },
    ];
  }, [approve]);

  // Table instance
  const table = useReactTable({
    data: filtered,
    columns,
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  // Selected IDs — derive so buttons enable instantly
  const selectedIds = table.getSelectedRowModel().rows.map((r) => r.original.id);

  // ── Gates ────────────────────────────────────────────────────────────────
  if (!connected) {
    return (
      <div className="border rounded-lg p-10 text-center flex flex-col items-center gap-5">
        <LoaderModal />
        <p className="text-muted-foreground">
          Connect your wallet to access the admin dashboard.
        </p>
        <ConnectWallet />
      </div>
    );
  }

  if (!permitted) {
    return (
      <div className="border rounded-lg p-10 text-center flex flex-col items-center gap-5">
        <LoaderModal />
        <ShieldAlert className="w-8 h-8 text-yellow-500" />
        <p className="text-lg font-medium">Access Denied</p>
        <p className="text-muted-foreground">
          The connected wallet <span className="font-mono">{short(account?.address)}</span> is
          not allowed to access the admin dashboard.
        </p>
        <ConnectWallet />
      </div>
    );
  }

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <>
      <LoaderModal />

      {/* Top-right persistent Thirdweb chip */}
      <div className="flex justify-end mb-4">
        <ConnectWallet />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Search by name / symbol / contract…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchRows}
            title="Refresh"
            className="inline-flex gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-700"
            disabled={selectedIds.length === 0}
            onClick={() => approve(selectedIds)}
          >
            Approve Selected
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedIds.length === 0}
            onClick={() => {
              setRejectIds(selectedIds);
              setRejectReason("");
              setRejectOpen(true);
            }}
          >
            Reject Selected
          </Button>
        </div>
      </div>

      {/* Table (shadcn data-table primitives) */}
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((h) => (
                  <TableHead key={h.id} style={{ width: h.getSize() }}>
                    {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>

          <TableBody>
            {table.getRowModel().rows.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No pending submissions.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        {/* Pagination */}
        <div className="flex items-center justify-end gap-2 p-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>

      {/* Reject Modal (reason required; CLOSE IMMEDIATELY on Reject) */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>Reject Submission{rejectIds.length > 1 ? "s" : ""}</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Provide a clear reason. The submission{rejectIds.length > 1 ? "s" : ""} will be deleted so
              the creator can resubmit.
            </p>
            <textarea
              className="w-full rounded-md border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-primary min-h-[120px]"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Missing website & socials. Please add verifiable links and resubmit."
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={async () => {
                // Close first so LoaderModal is fully visible while the request runs
                const ids = [...rejectIds];
                const reason = rejectReason.trim();
                setRejectOpen(false);
                setRejectIds([]);
                setRejectReason("");
                await reject(ids, reason);
              }}
            >
              Reject
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRejectOpen(false);
                setRejectIds([]);
                setRejectReason("");
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Drawer (Sheet) with added inner padding */}
      <Sheet open={viewOpen} onOpenChange={setViewOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0">
          <div className="px-4 sm:px-6 py-4">
            <SheetHeader>
              <SheetTitle>Submission Details</SheetTitle>
            </SheetHeader>

            {viewItem && (
              <div className="mt-4 space-y-6">
                {/* Cover + logo */}
                <div className="relative w-full h-40 rounded-lg overflow-hidden bg-muted">
                  {viewItem.coverUrl ? (
                    <Image
                      src={viewItem.coverUrl}
                      alt="cover"
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                      No cover
                    </div>
                  )}
                  {viewItem.logoUrl && (
                    <div className="absolute bottom-4 left-4 w-16 h-16 rounded-xl overflow-hidden border-4 border-background bg-muted">
                      <Image
                        src={viewItem.logoUrl}
                        alt="logo"
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  )}
                </div>
                <div className="pt-6">
                  <div className="text-lg font-semibold">
                    {viewItem.name || "—"} {viewItem.symbol ? `(${viewItem.symbol})` : ""}
                  </div>
                  <div className="mt-2 grid grid-cols-1 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Contract</span>
                      <code className="text-xs break-all">{viewItem.contract}</code>
                      <button className="p-1 hover:text-primary" onClick={() => copy(viewItem.contract)}>
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Owner</span>
                      <code className="text-xs break-all">{viewItem.ownerAddress || "—"}</code>
                      {viewItem.ownerAddress && (
                        <button className="p-1 hover:text-primary" onClick={() => copy(viewItem.ownerAddress!)}>
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Supply</span>
                      <span>{viewItem.supply ?? "—"}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-muted-foreground w-28 shrink-0 pt-1">Base URI</span>
                      <div className="min-w-0">
                        <code className="text-xs break-all">{viewItem.baseUri || "—"}</code>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Submitted</span>
                      <span>
                        {new Date(viewItem.createdAt).toLocaleString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="text-sm font-medium mb-1">Description</div>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {viewItem.description || "—"}
                  </p>
                </div>

                {/* Links */}
                <div className="space-y-2">
                  <div className="text-sm font-medium">Links</div>
                  <ul className="text-sm space-y-1">
                    <li className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Website</span>
                      {viewItem.website ? (
                        <Link href={viewItem.website} target="_blank" className="inline-flex items-center gap-1 underline">
                          {viewItem.website}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">X</span>
                      {viewItem.x ? (
                        <Link href={viewItem.x} target="_blank" className="inline-flex items-center gap-1 underline">
                          {viewItem.x}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Instagram</span>
                      {viewItem.instagram ? (
                        <Link href={viewItem.instagram} target="_blank" className="inline-flex items-center gap-1 underline">
                          {viewItem.instagram}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </li>
                    <li className="flex items-center gap-2">
                      <span className="text-muted-foreground w-28 shrink-0">Telegram</span>
                      {viewItem.telegram ? (
                        <Link href={viewItem.telegram} target="_blank" className="inline-flex items-center gap-1 underline">
                          {viewItem.telegram}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </li>
                  </ul>
                </div>

                {/* Inline actions */}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => {
                      if (viewItem) approve([viewItem.id]);
                      setViewOpen(false);
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => {
                      if (!viewItem) return;
                      setRejectIds([viewItem.id]);
                      setRejectReason("");
                      setViewOpen(false);
                      setRejectOpen(true);
                    }}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
