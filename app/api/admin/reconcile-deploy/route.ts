// app/api/admin/reconcile-deploy/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import {
  Prisma,
  ContractType,
  MetadataOption,
  IndexStatus,
  NftStatus,
} from "@/lib/generated/prisma";

import {
  createPublicClient,
  http,
  getAddress,
  isAddress,
  Hex,
  decodeEventLog,
} from "viem";
import { ERC1155_SINGLE_ABI } from "@/lib/abis/ERC1155SingleDropABI";
import { ERC721_DROP_ABI } from "@/lib/abis/ERC721DropABI";
import { NFT_FACTORY_ABI } from "@/lib/abis/NFTFactoryABI";

// Defaults
const DEFAULT_CHAIN_ID = Number(process.env.CHAIN_ID ?? 52014);
const DEFAULT_RPC_URL =
  process.env.RPC_HTTP_URL || process.env.ANKR_HTTP_URL || process.env.RPC_URL;

/* ---------------- helpers ---------------- */

function asDecimalString(x: string | number | bigint): string {
  if (typeof x === "string") return x;
  if (typeof x === "number") return String(Math.trunc(x));
  return x.toString();
}

function normalizeIpfsBase(u?: string | null) {
  if (!u) return u ?? undefined;
  const t = u.trim().replace(/\/+$/, "");
  return t.startsWith("ipfs://") ? t : `ipfs://${t}`;
}

