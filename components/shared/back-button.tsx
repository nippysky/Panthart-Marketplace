"use client";

import { MoveLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/button";

export default function BackButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  return (
    <Button
      type="button"
      variant={"outline"}
      onClick={() => router.back()}
      className={`inline-flex items-center gap-2 text-sm hover:opacity-80 ${className}`}
      aria-label="Go back"
    >
      <MoveLeft className="h-4 w-4" />
      Back
    </Button>
  );
}
