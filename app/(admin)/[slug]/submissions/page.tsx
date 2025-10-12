// app/(admin)/[slug]/submissions/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { notFound } from "next/navigation";
import AdminSubmissionsClient from "@/components/admin/CollectionSubmissionsTable";

type PageContext = { params: Promise<{ slug: string }> };

/**
 * Unguessable segment check.
 * Only render if the secret segment matches ADMIN_SLUG.
 */
export default async function AdminSubmissionsPage(ctx: PageContext) {
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
    <div className="max-w-6xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight mb-6">
        Collection Submissions — Pending Review
      </h1>
      <AdminSubmissionsClient allowedWallets={allowedWallets} />
    </div>
  );
}
