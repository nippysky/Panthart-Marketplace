"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import Link from "next/link";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Account } from "thirdweb/wallets";

interface MobileMenuSheetProps {
  account: Account | undefined;
}

export default function MobileMenuSheet({ account }: MobileMenuSheetProps) {
  const navLinks = account
    ? [
        { name: "Create", href: "/create" },
        { name: "Explore", href: "/explore" },
        { name: "Profile", href: "/profile" },
      ]
    : [];

  // If wallet not connected, don't show the menu at all
  if (!account) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">
              <Menu size={20} />
            </Button>
          </SheetTrigger>

          <SheetContent>
            <SheetHeader>
              <SheetTitle>Decent Menu</SheetTitle>
            </SheetHeader>

            <ScrollArea className="flex-1 w-full h-full p-5">
              <nav className="flex flex-col gap-10 mt-10">
                {navLinks.map((link) => (
                  <Link
                    key={link.name}
                    href={link.href}
                    className="text-[1.5rem] font-semibold text-muted-foreground hover:text-primary transition-all duration-300 ease-in-out"
                  >
                    {link.name}
                  </Link>
                ))}
              </nav>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </TooltipTrigger>
      <TooltipContent>Menu</TooltipContent>
    </Tooltip>
  );
}
