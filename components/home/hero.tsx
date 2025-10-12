import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BadgeCheck, Compass } from "lucide-react";

export default function Hero() {
  return (
    <section className="w-full py-10 lg:py-20 font-[family-name:var(--font-geist-sans)]">
      {/* Responsive container to prevent overflow and keep content centered on large screens */}
      <div className="max-w-screen-xl mx-auto lg:px-5">
        {/* Flex column; left-aligned on mobile, center-aligned on large screens */}
        <div className="flex flex-col items-start lg:items-center">
          <h1 className="text-left lg:text-center font-extrabold lg:text-[4.5rem] md:text-[3rem] text-[2rem] lg:leading-[6rem] leading-tight">
            Mint, Trade, and Discover Digital Assets on <span className="text-brand">Electronuem</span>
          </h1>

          <div className="mt-10 text-left lg:text-center flex items-center gap-4 flex-wrap">
            <Link href="/explore" passHref>
              <Button className="lg:px-10"> <Compass/>Explore Marketplace</Button>
            </Link>
            <Link href="/submit-collection" passHref>
              <Button className="lg:px-10">     <BadgeCheck />Submit Collection</Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
