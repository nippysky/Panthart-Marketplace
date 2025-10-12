// components/explore/explore-page.tsx
"use client";

import { usePathname } from "next/navigation";
import { Slash } from "lucide-react";
import ExploreComponent from "./explore-component";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import React from "react";

export default function ExplorePage() {
  const pathname = usePathname();
  const pathSegments = pathname.split("/").filter(Boolean);

  return (
    <section className="flex-1">
      <Breadcrumb className="mb-5 mt-2">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          {pathSegments.map((segment, index) => {
            const href = "/" + pathSegments.slice(0, index + 1).join("/");
            const isLast = index === pathSegments.length - 1;
            const label = segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
            return (
              <React.Fragment key={index}>
                <BreadcrumbSeparator>
                  <Slash className="w-3.5 h-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem key={href}>
                  {isLast ? <BreadcrumbPage>{label}</BreadcrumbPage> : <BreadcrumbLink href={href}>{label}</BreadcrumbLink>}
                </BreadcrumbItem>
              </React.Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-3 mt-10">
        <h1 className="font-bold text-[1.5rem] lg:text-[2rem]">Explore Panthart</h1>
        <p>
          Discover what’s trending on Panthart. Explore top collections, live mints, and auctions.
        </p>
      </div>

      <ExploreComponent />
    </section>
  );
}
