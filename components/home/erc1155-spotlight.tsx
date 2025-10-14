// components/home/erc1155-spotlight.tsx
export const dynamic = "force-dynamic";

import Link from "next/link";
import Image from "next/image";
import prisma, { prismaReady } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NftStatus, Prisma } from "@/lib/generated/prisma";

type Props = { className?: string };

export default async function Erc1155Spotlight({ className }: Props) {
  await prismaReady;

  const where: Prisma.NFTWhereInput = {
    standard: "ERC1155",
    status: { equals: NftStatus.SUCCESS },
    imageUrl: { not: null },
  };

  const items = await prisma.nFT.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 8,
    select: {
      contract: true,
      tokenId: true,
      name: true,
      imageUrl: true,
      single1155: { select: { name: true } },
      collection: { select: { name: true } },
    },
  });

  if (!items.length) return null; // hide section when no ERC1155

  return (
    <section className={className}>
      <div className="flex items-center justify-between mb-10">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold">
            Multi-Edition Spotlight
          </h2>
    
        <Button asChild variant="secondary" size="sm">
          <Link href="/erc1155">View all</Link>
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
        {items.map((nft) => {
          const parent = nft.single1155?.name || nft.collection?.name || "ERC-1155 Drop";
          const title = nft.name || `${parent} #${nft.tokenId}`;
          const href = `/collections/${nft.contract}/${nft.tokenId}`;
          return (
            <Link key={`${nft.contract}-${nft.tokenId}`} href={href} prefetch={false} className="group block">
              <Card className="overflow-hidden rounded-2xl bg-card/50 backdrop-blur-sm border-border/50 transition-all duration-200 hover:shadow-lg hover:translate-y-[-2px] pt-0">
                {/* Image flush to the top, no gutters */}
                <div className="relative w-full aspect-square">
                  {nft.imageUrl ? (
                    <Image
                      src={nft.imageUrl}
                      alt={title}
                      fill
                      sizes="(max-width:768px) 100vw, (max-width:1200px) 33vw, 25vw"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                  {/* Subtle top overlay to kill any perceived gap on dark themes */}
                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-background/60 via-transparent to-transparent opacity-70" />
                </div>

                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm sm:text-base font-medium line-clamp-1">{title}</h3>
                  <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">{parent}</p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
