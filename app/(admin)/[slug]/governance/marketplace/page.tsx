// app/(admin)/[slug]/governance/marketplace/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import MarketplaceAdminPanel from "@/components/admin/marketplace/MarketplaceAdminPanel";

type Ctx = { params: Promise<{ slug: string }> };

export default async function MarketplacePage(ctx: Ctx) {
  const allowedWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Marketplace</h2>
      <MarketplaceAdminPanel allowedWallets={allowedWallets} />
    </div>
  );
}
