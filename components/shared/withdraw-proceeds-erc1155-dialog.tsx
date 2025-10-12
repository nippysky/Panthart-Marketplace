"use client";

import * as React from "react";
import {
  Address,
  Hash,
  Abi,
  defineChain,
  createPublicClient,
  createWalletClient,
  custom,
  http,
  encodeFunctionData,
  formatEther,
} from "viem";
import { useActiveAccount } from "thirdweb/react";
import { toast } from "sonner";
import clsx from "clsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CircleDollarSign, ExternalLink, Loader2, Copy } from "lucide-react";
/* ★ Use your ABI path */
import { ERC1155_SINGLE_ABI } from "@/lib/abis/ERC1155SingleDropABI";

/* ── Chain / Env ───────────────────────────────────────────────────────────── */

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ||
  process.env.RPC_URL ||
  "https://rpc.ankr.com/electroneum";

const EXPLORER_BASE = (process.env.NEXT_PUBLIC_BLOCK_EXPLORER ||
  "https://blockexplorer.electroneum.com")!.replace(/\/+$/, "");

const CHAIN_ID =
  Number(process.env.NEXT_PUBLIC_CHAIN_ID || 52014) || 52014;

const ELECTRONEUM = defineChain({
  id: CHAIN_ID,
  name: "Electroneum",
  nativeCurrency: { name: "Electroneum", symbol: "ETN", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] }, public: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "ETN Explorer", url: EXPLORER_BASE } },
});

const CHAIN_HEX_ID = `0x${ELECTRONEUM.id.toString(16)}` as const;

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

/* ── Component ─────────────────────────────────────────────────────────────── */

export type WithdrawProceedsERC1155DialogProps = {
  contract: string;
  tokenLabel?: string;
  className?: string;
};

export default function WithdrawProceedsERC1155Dialog({
  contract,
  tokenLabel = "Edition",
  className,
}: WithdrawProceedsERC1155DialogProps) {
  const acct = useActiveAccount();
  const myAddr = (acct?.address ?? "") as Address;

  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [balanceWei, setBalanceWei] = React.useState<bigint>(0n);
  const [lastTx, setLastTx] = React.useState<Hash | null>(null);

  const contractAddr = React.useMemo(() => contract as Address, [contract]);

  const pub = React.useMemo(
    () => createPublicClient({ chain: ELECTRONEUM, transport: http(RPC_URL) }),
    []
  );

  async function refreshBalance() {
    setLoading(true);
    try {
      const bal = await pub.getBalance({ address: contractAddr });
      setBalanceWei(bal);
    } catch (err) {
      console.error("getBalance error", err);
      toast.error("Could not load contract balance");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    if (open && contractAddr) refreshBalance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contractAddr]);

  async function onWithdraw() {
    if (!myAddr) return toast.error("Connect your wallet first.");
    if (balanceWei <= 0n) return toast("Nothing to withdraw — balance is 0.");

    const provider = (globalThis as any).ethereum;
    if (!provider?.request) {
      toast.error("No injected wallet provider found.");
      return;
    }

    try {
      setSending(true);
      await ensureWalletOnChain(provider);

      const wal = createWalletClient({
        chain: ELECTRONEUM,
        transport: custom(provider),
      });

      const data = encodeFunctionData({
        abi: ERC1155_SINGLE_ABI as Abi,
        functionName: "withdrawProceeds",
        args: [myAddr],
      });

      const hash = await wal.sendTransaction({
        chain: ELECTRONEUM,
        to: contractAddr,
        data,
        account: myAddr,
      });

      setLastTx(hash);
      toast.success("Withdrawal submitted. Waiting for confirmation…");
      await pub.waitForTransactionReceipt({ hash });
      toast.success("Proceeds withdrawn successfully!");
      await refreshBalance();
    } catch (err: any) {
      console.error("withdraw error", err);
      toast.error(err?.shortMessage || err?.message || "Withdrawal failed");
    } finally {
      setSending(false);
    }
  }

  const human = React.useMemo(() => {
    try {
      return Number(formatEther(balanceWei)).toLocaleString(undefined, {
        maximumFractionDigits: 6,
      });
    } catch {
      return "0";
    }
  }, [balanceWei]);

  return (
    <>
      <Button
        variant="outline"
        className={clsx("rounded-lg border-dashed", className)}
        onClick={() => setOpen(true)}
      >
        <CircleDollarSign className="mr-2 h-4 w-4" />
        Withdraw
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
              <DialogTitle>Withdraw Proceeds</DialogTitle>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4 space-y-4">
              <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
                <div className="text-sm text-muted-foreground">Token</div>
                <div className="font-medium">{tokenLabel}</div>
                <div className="text-xs text-muted-foreground mt-1 break-all">
                  {contractAddr}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm text-muted-foreground">
                      Contract Balance
                    </div>
                    <div className="text-lg font-semibold">
                      {loading ? "…" : `${human} ETN`}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={refreshBalance}
                    disabled={loading || sending}
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
              </div>

              {lastTx && (
                <div className="rounded-lg border bg-muted/10 p-3 sm:p-4 space-y-2">
                  <div className="text-sm text-muted-foreground">
                    Last transaction
                  </div>

                  <div className="rounded-md border bg-background/60 p-2">
                    <div className="max-w-full overflow-x-auto">
                      <a
                        href={explorerTxUrl(lastTx)}
                        target="_blank"
                        rel="noreferrer"
                        className="
                          block
                          text-xs font-mono leading-5
                          [overflow-wrap:anywhere]
                          [word-break:break-word]
                        "
                        title={lastTx}
                      >
                        {lastTx}
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        navigator.clipboard
                          .writeText(lastTx)
                          .then(() => toast.success("Hash copied"))
                      }
                    >
                      <Copy className="mr-1 h-3.5 w-3.5" />
                      Copy
                    </Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={explorerTxUrl(lastTx)} target="_blank" rel="noreferrer">
                        Open in Explorer
                        <ExternalLink className="ml-1 h-3.5 w-3.5" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Only the token creator (on-chain contract <code>owner()</code>)
                can withdraw mint proceeds. You’ll confirm the transaction on{" "}
                <b>{ELECTRONEUM.name}</b>.
              </p>
            </div>

            <DialogFooter className="gap-2 border-t bg-background px-4 py-3 sm:px-6 sm:py-4">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button
                onClick={onWithdraw}
                disabled={sending || loading || balanceWei <= 0n}
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Withdrawing…
                  </>
                ) : (
                  "Withdraw"
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
