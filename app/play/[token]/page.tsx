import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadSharedPrototype } from "@/lib/wave";
import { SharedPrototype } from "./SharedPrototype";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Prototype", robots: { index: false, follow: false } };

/**
 * A feature's prototype for anybody holding the link: no account, view only,
 * this one feature. The link is revoked from the feature's page in Post-it.
 */
export default async function PlayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await loadSharedPrototype(token);
  if (!loaded) notFound();
  return <SharedPrototype token={token} view={loaded.view} />;
}
