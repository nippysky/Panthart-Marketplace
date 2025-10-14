import Link from "next/link";
import prisma, { prismaReady } from "@/lib/db";
import { ListingStatus, NftStatus } from "@/lib/generated/prisma";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import MediaThumb from "@/components/shared/media-thumb";

function shorten(addr: string) {
  const a = addr.toLowerCase();
  return a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export default async function FixedListingsSpotlight({
  className = "",
  take = 8,
}: {
  className?: string;
  take?: number;
}) {
  await prismaReady;

  const now = new Date();

  const items = await prisma.marketplaceListing.findMany({
    where: {
      status: ListingStatus.ACTIVE,
      startTime: { lte: now },
      OR: [{ endTime: null }, { endTime: { gt: now } }],
      nft: { status: NftStatus.SUCCESS, imageUrl: { not: null as any } },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      sellerAddress: true,
      priceEtnWei: true,
      priceTokenAmount: true,
      quantity: true, // 👈 need for ERC1155 qty badge
      createdAt: true,
      nft: {
        select: {
          contract: true,
          tokenId: true,
          name: true,
          imageUrl: true,
          standard: true, // 👈 ERC721 / ERC1155 badge
        },
      },
      currency: { select: { symbol: true, decimals: true, tokenAddress: true } },
    },
  });

  if (!items.length) return null;

  const view = items.map((it) => {
    const { nft, currency } = it;
    const isNative = !currency || !currency.tokenAddress || currency.symbol === "ETN";
    const decimals = currency?.decimals ?? 18;
    const raw = isNative ? String(it.priceEtnWei) : String(it.priceTokenAmount ?? "0");
    const pad = raw.padStart(decimals + 1, "0");
    const int = pad.slice(0, pad.length - decimals);
    const frac = pad.slice(pad.length - decimals).replace(/0+$/, "");
    const human = frac ? `${int}.${frac}` : int;
    const symbol = isNative ? "ETN" : currency?.symbol ?? "TOKEN";
    return {
      id: it.id,
      href: `/collections/${nft.contract}/${nft.tokenId}`,
      title: nft.name || `#${nft.tokenId}`,
      media: nft.imageUrl,
      standard: nft.standard || "ERC721",
      quantity: it.quantity ?? 1,
      seller: shorten(it.sellerAddress),
      priceLabel: `${human} ${symbol}`,
    };
  });

  return (
    <section className={`w-full ${className}`}>
      <div className="flex items-center justify-between mb-10">
     
          <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold">
            Listing Spotlight
          </h2>

    
        <Button asChild variant="secondary" className="shrink-0">
          <Link href="/listings">View all</Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
        {view.map((v) => (
          <Link key={v.id} href={v.href} prefetch={false} className="group block">
            <Card className="overflow-hidden rounded-2xl bg-card/50 backdrop-blur-sm border-border/50 transition-all duration-200 hover:shadow-lg hover:-translate-y-[2px] pt-0">
              <div className="relative w-full aspect-square bg-muted/30">
                <MediaThumb src={v.media} alt={v.title} />
                {/* Badge (top-left) */}
                <div className="absolute left-3 top-3 z-10">
                  <Badge className="rounded-full px-2.5 py-1 text-[10px] sm:text-xs backdrop-blur border-border/50 bg-black/65 text-white">
                    {v.standard === "ERC1155"
                      ? `ERC-1155${v.quantity > 1 ? ` × ${v.quantity}` : ""}`
                      : "ERC-721"}
                  </Badge>
                </div>
              </div>

              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{v.title}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      Seller {v.seller}
                    </div>
                  </div>
                  <div className="text-right text-sm font-semibold shrink-0">
                    {v.priceLabel}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}
