"use client";

import { MoveRight } from "lucide-react";
import Link from "next/link";
import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CREATE_NFT_OPTIONS } from "@/lib/app-data";

export default function CreateNFTOptions() {
  return (
    <section className="flex-1">
      <ul className="flex flex-col gap-3">
        {CREATE_NFT_OPTIONS.map((option) => (
          <li key={option.href}>
            <Link href={option.href} aria-label={option.title} className="group block">
              <Card
                className="
                  border border-white/10 bg-background/60 backdrop-blur-xl
                  transition-all duration-300
                  hover:border-brand/60 hover:shadow-[0_10px_30px_-15px_rgba(0,0,0,0.35)]
                  hover:-translate-y-0.5
                "
              >
                <CardContent className="p-4 md:p-5 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-base md:text-[1.05rem] tracking-tight truncate">
                      {option.title}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                      {option.desc}
                    </p>
                  </div>
                  <MoveRight
                    className="h-5 w-5 shrink-0 transition-transform duration-300 group-hover:translate-x-1"
                  />
                </CardContent>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
