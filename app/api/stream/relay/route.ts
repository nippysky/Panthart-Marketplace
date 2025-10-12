// app/api/stream/relay/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { publish, walletTopic } from "@/lib/server/sse";

const TOKEN = process.env.STREAM_RELAY_TOKEN || "";

/**
 * Normalize incoming topics so clients can post with any wallet casing.
 * - "wallet:<address>"  -> walletTopic(<address>)  (which lowercases internally)
 * - everything else     -> passthrough
 */
function normalizeTopic(raw: string): string {
  // very small, allocation-friendly split
  const idx = raw.indexOf(":");
  if (idx === -1) return raw;

  const prefix = raw.slice(0, idx);
  const rest = raw.slice(idx + 1);

  if (prefix === "wallet" && rest) {
    // Delegate to the shared helper to prevent drift
    return walletTopic(rest);
  }

  // If you later add other canonicalizations (e.g., "profile:"), handle here.
  return raw;
}

export async function POST(req: NextRequest) {
  // Optional bearer token auth
  if (TOKEN) {
    const auth = req.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ") || auth.slice(7) !== TOKEN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const body = await req.json().catch(() => ({}));
    const topic = typeof body.topic === "string" ? body.topic : "";
    const event = typeof body.event === "string" ? body.event : "";
    const data = body.data ?? {};

    if (!topic || !event) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    // 🔒 Make wallet topics casing-agnostic
    const normalized = normalizeTopic(topic);

    publish(normalized, event, data);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Bad Request" }, { status: 400 });
  }
}
