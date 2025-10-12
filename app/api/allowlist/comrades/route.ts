/**
 * /api/allowlist/comrades
 * ---------------------------------------
 * Purpose:
 *   Lightweight, real-time *preview* of Comrades holders who meet a minimum
 *   NFT count threshold (default: >= 100). Returns:
 *     - the configured contract (source of truth)
 *     - the minimum threshold used
 *     - the total count of qualifying holders
 *     - a tiny preview (first 3 addresses) to be transparent in the UI
 *     - a server timestamp (when this snapshot was computed)
 *
 *   This endpoint is intentionally NOT returning the full address list.
 *   The full set is appended server-side during /api/presale/prepare (next file).
 *
 * Design:
 *   - No schema/index changes required (aligns with your /api/legends approach)
 *   - Preserves address casing exactly as stored (NO lowercasing/uppercasing)
 *   - Uses a small in-memory TTL cache to keep UX snappy while staying “live”
 *
 * Query params:
 *   GET /api/allowlist/comrades?min=100&previewLimit=3
 *     - min:           minimum # of comrades held to qualify (default 100)
 *     - previewLimit:  number of addresses in preview (default 3, max 10)
 *
 * Env:
 *   - PANTHART_NFC_CONTRACT       (preferred)
 *   - If missing, we fall back to resolving collection by name
 *     "Non-Fungible Comrades" (case-insensitive)
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma, { prismaReady } from "@/lib/db";

/** Tiny in-memory cache (per-instance). Safe in Node runtime. */
type CacheKey = string;
type CacheEntry = {
  expiresAt: number;
  payload: any;
};
const ttlMs =
  Number(process.env.COMRADES_PREVIEW_TTL_MS || "") > 0
    ? Number(process.env.COMRADES_PREVIEW_TTL_MS)
    : 30_000; // default 30s
const cache = new Map<CacheKey, CacheEntry>();

/** Resolve the NFC (Non-Fungible Comrades) contract address */
async function resolveComradesContract(): Promise<string> {
  let CONTRACT = process.env.PANTHART_NFC_CONTRACT?.trim();
  if (CONTRACT) return CONTRACT; // keep original casing from env

  // Fall back to collection lookup by name (case-insensitive).
  // NOTE: contract column is CITEXT (case-insensitive storage), but Postgres
  // will return the originally stored casing; we keep it as-is.
  const col = await prisma.collection.findFirst({
    where: { name: { equals: "Non-Fungible Comrades", mode: "insensitive" } },
    select: { contract: true },
  });
  if (!col?.contract) {
    throw new Error(
      "Missing PANTHART_NFC_CONTRACT env and collection not found by name."
    );
  }
  return col.contract; // preserve original
}

/** Safely extract quoted alias results that Prisma/pg may lowercase */
function pickAliased<T extends Record<string, any>>(row: T, key: string): string {
  // When alias is quoted ("walletAddress"), pg should respect it,
  // but drivers sometimes still lowercase the key. Be defensive:
  return row[key] ?? row[key.toLowerCase()];
}

/** Build a stable cache key */
function makeKey(contract: string, min: number, previewLimit: number): CacheKey {
  return `${contract}::min=${min}::previewLimit=${previewLimit}`;
}

/** GET handler */
export async function GET(req: NextRequest) {
  await prismaReady;

  try {
    const url = new URL(req.url);
    const min = Math.max(1, Number(url.searchParams.get("min") ?? 100)); // default 100
    const previewLimit = Math.min(
      10,
      Math.max(0, Number(url.searchParams.get("previewLimit") ?? 3))
    );

    // 1) Resolve contract once (env or DB by name)
    const CONTRACT = await resolveComradesContract();

    // 2) Try cache
    const key = makeKey(CONTRACT, min, previewLimit);
    const now = Date.now();
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) {
      return NextResponse.json(hit.payload);
    }

    // 3) Count qualifying holders (>= min comrades)
    //    Logic mirrors /api/legends style; NO schema/index changes required.
    const countRows = await prisma.$queryRaw<Array<{ cnt: bigint }>>`
      SELECT COUNT(*)::bigint AS cnt FROM (
        SELECT u."walletAddress" AS "walletAddress"
        FROM "NFT" n
        JOIN "User" u ON u.id = n."ownerId"
        WHERE n.contract = ${CONTRACT}::citext
          AND n.status = 'SUCCESS'
          AND n."ownerId" IS NOT NULL
        GROUP BY u."walletAddress"
        HAVING COUNT(n.*) >= ${min}
      ) t
    `;

    const totalCount = Number(countRows[0]?.cnt ?? 0);

    // 4) Optional preview sample (first N addresses)
    let preview: string[] = [];
    if (previewLimit > 0) {
      const previewRows = await prisma.$queryRaw<Array<{ walletAddress: string }>>`
        SELECT u."walletAddress" AS "walletAddress"
        FROM "NFT" n
        JOIN "User" u ON u.id = n."ownerId"
        WHERE n.contract = ${CONTRACT}::citext
          AND n.status = 'SUCCESS'
          AND n."ownerId" IS NOT NULL
        GROUP BY u."walletAddress"
        HAVING COUNT(n.*) >= ${min}
        ORDER BY u."walletAddress" ASC
        LIMIT ${previewLimit}
      `;

      preview = previewRows
        .map((r) => pickAliased(r, "walletAddress"))
        .filter((s) => typeof s === "string" && !!s.trim());
      // ⚠️ DO NOT lower/upper-case addresses. Preserve original casing.
    }

    const payload = {
      ok: true,
      contract: CONTRACT, // preserve original casing
      min,
      count: totalCount,
      preview,
      serverTime: new Date().toISOString(),
      cacheTtlMs: ttlMs,
      note:
        "Preview only. Full set is appended server-side during /api/presale/prepare when includeComrades=true.",
    };

    // 5) Cache briefly
    cache.set(key, { expiresAt: now + ttlMs, payload });

    return NextResponse.json(payload);
  } catch (e: any) {
    const msg = e?.message || "Internal error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
