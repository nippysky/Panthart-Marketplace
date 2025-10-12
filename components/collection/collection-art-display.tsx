"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { ETN_LOGO } from "@/lib/images";
import { formatNumber } from "@/lib/utils";
import { Collection } from "@/lib/types/types";

interface CollectionArtDisplayProps {
  collection: Collection;
}

const CollectionArtDisplay: React.FC<CollectionArtDisplayProps> = ({
  collection,
}) => {
  const {
name, logoUrl, coverUrl, volume, contract,

    floorPrice,

  } = collection;

  const href = `/collection/${contract}`;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // prevent hydration mismatch
  }, []);

  return (
    <Card className="w-full border p-4">
      <CardContent className="p-0">
        {/* Cover Image */}
        <div className="relative w-full h-[140px] rounded-md overflow-hidden mb-4">
          <Image
            src={coverUrl as string}
            alt={`${name} Cover`}
            fill
            className="object-cover"
          />
        </div>

        {/* Profile + Name */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative w-[50px] h-[50px] rounded-full overflow-hidden border shadow-sm">
            <Image
              src={logoUrl as string}
              alt={`${name} Logo`}
              fill
              className="object-cover object-center"
            />
          </div>
          <p className="text-[0.95rem] font-semibold leading-tight line-clamp-1">
            {name}
          </p>
        </div>

        {/* Side-by-side Floor & Volume */}
        {mounted && (
          <div className="flex justify-between gap-4 text-sm">
            <div className="flex-1 bg-muted/10 p-2 rounded-md">
              <p className="text-muted-foreground text-xs mb-1">Floor</p>
              <div className="flex items-center gap-1 font-semibold">
                {formatNumber(floorPrice)}{" "}
                <Image src={ETN_LOGO} alt="ETN" width={15} height={15} />
              </div>
            </div>

            <div className="flex-1 bg-muted/10 p-2 rounded-md">
              <p className="text-muted-foreground text-xs mb-1">Volume</p>
              <div className="flex items-center gap-1 font-semibold">
                {formatNumber(volume)}{" "}
                <Image src={ETN_LOGO} alt="ETN" width={15} height={15} />
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="p-0 mt-4">
        <Link href={href} passHref className="w-full">
          <Button className="w-full">View Collection</Button>
        </Link>
      </CardFooter>
    </Card>
  );
};

export default CollectionArtDisplay;
