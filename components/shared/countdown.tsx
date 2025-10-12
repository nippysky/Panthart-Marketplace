// components/shared/countdown.tsx
"use client";

import * as React from "react";

function diffParts(target: number) {
  const now = Date.now();
  let secs = Math.max(0, Math.floor((target - now) / 1000));
  const days = Math.floor(secs / 86400);
  secs -= days * 86400;
  const hours = Math.floor(secs / 3600);
  secs -= hours * 3600;
  const mins = Math.floor(secs / 60);
  secs -= mins * 60;
  return { days, hours, mins, secs };
}

export default function Countdown({ targetISO, className }: { targetISO: string; className?: string }) {
  const [mounted, setMounted] = React.useState(false);
  const [parts, setParts] = React.useState(() => diffParts(Date.parse(targetISO)));

  React.useEffect(() => {
    setMounted(true);
    const t = Date.parse(targetISO);
    const id = setInterval(() => setParts(diffParts(t)), 1000);
    return () => clearInterval(id);
  }, [targetISO]);

  if (!mounted) {
    return <span suppressHydrationWarning className={className}>—</span>;
  }

  const { days, hours, mins, secs } = parts;
  return (
    <span className={className}>
      {days}d {String(hours).padStart(2, "0")}h:{String(mins).padStart(2, "0")}m:
      {String(secs).padStart(2, "0")}s
    </span>
  );
}
