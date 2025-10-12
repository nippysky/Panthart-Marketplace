"use client";

import * as React from "react";
import { X, Coins, Tag, Gavel, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import DateTimePicker from "@/components/shared/date-time-picker";

/* ---------------------------------------------------------- */
/* Types + helpers                                            */
/* ---------------------------------------------------------- */

type Standard = "ERC721" | "ERC1155";

export type CurrencyOption = {
  id: string;
  symbol: string;
  kind: "NATIVE" | "ERC20";
  tokenAddress: string | null;
  decimals: number;
  label: string;
};

type CurrencyRowFromAPI = {
  id: string;
  symbol: string;
  decimals?: number | null;
  kind: string;
  tokenAddress?: string | null;
};

export type CurrencyHint = {
  kind: "NATIVE" | "ERC20";
  tokenAddress?: string | null;
  symbol?: string;
  decimals?: number;
};

const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};
const isPos = (s: string) => Number.isFinite(num(s)) && num(s) > 0;
const isStrictPos = (s: string) => Number.isFinite(num(s)) && num(s) > 0;

function normalizeApiRows(rows: CurrencyRowFromAPI[]): CurrencyOption[] {
  return rows.map((c) => {
    const kind: "NATIVE" | "ERC20" = c.kind === "NATIVE" ? "NATIVE" : "ERC20";
    return {
      id: c.id,
      symbol: c.symbol,
      kind,
      tokenAddress: c.tokenAddress ?? null,
      decimals: typeof c.decimals === "number" ? c.decimals : 18,
      label: kind === "NATIVE" ? c.symbol : `${c.symbol} (ERC-20)`,
    };
  });
}
function uniqCurrencies(list: CurrencyOption[]): CurrencyOption[] {
  const seen = new Set<string>();
  const out: CurrencyOption[] = [];
  for (const c of list) {
    const key = c.kind === "NATIVE" ? "NATIVE" : (c.tokenAddress ?? "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}
function pickDefaultCurrencyId(list: CurrencyOption[], hint?: CurrencyHint): string {
  if (hint) {
    if (hint.kind === "NATIVE") {
      const native = list.find((c) => c.kind === "NATIVE");
      if (native) return native.id;
    } else if (hint.kind === "ERC20") {
      const addr = (hint.tokenAddress || "").toLowerCase();
      const byAddr = list.find((c) => c.kind === "ERC20" && (c.tokenAddress || "").toLowerCase() === addr);
      if (byAddr) return byAddr.id;
      const bySymbol = hint.symbol ? list.find((c) => c.symbol === hint.symbol) : undefined;
      if (bySymbol) return bySymbol.id;
    }
  }
  const native = list.find((c) => c.kind === "NATIVE");
  return native?.id ?? list[0]?.id ?? "";
}

/* ---------------------------------------------------------- */

type BaseProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;

  standard: Standard;
  contract: string;
  tokenId: string;

  defaultPrice?: string;     // for 1155 this is UNIT price in UI
  defaultQty?: string;
  defaultStartISO?: string;
  defaultEndISO?: string;

  defaultAucStartPrice?: string;
  defaultAucMinInc?: string;
  defaultAucQty?: string;
  defaultAucStartISO?: string;
  defaultAucEndISO?: string;

  currencies?: CurrencyOption[];
  initialCurrencyHint?: CurrencyHint;
  disableAuctionTab?: boolean;

  max1155Qty?: number;
  your1155Balance?: number;

  onCreateListing: (args: {
    contract: string;
    tokenId: string;
    standard: Standard;
    currency: CurrencyOption;
    price: string;            // IMPORTANT: TOTAL (unit×qty) for 1155
    quantity?: string;
    startTimeISO?: string;
    endTimeISO?: string;
  }) => Promise<void>;

  onCreateAuction: (args: {
    contract: string;
    tokenId: string;
    standard: Standard;
    currency: CurrencyOption;
    startPrice: string;
    minIncrement: string;
    quantity?: string;
    startTimeISO?: string;
    endTimeISO: string;
  }) => Promise<void>;
};

export default function SellSheet({
  open,
  onOpenChange,
  standard,
  contract,
  tokenId,
  defaultPrice = "1",
  defaultQty = "1",
  defaultStartISO = "",
  defaultEndISO = "",
  defaultAucStartPrice = "0.5",
  defaultAucMinInc = "0.05",
  defaultAucQty = "1",
  defaultAucStartISO = "",
  defaultAucEndISO = "",
  currencies: currenciesProp,
  initialCurrencyHint,
  disableAuctionTab = false,
  max1155Qty,
  your1155Balance,
  onCreateListing,
  onCreateAuction,
}: BaseProps) {
  const is1155 = standard === "ERC1155";
  const maxQty = is1155 ? Math.max(0, Number(max1155Qty ?? 0)) : 1;

  const [tab, setTab] = React.useState<"fixed" | "auction">("fixed");

  // NEW: minimal busy state (keeps Shadcn sheet behavior unchanged)
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (disableAuctionTab) setTab("fixed");
  }, [disableAuctionTab, open]);

  // currencies
  const [currencies, setCurrencies] = React.useState<CurrencyOption[]>(
    currenciesProp ?? []
  );
  const [currencyId, setCurrencyId] = React.useState<string>("");

  React.useEffect(() => {
    if (currenciesProp?.length) {
      const norm = uniqCurrencies(currenciesProp);
      setCurrencies(norm);
      setCurrencyId(pickDefaultCurrencyId(norm, initialCurrencyHint));
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/currencies/active", { cache: "no-store" });
        const json = await res.json();
        let rows: CurrencyOption[] = [];
        if (Array.isArray(json?.items)) {
          rows = normalizeApiRows(json.items as CurrencyRowFromAPI[]);
        }
        if (rows.length === 0) {
          rows = [
            { id: "native", symbol: "ETN", kind: "NATIVE", tokenAddress: null, decimals: 18, label: "ETN" },
          ];
        }
        const norm = uniqCurrencies(rows);
        setCurrencies(norm);
        setCurrencyId(pickDefaultCurrencyId(norm, initialCurrencyHint));
      } catch {
        const fallback: CurrencyOption[] = [
          { id: "native", symbol: "ETN", kind: "NATIVE", tokenAddress: null, decimals: 18, label: "ETN" },
        ];
        setCurrencies(fallback);
        setCurrencyId(pickDefaultCurrencyId(fallback, initialCurrencyHint));
      }
    })();
  }, [currenciesProp, initialCurrencyHint]);

  const selectedCurrency = React.useMemo(
    () => currencies.find((c) => c.id === currencyId) ?? currencies[0],
    [currencies, currencyId]
  );

  /* ---------------- Fixed price state + validation ---------------- */
  const [price, setPrice] = React.useState<string>(defaultPrice); // UNIT for 1155
  const [qty, setQty] = React.useState<string>(defaultQty);
  const [fpStartISO, setFpStartISO] = React.useState<string>(defaultStartISO);
  const [fpEndISO, setFpEndISO] = React.useState<string>(defaultEndISO);

  React.useEffect(() => {
    if (!open) return;
    setPrice(defaultPrice);

    const defQtyNum = Math.max(1, Number(defaultQty || "1"));
    const clamped = is1155 ? Math.min(defQtyNum, maxQty || 0) : 1;
    setQty(is1155 ? String(clamped || 0) : "1");

    setFpStartISO(defaultStartISO);
    setFpEndISO(defaultEndISO);
  }, [open, defaultPrice, defaultQty, defaultStartISO, defaultEndISO, is1155, maxQty]);

  const qtyNum = Number(qty || "0");
  const priceError =
    price.trim() === "" ? "Price is required." : !isPos(price) ? "Enter a positive price." : "";
  const qtyError =
    is1155
      ? maxQty === 0
        ? "You own 0 of this token."
        : (qty.trim() === "" || !isPos(qty) || !Number.isInteger(Number(qty)))
          ? "Quantity must be a positive integer."
          : qtyNum > maxQty
            ? `You can list at most ${maxQty}.`
            : ""
      : "";
  const fpTimeError =
    fpEndISO && fpStartISO && !(new Date(fpEndISO).getTime() > new Date(fpStartISO).getTime())
      ? "End time must be later than start time."
      : "";

  const fixedDisabled = !!priceError || !!qtyError || !!fpTimeError || !selectedCurrency;

  // LIVE total (what goes on-chain for 1155)
  const totalHuman = React.useMemo(() => {
    if (!is1155) return price.trim();
    const p = Number(price || "0");
    const q = Math.max(1, Number(qty || "1"));
    if (!Number.isFinite(p) || !Number.isFinite(q)) return price;
    const t = p * q;
    return String(t);
  }, [is1155, price, qty]);

  /* ---------------- Auction state + validation ------------------ */
  const [startPrice, setStartPrice] = React.useState<string>(defaultAucStartPrice);
  const [minInc, setMinInc] = React.useState<string>(defaultAucMinInc);
  const [aucQty, setAucQty] = React.useState<string>(defaultAucQty);
  const [aucStartISO, setAucStartISO] = React.useState<string>(defaultAucStartISO);
  const [aucEndISO, setAucEndISO] = React.useState<string>(defaultAucEndISO);

  React.useEffect(() => {
    if (!open) return;
    setStartPrice(defaultAucStartPrice);
    setMinInc(defaultAucMinInc);

    const defQtyNum = Math.max(1, Number(defaultAucQty || "1"));
    const clamped = is1155 ? Math.min(defQtyNum, maxQty || 0) : 1;
    setAucQty(is1155 ? String(clamped || 0) : "1");

    setAucStartISO(defaultAucStartISO);
    setAucEndISO(defaultAucEndISO);
  }, [
    open,
    defaultAucStartPrice,
    defaultAucMinInc,
    defaultAucQty,
    defaultAucStartISO,
    defaultAucEndISO,
    is1155,
    maxQty,
  ]);

  const aucQtyNum = Number(aucQty || "0");
  const startPriceError =
    startPrice.trim() === "" ? "Starting price is required." : !isPos(startPrice) ? "Enter a positive starting price." : "";
  const minIncError =
    minInc.trim() === "" ? "Min increment is required." : !isStrictPos(minInc) ? "Min increment must be greater than 0." : "";
  const aucQtyError =
    is1155
      ? maxQty === 0
        ? "You own 0 of this token."
        : (aucQty.trim() === "" || !isPos(aucQty) || !Number.isInteger(Number(aucQty)))
          ? "Quantity must be a positive integer."
          : aucQtyNum > maxQty
            ? `You can auction at most ${maxQty}.`
            : ""
      : "";
  const aucTimeError =
    !aucEndISO
      ? "End time is required."
      : (aucStartISO && !(new Date(aucEndISO).getTime() > new Date(aucStartISO).getTime()))
      ? "End time must be later than start time."
      : "";

  const auctionDisabled =
    !!startPriceError || !!minIncError || !!aucQtyError || !!aucTimeError || !selectedCurrency;

  /* ---------------- Actions ---------------- */
  function close() {
    if (submitting) return; // avoid closing mid-flight
    onOpenChange(false);
  }

  async function submitFixed() {
    if (submitting || fixedDisabled || !selectedCurrency) return;

    try {
      setSubmitting(true);
      // IMPORTANT: send TOTAL for 1155, unit for 721
      const priceForChain = is1155 ? totalHuman : price;

      await onCreateListing({
        contract,
        tokenId,
        standard,
        currency: selectedCurrency,
        price: priceForChain,
        quantity: is1155 ? qty : undefined,
        startTimeISO: fpStartISO || undefined,
        endTimeISO: fpEndISO || undefined,
      });
      onOpenChange(false); // auto-close on success
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAuction() {
    if (submitting || auctionDisabled || !selectedCurrency) return;

    try {
      setSubmitting(true);
      await onCreateAuction({
        contract,
        tokenId,
        standard,
        currency: selectedCurrency,
        startPrice,
        minIncrement: minInc,
        quantity: is1155 ? aucQty : undefined,
        startTimeISO: aucStartISO || undefined,
        endTimeISO: aucEndISO,
      });
      onOpenChange(false); // auto-close on success
    } finally {
      setSubmitting(false);
    }
  }

  /* ---------------- UI ---------------- */
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        className={cn(
          "w-full sm:max-w-md p-0",
          "bg-white dark:bg-card text-foreground border-l border-border",
          "backdrop-blur-2xl supports-[backdrop-filter]:bg-white/90 dark:supports-[backdrop-filter]:bg-card/80"
        )}
        style={{ zIndex: 1_000_000 }}
      >
        {/* Header */}
        <SheetHeader className="sticky top-0 z-[1000000] px-6 py-5 bg-white/95 dark:bg-card/90 backdrop-blur border-b border-border">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-xl">Sell Item</SheetTitle>
              <SheetDescription className="mt-1">
                List for fixed price or start a timed auction.
              </SheetDescription>
            </div>
            <button
              onClick={close}
              disabled={submitting}
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-full transition",
                submitting ? "opacity-50 cursor-not-allowed" : "hover:bg-accent"
              )}
              aria-label="Close"
              title={submitting ? "Please wait…" : "Close"}
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="px-6 py-6 space-y-6">
          <Tabs
            value={tab}
            onValueChange={(v) => {
              if (submitting) return;
              setTab(v as any);
            }}
          >
            <TabsList className={cn("grid grid-cols-2 w/full", "bg-transparent p-0 gap-2")}>
              <TabsTrigger
                value="fixed"
                disabled={submitting}
                className={cn(
                  "rounded-xl border border-border bg-white dark:bg-muted/20",
                  "data-[state=active]:bg-primary/5 data-[state=active]:border-primary/40",
                  "shadow-sm",
                  submitting && "opacity-50 cursor-not-allowed"
                )}
              >
                <Tag className="h-4 w-4 mr-2" /> Fixed Price
              </TabsTrigger>

              <TabsTrigger
                value="auction"
                disabled={disableAuctionTab || submitting}
                className={cn(
                  "rounded-xl border border-border bg-white dark:bg-muted/20",
                  "data-[state=active]:bg-primary/5 data-[state=active]:border-primary/40",
                  "shadow-sm",
                  (disableAuctionTab || submitting) && "opacity-50 cursor-not-allowed"
                )}
                title={
                  disableAuctionTab ? "Disabled while editing a fixed-price listing"
                  : submitting ? "Please wait…" : undefined
                }
              >
                <Gavel className="h-4 w-4 mr-2" /> Auction
              </TabsTrigger>
            </TabsList>

            {/* ---------- Fixed Price ---------- */}
            <TabsContent value="fixed" className="mt-5 space-y-5">
              {/* Currency */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Currency</div>
                <Select value={currencyId} onValueChange={setCurrencyId}>
                  <SelectTrigger
                    disabled={submitting}
                    className="w-full justify-between bg-white dark:bg-background border border-input shadow-sm"
                  >
                    <div className="inline-flex items-center gap-2">
                      <Coins className="h-4 w-4 opacity-70" />
                      <SelectValue placeholder="Select currency" />
                    </div>
                    <ChevronDown className="ml-auto h-4 w-4 opacity-70" />
                  </SelectTrigger>
                  <SelectContent className="z-[1000002] bg-white dark:bg-popover border border-border">
                    {currencies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Price (UNIT for 1155) */}
              <div className="space-y-2">
                <div className="text-sm font-medium">
                  {is1155 ? "Unit price" : "Price"}{" "}
                  {selectedCurrency?.symbol ? `(${selectedCurrency.symbol})` : ""}
                </div>
                <Input
                  inputMode="decimal"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={is1155 ? "e.g. 1.25 per edition" : "e.g. 1.25"}
                  className="bg-white dark:bg-background border border-input shadow-sm"
                  disabled={submitting}
                />
                {priceError && <p className="text-xs text-destructive">{priceError}</p>}
                <p className="text-xs text-muted-foreground">
                  {is1155
                    ? "Buyers must purchase the full lot. Total price = unit × quantity."
                    : `Buyers pay this amount in ${selectedCurrency?.symbol ?? "ETN"}.`}
                </p>
                {is1155 && (
                  <div className="text-xs">
                    <span className="opacity-70">Total price:</span>{" "}
                    <span className="font-medium">
                      {totalHuman} {selectedCurrency?.symbol ?? "ETN"}
                    </span>
                  </div>
                )}
              </div>

              {/* ERC1155 Quantity */}
              {is1155 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Quantity</div>
                    <div className="text-xs text-muted-foreground">
                      You own {your1155Balance ?? maxQty}. Max listable: {maxQty}.
                    </div>
                  </div>
                  <Input
                    inputMode="numeric"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                    placeholder="1"
                    className="bg-white dark:bg-background border border-input shadow-sm"
                    disabled={submitting}
                  />
                  {qtyError && <p className="text-xs text-destructive">{qtyError}</p>}
                </div>
              )}

              {/* Schedule */}
              <div className="grid gap-4">
                <div>
                  <DateTimePicker
                    label="Start time (optional)"
                    value={fpStartISO}
                    onChange={setFpStartISO}
                    minNow
                    disabled={submitting}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    If not set, the listing starts immediately.
                  </p>
                </div>
                <div>
                  <DateTimePicker
                    label="End time (optional)"
                    value={fpEndISO}
                    onChange={setFpEndISO}
                    minNow
                    disabled={submitting}
                  />
                  {fpTimeError && <p className="mt-1 text-xs text-destructive">{fpTimeError}</p>}
                </div>
              </div>
            </TabsContent>

            {/* ---------- Auction ---------- */}
            <TabsContent
              value="auction"
              className={cn("mt-5 space-y-5", disableAuctionTab && "pointer-events-none select-none")}
            >
              {/* Currency */}
              <div className="space-y-2">
                <div className="text-sm font-medium">Currency</div>
                <Select value={currencyId} onValueChange={setCurrencyId}>
                  <SelectTrigger
                    disabled={disableAuctionTab || submitting}
                    className="w-full justify-between bg-white dark:bg-background border border-input shadow-sm"
                  >
                    <div className="inline-flex items-center gap-2">
                      <Coins className="h-4 w-4 opacity-70" />
                      <SelectValue placeholder="Select currency" />
                    </div>
                    <ChevronDown className="ml-auto h-4 w-4 opacity-70" />
                  </SelectTrigger>
                  <SelectContent className="z-[1000002] bg-white dark:bg-popover border border-border">
                    {currencies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Prices */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Starting price {selectedCurrency?.symbol ? `(${selectedCurrency.symbol})` : ""}
                  </div>
                  <Input
                    inputMode="decimal"
                    value={startPrice}
                    onChange={(e) => setStartPrice(e.target.value)}
                    placeholder="0.5"
                    className="bg-white dark:bg-background border border-input shadow-sm"
                    disabled={disableAuctionTab || submitting}
                  />
                  {startPriceError && <p className="text-xs text-destructive">{startPriceError}</p>}
                </div>
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    Min increment {selectedCurrency?.symbol ? `(${selectedCurrency.symbol})` : ""}
                  </div>
                  <Input
                    inputMode="decimal"
                    value={minInc}
                    onChange={(e) => setMinInc(e.target.value)}
                    placeholder="0.05"
                    className="bg-white dark:bg-background border border-input shadow-sm"
                    disabled={disableAuctionTab || submitting}
                  />
                  {minIncError && <p className="text-xs text-destructive">{minIncError}</p>}
                </div>
              </div>

              {/* ERC1155 Quantity */}
              {is1155 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Quantity</div>
                    <div className="text-xs text-muted-foreground">
                      You own {your1155Balance ?? maxQty}. Max auctionable: {maxQty}.
                    </div>
                  </div>
                  <Input
                    inputMode="numeric"
                    value={aucQty}
                    onChange={(e) => setAucQty(e.target.value)}
                    placeholder="1"
                    className="bg-white dark:bg-background border border-input shadow-sm"
                    disabled={disableAuctionTab || submitting}
                  />
                  {aucQtyError && <p className="text-xs text-destructive">{aucQtyError}</p>}
                </div>
              )}

              {/* Schedule */}
              <div className="grid gap-4">
                <div>
                  <DateTimePicker
                    label="Start time (optional)"
                    value={aucStartISO}
                    onChange={setAucStartISO}
                    minNow
                    disabled={disableAuctionTab || submitting}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    If not set, the auction starts immediately.
                  </p>
                </div>
                <div>
                  <DateTimePicker
                    label="End time (required)"
                    value={aucEndISO}
                    onChange={setAucEndISO}
                    minNow
                    disabled={disableAuctionTab || submitting}
                  />
                  {aucTimeError && <p className="mt-1 text-xs text-destructive">{aucTimeError}</p>}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 px-6 pb-6 pt-4 border-t border-border bg-white/95 dark:bg-card/80 backdrop-blur">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="sm:flex-1"
              onClick={onOpenChange.bind(null, false)}
              disabled={submitting}
              title={submitting ? "Please wait…" : "Cancel"}
            >
              Cancel
            </Button>
            {tab === "fixed" ? (
              <Button className="sm:flex-[2]" onClick={submitFixed} disabled={submitting || fixedDisabled}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? "Creating…" : "Create Listing"}
              </Button>
            ) : (
              <Button
                className="sm:flex-[2]"
                onClick={submitAuction}
                disabled={submitting || auctionDisabled || disableAuctionTab}
                title={disableAuctionTab ? "Disabled while editing listing" : undefined}
              >
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? "Creating…" : "Create Auction"}
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
