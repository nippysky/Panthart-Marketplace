// app/(admin)/[slug]/governance/settings/page.tsx
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import AddressChip from "@/components/common/AddressChip";

export default async function SettingsPage() {
  const EXPLORER = process.env.NEXT_PUBLIC_BLOCK_EXPLORER

  const env = {
    NEXT_PUBLIC_MULTI_SIG_ADDRESS:
      process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS || "",
    NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS:
      process.env.NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS || "",
    NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS:
      process.env.NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS || "",
    NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS:
      process.env.NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS || "",
    NEXT_PUBLIC_BLOCK_EXPLORER: EXPLORER || "",
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "",
  };

  const addressKeys = new Set([
    "NEXT_PUBLIC_MULTI_SIG_ADDRESS",
    "NEXT_PUBLIC_MARKETPLACE_CORE_ADDRESS",
    "NEXT_PUBLIC_REWARD_DISTRIBUTOR_ADDRESS",
    "NEXT_PUBLIC_STOLEN_REGISTRY_ADDRESS",
  ]);

  // small helper: wrap an AddressChip with an explorer link when available
  const ChipLink = ({ address }: { address: string }) => {
    if (!address) return <span className="text-muted-foreground">—</span>;
    const href = EXPLORER ? `${EXPLORER}/address/${address}` : "";
    return href ? (
      <Link href={href} target="_blank" className="inline-flex">
        <AddressChip address={address} showCopy />
      </Link>
    ) : (
      <AddressChip address={address} showCopy />
    );
  };

  return (
    <Card className="p-6">
      <h2 className="text-xl font-semibold mb-4">Settings</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        {Object.entries(env).map(([k, v]) => (
          <div key={k} className="rounded border p-3">
            <div className="text-xs uppercase text-muted-foreground">{k}</div>

            {addressKeys.has(k) ? (
              <div className="mt-1">
                <ChipLink address={v} />
              </div>
            ) : k === "NEXT_PUBLIC_BLOCK_EXPLORER" && v ? (
              <Link
                href={v}
                target="_blank"
                className="underline break-all text-muted-foreground"
              >
                {v}
              </Link>
            ) : (
              <div className="font-mono break-all">{v || "—"}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
