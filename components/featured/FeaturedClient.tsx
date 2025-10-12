"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatUnits } from "ethers";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { FeaturedInitial } from "@/lib/types/featured-collections";
import { useActiveAccount } from "thirdweb/react";
import { Skeleton } from "@/components/ui/skeleton";

const TREASURY_ADDR = process.env.NEXT_PUBLIC_FEATURED_TREASURY_ADDRESS!;
const ZERO = "0x0000000000000000000000000000000000000000";
const EPSILON = 0.000001;

type LiveEvent = {
  kind: "BidPlaced" | "BidIncreased";
  at: number;
  txHash: string;
  cycleId: string;
  bidder: string;
  newTotalWei: string | number | bigint; // ← accept a few shapes defensively
  collection: string;
  bidderProfile?: {
    username: string | null;
    profileAvatar: string | null;
    walletAddress: string;
  } | null;
  collectionMeta?: {
    name: string | null;
    logoUrl: string | null;
    coverUrl: string | null;
    itemsCount: number | null;
    contract: string;
  } | null;
};

/* ---------------- SSE ---------------- */
function useSSE(url: string, onData: (d: LiveEvent) => void) {
  useEffect(() => {
    const ev = new EventSource(url);
    ev.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed?.kind === "BidPlaced" || parsed?.kind === "BidIncreased") {
          onData(parsed);
        }
      } catch {}
    };
    return () => ev.close();
  }, [url, onData]);
}

/* ---------------- utils ---------------- */
const short = (addr?: string | null, n = 6) =>
  addr ? `${addr.slice(0, n)}…${addr.slice(-4)}` : "—";

