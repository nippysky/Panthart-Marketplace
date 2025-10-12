// app/layout.tsx
import type { Metadata, Viewport } from "next";
import { Sora } from "next/font/google";
import "./globals.css";
import ThirdwebProviderWrapper from "@/components/shared/thirdweb";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import LoaderModal from "@/components/shared/loader-modal";
import React from "react";
import QueryProvider from "./providers";
import WalletSyncProvider from "@/components/shared/WalletSyncProvider";

const sora = Sora({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700", "800"],
});

const SITE_URL = "https://panth.art";
const SITE_NAME = "Panthart";
const SITE_TAGLINE = "Mint, Trade, and Discover Digital Assets on Electronuem";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0b0c" },
  ],
  colorScheme: "light dark",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  generator: "Next.js",
  referrer: "strict-origin-when-cross-origin",
  title: {
    default: `${SITE_NAME} — NFT Marketplace on Electroneum`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Panthart is the NFT marketplace on Electroneum. Mint, trade, and discover digital assets with $ETN—fast, affordable, and creator-friendly.",
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
  ],
  alternates: {
    canonical: "/",
    languages: { "en-US": "/" },
  },
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
  manifest: "/site.webmanifest",
  icons: {
    icon: [
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon-32x32.png"],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    title: SITE_NAME,
    siteName: SITE_NAME,
    description: SITE_TAGLINE,
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image.png",
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — ${SITE_TAGLINE}`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@decentroneum",
    creator: "@decentroneum",
    title: SITE_NAME,
    description: SITE_TAGLINE,
    images: ["/opengraph-image.png"],
  },
  verification: {
    google: "",
    yandex: "",
    me: ["https://x.com/decentroneum"],
  },
  category: "technology",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const jsonLdOrg = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/opengraph-image.png`,
    sameAs: ["https://x.com/decentroneum"],
  };

  const jsonLdWebsite = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    potentialAction: {
      "@type": "SearchAction",
      target: `${SITE_URL}/search?q={query}`,
      "query-input": "required name=query",
    },
  };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${sora.variable} scroll-smooth`}
    >
      <head>
        {/* JSON-LD */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdOrg) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLdWebsite) }}
        />
        {/* Optional preconnects for IPFS gateways */}
        <link rel="preconnect" href="https://ipfs.io" />
        <link rel="preconnect" href="https://lime-traditional-stork-669.mypinata.cloud/ipfs/" />
      </head>

      {/* Apply font immediately without Tailwind config */}
      <body
        className="antialiased w-full max-w-[1920px] mx-auto"
        style={{
          fontFamily:
            'var(--font-sans), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ThirdwebProviderWrapper>
            <QueryProvider>
              <React.Fragment>
                <WalletSyncProvider>
                  {children}
                  <LoaderModal />
                </WalletSyncProvider>
              </React.Fragment>
            </QueryProvider>
          </ThirdwebProviderWrapper>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  );
}
