import BreadcrumbFromPath from "@/components/shared/breadcrumb-from-path";
import { getMintingNowPage } from "@/lib/server/minting-now";
import MintingNowLive from "./minting-now-live";

export default async function MintingNowPageComponent() {
  // Grab a big first page on the server for fast initial paint
  const { items, nextCursor } = await getMintingNowPage(60, null);

  return (
    <section className="flex-1">
      <BreadcrumbFromPath />

      <div className="flex flex-col gap-2 mb-6">
        <h1 className="font-bold text-[1.7rem] lg:text-[2.1rem] tracking-tight">
          Minting Now
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Discover and claim exclusive digital assets as they go live. Join the
          mint while supplies last.
        </p>
      </div>

      {/* Grid only — no hero */}
      <MintingNowLive
        initialPage={{ items, nextCursor }}
      />
    </section>
  );
}
