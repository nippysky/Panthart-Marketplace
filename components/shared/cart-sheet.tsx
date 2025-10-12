"use client";

import React, { useState } from "react";
import { GrShop } from "react-icons/gr";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "../ui/sheet";
import { Button } from "../ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { useNFTCartStore } from "@/lib/store/add-to-cart";
import CartSheetItems from "./cart-sheet-item";

export default function CartSheet() {
  const [open, setOpen] = useState(false);
  const cart = useNFTCartStore((s) => s.cart);
  const count = cart.length;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <div className="relative">
                <Button variant="outline" aria-label="Open cart">
                  <GrShop size={20} />
                </Button>
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                    {count}
                  </span>
                )}
              </div>
            </SheetTrigger>

            <SheetContent side="right" className="flex flex-col">
              <SheetHeader>
                <SheetTitle>Your Cart</SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-auto">
                <CartSheetItems closeSheet={() => setOpen(false)} />
              </div>
            </SheetContent>
          </Sheet>
        </TooltipTrigger>
        <TooltipContent>View your cart</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
