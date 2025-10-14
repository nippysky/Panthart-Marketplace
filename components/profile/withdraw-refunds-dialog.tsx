"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import clsx from "clsx";
import {
  Address,
  Abi,
  Hash,
  defineChain,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  formatUnits,
  encodeFunctionData,
} from "viem";
import { useActiveAccount } from "thirdweb/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CircleDollarSign, ExternalLink, Copy } from "lucide-react";
import { MARKETPLACE_CORE_ABI } from "@/lib/abis/marketplace-core/marketPlaceCoreABI";

/* ──────────────────────────────────────────────────────────────────────────────
 * Chain & env
 * ──────────────────────────────────────────────────────────────────────────────*/
const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.RPC_URL ||
  "https://rpc.ankr.com/electroneum";

const EXPLORER_BASE = (
  process.env.NEXT_PUBLIC_BLOCK_EXPLORER ||
  "https://blockexplorer.electroneum.com"
).replace(/\/+$/, "");

const MARKETPLACE_ADDRESS = process.env
  .NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS as Address | undefined;

const ELECTRONEUM = defineChain({
  id: 52014,
  name: "Electroneum",
  nativeCurrency: { name: "Electroneum", symbol: "ETN", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "ETN Explorer", url: EXPLORER_BASE } },
});
const CHAIN_HEX_ID = `0x${ELECTRONEUM.id.toString(16)}` as const;

const ZERO_ADDR = "0x0000000000000000000000000000000000000000" as Address;

function explorerTxUrl(hash: Hash) {
  return `${EXPLORER_BASE}/tx/${hash}`;
}

