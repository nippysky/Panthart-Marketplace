import { z } from "zod";

export const MintingNowItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["erc721", "erc1155"]),
  name: z.string(),
  description: z.string().nullish(),
  contract: z.string(),
  href: z.string(),
  logoUrl: z.string().min(1),
  coverUrl: z.string().min(1),
  supply: z.number().int().positive(),
  minted: z.number().int().nonnegative(),
  mintedPct: z.number().min(0).max(100),
  status: z.enum(["presale", "public"]),
  publicSale: z.object({
    startISO: z.string(),
    priceEtnWei: z.string(),
  }),
  presale: z
    .object({
      startISO: z.string(),
      endISO: z.string(),
      priceEtnWei: z.string(),
    })
    .optional(),
});

export type MintingNowItem = z.infer<typeof MintingNowItemSchema>;

/** Client-safe formatter (no server deps) */
export function formatEtnFromWei(wei: string | number | bigint): string {
  const b = BigInt(wei.toString());
  const whole = b / 10n ** 18n;
  const frac = b % 10n ** 18n;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
  return `${whole.toString()}.${fracStr}`;
}
