import type { Metadata } from "next";
import CollectionDirectory from "@/components/collection/collection-directory";

const TITLE = "Explore NFT Collections on Electroneum | Panthart";
const DESCRIPTION =
  "Browse verified ERC-721 collections on the Electroneum chain. Track volume, floor price, holders, and activity—only on Panthart.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/collections" },
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
    "Electroneum",
    "ETN",
    "NFT Collections",
    "ERC721",
    "Floor Price",
    "Volume",
    "Web3 Marketplace",
  ],
  openGraph: {
    type: "website",
    url: "/collections",
    title: TITLE,
    description: DESCRIPTION,
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: "Panthart — Explore NFT Collections",
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

export default function CollectionsPage() {
  const collectionPageLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: TITLE,
    description: DESCRIPTION,
    url: "https://panth.art/collections",
    isPartOf: { "@type": "WebSite", name: "Panthart", url: "https://panth.art" },
  };

  const breadcrumbsLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://panth.art/" },
      { "@type": "ListItem", position: 2, name: "Collections", item: "https://panth.art/collections" },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionPageLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsLd) }} />
      <CollectionDirectory />
    </>
  );
}
