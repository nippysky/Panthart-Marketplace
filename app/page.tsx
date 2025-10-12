// app/page.tsx
export const dynamic = "force-dynamic";

import AuctionsCarousel from "@/components/home/auctions-carousel";
import FeaturedCollection from "@/components/home/featured-collection-hero";
import Hero from "@/components/home/hero";
import MintingNowCarousel from "@/components/home/minting-now-carousel";
import TopCollections from "@/components/home/top-collections";
import Footer from "@/components/shared/footer";
import Header from "@/components/shared/header";
import type { Metadata } from "next";

const TITLE = "Mint, Trade, and Discover Digital Assets with $ETN | Panthart";
const DESCRIPTION =
  "Panthart is the NFT marketplace on Electroneum. Mint, trade, and discover ERC-721 & ERC-1155 digital assets with $ETN—fast, affordable, and creator-friendly.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
  keywords: [
    "Panthart",
    "Decentroneum",
    "NFT Marketplace",
    "Electroneum",
    "ETN",
    "Web3",
    "ERC721",
    "ERC1155",
    "Crypto Art",
    "Digital Collectibles",
    "On-chain",
  ],
  openGraph: {
    type: "website",
    url: "/",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — NFT Marketplace on Electroneum",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["/opengraph-image.png"],
    site: "@decentroneum",
    creator: "@decentroneum",
  },
};

export default async function Home() {
  // Bootstrap with defaults window=24h & currency=native
  let initialCollections: any[] = [];
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/collections/top?window=24h&currency=native`,
      { cache: "no-store" }
    );
    if (res.ok) {
      const data = await res.json();
      initialCollections = data.collections || [];
    }
  } catch (err) {
    console.error("❌ Error fetching /api/collections/top:", err);
  }

  return (
    <section className="min-h-screen flex flex-col lg:px-20 md:px-10 px-5">
      <Header />
      <main className="w-full flex-1">
        <Hero />
        <FeaturedCollection className="mt-6" />
        <TopCollections initialCollections={initialCollections} />
        <MintingNowCarousel />
        <AuctionsCarousel />
      </main>
      <Footer />
    </section>
  );
}
