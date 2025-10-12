"use client";

import React from "react";

export default function AuctionCardCountdown({ endTime }: { endTime: string }) {
  const [timeLeft, setTimeLeft] = React.useState({
    hours: 0,
    minutes: 0,
    seconds: 0,
    ended: false,
  });

  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const end = new Date(endTime).getTime();
      const diff = end - now;

      if (!Number.isFinite(end) || diff <= 0) {
        setTimeLeft({ hours: 0, minutes: 0, seconds: 0, ended: true });
        clearInterval(interval);
        return;
      }

      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      const seconds = Math.floor((diff % 60_000) / 1000);
      setTimeLeft({ hours, minutes, seconds, ended: false });
    }, 1000);

    return () => clearInterval(interval);
  }, [endTime]);

  if (timeLeft.ended) {
    return (
      <p className="bg-red-600 text-white font-semibold px-2 py-1 rounded-md text-[0.7rem]">
        Auction Ended
      </p>
    );
  }

  return (
    <p className="bg-muted text-foreground font-semibold px-2 py-1 rounded-md text-[0.7rem]">
      {String(timeLeft.hours).padStart(2, "0")}h :{" "}
      {String(timeLeft.minutes).padStart(2, "0")}m :{" "}
      {String(timeLeft.seconds).padStart(2, "0")}s
    </p>
  );
}