async function ensureWalletOnChain(provider: any) {
  if (!provider?.request) return;
  try {
    const currentHex = await provider.request({ method: "eth_chainId" });
    if (String(currentHex).toLowerCase() === CHAIN_HEX_ID.toLowerCase()) return;

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_HEX_ID }],
    });
  } catch (err: any) {
    if (err?.code === 4902) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: CHAIN_HEX_ID,
            chainName: ELECTRONEUM.name,
            nativeCurrency: ELECTRONEUM.nativeCurrency,
            rpcUrls: [RPC_URL],
            blockExplorerUrls: [EXPLORER_BASE],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Types
 * ──────────────────────────────────────────────────────────────────────────────*/
type CurrencyOption = {
  id: string | null; // DB id or null for ETN
  symbol: string; // e.g. ETN, USDC
  kind: "NATIVE" | "ERC20";
  decimals: number;
  tokenAddress?: string | null; // null for ETN
  active?: boolean;
};

type Row = {
  currency: CurrencyOption;
  rawWei: bigint;
  formatted: string;
  hasCredit: boolean;
  lastTx?: Hash | null;
};

/* ──────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────────*/
function withTimeout<T>(p: Promise<T>, ms: number, label = "request") {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

/* ──────────────────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────────────────────*/
export default function WithdrawRefundsDialog({
  ownerAddress,
  className,
}: {
  ownerAddress: string;
  className?: string;
}) {
  const acct = useActiveAccount();
  const myAddr = (acct?.address ?? "") as Address;

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [withdrawing, setWithdrawing] = React.useState(false);
  const [rows, setRows] = React.useState<Row[]>([]);
  const [anyTx, setAnyTx] = React.useState<Hash | null>(null);

  // Currency list we will actually use to query refunds.
  // Seed with ETN immediately so the modal never looks empty.
  const [currencies, setCurrencies] = React.useState<CurrencyOption[]>([
    {
      id: null,
      symbol: "ETN",
      kind: "NATIVE",
      decimals: 18,
      tokenAddress: null,
      active: true,
    },
  ]);

  const [extraCurrenciesState, setExtraCurrenciesState] = React.useState<
    "idle" | "loading" | "loaded" | "error"
  >("idle");

  const pub = React.useMemo(
    () => createPublicClient({ chain: ELECTRONEUM, transport: http(RPC_URL) }),
    []
  );

  /* ============================================================
   * Fetch extra currencies (non-blocking, with timeout & retry)
   * ============================================================ */
  const { refetch: refetchActiveCurrencies } = useQuery({
    queryKey: ["active-currencies"],
    queryFn: async () => {
      // 10s timeout guard; retry logic handled below by manual calls
      const res = await withTimeout(
        fetch("/api/currencies/active", { cache: "no-store" }),
        10000,
        "/api/currencies/active"
      );
      if (!res.ok) throw new Error("Active currencies fetch failed");
      const json = await res.json();
      const list: CurrencyOption[] = Array.isArray(json?.items)
        ? json.items.map((it: any) => ({
            id: String(it.id),
            symbol: String(it.symbol),
            kind: (it.kind as "NATIVE" | "ERC20") ?? "ERC20",
            decimals: Number(it.decimals ?? 18),
            tokenAddress: it.tokenAddress ?? null,
            active: true,
          }))
        : [];
      // Filter out ETN duplicates and sort by symbol for stable UI
      return list.filter(
        (c) => !(c.kind === "NATIVE" && c.symbol.toUpperCase() === "ETN")
      ).sort((a, b) => a.symbol.localeCompare(b.symbol));
    },
    // We control when it runs (only when modal is opened)
    enabled: false,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  async function loadExtraCurrencies(retries = 1) {
    if (extraCurrenciesState === "loading" || extraCurrenciesState === "loaded") return;
    setExtraCurrenciesState("loading");
    try {
      const { data } = await refetchActiveCurrencies();
      if (Array.isArray(data) && data.length) {
        // merge ETN (already first) + extra
        setCurrencies((prev) => {
          const withoutDupes = data.filter(
            (c) => !prev.some((p) => (p.tokenAddress || "") === (c.tokenAddress || "") && p.symbol === c.symbol)
          );
          return [...prev, ...withoutDupes];
        });
      }
      setExtraCurrenciesState("loaded");
    } catch (e) {
      if (retries > 0) {
        // brief backoff
        await new Promise((r) => setTimeout(r, 800));
        return loadExtraCurrencies(retries - 1);
      }
      setExtraCurrenciesState("error");
      // keep ETN-only; user can still refresh later
    }
  }

  // Reads credits for the provided currency list
  async function refreshCredits(currs: CurrencyOption[]) {
    if (!MARKETPLACE_ADDRESS) {
      toast.error("Marketplace address not configured.");
      return;
    }
    if (!currs?.length) return;

    setLoading(true);
    try {
      const updated = await Promise.all(
        currs.map(async (c) => {
          const currencyAddr = (c.tokenAddress || ZERO_ADDR) as Address;
          const raw = (await pub.readContract({
            address: MARKETPLACE_ADDRESS,
            abi: MARKETPLACE_CORE_ABI as Abi,
            functionName: "credits",
            args: [currencyAddr, ownerAddress as Address],
          })) as bigint;

          const formatted = Number(
            formatUnits(raw, c.decimals ?? 18)
          ).toLocaleString(undefined, { maximumFractionDigits: 6 });

          return {
            currency: c,
            rawWei: raw,
            formatted,
            hasCredit: raw > 0n,
          } as Row;
        })
      );
      setRows(updated);
    } catch (err) {
      console.error("credits read error", err);
      toast.error("Could not load refunds");
    } finally {
      setLoading(false);
    }
  }

  /* ───────────────────────────────────────────
   * Open -> immediately show ETN credits.
   * Then (non-blocking) try to fetch extra ERC20s
   * and refresh again when they arrive.
   * Also re-run when wallet/owner changes while open.
   * ─────────────────────────────────────────── */
  React.useEffect(() => {
    if (!open) return;

    let cancelled = false;

    (async () => {
      // 1) Always refresh with current currency list (ETN available instantly)
      await refreshCredits(currencies);
      if (cancelled) return;

      // 2) Kick off extra currencies in the background (if not yet loaded)
      if (extraCurrenciesState === "idle") {
        await loadExtraCurrencies(1);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // When extra currencies list gets merged, refresh credits once.
  React.useEffect(() => {
    if (open) {
      // Avoid hammering: if we only had ETN before and now we have >1, refresh.
      if (currencies.length > 1) {
        refreshCredits(currencies);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currencies]);

  React.useEffect(() => {
    if (open) {
      refreshCredits(currencies);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acct?.address, ownerAddress]);

  const totalCredits = React.useMemo(
    () => rows.filter((r) => r.hasCredit),
    [rows]
  );

  async function withdrawAll() {
    if (!myAddr) return toast.error("Connect your wallet first.");
    if (!totalCredits.length) return toast("No refunds to withdraw.");

    const provider = (globalThis as any).ethereum;
    if (!provider?.request) {
      toast.error("No injected wallet provider found.");
      return;
    }

    try {
      setWithdrawing(true);
      await ensureWalletOnChain(provider);

      const wallet = createWalletClient({
        chain: ELECTRONEUM,
        transport: custom(provider),
      });

      // sequential per-currency for clean UX + receipts
      for (const r of totalCredits) {
        const cAddr = (r.currency.tokenAddress || ZERO_ADDR) as Address;
        const data = encodeFunctionData({
          abi: MARKETPLACE_CORE_ABI as Abi,
          functionName: "withdrawCredits",
          args: [cAddr],
        });

        const hash = await wallet.sendTransaction({
          chain: ELECTRONEUM,
          to: MARKETPLACE_ADDRESS!,
          data,
          account: myAddr,
        });

        setAnyTx(hash);
        setRows((prev) =>
          prev.map((x) =>
            x.currency.symbol === r.currency.symbol ? { ...x, lastTx: hash } : x
          )
        );

        toast.success(`Withdrawing ${r.currency.symbol}…`);
        await pub.waitForTransactionReceipt({ hash });
      }

      toast.success("All available refunds withdrawn.");
      await refreshCredits(currencies);
    } catch (err: any) {
      console.error("withdrawCredits error", err);
      toast.error(err?.shortMessage || err?.message || "Withdrawal failed");
    } finally {
      setWithdrawing(false);
    }
  }

  const hasAnyCredit = totalCredits.length > 0;

  return (
    <>
      <Button
        variant="outline"
        className={clsx("rounded-lg", className)}
        onClick={() => {
          if (!MARKETPLACE_ADDRESS) {
            toast.error("Marketplace address not configured.");
            return;
          }
          setOpen(true);
        }}
      >
        <CircleDollarSign className="mr-2 h-4 w-4" />
        Refunds
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="
            w-[calc(100vw-2rem)] sm:w-full sm:max-w-lg
            max-h-[92vh] sm:max-h-[86vh]
            p-0 overflow-hidden
          "
        >
          <div className="flex h-full flex-col">
            <DialogHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b">
              <DialogTitle>Withdraw Refunds</DialogTitle>
            </DialogHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-4">
              {/* Address + marketplace */}
              <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
                <div className="text-sm text-muted-foreground">Your wallet</div>
                <div className="text-xs break-all">{ownerAddress}</div>
                <div className="text-sm text-muted-foreground mt-3">Marketplace</div>
                <div className="text-xs break-all">{MARKETPLACE_ADDRESS || "—"}</div>
              </div>

              {/* Balances list */}
              <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium">Available refunds</div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => refreshCredits(currencies)}
                    disabled={loading || withdrawing}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Refresh
                      </>
                    ) : (
                      "Refresh"
                    )}
                  </Button>
                </div>

                {/* Non-blocking status line for extra currencies */}
                {extraCurrenciesState === "loading" && (
                  <div className="text-sm text-muted-foreground mb-2">
                    ETN loaded. Loading other currencies…
                  </div>
                )}
                {extraCurrenciesState === "error" && (
                  <div className="text-sm text-muted-foreground mb-2">
                    Other currencies unavailable right now.
                    <Button
                      size="sm"
                      variant="link"
                      className="ml-1 px-0"
                      onClick={() => loadExtraCurrencies(1)}
                    >
                      Retry
                    </Button>
                  </div>
                )}

                {(!rows.length && loading) && (
                  <div className="text-sm text-muted-foreground">Loading…</div>
                )}

                {!!rows.length && (
                  <ul className="space-y-2">
                    {rows.map((r) => (
                      <li
                        key={(r.currency.id ?? `native-${r.currency.symbol}`) as string}
                        className="flex flex-col gap-1 rounded-md border bg-background/60 p-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="text-sm">
                            <span className="font-semibold">{r.currency.symbol}</span>{" "}
                            <span className="text-muted-foreground">
                              ({r.currency.kind === "NATIVE" ? "ETN" : "ERC20"})
                            </span>
                          </div>
                          <div className="text-sm font-semibold">
                            {loading ? "…" : `${r.formatted} ${r.currency.symbol}`}
                          </div>
                        </div>

                        {r.lastTx && (
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() =>
                                navigator.clipboard
                                  .writeText(r.lastTx as string)
                                  .then(() => toast.success("Hash copied"))
                              }
                            >
                              <Copy className="mr-1 h-3.5 w-3.5" />
                              Copy Tx
                            </Button>
                            <Button size="sm" variant="outline" asChild>
                              <a
                                href={explorerTxUrl(r.lastTx!)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open in Explorer
                                <ExternalLink className="ml-1 h-3.5 w-3.5" />
                              </a>
                            </Button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {!loading && rows.length > 0 && !hasAnyCredit && (
                  <p className="text-sm text-muted-foreground mt-2">
                    No refunds. 0&nbsp;ETN and 0&nbsp;ERC20 credits.
                  </p>
                )}
              </div>

              {/* Overall last tx (if any) */}
              {anyTx && (
                <div className="rounded-lg border bg-muted/10 p-3 sm:p-4 space-y-2">
                  <div className="text-sm text-muted-foreground">Latest transaction</div>
                  <div className="rounded-md border bg-background/60 p-2">
                    <div className="max-w-full overflow-x-auto">
                      <a
                        href={explorerTxUrl(anyTx)}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs font-mono leading-5 [overflow-wrap:anywhere] [word-break:break-word]"
                        title={anyTx}
                      >
                        {anyTx}
                      </a>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Refunds are credited when your bid is outbid or when a payout could not be
                delivered. You can withdraw them here per currency. Your wallet will be
                prompted on the <b>{ELECTRONEUM.name}</b> network.
              </p>
            </div>

            {/* Footer */}
            <DialogFooter className="gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button
                onClick={withdrawAll}
                disabled={withdrawing || loading || !hasAnyCredit}
              >
                {withdrawing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Withdrawing…
                  </>
                ) : (
                  "Withdraw All"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
