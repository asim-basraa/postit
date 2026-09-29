import { createWaveHandlers, loadScreenView, prototypeOf, type PrototypeView, type ScreenView } from "@wave/server";
import type { Comment } from "@/lib/comment-threads";
import { postitWave, type PostitScreen } from "@/lib/wave-host";

/**
 * Wave, mounted in Post-it.
 *
 * The API lives at /api/wave (app/api/wave/[...path]), the review screen at
 * /review/<page id>. Both go through postitWave, so Post-it's permissions
 * decide everything.
 */

/** A review screen's data with Post-it's own fields filled in. */
export type MockupView = Omit<ScreenView, "node" | "comments"> & { node: PostitScreen; comments: Comment[] };

export async function loadMockupView(nodeId: string, version?: number | null): Promise<MockupView | null> {
  return (await loadScreenView(await postitWave(), nodeId, version)) as MockupView | null;
}

/**
 * A feature's prototype, with where its folder and data requirements page are
 * in Post-it. Null when the viewer cannot read it or it is not a folder.
 */
export async function loadPrototype(flowId: string): Promise<{ view: PrototypeView; folderHref: string; requirementsHref: string | null } | null> {
  const host = await postitWave();
  const view = await prototypeOf(host, flowId);
  if (!view) return null;
  const flow = (await host.resources.flow(flowId)) as { path: string; space_id: string } | null;
  const { createClient } = await import("@/lib/supabase/server");
  const db = await createClient();
  const { data } = await db.from("spaces").select("slug").eq("id", flow?.space_id ?? "").maybeSingle();
  const space = (data as { slug: string } | null)?.slug ?? "";
  const folderHref = `/s/${space}/${flow?.path ?? ""}`;
  return { view, folderHref, requirementsHref: view.requirementsId ? `${folderHref}/api/data-requirements` : null };
}

import { WAVE_BASE } from "@/lib/wave-routes";

export { WAVE_BASE };

export const waveHandlers = createWaveHandlers({
  host: () => postitWave(),
  basePath: WAVE_BASE,
  build: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev",
});