function ipfsToHttp(u?: string | null) {
  if (!u) return u ?? undefined;
  return u.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7)}` : u;
}

async function fetchJsonWithTimeout(url: string, ms = 12_000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { cache: "no-store", signal: ctl.signal });
    if (!res.ok) throw new Error(`(${res.status}) ${await res.text()}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function tryTrimBaseFromUriTemplate(s?: string | null): string | undefined {
  if (!s) return undefined;
  const low = s.toLowerCase();
  if (low.includes("{id}")) return s.replace(/\/\{id\}(\.json)?$/i, "");
  return s.replace(/\/1\.json$/i, "");
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseDelayMs = 300
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message || "");
      if (!/timeout|ECONNRESET|Connection|rate limit|Too Many|429|temporar|try again/i.test(msg))
        break;
      await new Promise((r) => setTimeout(r, baseDelayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function safeRead<T>(
  client: any,
  address: `0x${string}`,
  fn: string,
  args: any[] = [],
  abi: any
): Promise<T | undefined> {
  try {
    return await client.readContract({ address, abi, functionName: fn, args });
  } catch {
    return undefined;
  }
}

/* ---------------- event typing ---------------- */

type FactoryEventName =
  | "ERC1155DropCloneCreated"
  | "ERC721SingleCloneCreated"
  | "ERC721DropCloneCreated";

type FactoryDecoded = {
  eventName: FactoryEventName;
  args: Record<string, any>;
};

/* ---------------- handler ---------------- */

export async function POST(req: NextRequest) {
  await prismaReady;
  try {
    const body = await req.json().catch(() => ({}));
    const {
      txHash,
      chainId = DEFAULT_CHAIN_ID,
      factoryAddress, // optional hint to speed up/ensure detection
      preview = false,
    }: {
      txHash?: string;
      chainId?: number;
      factoryAddress?: string;
      preview?: boolean;
    } = body;

    if (!txHash || typeof txHash !== "string") {
      return NextResponse.json({ error: "txHash (string) is required" }, { status: 400 });
    }
    if (!DEFAULT_RPC_URL) {
      return NextResponse.json(
        { error: "RPC URL not configured (RPC_HTTP_URL / ANKR_HTTP_URL / RPC_URL)" },
        { status: 500 }
      );
    }

    const client = createPublicClient({
      chain: {
        id: chainId,
        name: "ETN",
        nativeCurrency: { name: "ETN", symbol: "ETN", decimals: 18 },
        rpcUrls: { default: { http: [DEFAULT_RPC_URL] } },
      } as any,
      transport: http(DEFAULT_RPC_URL),
    });

    // 1) Receipt
    const receipt = await withRetry(() =>
      client.getTransactionReceipt({ hash: txHash as Hex })
    );
    if (!receipt || receipt.status !== "success") {
      return NextResponse.json(
        { error: "Receipt not found or failed", details: receipt },
        { status: 400 }
      );
    }

    // 2) Determine kind + contract
    let kind: "ERC1155_SINGLE" | "ERC721_SINGLE" | undefined;
    let contract: string | undefined;
    let deployerFromEvent: string | undefined;

    const factoryAddrNorm = factoryAddress && isAddress(factoryAddress)
      ? getAddress(factoryAddress)
      : undefined;

    if (!contract && factoryAddrNorm) {
      for (const log of receipt.logs) {
        if (getAddress(log.address) !== factoryAddrNorm) continue;
        try {
          const decoded = decodeEventLog({
            abi: NFT_FACTORY_ABI as any,
            topics: log.topics as any,
            data: log.data as any,
          }) as FactoryDecoded; // 👈 fixes “unknown” typing

          if (decoded.eventName === "ERC1155DropCloneCreated") {
            const { cloneAddress, deployer } = decoded.args;
            if (cloneAddress && isAddress(cloneAddress)) {
              contract = getAddress(cloneAddress);
              kind = "ERC1155_SINGLE";
            }
            if (deployer && isAddress(deployer)) {
              deployerFromEvent = getAddress(deployer);
            }
            break;
          }

          if (decoded.eventName === "ERC721SingleCloneCreated") {
            const { cloneAddress, deployer } = decoded.args;
            if (cloneAddress && isAddress(cloneAddress)) {
              contract = getAddress(cloneAddress);
              kind = "ERC721_SINGLE";
            }
            if (deployer && isAddress(deployer)) {
              deployerFromEvent = getAddress(deployer);
            }
            break;
          }

          // Ignore ERC721DropCloneCreated for this endpoint
        } catch {
          /* ignore unrelated events */
        }
      }
    }

    // If still missing contract, try direct create / code heuristic
    if (!contract && receipt.contractAddress) {
      contract = getAddress(receipt.contractAddress);
      // kind will be inferred later by probing ABI
    }
    if (!contract) {
      for (const log of receipt.logs) {
        try {
          const addr = getAddress(log.address);
          const code = await client.getCode({
            address: addr as `0x${string}`,
            blockNumber: BigInt(receipt.blockNumber) + 1n,
          });
          if (code && code !== "0x") {
            contract = addr;
            break;
          }
        } catch { /* ignore */ }
      }
    }
    if (!contract) {
      return NextResponse.json(
        { error: "Could not infer deployed contract address from tx/logs" },
        { status: 400 }
      );
    }

    const caddr = getAddress(contract) as `0x${string}`;

    // 3) Probe chain by ABI to confirm kind & gather fields
    // We’ll attempt 1155-first if kind is unknown, else follow the hint from events.
    const blockNumber = Number(receipt.blockNumber);
    const deployerAddress = deployerFromEvent
      ?? (isAddress(receipt.from) ? getAddress(receipt.from) : undefined);

    // Common reads
    async function readCommon1155() {
      const [name, symbol] = await Promise.all([
        safeRead<string>(client, caddr, "name", [], ERC1155_SINGLE_ABI),
        safeRead<string>(client, caddr, "symbol", [], ERC1155_SINGLE_ABI),
      ]);
      const uri1 = await safeRead<string>(client, caddr, "uri", [1n], ERC1155_SINGLE_ABI);
      const baseUri = tryTrimBaseFromUriTemplate(uri1);
      const normBase = normalizeIpfsBase(baseUri);

      let royaltyRecipient: string | undefined;
      let royaltyBps: number | undefined;
      try {
        const ri = await safeRead<[`0x${string}`, bigint]>(
          client,
          caddr,
          "royaltyInfo",
          [1n, 10000n],
          ERC1155_SINGLE_ABI
        );
        if (ri) {
          const [rec, amt] = ri;
          royaltyRecipient = rec ? getAddress(rec) : undefined;
          royaltyBps = typeof amt === "bigint" ? Number(amt) : undefined;
        }
      } catch {}

      const maxSupplyRaw = await safeRead<bigint>(client, caddr, "maxSupply", [], ERC1155_SINGLE_ABI);
      const mintPriceRaw = await safeRead<bigint>(client, caddr, "mintPrice", [], ERC1155_SINGLE_ABI);
      const maxPerWalletRaw = await safeRead<bigint>(client, caddr, "maxPerWallet", [], ERC1155_SINGLE_ABI);
      const ownerAddress = await safeRead<string>(client, caddr, "owner", [], ERC1155_SINGLE_ABI);

      return {
        ok:
          !!name &&
          !!symbol &&
          !!normBase &&
          typeof maxSupplyRaw === "bigint" &&
          typeof mintPriceRaw === "bigint" &&
          typeof maxPerWalletRaw === "bigint" &&
          !!royaltyRecipient &&
          typeof royaltyBps === "number" &&
          !!ownerAddress,
        fields: {
          name,
          symbol,
          normBase,
          maxSupply:
            typeof maxSupplyRaw === "bigint" ? Number(maxSupplyRaw) : undefined,
          mintPriceEtnWei:
            typeof mintPriceRaw === "bigint" ? mintPriceRaw.toString() : undefined,
          maxPerWallet:
            typeof maxPerWalletRaw === "bigint" ? Number(maxPerWalletRaw) : undefined,
          royaltyRecipient,
          royaltyBps,
          ownerAddress: ownerAddress ? getAddress(ownerAddress) : undefined,
        },
      };
    }

    async function readCommon721() {
      const [name, symbol] = await Promise.all([
        safeRead<string>(client, caddr, "name", [], ERC721_DROP_ABI),
        safeRead<string>(client, caddr, "symbol", [], ERC721_DROP_ABI),
      ]);
      const tokenUri = await safeRead<string>(client, caddr, "tokenURI", [1n], ERC721_DROP_ABI);

      let royaltyRecipient: string | undefined;
      let royaltyBps: number | undefined;
      try {
        const ri = await safeRead<[`0x${string}`, bigint]>(
          client,
          caddr,
          "royaltyInfo",
          [1n, 10000n],
          ERC721_DROP_ABI
        );
        if (ri) {
          const [rec, amt] = ri;
          royaltyRecipient = rec ? getAddress(rec) : undefined;
          royaltyBps = typeof amt === "bigint" ? Number(amt) : undefined;
        }
      } catch {}

      const ownerAddress = await safeRead<string>(client, caddr, "owner", [], ERC721_DROP_ABI);

      return {
        ok: !!name && !!symbol && !!tokenUri && !!royaltyRecipient && typeof royaltyBps === "number" && !!ownerAddress,
        fields: {
          name,
          symbol,
          tokenUri,
          royaltyRecipient,
          royaltyBps,
          ownerAddress: ownerAddress ? getAddress(ownerAddress) : undefined,
        },
      };
    }

    let mode: "1155" | "721" | undefined;
    if (kind === "ERC1155_SINGLE") mode = "1155";
    if (kind === "ERC721_SINGLE") mode = "721";

    let f1155: Awaited<ReturnType<typeof readCommon1155>> | undefined;
    let f721: Awaited<ReturnType<typeof readCommon721>> | undefined;

    if (!mode) {
      f1155 = await readCommon1155();
      if (f1155.ok) mode = "1155";
      else {
        f721 = await readCommon721();
        if (f721.ok) mode = "721";
      }
    }

    if (mode === "1155" && !f1155) f1155 = await readCommon1155();
    if (mode === "721" && !f721) f721 = await readCommon721();

    if (!mode) {
      return NextResponse.json(
        { error: "Unable to identify contract kind as ERC1155 single or ERC721 single." },
        { status: 400 }
      );
    }

    if (preview) {
      return NextResponse.json({
        ok: false,
        preview: true,
        kind: mode === "1155" ? "ERC1155_SINGLE" : "ERC721_SINGLE",
        derived: mode === "1155" ? f1155?.fields : f721?.fields,
      });
    }

    // 4) Writes (idempotent; no interactive transaction)

    // creator = deployer (fallback) or owner
    const creatorWallet =
      (mode === "1155" ? f1155?.fields.ownerAddress : f721?.fields.ownerAddress) ??
      deployerAddress;
    if (!creatorWallet) {
      return NextResponse.json({ error: "Cannot resolve creator wallet." }, { status: 400 });
    }

    let creatorId: string;
    const existing = await prisma.user.findFirst({
      where: { walletAddress: { equals: creatorWallet, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing?.id) {
      creatorId = existing.id;
    } else {
      const short = creatorWallet.startsWith("0x")
        ? creatorWallet.slice(2, 8)
        : creatorWallet.slice(0, 6);
      const created = await prisma.user.create({
        data: {
          walletAddress: creatorWallet,
          username: `${short}`,
          profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${short}`,
          profileBanner:
            "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
        },
        select: { id: true },
      });
      creatorId = created.id;
    }

    if (mode === "1155") {
      const F = f1155!.fields;

      const single = await prisma.single1155.upsert({
        where: { contract: caddr },
        create: {
          name: F.name!,
          symbol: F.symbol!,
          contract: caddr,
          baseUri: F.normBase!,
          maxSupply: Number(F.maxSupply),
          mintPriceEtnWei: new Prisma.Decimal(asDecimalString(F.mintPriceEtnWei as any)),
          maxPerWallet: Number(F.maxPerWallet),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          creatorId,
          ownerAddress: getAddress(F.ownerAddress!),
          indexStatus: IndexStatus.COMPLETED,
        },
        update: {
          baseUri: F.normBase!,
          maxSupply: Number(F.maxSupply),
          mintPriceEtnWei: new Prisma.Decimal(asDecimalString(F.mintPriceEtnWei as any)),
          maxPerWallet: Number(F.maxPerWallet),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          ownerAddress: getAddress(F.ownerAddress!),
          indexStatus: IndexStatus.COMPLETED,
        },
        select: { id: true },
      });

      const tokenUri = `${F.normBase}/1.json`;
      const nft = await prisma.nFT.upsert({
        where: { contract_tokenId: { contract: caddr, tokenId: "1" } },
        create: {
          tokenId: "1",
          name: F.name!,
          imageUrl: "",
          description: null,
          tokenUri,
          contract: caddr,
          standard: "ERC1155",
          royaltyBps: Number(F.royaltyBps),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          single1155Id: single.id,
          status: NftStatus.SUCCESS,
        },
        update: {
          name: F.name!,
          imageUrl: "",
          description: null,
          tokenUri,
          royaltyBps: Number(F.royaltyBps),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          single1155Id: single.id,
          status: NftStatus.SUCCESS,
        },
        select: { id: true },
      });

      await prisma.deployedContract.upsert({
        where: { cloneAddress: caddr },
        create: {
          contractType: ContractType.ERC1155_SINGLE,
          cloneAddress: caddr,
          implementationAddr: "",
          factoryAddress: factoryAddrNorm ?? "",
          deployerAddress: getAddress(deployerAddress!),
          txHash,
          blockNumber,
          metadataOption: MetadataOption.UPLOAD,
          feeRecipient: getAddress(deployerAddress!),
          feeAmountEtnWei: new Prisma.Decimal("0"),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          baseURI: F.normBase!,
          maxSupply: Number(F.maxSupply),
          rawInit: {
            name: F.name,
            symbol: F.symbol,
            baseUri: F.normBase,
            maxSupply: F.maxSupply,
            mintPriceEtnWei: asDecimalString(F.mintPriceEtnWei as any),
            maxPerWallet: F.maxPerWallet,
            royaltyRecipient: F.royaltyRecipient,
            royaltyBps: F.royaltyBps,
          } as Prisma.InputJsonValue,
          single1155Id: single.id,
        },
        update: {
          txHash,
          blockNumber,
          feeRecipient: getAddress(deployerAddress!),
          feeAmountEtnWei: new Prisma.Decimal("0"),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          baseURI: F.normBase!,
          maxSupply: Number(F.maxSupply),
          rawInit: {
            name: F.name,
            symbol: F.symbol,
            baseUri: F.normBase,
            maxSupply: F.maxSupply,
            mintPriceEtnWei: asDecimalString(F.mintPriceEtnWei as any),
            maxPerWallet: F.maxPerWallet,
            royaltyRecipient: F.royaltyRecipient,
            royaltyBps: F.royaltyBps,
          } as Prisma.InputJsonValue,
          single1155Id: single.id,
        },
      });

      // Best-effort metadata enrichment
      try {
        const httpUrl = ipfsToHttp(tokenUri);
        if (httpUrl) {
          const raw = await fetchJsonWithTimeout(httpUrl, 10_000);
          await prisma.nFT.update({
            where: { id: nft.id },
            data: { rawMetadata: raw as any },
          });
        }
      } catch {}

      return NextResponse.json({
        ok: true,
        kind: "ERC1155_SINGLE",
        contract: caddr,
        singleId: single.id,
        nftId: nft.id,
        tokenUri,
      });
    }

    // mode === "721"
    {
      const F = f721!.fields;

      const single = await prisma.single721.upsert({
        where: { contract: caddr },
        create: {
          name: F.name!,
          symbol: F.symbol!,
          contract: caddr,
          tokenUri: F.tokenUri!,
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          creatorId,
          ownerAddress: getAddress(F.ownerAddress!),
          indexStatus: IndexStatus.COMPLETED,
        },
        update: {
          tokenUri: F.tokenUri!,
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          ownerAddress: getAddress(F.ownerAddress!),
          indexStatus: IndexStatus.COMPLETED,
        },
        select: { id: true },
      });

      const nft = await prisma.nFT.upsert({
        where: { contract_tokenId: { contract: caddr, tokenId: "1" } },
        create: {
          tokenId: "1",
          name: F.name!,
          imageUrl: "",
          description: null,
          tokenUri: F.tokenUri!,
          contract: caddr,
          standard: "ERC721",
          royaltyBps: Number(F.royaltyBps),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          single721Id: single.id,
          status: NftStatus.SUCCESS,
        },
        update: {
          name: F.name!,
          imageUrl: "",
          description: null,
          tokenUri: F.tokenUri!,
          royaltyBps: Number(F.royaltyBps),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          single721Id: single.id,
          status: NftStatus.SUCCESS,
        },
        select: { id: true },
      });

      await prisma.deployedContract.upsert({
        where: { cloneAddress: caddr },
        create: {
          contractType: ContractType.ERC721_SINGLE,
          cloneAddress: caddr,
          implementationAddr: "",
          factoryAddress: factoryAddrNorm ?? "",
          deployerAddress: getAddress(deployerAddress!),
          txHash,
          blockNumber,
          metadataOption: MetadataOption.UPLOAD,
          feeRecipient: getAddress(deployerAddress!),
          feeAmountEtnWei: new Prisma.Decimal("0"),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          baseURI: F.tokenUri!, // for single, base=tokenUri
          maxSupply: 1,
          rawInit: {
            name: F.name,
            symbol: F.symbol,
            tokenUri: F.tokenUri,
            royaltyRecipient: F.royaltyRecipient,
            royaltyBps: F.royaltyBps,
          } as Prisma.InputJsonValue,
          single721Id: single.id,
        },
        update: {
          txHash,
          blockNumber,
          feeRecipient: getAddress(deployerAddress!),
          feeAmountEtnWei: new Prisma.Decimal("0"),
          royaltyRecipient: getAddress(F.royaltyRecipient!),
          royaltyBps: Number(F.royaltyBps),
          baseURI: F.tokenUri!,
          maxSupply: 1,
          rawInit: {
            name: F.name,
            symbol: F.symbol,
            tokenUri: F.tokenUri,
            royaltyRecipient: F.royaltyRecipient,
            royaltyBps: F.royaltyBps,
          } as Prisma.InputJsonValue,
          single721Id: single.id,
        },
      });

      // Best-effort metadata enrichment
      try {
        const httpUrl = ipfsToHttp(F.tokenUri!);
        if (httpUrl) {
          const raw = await fetchJsonWithTimeout(httpUrl, 10_000);
          await prisma.nFT.update({
            where: { id: nft.id },
            data: { rawMetadata: raw as any },
          });
        }
      } catch {}

      return NextResponse.json({
        ok: true,
        kind: "ERC721_SINGLE",
        contract: caddr,
        singleId: single.id,
        nftId: nft.id,
        tokenUri: F.tokenUri!,
      });
    }
  } catch (err: any) {
    console.error("admin/reconcile-deploy POST error", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
