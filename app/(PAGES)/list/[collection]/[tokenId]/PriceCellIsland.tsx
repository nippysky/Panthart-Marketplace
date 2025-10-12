"use client";

import * as React from "react";
import { marketplace, type Standard as Std } from "@/lib/services/marketplace";
import { ZERO_ADDRESS } from "@/lib/evm/getSigner";
import { formatNumber } from "@/lib/utils";

type Props = {
  contract: string;
  tokenId: string;
  standard: "ERC721" | "ERC1155" | string;
  sellerAddress: string;
  qty: number;
  dbSymbol?: string | null;
  dbPriceHuman?: string | null; // UNIT
  dbPriceWei?: string | null;   // not used for display
};

export default function PriceCellIsland({
  contract,
  tokenId,
  standard,
  sellerAddress,
  qty,
  dbSymbol,
  dbPriceHuman,
}: Props) {
  const [symbol, setSymbol] = React.useState<string>(dbSymbol || "ETN");
  const [unit, setUnit] = React.useState<number | null>(null);
  const [total, setTotal] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancel = false;

    async function run() {
      const dbNum = Number(dbPriceHuman);
      if (Number.isFinite(dbNum) && dbNum > 0) {
        const t = qty > 1 ? dbNum * qty : dbNum;
        if (!cancel) {
          setSymbol(dbSymbol || "ETN");
          setUnit(dbNum);
          setTotal(t);
        }
        return;
      }

      try {
        const li = await marketplace.readActiveListingForSeller({
          collection: contract as `0x${string}`,
          tokenId: BigInt(tokenId),
          standard: (standard as Std) || "ERC721",
          seller: sellerAddress as `0x${string}`,
        });
        if (!li || !li.id) return;

        const row = await marketplace.readListingById(li.id);
        if (!row) return;

        let sym = "ETN";
        let decimals = 18;
        if (row.row.currency && row.row.currency !== ZERO_ADDRESS) {
          try {
            const meta = await marketplace.getErc20Meta(row.row.currency as `0x${string}`);
            sym = meta.symbol || "ERC20";
            decimals = meta.decimals || 18;
          } catch {}
        }

        const priceHumanTotal = Number(row.row.price) / 10 ** decimals;
        const u = qty > 0 ? priceHumanTotal / qty : priceHumanTotal;

        if (!cancel) {
          setSymbol(sym);
          setUnit(u);
          setTotal(priceHumanTotal);
        }
      } catch {}
    }

    run();
    return () => {
      cancel = true;
    };
  }, [contract, tokenId, standard, sellerAddress, qty, dbSymbol, dbPriceHuman]);

  return (
    <div className="text-left sm:text-right text-sm min-w-0 break-words">
      <div className="text-xs text-muted-foreground">{qty > 1 ? "Unit price" : "Price"}</div>
      <div className="font-semibold">{unit !== null ? formatNumber(unit) : "—"} {symbol}</div>
      {qty > 1 && (
        <>
          <div className="text-xs text-muted-foreground">Qty {qty}</div>
          <div className="text-xs font-semibold break-words">
            Total (all {qty}) {total !== null ? formatNumber(total) : "—"} {symbol}
          </div>
        </>
      )}
    </div>
  );
}
