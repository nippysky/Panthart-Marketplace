// scripts/seed-multisig.cjs
require('dotenv/config');

let PrismaClient;
try {
  ({ PrismaClient } = require('../lib/generated/prisma'));
} catch {
  ({ PrismaClient } = require('@prisma/client'));
}

const MULTI_SIG_ABI = require('../lib/abis/marketplace-core/multiSigABI.json');

const MULTI_SIG_ADDRESS = (process.env.MULTI_SIG_ADDRESS ||
  '0x0711d1ad70b920fA348A3C3D3223721030558B55').toLowerCase();

(async () => {
  const { createPublicClient, http } = await import('viem');

  const dbUrl = process.env.DATABASE_URL || process.env.MIGRATE_DATABASE_URL || '';
  if (!/^postgres(ql)?:\/\//i.test(dbUrl) && !/^prisma:\/\//i.test(dbUrl)) {
    console.log('Skipping multisig seed: no DATABASE_URL / MIGRATE_DATABASE_URL set.');
    process.exit(0);
  }

  const rpcUrl = process.env.RPC_URL || 'https://rpc.electroneum.com';
  const client = createPublicClient({ transport: http(rpcUrl) });
  const prisma = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  try {
    // -------- on-chain reads
    const owners = await client.readContract({
      address: MULTI_SIG_ADDRESS,
      abi: MULTI_SIG_ABI,
      functionName: 'getOwners',
    });

    const required = await client.readContract({
      address: MULTI_SIG_ADDRESS,
      abi: MULTI_SIG_ABI,
      functionName: 'required',
    });

    const threshold = Number(required || 0);

    // -------- upsert MultisigSafe
    const safe = await prisma.multisigSafe.upsert({
      where: { contract: MULTI_SIG_ADDRESS },
      update: { threshold },
      create: { contract: MULTI_SIG_ADDRESS, name: 'Main Safe', threshold },
    });

    // -------- sync owners
    const now = new Date();
    const existing = await prisma.multisigOwner.findMany({ where: { safeId: safe.id } });
    const existingMap = new Map(existing.map(o => [o.ownerAddress.toLowerCase(), o]));
    const live = new Set();

    for (const o of owners) {
      const addr = String(o).toLowerCase();
      live.add(addr);
      const row = existingMap.get(addr);
      if (!row) {
        await prisma.multisigOwner.create({
          data: { safeId: safe.id, ownerAddress: addr, addedAt: now },
        });
      } else if (row.removedAt) {
        await prisma.multisigOwner.update({ where: { id: row.id }, data: { removedAt: null } });
      }
    }

    for (const row of existing) {
      const addr = row.ownerAddress.toLowerCase();
      if (!live.has(addr) && !row.removedAt) {
        await prisma.multisigOwner.update({ where: { id: row.id }, data: { removedAt: now } });
      }
    }

    // -------- ensure native ETN currency exists (no upsert with nullable unique)
    const etn = await prisma.currency.findFirst({
      where: { symbol: 'ETN', tokenAddress: null },
    });

    if (etn) {
      await prisma.currency.update({
        where: { id: etn.id },
        data: { active: true, decimals: 18, kind: 'NATIVE' },
      });
    } else {
      await prisma.currency.create({
        data: { symbol: 'ETN', decimals: 18, kind: 'NATIVE', tokenAddress: null, active: true },
      });
    }

    console.log('Seed OK:', {
      safe: MULTI_SIG_ADDRESS,
      threshold,
      ownersCount: owners.length,
      currency: 'ETN',
      rpc: rpcUrl,
    });
  } catch (err) {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  } finally {
    try { await prisma.$disconnect(); } catch {}
  }
})();
