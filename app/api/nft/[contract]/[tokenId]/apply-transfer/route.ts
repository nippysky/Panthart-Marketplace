// app/api/nft/[contract]/[tokenId]/apply-transfer/route.ts
export const revalidate = 0;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";
import { ethers } from "ethers";

/* ---------- helpers ---------- */
const isAddr = (a?: string) => /^0x[0-9a-fA-F]{40}$/.test(String(a || ""));
const isHash = (h?: string) => /^0x[0-9a-fA-F]{64}$/.test(String(h || ""));
const lc = (s: string) => s.toLowerCase();

/** ERC event signatures (topic0) */
const TOPIC_ERC721_TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"; // Transfer(address,address,uint256)
const TOPIC_ERC1155_SINGLE =
  "0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62"; // TransferSingle(address,address,address,uint256,uint256)
const TOPIC_ERC1155_BATCH =
  "0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb"; // TransferBatch(address,address,address,uint256[],uint256[])

/** read-only provider */
function getProvider(): ethers.Provider {
  const rpc =
    process.env.RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.ETH_RPC_URL;
  if (!rpc) throw new Error("Missing RPC URL (RPC_URL or NEXT_PUBLIC_RPC_URL).");
  return new ethers.JsonRpcProvider(rpc);
}

/** parse topic to address (last 20 bytes of 32-byte topic) */
function topicToAddress(t: string): string {
  return ethers.getAddress("0x" + t.slice(26));
}

/** parse topic to bigint */
function topicToBigint(t: string): bigint {
  return BigInt(t);
}

/* ---------- GET ---------- */
export async function GET() {
  return NextResponse.json({ error: "Use POST" }, { status: 405 });
}

