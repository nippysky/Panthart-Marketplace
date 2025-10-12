// app/(admin)/[slug]/governance/layout.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import Link from "next/link";
import { notFound } from "next/navigation";
import Sidebar from "./_components/Sidebar";
import AddressChip from "@/components/common/AddressChip";
import WalletGate from "./_components/WalletGate";
import WalletHeader from "./_components/WalletHeader";

type Ctx = { params: Promise<{ slug: string }> };

export default async function GovernanceLayout(
  props: Ctx & { children: React.ReactNode }
) {
  const { slug } = await props.params;

  const adminSlug = process.env.ADMIN_SLUG || "";
  if (!adminSlug || slug !== adminSlug) notFound();

  const allowedWallets = (process.env.ADMIN_WALLETS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  const env = {
    MULTI_SIG_ADDRESS: process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS || "",
    MARKETPLACE_CORE_ADDRESS: process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS || "",
    REWARD_DISTRIBUTOR_ADDRESS: process.env.NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS || "",
    STOLEN_REGISTRY_ADDRESS: process.env.NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS || "",
    BLOCK_EXPLORER_URL: process.env.NEXT_PUBLIC_BLOCK_EXPLORER || "",
  };

  // helper to wrap a chip with an explorer link (when available)
  const ChipLink = ({
    address,
    hrefBase = "address",
  }: {
    address: string;
    hrefBase?: "address" | "token" | string;
  }) => {
    if (!address) return null;
    const url =
      env.BLOCK_EXPLORER_URL &&
      `${env.BLOCK_EXPLORER_URL}/${hrefBase}/${address}`;
    return url ? (
      <Link href={url} target="_blank" className="inline-flex">
        <AddressChip address={address} showCopy />
      </Link>
    ) : (
      <AddressChip address={address} showCopy />
    );
  };

  return (
    <div className="mx-auto max-w-[1400px] px-4">
      <div className="py-8">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
            <p className="text-sm text-muted-foreground">
              Admin & multisig operations for Panth.Art
            </p>
          </div>
          {/* persistent connect button on the right */}
          <WalletHeader />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <aside className="lg:sticky lg:top-6 h-max">
          <Sidebar baseHref={`/${slug}/governance`} />

          {/* Allowed wallets */}
          <div className="mt-6 rounded-xl border p-4">
            <div className="text-sm font-medium mb-2">Allowed admin wallets</div>
            <div className="grid gap-2">
              {allowedWallets.length ? (
                allowedWallets.map((w) => (
                  <div key={w} className="flex items-center">
                    <ChipLink address={w} />
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted-foreground">
                  No wallets configured.
                </div>
              )}
            </div>
          </div>

          {/* Contracts */}
          <div className="mt-6 rounded-xl border p-4">
            <div className="text-sm font-medium mb-3">Contracts</div>
            <ul className="grid gap-3 text-xs">
              {env.MULTI_SIG_ADDRESS && (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Multisig</span>
                  <ChipLink address={env.MULTI_SIG_ADDRESS} />
                </li>
              )}
              {env.MARKETPLACE_CORE_ADDRESS && (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Marketplace</span>
                  <ChipLink address={env.MARKETPLACE_CORE_ADDRESS} />
                </li>
              )}
              {env.REWARD_DISTRIBUTOR_ADDRESS && (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Rewards</span>
                  <ChipLink address={env.REWARD_DISTRIBUTOR_ADDRESS} />
                </li>
              )}
              {env.STOLEN_REGISTRY_ADDRESS && (
                <li className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Stolen Registry</span>
                  <ChipLink address={env.STOLEN_REGISTRY_ADDRESS} />
                </li>
              )}
            </ul>
          </div>
        </aside>

        {/* Gate the whole governance area until connected & allowed */}
        <main className="min-w-0">
          <WalletGate allowedWallets={allowedWallets}>
            {props.children}
          </WalletGate>
        </main>
      </div>
    </div>
  );
}
