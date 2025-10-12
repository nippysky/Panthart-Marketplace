// app/api/drop/postdeploy/route.ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import { NFT_FACTORY_ABI } from "@/lib/abis/NFTFactoryABI";
import prisma, { prismaReady } from "@/lib/db";
import {
  ContractType,
  DraftStatus,
  MetadataOption,
} from "@/lib/generated/prisma";
import { notifyDeployed } from "@/lib/telegram"; // ✅ NEW

type DeployPayload = {
  metadataOption: "UPLOAD" | "EXTERNAL";
  baseURI: string;
  name: string;
  symbol: string;
  description: string;
  totalSupply: number;
  publicPriceWei: string; // stringified wei
  maxPerWallet: number;
  maxPerTx: number;
  publicStartISO: string;
  royaltyPercent: number;
  royaltyRecipient: string;
  logoUrl?: string;
  coverUrl?: string;
  presale?: {
    startISO: string;
    endISO: string;
    priceWei: string; // stringified wei
    maxSupply: number;
    merkleRoot: string; // 0x...
    allowlistCount?: number;
    allowlistCommit?: string; // sha256
    draftId?: string;
  };
};

const FACTORY_ADDRESS = process.env.FACTORY_ADDRESS!;
const RPC_URL = process.env.RPC_URL!;

