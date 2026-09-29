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

export const WAVE_BUILD = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev";

export const waveHandlers = createWaveHandlers({
  host: () => postitWave(),
  basePath: WAVE_BASE,
  build: WAVE_BUILD,
});

/**
 * A feature's prototype opened by a link, for somebody with no account. The
 * host runs with the service role, so everything served through it is limited
 * here to the one feature the link opens.
 */
export async function loadSharedPrototype(token: string): Promise<{ flowId: string; view: PrototypeView } | null> {
  const { resolvePrototypeLink } = await import("@/lib/prototype-links");
  const flowId = await resolvePrototypeLink(token);
  if (!flowId) return null;
  const { createAdminClient } = await import("@/lib/supabase/server");
  const view = await prototypeOf(await postitWave(createAdminClient()), flowId);
  // The requirements page lives in Post-it, which the visitor cannot open.
  // Notes about the mock API are for the team, not whoever holds the link.
  return view ? { flowId, view: { ...view, requirementsId: null, problems: [] } } : null;
}

/** One screen of a shared prototype, if the link opens the feature it is in. */
export async function sharedScreenHtml(token: string, screenId: string): Promise<string | null> {
  const { resolvePrototypeLink } = await import("@/lib/prototype-links");
  const flowId = await resolvePrototypeLink(token);
  if (!flowId) return null;
  const { createAdminClient } = await import("@/lib/supabase/server");
  const host = await postitWave(createAdminClient());
  const member = (await host.resources.members(flowId)).find((m) => m.id === screenId && m.kind === "screen");
  if (!member) return null;
  const screen = await host.resources.screen(screenId);
  return screen ? host.resources.readCurrent(screen) : null;
}
