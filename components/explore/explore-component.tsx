// components/explore/explore-component.tsx
"use client";

import React from "react";
import ExploreCollections from "./explore-collections";
import TabView from "@/components/shared/tab-view";
import MintGrid from "../shared/mint-grid";
import AuctionGrid from "../shared/auction-grid";
import PanthartLegends from "./legends";



const TABS = [
  { label: "Collections",   content: <ExploreCollections /> },
  { label: "Minting Now",   content: <MintGrid /> },
  { label: "Live Auctions", content: <AuctionGrid /> },
  { label: "Panthart Legends", content: <PanthartLegends /> },
];

export default function ExploreComponent() {
  return (
    <section className="flex-1 mt-10">
      <TabView tabs={TABS} />
    </section>
  );
}
