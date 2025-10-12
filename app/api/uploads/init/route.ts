export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;


import { NextRequest, NextResponse } from "next/server";


/** Server-only URL of the uploader VM */
const UPLOAD_SERVICE_URL =
  process.env.UPLOAD_SERVICE_URL ||
  process.env.NEXT_PUBLIC_UPLOAD_BASE ||
  "";

export async function POST(req: NextRequest) {
  if (!UPLOAD_SERVICE_URL) {
    return NextResponse.json(
      { error: "Uploader service URL is not configured" },
      { status: 500 }
    );
  }

  // Best-effort client IP from headers
  const xfwd = req.headers.get("x-forwarded-for") || "";
  const realIp = req.headers.get("x-real-ip") || "";
  const clientIp =
    (xfwd.split(",")[0] || "").trim() || realIp || "";

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 12_000); // 12s timeout

  try {
    const upstream = await fetch(`${UPLOAD_SERVICE_URL}/init`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-host": req.headers.get("host") || "",
        "x-client-ip": clientIp,
        "x-client-user-agent": req.headers.get("user-agent") || "",
      },
      body: JSON.stringify({ via: "panth.art-frontend" }),
      cache: "no-store",
      signal: controller.signal,
    });

    const text = await upstream.text();
    clearTimeout(t);

    if (!upstream.ok) {
      let msg = text;
      try {
        const j = JSON.parse(text);
        msg = j?.error || text;
      } catch {}
      return NextResponse.json({ error: msg || "init failed" }, { status: 502 });
    }

    const json = JSON.parse(text);
    return NextResponse.json(json, {
      status: 200,
      headers: { "cache-control": "no-store" },
    });
  } catch (err: any) {
    clearTimeout(t);
    const msg = err?.name === "AbortError" ? "init timed out" : (err?.message || "init error");
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
