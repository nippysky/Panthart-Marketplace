// lib/types/dropCollection.ts

export type Mode = "upload" | "external";

export type DeployPayload = {
  metadataOption: "UPLOAD" | "EXTERNAL";
  baseURI: string;
  name: string;
  symbol: string;
  description?: string;
  totalSupply: number;
  publicPriceWei: string;
  maxPerWallet: number;
  maxPerTx: number;
  publicStartISO: string;
  royaltyPercent: number;
  royaltyRecipient: string;
  presale?: {
    startISO: string;
    endISO: string;
    priceWei: string;
    maxSupply: number;
    merkleRoot: string;

    // NEW: allow the extra details we pass from the UI
    allowlistCount?: number;
    allowlistCommit?: string;
    draftId?: string;
  };
  logoUrl?: string;
  coverUrl?: string;
};

export type MetaPreview = {
  name?: string;
  description?: string;
  image?: string;
  animation_url?: string;
  attributes?: Array<{ trait_type?: string; value?: string | number }>;
};

export type FieldErrors = {
  baseUri?: string | null;
  name?: string | null;
  symbol?: string | null;
  description?: string | null;
  totalSupply?: string | null;
  royaltyRecipient?: string | null;
  royaltyPercent?: string | null;
  publicStart?: string | null;
  publicPrice?: string | null;
  maxPerWallet?: string | null;
  maxPerTx?: string | null;
  presaleStart?: string | null;
  presaleEnd?: string | null;
  presalePrice?: string | null;
  presaleSupply?: string | null;
};

export type AllowlistState = {
  raw: string;
  ordered: string[];
  validChecksummed: string[];
  invalid: string[];
  duplicates: string[];
  previewFirst3: string[];
  previewRemain: number;
};

export type PrepareResult = {
  ok: boolean;
  draftId?: string;
  merkleRoot?: string;
  commit?: string;
  count?: number;
  error?: string;
};
