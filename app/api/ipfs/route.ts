import { NextRequest } from "next/server";

const HOPS = [
  "https://ipfs.io/ipfs/",
  "https://lime-traditional-stork-669.mypinata.cloud/ipfs/",
  "https://gateway.pinata.cloud/ipfs/",
];

const TIMEOUT_MS = 7_000;

const ONE_BY_ONE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=";

function isImageContentType(ct?: string | null) {
  if (!ct) return false;
  const lc = ct.toLowerCase();
  return lc.startsWith("image/") || lc === "application/octet-stream";
}

function normalizeToCandidates(raw: string): string[] {
  // If it's already https, try it verbatim first.
  const candidates: string[] = [];
  try {
    const u = new URL(raw);
    if (u.protocol === "https:") candidates.push(u.toString());
  } catch {
    // ignore
  }

  // ipfs://CID/.. or /ipfs/CID/.. or CID only
  let ipfsPath = "";
  if (raw.startsWith("ipfs://")) {
    ipfsPath = raw.replace(/^ipfs:\/\//, "");
  } else if (raw.includes("/ipfs/")) {
    ipfsPath = raw.split("/ipfs/")[1];
  } else {
    // maybe it’s just a CID
    ipfsPath = raw;
  }
  ipfsPath = ipfsPath.replace(/^\/+/, "");

  for (const g of HOPS) candidates.push(g + ipfsPath);
  return candidates;
}

async function fetchWithTimeout(url: string, signal?: AbortSignal) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: signal ?? controller.signal,
      // Be explicit about images to help some gateways
      headers: { Accept: "image/*,application/octet-stream" },
      // Avoid compression weirdness
      cache: "no-store",
    });
    return res;
  } finally {
    clearTimeout(id);
  }
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const allowRedirect = req.nextUrl.searchParams.get("redirect") === "1"; // optional escape hatch

  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  // Build the candidate list (no duplicates)
  const candidates = Array.from(new Set(normalizeToCandidates(url)));

  // If the first candidate is exactly the incoming https URL and redirect mode requested,
  // we can just redirect once (kept for debugging). Default is strict streaming: no 302s.
  if (allowRedirect && candidates.length > 0) {
    return Response.redirect(candidates[0], 302);
  }

  // Try each candidate until one returns an image
  for (const candidate of candidates) {
    try {
      const res = await fetchWithTimeout(candidate);
      if (!res.ok) continue;

      const ct = res.headers.get("content-type");
      if (!isImageContentType(ct)) continue;

      // Stream bytes back with strong caching
      const headers = new Headers();
      headers.set("Content-Type", ct || "image/*");
      // 1 year client + CDN cache; tweak as desired
      headers.set("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");
      // Pass through length/etag if present (nice-to-have)
      const len = res.headers.get("content-length");
      if (len) headers.set("Content-Length", len);
      const etag = res.headers.get("etag");
      if (etag) headers.set("ETag", etag);

      return new Response(res.body, {
        status: 200,
        headers,
      });
    } catch {
      // timeout/abort/network; go to next hop
      continue;
    }
  }

  // All hops failed: return a tiny transparent PNG so UI never breaks
  const fallback = await fetch(ONE_BY_ONE_PNG);
  return new Response(await fallback.arrayBuffer(), {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=60",
    },
  });
}