/**
 * POST /api/nft/[contract]/[tokenId]/apply-transfer
 * Body: { txHash: string }
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ contract: string; tokenId: string }> }
) {
  await prismaReady;

  const { contract, tokenId } = await context.params;
  if (!isAddr(contract) || !tokenId) {
    return NextResponse.json({ error: "Invalid contract or tokenId" }, { status: 400 });
  }

  let txHash: string | undefined;
  try {
    const body = await req.json();
    txHash = body?.txHash;
  } catch {
    // ignore parse errors
  }

  if (!isHash(txHash)) {
    return NextResponse.json(
      { error: "txHash is required and must be a real 0x…64 hash" },
      { status: 400 }
    );
  }

  try {
    const provider = getProvider();

    // Load NFT (id + standard)
    const nft = await prisma.nFT.findFirst({
      where: { contract: { equals: contract, mode: "insensitive" }, tokenId: String(tokenId) },
      select: { id: true, standard: true },
    });
    if (!nft) return NextResponse.json({ error: "NFT not found" }, { status: 404 });

    // Receipt + block time
    const receipt = await provider.getTransactionReceipt(txHash!);
    if (!receipt) {
      return NextResponse.json(
        { error: "Transaction receipt not found (not mined yet?)" },
        { status: 404 }
      );
    }
    const block =
      receipt.blockNumber != null ? await provider.getBlock(receipt.blockNumber) : null;
    const blockTime = block?.timestamp ? new Date(Number(block.timestamp) * 1000) : new Date();

    // Filter logs by contract
    const contractLogs = (receipt.logs || []).filter(
      (l) => lc(String(l.address)) === lc(contract)
    );

    // Detect event type
    const erc721Log = contractLogs.find(
      (l) => Array.isArray(l.topics) && lc(l.topics[0]) === lc(TOPIC_ERC721_TRANSFER)
    );
    const erc1155Single = contractLogs.find(
      (l) => Array.isArray(l.topics) && lc(l.topics[0]) === lc(TOPIC_ERC1155_SINGLE)
    );
    const erc1155Batch = contractLogs.find(
      (l) => Array.isArray(l.topics) && lc(l.topics[0]) === lc(TOPIC_ERC1155_BATCH)
    );

    if (!erc721Log && !erc1155Single && !erc1155Batch) {
      return NextResponse.json(
        { error: "No ERC721/1155 Transfer logs for this contract in tx" },
        { status: 422 }
      );
    }

    /* =======================
       ERC721 path
       ======================= */
    if (erc721Log) {
      const t = erc721Log.topics;
      if (t.length < 4) {
        return NextResponse.json(
          { error: "Malformed ERC721 Transfer log (missing topics)" },
          { status: 422 }
        );
      }

      const fromAddress = topicToAddress(t[1]);
      const toAddress = topicToAddress(t[2]);
      const logTokenId = topicToBigint(t[3]).toString();

      if (logTokenId !== String(tokenId)) {
        return NextResponse.json(
          { error: "Transfer log tokenId does not match URL tokenId" },
          { status: 422 }
        );
      }

      // Ensure receiver exists (outside txn to keep it fast)
      await prisma.user.upsert({
        where: { walletAddress: toAddress },
        create: {
          walletAddress: toAddress,
          username: toAddress,
          profileAvatar: "",
        },
        update: {},
      });

      // Update owner + activity atomically (batch $transaction — NO timeout option, NO readonly tuples)
      const ops = [
        prisma.nFT.update({
          where: { id: nft.id },
          data: {
            owner: { connect: { walletAddress: toAddress } },
            updatedAt: new Date(),
          },
        }),
        prisma.nFTActivity.upsert({
          where: {
            txHash_logIndex: {
              txHash: receipt.hash,      // ethers v6
              logIndex: erc721Log.index, // ethers v6
            },
          },
          update: {
            type: "TRANSFER",
            fromAddress: fromAddress,
            toAddress: toAddress,
            blockNumber: receipt.blockNumber ?? 0,
            timestamp: blockTime,
            marketplace: undefined,
            rawData: undefined,
            priceEtnWei: null,
          },
          create: {
            nftId: nft.id,
            contract,
            tokenId: String(tokenId),
            type: "TRANSFER",
            fromAddress: fromAddress,
            toAddress: toAddress,
            priceEtnWei: null,
            txHash: receipt.hash,
            logIndex: erc721Log.index,
            blockNumber: receipt.blockNumber ?? 0,
            timestamp: blockTime,
            marketplace: undefined,
            rawData: undefined,
          },
        }),
      ];

      await prisma.$transaction(ops);

      return NextResponse.json({
        ok: true,
        applied: "ERC721_TRANSFER",
        txHash: receipt.hash,
        logIndex: erc721Log.index,
        from: fromAddress,
        to: toAddress,
        tokenId: String(tokenId),
      });
    }

    /* =======================
       ERC1155 path
       ======================= */
    const base = (erc1155Single || erc1155Batch)!;
    const from = topicToAddress(base.topics[2]);
    const to = topicToAddress(base.topics[3]);

    // Decode data
    const coder = ethers.AbiCoder.defaultAbiCoder();

    let movedId: string | null = null;
    let movedAmount: number | null = null;

    if (erc1155Single) {
      // data: (id, value)
      const [id, value] = coder.decode(["uint256", "uint256"], base.data) as unknown as [
        bigint,
        bigint
      ];
      const idStr = (id as bigint).toString();
      if (idStr !== String(tokenId)) {
        return NextResponse.json(
          { error: "ERC1155 TransferSingle id does not match URL tokenId" },
          { status: 422 }
        );
      }
      movedId = idStr;
      movedAmount = Number(value as bigint);
    } else {
      // batch: (ids[], values[])
      const decoded = coder.decode(["uint256[]", "uint256[]"], base.data) as unknown as [
        readonly bigint[],
        readonly bigint[]
      ];
      const ids = Array.from(decoded[0]);
      const values = Array.from(decoded[1]);

      const idx = ids.findIndex((v) => v.toString() === String(tokenId));
      if (idx < 0) {
        return NextResponse.json(
          { error: "ERC1155 TransferBatch does not include this tokenId" },
          { status: 422 }
        );
      }
      movedId = String(tokenId);
      movedAmount = Number(values[idx]);
    }

    if (!movedId || movedAmount == null || movedAmount <= 0) {
      return NextResponse.json(
        { error: "Unable to resolve ERC1155 movement amount" },
        { status: 422 }
      );
    }

    // Ensure receiver exists (outside txn)
    await prisma.user.upsert({
      where: { walletAddress: to },
      create: { walletAddress: to, username: to, profileAvatar: "" },
      update: {},
    });

    // Prepare activity upsert
    const actUpsert = prisma.nFTActivity.upsert({
      where: {
        txHash_logIndex: {
          txHash: receipt.hash,
          logIndex: base.index,
        },
      },
      update: {
        type: "TRANSFER",
        fromAddress: from,
        toAddress: to,
        blockNumber: receipt.blockNumber ?? 0,
        timestamp: blockTime,
        marketplace: undefined,
        rawData: undefined,
        priceEtnWei: null,
      },
      create: {
        nftId: nft.id,
        contract,
        tokenId: String(tokenId),
        type: "TRANSFER",
        fromAddress: from,
        toAddress: to,
        priceEtnWei: null,
        txHash: receipt.hash,
        logIndex: base.index,
        blockNumber: receipt.blockNumber ?? 0,
        timestamp: blockTime,
        marketplace: undefined,
        rawData: undefined,
      },
    });

    // Read balances BEFORE txn (faster, avoids holding txn open)
    const [currentFrom, currentTo] = await Promise.all([
      prisma.erc1155Holding.findUnique({
        where: { contract_tokenId_ownerAddress: { contract, tokenId: String(tokenId), ownerAddress: from } },
        select: { balance: true },
      }),
      prisma.erc1155Holding.findUnique({
        where: { contract_tokenId_ownerAddress: { contract, tokenId: String(tokenId), ownerAddress: to } },
        select: { balance: true },
      }),
    ]);

    const fromNew = Math.max(0, (currentFrom?.balance ?? 0) - movedAmount);
    const toNew = Math.max(0, (currentTo?.balance ?? 0) + movedAmount);

    const fromUpsert = prisma.erc1155Holding.upsert({
      where: { contract_tokenId_ownerAddress: { contract, tokenId: String(tokenId), ownerAddress: from } },
      update: { balance: fromNew, updatedAt: new Date() },
      create: { contract, tokenId: String(tokenId), ownerAddress: from, balance: fromNew, updatedAt: new Date() },
    });

    const toUpsert = prisma.erc1155Holding.upsert({
      where: { contract_tokenId_ownerAddress: { contract, tokenId: String(tokenId), ownerAddress: to } },
      update: { balance: toNew, updatedAt: new Date() },
      create: { contract, tokenId: String(tokenId), ownerAddress: to, balance: toNew, updatedAt: new Date() },
    });

    // Atomic write (array form, no timeout option)
    await prisma.$transaction([actUpsert, fromUpsert, toUpsert]);

    return NextResponse.json({
      ok: true,
      applied: erc1155Single ? "ERC1155_TRANSFER_SINGLE" : "ERC1155_TRANSFER_BATCH",
      txHash: receipt.hash,
      logIndex: base.index,
      from,
      to,
      tokenId: String(tokenId),
      amount: movedAmount,
    });
  } catch (err: any) {
    console.error("[apply-transfer] error:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
