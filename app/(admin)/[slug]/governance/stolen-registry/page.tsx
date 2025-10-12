// app/(admin)/[slug]/governance/stolen-registry/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import RegistryAdminPanel from "@/components/admin/stolen/RegistryAdminPanel";

type Ctx = { params: Promise<{ slug: string }> };

export default async function StolenRegistryPage(ctx: Ctx) {
  const allowedWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return <RegistryAdminPanel allowedWallets={allowedWallets} />;
}
