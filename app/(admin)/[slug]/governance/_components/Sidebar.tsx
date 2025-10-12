"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ReceiptText,
  Store,
  Gift,
  ShieldAlert,
  Settings,
} from "lucide-react";

const items: Array<{
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { href: "overview", label: "Overview", icon: LayoutDashboard },
  { href: "transactions", label: "Transactions", icon: ReceiptText },
  { href: "marketplace", label: "Marketplace", icon: Store },
  { href: "rewards", label: "Rewards", icon: Gift },
  { href: "stolen-registry", label: "Stolen Registry", icon: ShieldAlert },
  { href: "settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ baseHref }: { baseHref: string }) {
  const pathname = usePathname();

  return (
    <nav className="rounded-xl border p-2">
      {items.map((it) => {
        const href = `${baseHref}/${it.href}`;
        const active = pathname?.startsWith(href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={href}
            className={cn(
              "group flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon
              size={16}
              className={cn(
                "shrink-0",
                active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
              )}
            />
            <span className="truncate">{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
