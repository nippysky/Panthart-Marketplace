// app/(admin)/[slug]/governance/overview/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import OverviewClient from "./ui/OverviewClient";

type Ctx = { params: Promise<{ slug: string }> };

export default async function OverviewPage(ctx: Ctx) {
  const { slug } = await ctx.params;
  const allowedWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return <OverviewClient allowedWallets={allowedWallets} baseHref={`/${slug}/governance`} />;
}
