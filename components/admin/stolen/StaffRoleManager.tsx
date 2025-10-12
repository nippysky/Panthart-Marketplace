"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import AddressChip from "@/components/common/AddressChip";
import { toast } from "sonner";
import { ethers } from "ethers";
import { getAddress, isAddress } from "viem";
import { useStolenRegistryAdmin } from "@/lib/hooks/useStolenRegistryAdmin";
import { getBrowserSigner, ZERO_ADDRESS } from "@/lib/evm/getSigner";
import { MULTI_SIG_ABI } from "@/lib/abis/marketplace-core/multiSigABI";
import { STOLEN_REGISTRY_ABI } from "@/lib/abis/marketplace-core/stolenRegistryABI";

const MULTISIG = process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS as `0x${string}`;

export default function StaffRoleManager({ allowedWallets }: { allowedWallets: string[] }) {
  const reg = useStolenRegistryAdmin();

  const [rawAddr, setRawAddr] = React.useState("");
  const [target, setTarget] = React.useState<`0x${string}` | null>(null);
  const [checking, setChecking] = React.useState(false);
  const [hasReporter, setHasReporter] = React.useState<boolean | null>(null);
  const [hasClearer, setHasClearer] = React.useState<boolean | null>(null);

  // normalize input
  React.useEffect(() => {
    if (isAddress(rawAddr || "")) {
      setTarget(getAddress(rawAddr) as `0x${string}`);
    } else {
      setTarget(null);
      setHasReporter(null);
      setHasClearer(null);
    }
  }, [rawAddr]);

  // check role membership when target changes
  React.useEffect(() => {
    (async () => {
      if (!target || !reg.address || !reg.REPORTER_ROLE || !reg.CLEARER_ROLE) {
        setHasReporter(null);
        setHasClearer(null);
        return;
      }
      setChecking(true);
      try {
        const [r, c] = await Promise.all([
          reg.hasRole(reg.REPORTER_ROLE, target),
          reg.hasRole(reg.CLEARER_ROLE, target),
        ]);
        setHasReporter(!!r);
        setHasClearer(!!c);
      } catch {
        setHasReporter(null);
        setHasClearer(null);
      } finally {
        setChecking(false);
      }
    })();
  }, [target, reg.address, reg.REPORTER_ROLE, reg.CLEARER_ROLE, reg.hasRole]);

  const guard = async () => {
    const { signer, chainId } = await getBrowserSigner();
    const wallet = (await signer.getAddress()).toLowerCase();
    if (!allowedWallets.map((x) => x.toLowerCase()).includes(wallet)) {
      throw new Error("This wallet is not in the allowed admin list.");
    }
    if (chainId !== 52014) throw new Error("Wrong network. Switch to Chain ID 52014.");
    return signer;
  };

  const propose = async (
    roleKey: "REPORTER_ROLE" | "CLEARER_ROLE",
    action: "grant" | "revoke"
  ) => {
    try {
      if (!reg.address) throw new Error("Registry address missing.");
      if (!target) throw new Error("Enter a valid staff address.");
      const roleId = roleKey === "REPORTER_ROLE" ? reg.REPORTER_ROLE : reg.CLEARER_ROLE;
      if (!roleId) throw new Error("Role id not loaded yet.");

      const signer = await guard();
      const iface = new ethers.Interface(STOLEN_REGISTRY_ABI as any);
      const data = iface.encodeFunctionData(
        action === "grant" ? "grantRole" : "revokeRole",
        [roleId, target]
      );

      const ms = new ethers.Contract(MULTISIG, MULTI_SIG_ABI as any, signer);
      const resp = await ms.submitAndConfirm(ZERO_ADDRESS, reg.address, 0n, data);
      toast.message(
        `${action === "grant" ? "Granting" : "Revoking"} ${roleKey} for ${target}…`
      );
      await resp.wait();
      toast.success(`Proposal submitted (and confirmed by you).`);

      // refresh role checks
      if (reg.REPORTER_ROLE) setHasReporter(await reg.hasRole(reg.REPORTER_ROLE, target));
      if (reg.CLEARER_ROLE) setHasClearer(await reg.hasRole(reg.CLEARER_ROLE, target));
    } catch (e: any) {
      toast.error(e?.message || String(e));
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-base font-medium mb-4">Staff Roles (Grant/Revoke)</h3>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Label className="mb-1 block">Staff EOA Address</Label>
          <Input
            value={rawAddr}
            onChange={(e) => setRawAddr(e.target.value)}
            placeholder="0x…"
            autoComplete="off"
          />
          <div className="mt-2">
            {target ? (
              <AddressChip address={target} />
            ) : (
              <span className="text-xs text-muted-foreground">Enter a valid address</span>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase text-muted-foreground mb-1">Registry</div>
          <AddressChip address={reg.address ?? ""} showCopy />
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {/* REPORTER_ROLE */}
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">REPORTER_ROLE</div>
            <div className="text-xs text-muted-foreground">
              Can flag items/collections as stolen.
            </div>
            <div className="text-xs mt-1">
              Status:{" "}
              {checking
                ? "Checking…"
                : hasReporter == null
                ? "—"
                : hasReporter
                ? "Granted"
                : "Not granted"}
            </div>
          </div>
          <div className="inline-flex gap-2">
            <Button
              size="sm"
              onClick={() => propose("REPORTER_ROLE", "grant")}
              disabled={!target || hasReporter === true}
              title="Grant REPORTER_ROLE to staff"
            >
              Grant
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => propose("REPORTER_ROLE", "revoke")}
              disabled={!target || hasReporter !== true}
              title="Revoke REPORTER_ROLE from staff"
            >
              Revoke
            </Button>
          </div>
        </div>

        {/* CLEARER_ROLE */}
        <div className="flex items-center justify-between gap-3 rounded-md border p-3">
          <div>
            <div className="text-sm font-medium">CLEARER_ROLE</div>
            <div className="text-xs text-muted-foreground">
              Can clear previously flagged items/collections.
            </div>
            <div className="text-xs mt-1">
              Status:{" "}
              {checking
                ? "Checking…"
                : hasClearer == null
                ? "—"
                : hasClearer
                ? "Granted"
                : "Not granted"}
            </div>
          </div>
          <div className="inline-flex gap-2">
            <Button
              size="sm"
              onClick={() => propose("CLEARER_ROLE", "grant")}
              disabled={!target || hasClearer === true}
              title="Grant CLEARER_ROLE to staff"
            >
              Grant
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => propose("CLEARER_ROLE", "revoke")}
              disabled={!target || hasClearer !== true}
              title="Revoke CLEARER_ROLE from staff"
            >
              Revoke
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        Note: the multisig must hold the admin role for these roles (typically{" "}
        <code>DEFAULT_ADMIN_ROLE</code> or each role’s admin) or the proposal will revert.
      </p>
    </Card>
  );
}