const nf2 = new Intl.NumberFormat(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Expand "1.002000001e+21" (or "1.0e+3") into a plain integer string. */
function expandScientificIntString(s: string): string {
  const m = String(s).toLowerCase().match(/^(\d+)(?:\.(\d+))?e\+(\d+)$/);
  if (!m) return s;
  const int = m[1];
  const frac = m[2] ?? "";
  const exp = Number(m[3]);
  // move decimal point right by exp
  const digits = int + frac;
  if (exp <= frac.length) {
    // This would leave a decimal point somewhere in the middle.
    // Wei should be an integer; take only the integer part (floor).
    const left = digits.slice(0, int.length + exp);
    return left || "0";
  }
  const zeros = exp - frac.length;
  return digits + "0".repeat(Math.max(zeros, 0));
}

/** Normalize anything "wei-like" into a base-10 integer string safe for BigInt. */
function toWeiIntegerString(x: unknown): string {
  if (x == null) return "0";
  if (typeof x === "bigint") return x.toString();
  if (typeof x === "number") {
    if (!Number.isFinite(x)) return "0";
    // If it's an integer in safe range, use it; otherwise expand from sci-not.
    const asStr = String(x);
    return /e\+/i.test(asStr) ? expandScientificIntString(asStr) : Math.trunc(x).toString();
  }
  let s = String(x).trim();
  if (/e\+/i.test(s)) s = expandScientificIntString(s);
  // strip any stray decimals (wei must be integer)
  if (s.includes(".")) s = s.split(".")[0];
  // remove leading plus
  s = s.replace(/^\+/, "");
  // keep only digits
  s = s.replace(/[^\d]/g, "") || "0";
  return s;
}

/** Safe formatUnits that tolerates scientific notation & numbers. */
function safeFormatUnits(weiLike: unknown, decimals = 18): string {
  try {
    const bi = BigInt(toWeiIntegerString(weiLike));
    return formatUnits(bi, decimals);
  } catch {
    return "0";
  }
}

/* ---------------- component ---------------- */
export default function FeaturedClient({ initial }: { initial: FeaturedInitial }) {
  const [data, setData] = useState<FeaturedInitial>(initial);
  const [activity, setActivity] = useState<LiveEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);
  const account = useActiveAccount();

  // has user already bid?
  const [hasUserBid, setHasUserBid] = useState<boolean | null>(null);
  useEffect(() => {
    const a = data.active;
    const addr = account?.address;
    if (!a || !addr) {
      setHasUserBid(null);
      return;
    }
    const qs = new URLSearchParams({ cycleId: a.cycleId, addr }).toString();
    fetch(`/api/featured/has-bid?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setHasUserBid(Boolean(j?.exists)))
      .catch(() => setHasUserBid(null));
  }, [data.active?.cycleId, account?.address]);

  // countdown
  const [now, setNow] = useState<number>(initial.now);
  const timerRef = useRef<number>(0);
  useEffect(() => {
    timerRef.current = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timerRef.current);
  }, []);

  // Prefill history on cycle change
  useEffect(() => {
    const a = data.active;
    let aborted = false;
    (async () => {
      if (!a) {
        setActivity([]);
        return;
      }
      setHistoryLoading(true);
      try {
        const res = await fetch(
          `/api/featured/activity/history?cycleId=${encodeURIComponent(a.cycleId)}`,
          { cache: "no-store" }
        );
        const j = await res.json();
        if (!aborted && Array.isArray(j?.events)) {
          setActivity(j.events as LiveEvent[]);
        }
      } catch {
        if (!aborted) setActivity([]);
      } finally {
        if (!aborted) setHistoryLoading(false);
      }
    })();
    return () => {
      aborted = true;
    };
  }, [data.active?.cycleId]);

  // Merge SSE on top
  useSSE("/api/featured/activity", (msg) => {
    setActivity((prev) => {
      const k = `${msg.txHash}:${msg.at}`;
      if (prev.some((p) => `${p.txHash}:${p.at}` === k)) return prev;
      const next = [msg, ...prev];
      return next.slice(0, 30);
    });
  });

  if (!data.active) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-4 pb-24">
        <div className="text-zinc-600 dark:text-zinc-400 text-center">
          No active cycle yet. Check back soon.
        </div>
      </div>
    );
  }

  const a = data.active;
  const hasLeader =
    a.leader && a.leader !== ZERO && Number(a.leaderAmountETN) > 0;

  const endsIn = useMemo(() => {
    const end = new Date(a.endAt).getTime();
    const ms = Math.max(0, end - now);
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return `${h.toString().padStart(2, "0")}:${m
      .toString()
      .padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
  }, [a.endAt, now]);

  const minToLead = useMemo(() => {
    const base = Number(a.minBidETN || 0);
    const leader = Number(a.leaderAmountETN || 0);
    return Math.max(base, leader > 0 ? leader + EPSILON : base);
  }, [a.minBidETN, a.leaderAmountETN]);

  const minEtnRounded = nf2.format(minToLead);
  const leaderRounded = nf2.format(Number(a.leaderAmountETN || 0));

  return (
    <div
      className="
        px-3 sm:px-5 lg:px-10 py-6 sm:py-8 max-w-6xl mx-auto pb-24
        overflow-x-hidden
        pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]
      "
    >
      {/* header row */}
      <div className="mb-5 sm:mb-6 flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold tracking-tight">
          Bid Collection Of The Month
        </h1>

        {account ? (
          <Link
            href="/bid-featured-collection/participate"
            className="rounded-full px-4 py-2 border transition
                       bg-white/80 text-black hover:bg-white
                       dark:bg-white/10 dark:text-white dark:hover:bg-white/15
                       border-black/10 dark:border-white/15"
          >
            {hasUserBid ? "Increase Bid" : "Place Bid"}
          </Link>
        ) : (
          <div className="text-xs sm:text-sm text-black/60 dark:text-white/60">
            Connect your wallet to participate
          </div>
        )}
      </div>

      {/* hero */}
      <div
        className="relative overflow-hidden rounded-3xl border 
                   bg-white/65 text-zinc-900
                   dark:bg-white/[0.06] dark:text-white
                   supports-[backdrop-filter]:backdrop-blur-xl
                   border-black/10 dark:border-white/10
                   shadow-[0_8px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.45)]
                   p-4 sm:p-6 md:p-8"
      >
        <div className="pointer-events-none absolute -inset-20 bg-[radial-gradient(ellipse_at_top_left,rgba(0,0,0,0.05),transparent_40%)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.08),transparent_40%)]" />

        <div className="grid gap-4 md:gap-8 md:grid-cols-[1.25fr_1fr] relative items-center">
          {/* leader block */}
          <div className="flex items-center gap-3 sm:gap-5 min-w-0 w-full">
            <div className="relative w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden ring-1 ring-black/10 dark:ring-white/15 shrink-0">
              <Image
                alt="leader"
                src={
                  hasLeader
                    ? a.leaderUser?.profileAvatar || "/placeholder.svg"
                    : "/placeholder.svg"
                }
                fill
                className="object-cover"
              />
            </div>
            <div className="min-w-0 w-full">
              <div className="text-[11px] sm:text-xs uppercase text-black/60 dark:text-white/60 tracking-wider">
                {hasLeader ? "Current Leader" : "No bids yet"}
              </div>
              {hasLeader ? (
                <>
                  <div className="mt-1 text-lg sm:text-xl md:text-2xl font-semibold break-words">
                    {a.leaderUser?.username || short(a.leader, 10)}
                  </div>
                  <div className="text-black/70 dark:text-white/70 text-sm flex items-center gap-1 flex-wrap">
                    Bid total:
                    <span className="inline-flex items-center gap-1 font-medium">
                      <Image src="/ETN_LOGO.png" alt="ETN" width={16} height={16} />
                      {leaderRounded}
                    </span>
                  </div>
                </>
              ) : (
                <div className="mt-1 text-black/70 dark:text-white/70 text-sm">
                  Be the first to place a bid for this cycle.
                </div>
              )}
            </div>
          </div>

          {/* timer & min */}
          <div className="flex md:justify-end items-center gap-6 sm:gap-8 flex-wrap">
            <div className="text-center min-w-[120px]">
              <div className="text-[11px] sm:text-xs uppercase text-black/60 dark:text-white/60 tracking-wider">
                Ends in
              </div>
              <div className="font-mono text-xl sm:text-2xl md:text-3xl mt-1" suppressHydrationWarning>
                {endsIn}
              </div>
            </div>
            <div className="text-center min-w-[120px]">
              <div className="text-[11px] sm:text-xs uppercase text-black/60 dark:text-white/60 tracking-wider">
                Min Bid
              </div>
              <div className="mt-1 font-semibold text-xl sm:text-2xl md:text-3xl inline-flex items-center gap-2 justify-center">
                <Image src="/ETN_LOGO.png" alt="ETN" width={22} height={22} />
                <span>{minEtnRounded}</span>
              </div>
              {data.fx?.lastPriceUsd ? (
                <div className="text-[11px] sm:text-xs text-black/60 dark:text-white/60">
                  ~${(minToLead * Number(data.fx.lastPriceUsd)).toFixed(2)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="mt-8 sm:mt-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Live Bid Activity</h2>
          <div className="text-xs text-black/50 dark:text-white/50">latest 30</div>
        </div>

        {historyLoading && activity.length === 0 ? (
          <ul className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <li
                key={i}
                className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 sm:h-11 sm:w-11 rounded-full" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-3 w-[80%]" />
                    <Skeleton className="h-3 w-[50%]" />
                  </div>
                  <Skeleton className="h-4 w-24 sm:w-28" />
                </div>
              </li>
            ))}
          </ul>
        ) : activity.length === 0 ? (
          <div className="rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] p-4 text-sm text-black/60 dark:text-white/60">
            No activity yet. Bid events will appear here instantly.
          </div>
        ) : (
          <ul className="space-y-2">
            <AnimatePresence initial={false}>
              {activity.map((ev, i) => {
                const displayName = ev?.bidderProfile?.username || short(ev.bidder, 8);
                const collectionName = ev?.collectionMeta?.name || short(ev.collection, 10);
                const key = `${ev.txHash ?? "tx"}:${ev.at ?? i}:${i}`;

                // SAFE: tolerate scientific notation and numbers
                const etnStr = safeFormatUnits(ev.newTotalWei ?? "0", 18);
                const amount = nf2.format(Number(etnStr));

                return (
                  <motion.li
                    key={key}
                    initial={{ y: -8, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="rounded-2xl border border-black/10 dark:border-white/10 bg-white/70 dark:bg-white/5 backdrop-blur px-4 py-3"
                  >
                    {/* Mobile stacks; desktop aligns */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5">
                      {/* Left: avatar + text */}
                      <div className="flex items-center gap-3 min-w-0 w-full">
                        <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden ring-1 ring-black/10 dark:ring-white/10 relative shrink-0">
                          <Image
                            alt=""
                            src={ev?.bidderProfile?.profileAvatar || "/placeholder.svg"}
                            fill
                            className="object-cover"
                          />
                        </div>

                        <div className="min-w-0 w-full">
                          {/* Wrap long sentences instead of truncate */}
                          <div className="text-sm break-words">
                            <span className="font-medium">{displayName}</span>{" "}
                            {ev.kind === "BidPlaced" ? (
                              <span className="text-black/70 dark:text-white/70">placed a bid on</span>
                            ) : (
                              <span className="text-black/70 dark:text-white/70">increased their bid for</span>
                            )}{" "}
                            <span className="font-medium">{collectionName}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: amount — keep on one line but allow container to shrink */}
                      <div className="text-sm font-mono sm:text-right whitespace-nowrap sm:self-start">
                        <span className="text-black/75 dark:text-white/80">Amount:</span>{" "}
                        <span className="font-semibold inline-flex items-center gap-1">
                          <Image src="/ETN_LOGO.png" alt="ETN" width={14} height={14} />
                          {amount}
                        </span>
                      </div>
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </ul>
        )}
      </div>
    </div>
  );
}
