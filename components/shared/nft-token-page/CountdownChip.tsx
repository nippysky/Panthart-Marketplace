"use client";
import React, { useEffect, useState } from "react";

function label(ms: number): string {
  if (ms <= 0) return "Ended";
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export function CountdownChip({ endISO }: { endISO?: string | null }) {
  const [text, setText] = useState<string>("");

  useEffect(() => {
    if (!endISO) {
      setText("");
      return;
    }
    let t: any;
    const tick = () => {
      const delta = new Date(endISO).getTime() - Date.now();
      setText(label(delta));
      if (delta > 0) t = setTimeout(() => requestAnimationFrame(tick), 1000);
    };
    tick();
    return () => clearTimeout(t);
  }, [endISO]);

  if (!endISO || !text) return null;
  const ended = text === "Ended";

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        ended
          ? "bg-gray-500/10 text-gray-700 dark:text-gray-300 border border-gray-500/20"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20",
      ].join(" ")}
      title={new Date(endISO).toLocaleString()}
      aria-label={ended ? "Auction ended" : `Time remaining ${text}`}
    >
      {ended ? "Ended" : <>⏳ {text}</>}
    </span>
  );
}
