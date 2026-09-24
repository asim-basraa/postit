import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { loadMockupView } from "@/lib/mockup-view";
import { Compare } from "./Compare";

export const dynamic = "force-dynamic";

/** Two versions of one mockup side by side, with what changed between them outlined. */
export default async function ComparePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { id } = await params;
  const { a, b } = await searchParams;
  if (!(await currentUser())) redirect("/login");
  const view = await loadMockupView(id);
  if (!view) notFound();
  const versions = view.versions.map((v) => v.content_version);
  const newer = Number(b) || versions[0] || view.version;
  const older = Number(a) || versions.find((v) => v < newer) || newer;
  return (
    <Compare
      nodeId={view.node.id}
      name={view.node.name}
      backHref={`/review/${view.node.id}`}
      versions={versions}
      initialA={older}
      initialB={newer}
    />
  );
}
