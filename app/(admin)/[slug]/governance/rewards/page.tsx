// app/(admin)/[slug]/governance/rewards/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import RewardsPanel from "./ui/RewardsPanel";

type Ctx = { params: Promise<{ slug: string }> };

export default async function RewardsPage(ctx: Ctx) {
  const allowedWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return <RewardsPanel allowedWallets={allowedWallets} />;
}
