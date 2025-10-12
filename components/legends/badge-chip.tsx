// components/legends/badge-chip.tsx
export default function BadgeChip({ icon, name }: { icon: string; name: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs
                     bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10">
      <span className="text-base leading-none">{icon}</span>
      <span className="font-medium">{name}</span>
    </span>
  );
}
