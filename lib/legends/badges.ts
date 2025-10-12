// /lib/legends/badges.ts
export type LegendBadge = {
  id: number;
  name: string;
  icon: string;   // emoji or future image URL
  min: number;    // inclusive
  max?: number;   // inclusive; undefined = infinity
  perks: string[];
};

export const LEGEND_BADGES: LegendBadge[] = [
  // 0) Onboarding
  { id: 0, name: "Visitor", icon: "👋", min: 0, max: 0, perks: [] },

  // 1) First win — holder = revenue share
  { id: 1, name: "Comrade", icon: "🏅", min: 1, max: 2, perks: [
    "Profile badge",
    "Legends leaderboard",
    "Next-badge progress",
    "Marketplace revenue share (proportional)",
  ]},

  // 2) Early momentum
  { id: 2, name: "Cell Leader", icon: "🏅🏅", min: 3, max: 9, perks: [
    "Priority support",
    "Explore spotlight (rotating)",
  ]},

  // 3) Solid contributor
  { id: 3, name: "Squad Leader", icon: "🏅🏅🏅", min: 10, max: 24, perks: [
    "Early access windows",
    "Community polls",
  ]},

  // 4) Core member
  { id: 4, name: "Platoon Lead", icon: "🎖️", min: 25, max: 99, perks: [
    "Featured row (rotating)",
    "Vanity URL eligibility",
  ]},

  // 5) Power user — allowlist starts here
  { id: 5, name: "Colonel", icon: "🎖️🎖️", min: 100, max: 499, perks: [
    "Guaranteed allowlist (select drops)",
    "Pinned in Legends",
    "Co-marketing slots (limited)",
  ]},

  // 6) Prestige / endgame
  { id: 6, name: "Legendary Marshal", icon: "👑", min: 500, perks: [
    "Guaranteed allowlist (select drops)",
    "Pinned in Legends",
    "Quarterly roundtable",
    "Partner badge",
    "Private feedback channel",
    "Co-marketing priority",
  ]},
];

export function getBadgeForCount(count: number): LegendBadge {
  for (let i = LEGEND_BADGES.length - 1; i >= 0; i--) {
    const b = LEGEND_BADGES[i];
    if (count >= b.min && (b.max == null || count <= b.max)) return b;
  }
  return LEGEND_BADGES[0];
}

export function getNextBadge(count: number) {
  const current = getBadgeForCount(count);
  const next = LEGEND_BADGES.find((b) => b.min > (current.max ?? Infinity));
  if (!next) return null;
  const progress = Math.max(0, Math.min(1, (count - current.min) / (next.min - current.min)));
  return { next, progress };
}

// Convenience helpers for gating
export const ALLOWLIST_MIN_COUNT = 100;
export function hasGuaranteedAllowlist(count: number) {
  return count >= ALLOWLIST_MIN_COUNT;
}
