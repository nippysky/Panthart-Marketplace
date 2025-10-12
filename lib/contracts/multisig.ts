// lib/contracts/multisig.ts
import multiSigAbi from "@/lib/abis/marketplace-core/multiSigABI.json";

export const MULTI_SIG_ADDRESS =
  (process.env.NEXT_PUBLIC_MULTI_SIG_ADDRESS ||
    "0x0711d1ad70b920fA348A3C3D3223721030558B55") as `0x${string}`;

export const MULTI_SIG_ABI = multiSigAbi;
