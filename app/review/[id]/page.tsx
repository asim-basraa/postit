import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import { loadMockupView } from "@/lib/mockup-view";
import { ReviewApp } from "./ReviewApp";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Review · Post-it" };

/**
 * Reviewing a mockup. Signed-in readers only: the inspector, the spec and the
 * conversation are for the people working on it, and the public link stays
 * the plain file.
 */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string; node?: string }>;
}) {
  const { id } = await params;
  const { v, node } = await searchParams;
  if (!(await currentUser())) redirect(`/login?next=${encodeURIComponent(`/review/${id}`)}`);

  const version = Number(v);
  const view = await loadMockupView(id, Number.isInteger(version) && version > 0 ? version : null);
  if (!view) notFound();

  return <ReviewApp key={view.node.id} initial={view} initialNode={typeof node === "string" ? node : null} />;
}
