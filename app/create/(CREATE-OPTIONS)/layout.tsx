"use client";

import Footer from "@/components/shared/footer";
import { ScrollArea } from "@/components/ui/scroll-area";
import React from "react";

export default function CreateOptionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col font-[family-name:var(--font-geist-sans)] lg:px-20 md:px-10 px-5">
      {/* Main content area grows to fill available space */}
      <main className="flex-1">
        <ScrollArea className="w-full h-full">{children}</ScrollArea>
      </main>
      <Footer />
    </div>
  );
}
