// app/(profile)/profile/[address]/page.tsx
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import type { Metadata } from "next";
import prisma from "@/lib/db";
import MyProfileComponent from "@/components/profile/my-profile-component";
import type { UserProfile } from "@/lib/types/types";

/* ----------------------------------------
 * Types & helpers
 * -------------------------------------- */
type PageContext = { params: Promise<{ address: string }> };

function shorten(addr: string) {
  return addr?.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

function normalizeUrl(u?: string | null): string | undefined {
  if (!u) return;
  if (/^https?:\/\//i.test(u)) return u;
  // Bare domains
  if (/^[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(u)) return `https://${u}`;
  return undefined;
}

function socialSameAs(user: {
  x?: string | null;
  instagram?: string | null;
  website?: string | null;
  telegram?: string | null;
}) {
  const links: string[] = [];

  // X (Twitter)
  if (user.x) {
    const h = user.x.replace(/^@/, "");
    const url = normalizeUrl(user.x) ?? `https://x.com/${h}`;
    if (url) links.push(url);
  }

  // Instagram
  if (user.instagram) {
    const h = user.instagram.replace(/^@/, "");
    const url =
      normalizeUrl(user.instagram) ?? `https://instagram.com/${h}`;
    if (url) links.push(url);
  }

  // Telegram
  if (user.telegram) {
    const h = user.telegram.replace(/^@/, "");
    const url =
      normalizeUrl(user.telegram) ?? `https://t.me/${h}`;
    if (url) links.push(url);
  }

  // Personal website
  const site = normalizeUrl(user.website);
  if (site) links.push(site);

  return links;
}

/* ----------------------------------------
 * SEO (light DB read only; no writes)
 * -------------------------------------- */
export async function generateMetadata(ctx: PageContext): Promise<Metadata> {
  const { address } = await ctx.params;

  const u = await prisma.user.findFirst({
    where: { walletAddress: { equals: address, mode: "insensitive" } },
    select: {
      username: true,
      profileAvatar: true,
      profileBanner: true,
      bio: true,
      x: true,
      instagram: true,
      website: true,
      telegram: true,
    },
  });

  // Fallbacks
  const handle = u?.username ?? shorten(address);
  const title = `@${handle}`;
  const desc =
    u?.bio?.slice?.(0, 220) ??
    `View @${handle}’s NFT portfolio. Explore their owned NFTs and ERC-1155 holdings on Panthart, the Electroneum (ETN) powered NFT marketplace.`;

  // Prefer banner for social image, then avatar
  const ogImage = u?.profileBanner || u?.profileAvatar || undefined;

  return {
    title,
    description: desc,
    // Relative canonical is fine since metadataBase is set in root layout
    alternates: { canonical: `/profile/${address}` },
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
    openGraph: {
      title,
      description: desc,
      url: `/profile/${address}`,
      siteName: "Panthart",
      images: ogImage
        ? [{ url: ogImage, width: 1200, height: 630, alt: `@${handle}` }]
        : undefined,
      locale: "en_US",
      type: "profile",
      firstName: undefined, // left empty intentionally (pseudonymous)
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
      creator: "@decentroneum",
      images: ogImage ? [ogImage] : undefined,
    },
    category: "marketplace",
    keywords: [
      "Panthart",
      "NFT",
      "Profile",
      "Electroneum",
      "ETN",
      "Web3",
      handle,
    ],
  };
}

/* ----------------------------------------
 * Data helpers
 * -------------------------------------- */
async function ensureUser(address: string) {
  const existing = await prisma.user.findFirst({
    where: { walletAddress: { equals: address, mode: "insensitive" } },
    select: {
      id: true,
      walletAddress: true,
      username: true,
      profileAvatar: true,
      profileBanner: true,
      instagram: true,
      x: true,
      website: true,
      telegram: true,
      bio: true,
    },
  });
  if (existing) return existing;

  await prisma.user.create({
    data: {
      walletAddress: address,
      username: `${address.slice(0, 6)}...${address.slice(-4)}`,
      profileAvatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${address}`,
      profileBanner:
        "https://res.cloudinary.com/dx1bqxtys/image/upload/v1750638432/panthart/amy5m5u7nxmhlh8brv6d.png",
    },
  });

  return prisma.user.findFirstOrThrow({
    where: { walletAddress: { equals: address, mode: "insensitive" } },
    select: {
      id: true,
      walletAddress: true,
      username: true,
      profileAvatar: true,
      profileBanner: true,
      instagram: true,
      x: true,
      website: true,
      telegram: true,
      bio: true,
    },
  });
}

/**
 * ✅ SSR item total that EXACTLY matches the grid:
 * Count rows in `NFT` with `status = SUCCESS` where ANY of these are true:
 *  - owner.walletAddress == address (ERC721 / owned rows)
 *  - (contract, tokenId) is in Erc1155Holding (balance > 0)
 *  - single1155Id is in Erc1155Balance (balance > 0)
 */
async function computeItemsTotal(address: string) {
  const [holdings, s1155] = await Promise.all([
    prisma.erc1155Holding.findMany({
      where: {
        ownerAddress: { equals: address, mode: "insensitive" },
        balance: { gt: 0 },
      },
      select: { contract: true, tokenId: true },
      take: 5000,
    }),
    prisma.erc1155Balance.findMany({
      where: {
        ownerAddress: { equals: address, mode: "insensitive" },
        balance: { gt: 0 },
      },
      select: { single1155Id: true },
      take: 5000,
    }),
  ]);

  const orScope: any[] = [
    { owner: { is: { walletAddress: { equals: address, mode: "insensitive" } } } },
    ...holdings.map((h) => ({
      AND: [
        { contract: { equals: h.contract, mode: "insensitive" } },
        { tokenId: h.tokenId },
      ],
    })),
  ];

  if (s1155.length) {
    orScope.push({ single1155Id: { in: s1155.map((b) => b.single1155Id) } });
  }

  return prisma.nFT.count({
    where: { AND: [{ status: "SUCCESS" }], OR: orScope },
  });
}

/* ----------------------------------------
 * Page
 * -------------------------------------- */
export default async function PublicProfilePage(ctx: PageContext) {
  const { address } = await ctx.params;

  const user = await ensureUser(address);
  if (!user) return notFound();

  // ✅ unified SSR count
  const itemsTotal = await computeItemsTotal(address);

  // Legends (NFC) SSR bootstrap
  const NFC_CONTRACT = process.env.PANTHART_NFC_CONTRACT?.trim() || "";
  let comradesHeld = 0;
  if (NFC_CONTRACT) {
    comradesHeld = await prisma.nFT.count({
      where: {
        ownerId: user.id,
        status: "SUCCESS",
        contract: { equals: NFC_CONTRACT, mode: "insensitive" },
      },
    });
  }

  const profile: UserProfile & { bio?: string } = {
    walletAddress: user.walletAddress,
    username: user.username,
    profileAvatar: user.profileAvatar,
    profileBanner: user.profileBanner,
    instagram: user.instagram ?? undefined,
    x: user.x ?? undefined,
    website: user.website ?? undefined,
    telegram: user.telegram ?? undefined,
    bio: user.bio ?? undefined,
    ownedNFTs: [],
    erc1155Holdings: [],
  };

  /* ---------- Structured Data (ProfilePage + Person) ---------- */
  const handle = user.username || shorten(user.walletAddress);
  const sameAs = socialSameAs(user);

  const profileJsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: `@${handle} on Panthart`,
    url: `/profile/${user.walletAddress}`,
    about: user.bio || undefined,
    primaryImageOfPage: user.profileBanner || user.profileAvatar || undefined,
    breadcrumb: {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "/" },
        { "@type": "ListItem", position: 2, name: "Profiles", item: "/profile" },
        { "@type": "ListItem", position: 3, name: `@${handle}`, item: `/profile/${user.walletAddress}` },
      ],
    },
  };

  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: `@${handle}`,
    url: `/profile/${user.walletAddress}`,
    image: user.profileAvatar || undefined,
    description: user.bio || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
    identifier: user.walletAddress,
  };

  return (
    <>
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(profileJsonLd),
        }}
      />
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(personJsonLd),
        }}
      />

      <MyProfileComponent
        profile={profile}
        itemsTotal={itemsTotal}
        legendsBootstrap={{ comradesHeld }}
      />
    </>
  );
}
