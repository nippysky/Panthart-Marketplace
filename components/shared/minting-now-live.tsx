"use client";

import React from "react";
import MintGrid from "./mint-grid";
import { MintingNowItem } from "@/lib/types/minting-now";

type PagePayload = { items: MintingNowItem[]; nextCursor: string | null };

export default function MintingNowLive({
  initialPage,
}: {
  initialPage: PagePayload;
}) {
  // No hero, just the live-updating grid
  return (
    <MintGrid
      className="mt-2 mb-20"
      initialPage={initialPage}
    />
  );
}
