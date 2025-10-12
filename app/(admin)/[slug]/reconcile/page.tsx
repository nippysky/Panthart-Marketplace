// app/(admin)/[slug]/reconcile/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { notFound } from "next/navigation";
import AdminReconcileDeployClient from "@/components/admin/AdminReconcileDeployClient";

type PageContext = { params: Promise<{ slug: string }> };

/**
 * Unguessable segment check.
 * Only render if the secret segment matches ADMIN_SLUG.
 */
export default async function AdminReconcileDeployPage(ctx: PageContext) {
  const { slug } = await ctx.params;

  const adminSlug = process.env.ADMIN_SLUG || "";
  if (!adminSlug || slug !== adminSlug) {
    notFound();
  }

  // Allowed admin wallets (public info, safe to pass to client)
  const allowedWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-2">
        Reconcile Deployed Contract
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Paste a tx hash from your factory deployment. We’ll derive the contract,
        read on-chain config, and upsert your DB. You can preview first, then write.
      </p>
      <AdminReconcileDeployClient allowedWallets={allowedWallets} />
    </div>
  );
}
