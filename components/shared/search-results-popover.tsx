"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "../ui/card";
import Link from "next/link";
import { Loader2 } from "lucide-react";

type GroupKey = "users" | "collections" | "nfts";

interface SearchItem {
  id: string;
  label: string;
  image: string;
  href: string;
  type: GroupKey;       // keep in sync with API
  subtitle?: string;    // optional: wallet, symbol, tokenId, etc.
}

const PLACEHOLDER =
  "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png";

export default function SearchResultsPopover({
  open,
  onClose,
  searchTerm,
  anchorRef,
}: {
  open: boolean;
  onClose: () => void;
  searchTerm: string;
  // Accept both ref flavors and allow null current:
  anchorRef:
    | React.RefObject<HTMLElement>
    | React.MutableRefObject<HTMLElement | null>;
}) {

  const [results, setResults] = useState<{
    users: SearchItem[];
    collections: SearchItem[];
    nfts: SearchItem[];
    recent: SearchItem[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [highlighted, setHighlighted] = useState(0);

  const popRef = useRef<HTMLDivElement | null>(null);

  const flatList = useMemo(
    () =>
      results
        ? [
            ...(results.recent || []),
            ...(results.users || []),
            ...(results.collections || []),
            ...(results.nfts || []),
          ]
        : [],
    [results]
  );

  // Fetch as user types (debounced)
  useEffect(() => {
    if (!open) return; // if closed, don't fetch
    if (!searchTerm.trim()) {
      setResults(null);
      return;
    }

    const controller = new AbortController();
    const doFetch = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchTerm)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          setResults({
            users: data.users || [],
            collections: data.collections || [],
            nfts: data.nfts || [],
            recent: data.recent || [],
          });
        } else {
          setResults({ users: [], collections: [], nfts: [], recent: [] });
        }
      } catch {
        if (!controller.signal.aborted) {
          setResults({ users: [], collections: [], nfts: [], recent: [] });
        }
      } finally {
        setLoading(false);
        setHighlighted(0);
      }
    };

    const t = setTimeout(doFetch, 180);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [open, searchTerm]);

  // Click-away to close
  useEffect(() => {
    if (!open) return;
    const handleDown = (e: MouseEvent | TouchEvent) => {
      const p = popRef.current;
      const a = anchorRef.current;
      const target = e.target as Node | null;
      if (!p || !a || !target) return;
      const clickedInsidePopover = p.contains(target);
      const clickedInsideAnchor = a.contains(target);
      if (!clickedInsidePopover && !clickedInsideAnchor) onClose();
    };
    document.addEventListener("mousedown", handleDown);
    document.addEventListener("touchstart", handleDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", handleDown);
      document.removeEventListener("touchstart", handleDown);
    };
  }, [open, onClose, anchorRef]);

  // Keyboard nav (only while open)
  useEffect(() => {
    if (!open || !flatList.length) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlighted((h) => (h + 1) % flatList.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlighted((h) => (h - 1 + flatList.length) % flatList.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = flatList[highlighted];
        if (item) window.location.href = item.href;
      } else if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, flatList, highlighted, onClose]);

  const getImageStyle = (type: GroupKey) => {
    if (type === "users") return "rounded-full";
    if (type === "collections") return "rounded-xl";
    return "rounded-md"; // nfts
  };

  const renderGroup = (items: SearchItem[], label: string, offset: number) =>
    items.length ? (
      <div className="mb-3" key={label}>
        <div className="text-xs uppercase font-semibold text-muted-foreground mb-2">
          {label}
        </div>
        {items.map((it, i) => {
          const idx = offset + i;
          const active = idx === highlighted;
          return (
            <Link
              key={`${it.type}:${it.id}:${it.href}`}
              href={it.href}
              className={[
                "flex items-center gap-3 px-3 py-2 rounded-md transition text-sm",
                active ? "bg-muted text-primary" : "hover:bg-muted text-muted-foreground",
              ].join(" ")}
              onMouseEnter={() => setHighlighted(idx)}
              onClick={() => onClose()}
            >
              {/* image */}
              <img
                src={it.image || PLACEHOLDER}
                alt={it.label}
                width={40}
                height={40}
                className={`object-cover w-10 h-10 ${getImageStyle(it.type)}`}
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = PLACEHOLDER;
                }}
              />
              {/* text */}
              <div className="flex flex-col">
                <span className="text-foreground">{it.label}</span>
                {it.subtitle ? (
                  <span className="text-[11px] text-muted-foreground">{it.subtitle}</span>
                ) : (
                  <span className="text-[11px] text-muted-foreground capitalize">
                    {it.type.slice(0, -1)}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    ) : null;

  if (!open) return null;

  if (loading) {
    return (
      <Card
        ref={popRef}
        className="absolute top-full mt-2 left-0 w-full max-w-[600px] z-[95] p-4 flex items-center justify-center text-sm text-muted-foreground"
      >
        <Loader2 className="animate-spin h-4 w-4 mr-2" />
        Searching…
      </Card>
    );
  }

  const flatLen = flatList.length;
  if (!results || flatLen === 0) {
    return (
      <Card
        ref={popRef}
        className="absolute top-full mt-2 left-0 w-full max-w-[600px] z-[95] p-4 text-sm text-muted-foreground"
      >
        No results. Try a contract (0x…), a token id (e.g. 1234), or “0x… 1234”.
      </Card>
    );
  }

  const usersLen = results.users.length;
  const collsLen = results.collections.length;
  const recLen = (results.recent || []).length;

  return (
    <Card
      ref={popRef}
      className="absolute top-full mt-2 left-0 w-full max-w-[600px] z-[95] p-4"
    >
      {renderGroup(results.recent, "Recently viewed", 0)}
      {renderGroup(results.users, "Users", recLen)}
      {renderGroup(results.collections, "Collections", recLen + usersLen)}
      {renderGroup(results.nfts, "NFTs", recLen + usersLen + collsLen)}
    </Card>
  );
}
