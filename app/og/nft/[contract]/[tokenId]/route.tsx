/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Panthart — NFT Preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function truncate(s?: string, n = 90) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

export default async function GET(
  req: Request,
  ctx: { params: { contract: string; tokenId: string } }
) {
  const { contract, tokenId } = ctx.params;
  const origin = new URL(req.url).origin;
  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/+$/, "") || origin;

  let name = `Token #${tokenId}`;
  let collection = "";
  let img: string | undefined;
  let desc = "";
  let rarityScore: number | undefined;
  let rarityRank: number | undefined;
  let population: number | undefined;

  // Auction
  let live = false;
  let priceLabel = "";
  try {
    const [nftRes, activeRes] = await Promise.all([
      fetch(
        `${base}/api/nft/${encodeURIComponent(contract)}/${encodeURIComponent(tokenId)}`,
        { cache: "no-store" }
      ),
      // NEW: use the active-auctions endpoint filtered by NFT identity
      fetch(
        `${base}/api/auction/active?contract=${encodeURIComponent(
          contract
        )}&tokenId=${encodeURIComponent(tokenId)}`,
        { cache: "no-store" }
      ).catch(() => null),
    ]);

    if (nftRes.ok) {
      const data = await nftRes.json();
      name = data?.nft?.name || name;
      collection = data?.displayGroup?.title || "";
      img = data?.nft?.image || undefined;
      desc = data?.nft?.description || "";
      rarityScore = typeof data?.rarityScore === "number" ? data.rarityScore : undefined;
      rarityRank = typeof data?.rarityRank === "number" ? data.rarityRank : undefined;
      population = typeof data?.population === "number" ? data.population : undefined;
    }

    if (activeRes && activeRes.ok) {
      const active = await activeRes.json();
      // Find this NFT’s auction (should be at most one)
      const it =
        active?.items?.find?.(
          (x: any) =>
            x?.nft?.contract === contract &&
            String(x?.nft?.tokenId) === String(tokenId)
        ) ?? null;

      if (it?.endTime) {
        const now = Date.now();
        const end = Date.parse(it.endTime);
        const start = it.startTime ? Date.parse(it.startTime) : now - 1;
        live = Number.isFinite(end) && now >= start && now < end;

        const priceHuman =
          typeof it?.price?.current === "string" && it.price.current.trim().length > 0
            ? it.price.current
            : null;
        const symbol = it?.currency?.symbol || "ETN";
        if (priceHuman) priceLabel = `${priceHuman} ${symbol}`;
      }
    }
  } catch {
    // keep defaults
  }

  const bg = "#0b0c10";
  const fg = "#ffffff";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: bg,
          color: fg,
          position: "relative",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto",
        }}
      >
        {/* radial glow */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(1200px 500px at 80% -10%, rgba(255,255,255,0.12), transparent 60%), radial-gradient(1200px 500px at 20% 110%, rgba(255,255,255,0.08), transparent 60%)",
          }}
        />

        <div style={{ display: "flex", gap: 32, padding: 48, width: "100%", height: "100%", boxSizing: "border-box", alignItems: "center" }}>
          {/* Left: media */}
          <div style={{ width: 520, height: 520, borderRadius: 24, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)", display: "grid", placeItems: "center", overflow: "hidden", position: "relative" }}>
            {img ? (
              <img src={img} alt={name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
            ) : (
              <div style={{ opacity: 0.5, fontSize: 20 }}>No Image</div>
            )}

            {/* Price chip */}
            {priceLabel && (
              <div
                style={{
                  position: "absolute",
                  left: 16,
                  bottom: 16,
                  padding: "10px 14px",
                  borderRadius: 999,
                  fontSize: 22,
                  background: "rgba(0,0,0,0.5)",
                  border: "1px solid rgba(255,255,255,0.25)",
                }}
              >
                {priceLabel}
              </div>
            )}

            {/* Live auction ribbon */}
            {live && (
              <div
                style={{
                  position: "absolute",
                  top: 16,
                  left: -50,
                  transform: "rotate(-12deg)",
                  padding: "10px 60px",
                  background: "#ef4444",
                  color: "#fff",
                  fontWeight: 800,
                  fontSize: 20,
                  letterSpacing: 1,
                  boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                }}
              >
                LIVE AUCTION
              </div>
            )}
          </div>

          {/* Right: text */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, flex: 1 }}>
            <div style={{ fontSize: 18, opacity: 0.7, letterSpacing: 1, textTransform: "uppercase" }}>
              {collection || "Panthart Collection"}
            </div>
            <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15 }}>
              {truncate(name, 60)}
            </div>

            {/* rarity */}
            {typeof rarityScore === "number" && population ? (
              <div style={{ marginTop: 4, display: "flex", gap: 12 }}>
                <div
                  style={{
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.25)",
                    padding: "6px 12px",
                    fontSize: 18,
                    background: "rgba(255,255,255,0.06)",
                  }}
                >
                  Rarity Score: {rarityScore.toFixed(2)}
                </div>
                {typeof rarityRank === "number" && (
                  <div
                    style={{
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.25)",
                      padding: "6px 12px",
                      fontSize: 18,
                      background: "rgba(255,255,255,0.06)",
                    }}
                  >
                    Rank: {rarityRank}/{population}
                  </div>
                )}
              </div>
            ) : null}

            {desc ? (
              <div style={{ marginTop: 8, fontSize: 20, opacity: 0.9, lineHeight: 1.4 }}>
                {truncate(desc, 180)}
              </div>
            ) : null}

            <div style={{ marginTop: 28, display: "flex", gap: 10, alignItems: "center" }}>
              <div style={{ width: 10, height: 10, borderRadius: 999, background: "#10B981" }} />
              <div style={{ fontSize: 22, opacity: 0.9 }}>panth.art</div>
            </div>
          </div>
        </div>

        {/* watermark */}
        <div style={{ position: "absolute", right: 28, bottom: 22, fontSize: 18, opacity: 0.55 }}>
          Mint, Trade & Discover with ETN
        </div>
      </div>
    ),
    { ...size }
  );
}
