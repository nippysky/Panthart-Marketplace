"use client";

import React from "react";
import { Slash } from "lucide-react";
import AuctionGrid from "./auction-grid";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default function AuctioningNowComponent() {
  return (
    <section className="flex-1">
      {/* Breadcrumb */}
      <Breadcrumb className="mb-5 mt-10">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <Slash className="w-3.5 h-3.5" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>Auctions</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Heading */}
      <div className="flex flex-col gap-3">
        <h1 className="font-bold text-[1.5rem] lg:text-[2rem]">Live Auctions</h1>
        <p>Bid in real-time on digital assets. Make sure you don't miss out.</p>
      </div>

      {/* AUCTION GRID */}
      <AuctionGrid />
    </section>
  );
}
