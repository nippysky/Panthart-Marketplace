"use client";
import React from "react";
import {
  Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbLink, BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Slash } from "lucide-react";

export function BreadcrumbsBar({
  items,
}: {
  items: Array<{ type: "link"; href: string; label: string } | { type: "page"; label: string }>;
}) {
  return (
    <Breadcrumb className="mb-5 mt-2">
      <BreadcrumbList>
        {items.map((c, i) => (
          <React.Fragment key={`${c.type}:${"href" in c ? c.href : c.label}`}>
            {i > 0 && (
              <BreadcrumbSeparator>
                <Slash className="w-3.5 h-3.5" />
              </BreadcrumbSeparator>
            )}
            <BreadcrumbItem>
              {c.type === "link" ? (
                <BreadcrumbLink href={c.href}>{c.label}</BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
