// app/api/featured/activity/snapshot/route.ts
export const dynamic = "force-dynamic";

import { getFeaturedSnapshot } from "@/lib/sse";

export async function GET() {
  const items = getFeaturedSnapshot(30);
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
