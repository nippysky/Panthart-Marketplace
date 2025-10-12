// components/featured/BidParticipateClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BrowserProvider, Contract, Interface, parseUnits, formatUnits } from "ethers";
import FeaturedAuctionAbi from "@/lib/abis/FeaturedAuction.json";
import Image from "next/image";
import Link from "next/link";
import { useActiveAccount } from "thirdweb/react";
import { useLoaderStore } from "@/lib/store/loader-store";
import LoaderModal from "@/components/shared/loader-modal";
import { useRouter } from "next/navigation";

const FEATURED_ADDR = process.env.NEXT_PUBLIC_FEATURED_AUCTION_ADDRESS!;
const FALLBACK_COLL =
  process.env.NEXT_PUBLIC_FEATURED_FALLBACK_CONTRACT ||
  process.env.NEXT_PUBLIC_PANTHART_NFC_CONTRACT ||
  "0xc107C97710972e964d59000f610c07262638B508";

const EPSILON = 0.000001;
const nf2 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });
const nf6 = new Intl.NumberFormat(undefined, { minimumFractionDigits: 6, maximumFractionDigits: 6 });

type ActivePayload = {
  active: {
    cycleId: string;
    endAt: string;
    minBidETN: string;
    minBidWei: string;
    leader?: string | null;
    leaderAmountETN?: string | null;
    leaderAmountWei?: string | null;
  } | null;
  fx: { lastPriceUsd: string | null } | null;
};

type ValidationResp = {
  ok: boolean;
  reason?: string;
  collection?: {
    contract: string;
    name?: string | null;
    logoUrl?: string | null;
    itemsCount?: number | null;
  };
};

async function fetchActive(): Promise<ActivePayload> {
  const r = await fetch("/api/featured/active", { cache: "no-store" });
  return r.json();
}

async function validateCollection(contract: string, wallet?: string | null): Promise<ValidationResp> {
  const qs = new URLSearchParams({ contract, ...(wallet ? { wallet } : {}) }).toString();
  const r = await fetch(`/api/collections/validate?${qs}`, { cache: "no-store" });
  return r.json();
}

async function getSigner(withAccountRequest = true) {
  if (!(window as any).ethereum) throw new Error("Wallet not found.");
  const provider = new BrowserProvider((window as any).ethereum);
  if (withAccountRequest) await provider.send("eth_requestAccounts", []);
  return provider.getSigner();
}

/* ---------------- helpers to read user bid safely ---------------- */
const addrRe = /^0x[a-fA-F0-9]{40}$/;

function toETN(value: any): number {
  try {
    const s =
      typeof value === "bigint"
        ? value.toString()
        : typeof value === "string"
        ? value
        : value?.toString?.() ?? "0";
    return Number(formatUnits(s, 18));
  } catch {
    return 0;
  }
}

async function readUserBid(cycleId: string, addr: string) {
  const signer = await getSigner(false);
  const c = new Contract(FEATURED_ADDR, FeaturedAuctionAbi as any, signer);
  const r: any = await c.getBid(cycleId, addr);

  const named = r?.totalWei ?? r?.total ?? r?.amount ?? r?.value ?? r?.sum ?? undefined;

  let totalETN = 0;
  if (named != null) {
    totalETN = toETN(named);
  } else {
    const i0 = r?.[0];
    const i1 = r?.[1];
    const i2 = r?.[2];

    if (addrRe.test(String(i0)) && typeof i1 === "bigint") {
      totalETN = toETN(i1);
    } else if (addrRe.test(String(i0)) && typeof i2 === "bigint") {
      totalETN = toETN(i2);
    } else {
      const candidates: number[] = [];
      for (let k = 0; k < 5; k++) {
        if (typeof r?.[k] === "bigint" || typeof r?.[k] === "string") {
          const v = toETN(r[k]);
          if (v > 0 && v < 1_000_000_000_000) candidates.push(v);
        }
      }
      totalETN = candidates.length ? Math.max(...candidates) : 0;
    }
  }

  const existsNamed = typeof r?.exists === "boolean" ? r.exists : undefined;
  const exists = existsNamed ?? totalETN > 0;

  const collection =
    r?.collection ?? r?.contract ?? r?.coll ?? (addrRe.test(String(r?.[0])) ? String(r[0]) : null);

  return { exists: Boolean(exists), totalETN, collection: collection || null };
}

