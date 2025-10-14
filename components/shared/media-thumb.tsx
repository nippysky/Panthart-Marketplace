// components/shared/media-thumb.tsx
type Group = "card" | "avatar";

const VIDEO_EXT_RE = /\.(mp4|mov|webm|ogg|m4v|mpeg)(\?.*)?$/i;
const isVideo = (u?: string | null) => !!u && VIDEO_EXT_RE.test(u);

export default function MediaThumb({
  src,
  alt,
  group = "card",
  className = "",
}: {
  src?: string | null;
  alt: string;
  group?: Group;
  className?: string;
}) {
  const rounded = group === "avatar" ? "rounded-full" : "rounded-xl";
  const base = `w-full h-full object-cover ${rounded} ${className}`;

  if (!src) {
    return <div className={`${base} bg-muted`} aria-label={alt} />;
  }
  if (isVideo(src)) {
    return (
      <video
        src={src}
        className={base}
        muted
        loop
        playsInline
        autoPlay
        preload="metadata"
        aria-label={alt}
      />
    );
  }
  return <img src={src} alt={alt} className={base} loading="lazy" />;
}
