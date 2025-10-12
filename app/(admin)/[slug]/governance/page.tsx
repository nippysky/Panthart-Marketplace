// app/(admin)/[slug]/governance/page.tsx
import { redirect } from "next/navigation";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/${slug}/governance/overview`);
}
