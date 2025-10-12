// app/(admin)/[slug]/governance/transactions/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import MultisigAdminClient from "@/components/admin/multisig/MultisigAdminClient";

type Ctx = { params: Promise<{ slug: string }> };

export default async function TransactionsPage(ctx: Ctx) {
  const { slug } = await ctx.params;
  const allowedWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Transactions</h2>
      <MultisigAdminClient allowedWallets={allowedWallets} />
    </div>
  );
}