/* ---------------- modal ---------------- */
function SuccessModal({
  open,
  onClose,
  title,
  subtitle,
  image,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: React.ReactNode;
  image?: string | null;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1001] bg-background/70 dark:bg-background/70 backdrop-blur-sm flex items-center justify-center px-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-card rounded-2xl p-6 sm:p-8 shadow-xl w-full max-w-[560px] border border-black/10 dark:border-white/10 overflow-hidden">
        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-black/10 dark:ring-white/10 relative">
          <Image alt="collection" src={image || "/placeholder.svg"} fill className="object-cover" />
        </div>
        <h3 className="text-lg sm:text-xl font-semibold text-center break-words">{title}</h3>
        {subtitle ? (
          <div className="mt-2 text-sm text-muted-foreground text-center whitespace-pre-wrap break-all">
            {subtitle}
          </div>
        ) : null}
        <div className="mt-6 flex justify-center">
          <button
            onClick={onClose}
            className="rounded-xl px-5 py-2.5 bg-black text-white dark:bg-white dark:text-black border border-black/10 dark:border-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- main component ---------------- */
export default function BidParticipateClient() {
  const router = useRouter();
  const acct = useActiveAccount();
  const loader = useLoaderStore();

  const [active, setActive] = useState<ActivePayload | null>(null);

  const [alreadyBid, setAlreadyBid] = useState<boolean | null>(null);
  const [userPrevTotalETN, setUserPrevTotalETN] = useState<number>(0);
  const [userPrevCollection, setUserPrevCollection] = useState<string | null>(null);

  const [collection, setCollection] = useState("");
  const [validation, setValidation] = useState<ValidationResp | null>(null);

  // NEW: make the input truly editable
  const [amountRaw, setAmountRaw] = useState<string>("");
  const amountNum = useMemo(() => {
    const n = Number(amountRaw);
    return Number.isFinite(n) ? n : NaN;
  }, [amountRaw]);

  const [msg, setMsg] = useState<string | null>(null);

  const [successOpen, setSuccessOpen] = useState(false);
  const [successName, setSuccessName] = useState<string>("Bid successful!");
  const [successLogo, setSuccessLogo] = useState<string | null>(null);

  // bootstrap page data
  useEffect(() => {
    let mounted = true;
    (async () => {
      const a = await fetchActive();
      if (!mounted) return;
      setActive(a);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // refresh user bid when wallet or cycle changes
  useEffect(() => {
    (async () => {
      const a = active?.active;
      if (!a || !acct?.address) {
        setAlreadyBid(null);
        setUserPrevTotalETN(0);
        setUserPrevCollection(null);
        return;
      }
      try {
        const { exists, totalETN, collection } = await readUserBid(a.cycleId, acct.address);
        setAlreadyBid(exists);
        setUserPrevTotalETN(totalETN);
        setUserPrevCollection(collection);
      } catch {
        setAlreadyBid(false);
        setUserPrevTotalETN(0);
        setUserPrevCollection(null);
      }
    })();
  }, [acct?.address, active?.active?.cycleId]);

  // compute dynamic mins
  const minBidETN = Number(active?.active?.minBidETN || 0);
  const leaderETN = Number(active?.active?.leaderAmountETN || 0);
  const leaderAddr = active?.active?.leader || null;

  const youAreLeader = useMemo(
    () => !!acct?.address && leaderAddr && acct.address.toLowerCase() === leaderAddr.toLowerCase(),
    [acct?.address, leaderAddr]
  );

  const requiredTotalToLead = useMemo(() => {
    const highest = Math.max(minBidETN, leaderETN);
    return highest > 0 ? highest + EPSILON : minBidETN;
  }, [minBidETN, leaderETN]);

  const requiredAdditional = useMemo(() => {
    if (!alreadyBid) return 0;
    if (youAreLeader) return EPSILON;
    const need = requiredTotalToLead - userPrevTotalETN;
    return Math.max(need, EPSILON);
  }, [alreadyBid, youAreLeader, requiredTotalToLead, userPrevTotalETN]);

  // prefill once (don’t clobber manual typing)
  const didPrefillRef = useRef(false);
  useEffect(() => {
    if (!active?.active) return;
    if (didPrefillRef.current && amountRaw !== "") return;

    if (alreadyBid) {
      const add = Math.max(requiredAdditional, EPSILON);
      setAmountRaw(add > 0 ? add.toFixed(6) : "");
      didPrefillRef.current = true;
    } else {
      const first = Math.max(requiredTotalToLead, minBidETN);
      setAmountRaw(first > 0 ? first.toFixed(6) : "");
      didPrefillRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.active?.cycleId, alreadyBid, requiredAdditional, requiredTotalToLead, minBidETN]);

  // ---- VALIDATION (amount) ----
  const uiMin = alreadyBid ? requiredAdditional : requiredTotalToLead;
  const amountPositive = Number.isFinite(amountNum) && amountNum > 0;
  const amountBelowMin = amountPositive ? amountNum + 1e-12 < uiMin : false;
  const amountError =
    amountRaw.trim() === ""
      ? null
      : !amountPositive
      ? "Enter a positive ETN amount."
      : amountBelowMin
      ? `${alreadyBid ? "Increase" : "Amount"} must be at least ${nf6.format(uiMin)} ETN.`
      : null;

  const onBlurValidate = async () => {
    if (alreadyBid) return;
    const v = collection.trim();
    if (!v) return;
    try {
      loader.show("Verifying collection contract…");
      const resp = await validateCollection(v, acct?.address);
      setValidation(resp);
    } finally {
      loader.hide();
    }
  };

  const noWallet = !acct?.address;
  const showSteps = !noWallet;

  const addDelta = (d: number) =>
    setAmountRaw((prev) => {
      const cur = Number(prev) || 0;
      const next = Math.max(0, cur + d);
      return next > 0 ? next.toFixed(6) : "";
    });

  const setToMinimum = () => {
    if (alreadyBid) {
      const add = Math.max(requiredAdditional, EPSILON);
      setAmountRaw(add.toFixed(6));
    } else {
      const first = Math.max(requiredTotalToLead, minBidETN);
      setAmountRaw(first.toFixed(6));
    }
  };

  function validateAmountNow(): string | null {
    const a = active?.active;
    if (!a) return "No active cycle right now.";
    const n = Number(amountRaw);
    if (!Number.isFinite(n) || n <= 0) return "Enter a positive ETN amount.";

    if (!alreadyBid) {
      if (n + 1e-12 < requiredTotalToLead) {
        return `Amount must be at least ${nf6.format(requiredTotalToLead)} ETN to lead.`;
      }
    } else {
      if (youAreLeader) {
        if (n + 1e-12 < EPSILON) return `Increase must be at least ${EPSILON} ETN.`;
      } else {
        const newTotal = userPrevTotalETN + n;
        if (newTotal + 1e-12 < requiredTotalToLead) {
          const need = requiredTotalToLead - userPrevTotalETN;
          return `You must add at least ${nf6.format(Math.max(need, EPSILON))} ETN to take the lead.`;
        }
      }
    }
    return null;
  }

  async function submit() {
    setMsg(null);
    const a = active?.active;
    if (!acct?.address) {
      setMsg("Please connect your wallet to continue.");
      return;
    }
    if (!a) {
      setMsg("No active cycle right now.");
      return;
    }
    if (!alreadyBid && !validation?.ok) {
      setMsg(validation?.reason || "Your collection is not verified.");
      return;
    }
    const guard = validateAmountNow();
    if (guard) {
      setMsg(guard);
      return;
    }

    const valueWei = parseUnits(String(Number(amountRaw).toFixed(6)), 18);
    const mode: "place" | "increase" = alreadyBid ? "increase" : "place";

    try {
      loader.show("Connecting wallet…");
      const signer = await getSigner();

      const contract = new Contract(FEATURED_ADDR, FeaturedAuctionAbi as any, signer);

      loader.show("Estimating gas…");
      try {
        if (mode === "place") {
          await (contract as any).estimateGas["placeBid"](
            a.cycleId,
            validation?.collection?.contract || FALLBACK_COLL,
            { value: valueWei }
          );
        } else {
          await (contract as any).estimateGas["increaseBid"](a.cycleId, { value: valueWei });
        }
      } catch {}

      loader.show("Confirm in your wallet…");
      const tx =
        mode === "place"
          ? await contract.placeBid(a.cycleId, validation?.collection?.contract || FALLBACK_COLL, { value: valueWei })
          : await contract.increaseBid(a.cycleId, { value: valueWei });

      loader.show("Transaction submitted. Waiting for confirmations…");
      const rcpt = await tx.wait();

      loader.show("Finalizing on Panthart…");
      await fetch("/api/featured/verify-tx", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txHash: (rcpt?.hash ?? tx.hash) as string }),
      }).catch(() => {});

      // success modal content
      if (alreadyBid) {
        let name: string | null = null;
        let logo: string | null = null;
        if (userPrevCollection) {
          try {
            const meta = await validateCollection(userPrevCollection, acct.address);
            name = meta?.collection?.name || null;
            logo = meta?.collection?.logoUrl || null;
          } catch {}
        }
        setSuccessName(name ? `Bid increased for ${name}` : "Bid increased successfully");
        setSuccessLogo(logo);
      } else {
        setSuccessName(
          validation?.collection?.name ? `Bid placed for ${validation.collection.name}` : "Bid placed successfully"
        );
        setSuccessLogo(validation?.collection?.logoUrl || null);
      }
      setSuccessOpen(true);

      // refresh current state after success
      try {
        const fresh = await fetchActive();
        setActive(fresh);
        if (acct?.address && fresh?.active) {
          const snap = await readUserBid(fresh.active.cycleId, acct.address);
          setUserPrevTotalETN(snap.totalETN);
          setUserPrevCollection(snap.collection);
          setAlreadyBid(snap.exists);
        }
      } catch {}
      setMsg(null);
    } catch (e: any) {
      const iface = new Interface(FeaturedAuctionAbi as any);
      const data = e?.data?.data ?? e?.data ?? e?.error?.data ?? e?.info?.error?.data;
      let friendly = "Transaction failed.";
      if (data) {
        try {
          const err = iface.parseError(data);
          const map: Record<string, string> = {
            MinBidNotMet: "Your bid is below the minimum.",
            MustBeatLeader: "You must beat the current leader.",
            CycleNotActive: "This cycle is not active right now.",
            AlreadyBid: "You already placed a bid. Use Increase Bid instead.",
            NoExistingBid: "You don't have a bid to increase.",
            CycleAlreadyFinalized: "This cycle has already ended.",
            BadParams: "Invalid parameters.",
            Unauthorized: "Unauthorized.",
          };
          friendly = err?.name && map[err.name] ? map[err.name] : `Reverted: ${err?.name || "Unknown error"}`;
        } catch {
          friendly = e?.shortMessage || e?.message || friendly;
        }
      } else {
        friendly = e?.shortMessage || e?.message || friendly;
      }
      setMsg(friendly);
    } finally {
      loader.hide();
    }
  }

  const showSummary = !!active?.active;
  const nowHighest = Math.max(leaderETN, minBidETN);
  const yourCurrent = userPrevTotalETN;
  const yourNewTotalPreview = alreadyBid ? yourCurrent + (Number(amountRaw || 0) || 0) : (Number(amountRaw || 0) || 0);

  const canSubmit =
    !!acct?.address &&
    (!!alreadyBid || !!validation?.ok) &&
    amountError === null &&
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    amountNum + 1e-12 >= uiMin;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <LoaderModal />

      <div className="mb-6">
        <Link href="/bid-featured-collection" className="text-sm text-muted-foreground hover:underline">
          ← Back to Featured
        </Link>
      </div>

      {noWallet ? (
        <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/10 p-6">
          <h2 className="text-lg sm:text-xl font-semibold">Connect your wallet</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Please connect your wallet using the button in the header to participate in featured bidding.
          </p>
        </div>
      ) : null}

      {showSteps && (
        <div className="rounded-3xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/[0.06] supports-[backdrop-filter]:backdrop-blur-xl p-6">
          {!alreadyBid && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Your collection</h2>
              <p className="text-sm text-muted-foreground">
                Enter the collection contract you want to feature. We’ll verify ownership and readiness.
              </p>

              <input
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                onBlur={onBlurValidate}
                placeholder="0x… contract address"
                className="w-full rounded-xl border border-black/10 dark:border-white/10 bg-white/80 dark:bg-white/10 px-3 py-2"
              />

              {validation ? (
                validation.ok ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                    ✅ Verified for bidding
                    {validation.collection?.name ? (
                      <div className="mt-2 flex items-center gap-2 text-foreground">
                        {validation.collection.logoUrl ? (
                          <Image src={validation.collection.logoUrl} alt="" width={22} height={22} />
                        ) : null}
                        <span className="truncate">{validation.collection.name}</span>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm">
                    ⛔ {validation.reason || "Collection not eligible."}
                  </div>
                )
              ) : null}
            </div>
          )}

          {/* STEP: Amount */}
          <div className={`space-y-4 ${!alreadyBid ? "mt-8" : ""}`}>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-xl font-semibold">{alreadyBid ? "Increase your bid" : "Bid amount"}</h2>
              {active?.active ? (
                <span className="text-xs text-muted-foreground break-all">
                  cycle: <span className="font-mono break-all">{active.active.cycleId}</span>
                </span>
              ) : null}
            </div>

            {showSummary && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/10 p-3">
                  <div className="text-[11px] uppercase text-black/60 dark:text-white/60 tracking-wider">Current highest</div>
                  <div className="mt-1 font-semibold flex items-center gap-1">
                    <Image src="/ETN_LOGO.png" alt="ETN" width={16} height={16} />
                    {nf2.format(nowHighest)}
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/10 p-3">
                  <div className="text-[11px] uppercase text-black/60 dark:text-white/60 tracking-wider">Your total</div>
                  <div className="mt-1 font-semibold flex items-center gap-1">
                    <Image src="/ETN_LOGO.png" alt="ETN" width={16} height={16} />
                    {nf2.format(yourCurrent)}
                  </div>
                </div>
                <div className="rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/10 p-3">
                  <div className="text-[11px] uppercase text-black/60 dark:text-white/60 tracking-wider">
                    {alreadyBid ? "Min to add" : "Min to bid"}
                  </div>
                  <div className="mt-1 font-semibold flex items-center gap-1">
                    <Image src="/ETN_LOGO.png" alt="ETN" width={16} height={16} />
                    {nf6.format(uiMin)}
                  </div>
                </div>
              </div>
            )}

            {/* Input (free typing + live validation) */}
            <div>
              <input
                type="text"
                inputMode="decimal"
                value={amountRaw}
                onChange={(e) => setAmountRaw(e.target.value)}
                onBlur={(e) => {
                  // normalize to at most 6 decimals on blur
                  const n = Number(e.currentTarget.value);
                  if (Number.isFinite(n) && n > 0) {
                    setAmountRaw(n.toFixed(6));
                  }
                }}
                placeholder={alreadyBid ? "Enter ETN to add" : "Enter ETN amount"}
                aria-invalid={amountError ? true : undefined}
                className={
                  "w-full rounded-xl border px-3 py-2 bg-white/80 dark:bg-white/10 " +
                  (amountError
                    ? "border-red-500/50 focus:outline-none focus:ring-2 focus:ring-red-500/30"
                    : "border-black/10 dark:border-white/10")
                }
              />
              {amountError ? (
                <p className="mt-1 text-xs text-red-500">{amountError}</p>
              ) : null}
            </div>

            {/* quick helpers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={setToMinimum}
                className="text-xs rounded-full px-3 py-1.5 border border-black/10 dark:border-white/10"
              >
                {alreadyBid ? "Set to min add" : "Set to min to lead"}
              </button>
              <button
                type="button"
                onClick={() => addDelta(EPSILON)}
                className="text-xs rounded-full px-3 py-1.5 border border-black/10 dark:border-white/10"
              >
                +{EPSILON}
              </button>
              <button
                type="button"
                onClick={() => addDelta(1)}
                className="text-xs rounded-full px-3 py-1.5 border border-black/10 dark:border-white/10"
              >
                +1
              </button>
              <button
                type="button"
                onClick={() => addDelta(10)}
                className="text-xs rounded-full px-3 py-1.5 border border-black/10 dark:border-white/10"
              >
                +10
              </button>

              {alreadyBid ? (
                <div className="ml-auto text-xs text-muted-foreground w-full sm:w-auto text-right sm:text-left break-all">
                  New total preview: <span className="font-semibold">{nf6.format(yourNewTotalPreview)} ETN</span>
                </div>
              ) : null}
            </div>

            {msg ? <div className="text-sm text-red-500">{msg}</div> : null}

            {/* Submit */}
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              <button
                onClick={submit}
                className="rounded-xl px-4 py-2 bg-black text-white dark:bg-white dark:text-black disabled:opacity-50 w-full sm:w-auto"
                disabled={!canSubmit}
              >
                {alreadyBid ? "Increase Bid" : "Place Bid"}
              </button>

              <Link
                href="/bid-featured-collection"
                className="rounded-xl px-4 py-2 border border-black/10 dark:border-white/10 text-center w-full sm:w-auto"
              >
                Cancel
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Success modal */}
      <SuccessModal
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          router.replace("/bid-featured-collection");
        }}
        title={successName}
        subtitle={
          active?.active ? (
            <>
      
              {" You’re in the lead if your total remains highest at the end."}
            </>
          ) : null
        }
        image={successLogo}
      />
    </div>
  );
}