function sameAddress(a?: string | null, b?: string | null): boolean {
  try {
    if (!a || !b) return false;
    return ethers.getAddress(a) === ethers.getAddress(b);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  await prismaReady;
  try {
    if (!FACTORY_ADDRESS || !RPC_URL) {
      return NextResponse.json(
        { error: "Server missing FACTORY_ADDRESS/RPC_URL" },
        { status: 500 }
      );
    }

    const { txHash, payload } = (await req.json()) as {
      txHash: string;
      payload: DeployPayload;
    };
    if (!txHash || !payload) {
      return NextResponse.json({ error: "Missing txHash/payload" }, { status: 400 });
    }

    // 1) Fetch tx + receipt
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const [tx, receipt] = await Promise.all([
      provider.getTransaction(txHash),
      provider.getTransactionReceipt(txHash),
    ]);

    if (!tx || !receipt || receipt.status !== 1) {
      return NextResponse.json({ error: "Transaction not found or failed" }, { status: 400 });
    }
    if (!tx.to || !sameAddress(tx.to, FACTORY_ADDRESS)) {
      return NextResponse.json({ error: "Tx not sent to factory" }, { status: 400 });
    }

    // 2) Parse factory logs → deployer + clone address
    const iface = new ethers.Interface(NFT_FACTORY_ABI as any);
    let deployer = "";
    let cloneAddress = "";

    for (const log of receipt.logs ?? []) {
      if (!sameAddress(log.address, FACTORY_ADDRESS)) continue;
      try {
        const parsed = iface.parseLog(log);
        if (parsed?.name === "ERC721DropCloneCreated") {
          deployer = (parsed.args?.[0] as string) || "";
          cloneAddress = (parsed.args?.[1] as string) || "";
          break;
        }
      } catch {
        // ignore
      }
    }
    if (!ethers.isAddress(cloneAddress)) {
      return NextResponse.json(
        { error: "Could not parse clone address from logs" },
        { status: 400 }
      );
    }

    // 3) Best-effort implementation address (read-only)
    let implementationAddr = "";
    try {
      const factory = new ethers.Contract(FACTORY_ADDRESS, NFT_FACTORY_ABI as any, provider);
      implementationAddr = await factory.erc721DropImpl();
      if (!ethers.isAddress(implementationAddr)) implementationAddr = "";
    } catch {
      implementationAddr = "";
    }

    // 4) Fee snapshot
    const cfg = await prisma.feeConfig.findFirst({
      where: {
        contractType: ContractType.ERC721_DROP,
        metadataOption:
          payload.metadataOption === "UPLOAD" ? MetadataOption.UPLOAD : MetadataOption.EXTERNAL,
        active: true,
      },
    });
    const feeRecipient = cfg?.feeRecipient ?? "";
    const cfgAmountStr = cfg?.feeAmountEtnWei?.toString() ?? null;
    const txValueStr = tx.value?.toString() || "0";
    if (cfgAmountStr && cfgAmountStr !== txValueStr) {
      console.warn(
        `[postdeploy] Fee mismatch: tx.value=${txValueStr} vs FeeConfig=${cfgAmountStr} (option=${payload.metadataOption})`
      );
    }

    // 5) Persist (atomic)
    const royaltyBps = Math.round((payload.royaltyPercent || 0) * 100);
    const baseUriNormalized =
      (payload.baseURI ? String(payload.baseURI).replace(/\/+$/, "") : "") || null;

    const result = await prisma.$transaction(async (db) => {
      // Collection
      const collection = await db.collection.create({
        data: {
          name: payload.name,
          symbol: payload.symbol,
          contract: cloneAddress, // preserve original casing
          description: payload.description || "",
          logoUrl: payload.logoUrl,
          coverUrl: payload.coverUrl,
          standard: "ERC721",
          supply: payload.totalSupply,
          baseUri: baseUriNormalized,
          ownerAddress: deployer, // preserve original casing
          creator: {
            connectOrCreate: {
              where: { walletAddress: deployer },
              create: {
                walletAddress: deployer,
                username: `${deployer.slice(0, 6)}…${deployer.slice(-4)}`,
                profileAvatar: "",
              },
            },
          },
        },
      });

      // DeployedContract snapshot
      const deployed = await db.deployedContract.create({
        data: {
          contractType: ContractType.ERC721_DROP,
          cloneAddress: cloneAddress, // preserve original casing
          implementationAddr,
          factoryAddress: FACTORY_ADDRESS,
          deployerAddress: deployer,
          txHash,
          blockNumber: Number(receipt.blockNumber || 0),

          metadataOption:
            payload.metadataOption === "UPLOAD" ? MetadataOption.UPLOAD : MetadataOption.EXTERNAL,
          feeRecipient,
          feeAmountEtnWei: txValueStr,

          royaltyRecipient: payload.royaltyRecipient,
          royaltyBps,

          baseURI: baseUriNormalized,
          maxSupply: payload.totalSupply,

          rawInit: {
            ...payload,
            _feeSnapshot: {
              recipient: feeRecipient || null,
              cfgAmountEtnWei: cfgAmountStr,
              txValueEtnWei: txValueStr,
            },
          } as any,

          collection: { connect: { id: collection.id } },
        },
      });

      // Public sale snapshot
      await db.publicSale.create({
        data: {
          collectionId: collection.id,
          startTime: new Date(payload.publicStartISO),
          priceEtnWei: payload.publicPriceWei,
          maxPerWallet: payload.maxPerWallet,
          maxPerTx: payload.maxPerTx,
        },
      });

      // Presale snapshot + ALWAYS materialize whitelist from draft (any status)
      if (payload.presale) {
        // --- Find draft by id or commit (NO status filter; we allow CONSUMED reuse) ---
        let draft =
          (payload.presale.draftId
            ? await db.presaleDraft.findFirst({
                where: { id: payload.presale.draftId },
              })
            : null) ??
          (payload.presale.allowlistCommit
            ? await db.presaleDraft.findFirst({
                where: { sha256Commit: payload.presale.allowlistCommit },
                orderBy: { createdAt: "desc" },
              })
            : null);

        // Extract addresses (preserve as-is for storage)
        const rawAddresses: string[] = Array.isArray(draft?.addresses)
          ? (draft!.addresses as string[])
          : [];

        // Count unique valid addresses (case-insensitive) for whitelistCount ONLY
        const uniqueForCount = (() => {
          const set = new Set<string>();
          for (const a of rawAddresses) {
            try {
              set.add(ethers.getAddress(String(a).trim()));
            } catch {
              // skip invalid
            }
          }
          return set.size;
        })();

        // ★ Diagnostic: highlight any mismatch with client-provided allowlistCount
        if (
          typeof payload.presale.allowlistCount === "number" &&
          payload.presale.allowlistCount !== uniqueForCount
        ) {
          console.warn(
            `[postdeploy] allowlistCount mismatch: client=${payload.presale.allowlistCount} draft=${uniqueForCount}`
          );
        }

        const effectiveAllowlistCommit =
          payload.presale.allowlistCommit ?? draft?.sha256Commit ?? null;

        // Create presale row (count taken from deduped valid addresses)
        const presaleRow = await db.presale.create({
          data: {
            collectionId: collection.id,
            startTime: new Date(payload.presale.startISO),
            endTime: new Date(payload.presale.endISO),
            priceEtnWei: payload.presale.priceWei,
            maxSupply: payload.presale.maxSupply,
            merkleRoot: payload.presale.merkleRoot,
            whitelistCount: uniqueForCount, // ★ store exact number, including 0
            allowlistCommit: effectiveAllowlistCommit,
          },
        });

        // Materialize whitelist rows from draft (if any)
        if (rawAddresses.length) {
          const rows = rawAddresses.map((a) => ({
            presaleId: presaleRow.id,
            address: a, // preserve original casing (CITEXT enforces case-insensitive uniqueness)
          }));
          const CHUNK = 1000;
          for (let i = 0; i < rows.length; i += CHUNK) {
            await db.presaleWhitelistAddress.createMany({
              data: rows.slice(i, i + CHUNK),
              skipDuplicates: true,
            });
          }
        } else {
          console.warn(
            `[postdeploy] No addresses to copy from draft (empty or missing). draftId=${draft?.id ?? "n/a"} commit=${effectiveAllowlistCommit ?? "n/a"}`
          );
        }

        // Mark draft consumed ONLY if it isn't already; otherwise leave historical link
        if (draft && draft.status !== DraftStatus.CONSUMED) {
          await db.presaleDraft.update({
            where: { id: draft.id },
            data: {
              status: DraftStatus.CONSUMED,
              consumedAt: new Date(),
              consumedByPresaleId: presaleRow.id,
            },
          });
        }
      }

      return { collectionId: collection.id, deployedId: deployed.id };
    });

    // ✅ AFTER DB COMMIT — fire Telegram (never blocks success)
    try {
      await notifyDeployed({
        id: String(result.collectionId),
        name: payload.name,
        symbol: payload.symbol,
        contract: cloneAddress,
        supply: payload.totalSupply,
        deployer, // who deployed
        // txHash,  // uncomment + extend template if you add a TX explorer url
      });
    } catch (e) {
      console.warn("[postdeploy] telegram notify error:", (e as any)?.message || e);
    }

    return NextResponse.json({
      ok: true,
      cloneAddress,
      deployer,
      collectionId: result.collectionId,
      deployedId: result.deployedId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
