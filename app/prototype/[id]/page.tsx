import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { currentUser } from "@/lib/supabase/server";
import { loadPrototype } from "@/lib/wave";
import { PrototypeApp } from "@wave/react";
import { PostitWave } from "@/lib/wave-ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Prototype · Post-it" };

/**
 * A feature (flow) played as a working prototype with its mock API. Signed-in
 * readers of the feature only, like review.
 */
export default async function PrototypePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await currentUser())) redirect(`/login?next=${encodeURIComponent(`/prototype/${id}`)}`);
  const loaded = await loadPrototype(id);
  if (!loaded) notFound();
  return (
    <PostitWave>
      <PrototypeApp view={loaded.view} backHref={loaded.folderHref} requirementsHref={loaded.requirementsHref} />
    </PostitWave>
  );
}
