"use client";
import React from "react";
import TabView from "@/components/shared/tab-view";
import NFTAttributesTab from "@/components/shared/nft-attributes-tab";
import ActivityTab from "@/components/shared/activity-tab";
import NFTItemsTab from "@/components/shared/nft-items-tab";
import type { NFTItem } from "@/lib/types/types";
import type { DisplayGroup } from "@/lib/types/nft-page";
import { RawMetadataBlock } from "./RawMetadataBlock";

export function TabsContainer({
  nft,
  displayGroup,
  traitsWithRarity,
  rarityScore,
  rarityRank,
  population,
  rawMetadata,
}: {
  nft: NFTItem;
  displayGroup: DisplayGroup;
  traitsWithRarity?: any[];
  rarityScore?: number;
  rarityRank?: number;
  population?: number;
  rawMetadata?: Record<string, any> | null;
}) {
  const base = [
    {
      label: "Attributes",
      content: (
        <div className="w-full max-w-full overflow-x-auto">
          <NFTAttributesTab
            traitsWithRarity={traitsWithRarity ?? []}
            rarityScore={rarityScore ?? 0}
            rarityRank={rarityRank}
            population={population ?? 0}
          />
        </div>
      ),
    },
    {
      label: "Activities",
      content: (
        <div className="w-full max-w-full overflow-x-auto">
          <ActivityTab contract={nft.nftAddress} tokenId={nft.tokenId} />
        </div>
      ),
    },
  ] as const;

  const tabs =
    displayGroup.type === "collection"
      ? [
          ...base,
          {
            label: "More from Collection",
            content: (
              <div className="w-full max-w-full overflow-x-auto">
                <NFTItemsTab
                  contract={nft.nftAddress}
                  collectionName={displayGroup.title}
                />
              </div>
            ),
          } as any,
          {
            label: "Raw metadata",
            content: (
              <div className="w-full max-w-full overflow-x-auto">
                <RawMetadataBlock raw={rawMetadata} />
              </div>
            ),
          },
        ]
      : [
          ...base,
          {
            label: "Raw metadata",
            content: (
              <div className="w-full max-w-full overflow-x-auto">
                <RawMetadataBlock raw={rawMetadata} />
              </div>
            ),
          },
        ];

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <TabView tabs={tabs as any} />
    </div>
  );
}
