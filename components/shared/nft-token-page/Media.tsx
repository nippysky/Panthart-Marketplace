"use client";
import Image from "next/image";

export function Media({
  src,
  alt,
  isVideo,
}: {
  src: string;
  alt: string;
  isVideo: boolean;
}) {
  return (
    <div
      className="relative w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-border/50 bg-muted/40"
      /* this wrapper prevents any overflow & preserves rounded corners */
    >
      {/* Aspect box (square on mobile, 4:3 on md+) */}
      <div className="relative w-full aspect-square md:aspect-[4/3]">
        {isVideo ? (
          <video
            src={String(src)}
            autoPlay
            muted
            loop
            playsInline
            controls
            className="block w-full h-full object-contain bg-black"
          />
        ) : (
          <Image
            src={src}
            alt={alt}
            fill
            priority={false}
            unoptimized
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-contain"
          />
        )}
      </div>
    </div>
  );
}
