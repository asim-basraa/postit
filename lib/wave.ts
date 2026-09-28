import { createWaveHandlers, loadScreenView, type ScreenView } from "@wave/server";
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

import { WAVE_BASE } from "@/lib/wave-routes";

export { WAVE_BASE };

export const waveHandlers = createWaveHandlers({
  host: () => postitWave(),
  basePath: WAVE_BASE,
  build: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev",
});
