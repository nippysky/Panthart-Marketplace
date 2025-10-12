"use client";

import { useLoaderStore } from "@/lib/store/loader-store";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export default function LoaderModal() {
  const { isVisible, message } = useLoaderStore();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isVisible) {
      setShow(true);
    } else {
      timeout = setTimeout(() => setShow(false), 300); // Wait for fade-out
    }
    return () => clearTimeout(timeout);
  }, [isVisible]);

  if (!show) return null;

  return (
    <div
      className={`fixed inset-0 z-[1000] bg-background/70 dark:bg-background/70 backdrop-blur-sm flex items-center justify-center transition-opacity duration-300 ${
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <div className="flex flex-col items-center gap-4 bg-card p-8 rounded-lg shadow-lg w-[300px]">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
        <p className="text-sm text-center text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}
