import type { Approval, HostResult, WaveFlow, WaveHost } from "./host";

/**
 * Shared screens and locked features.
 *
 * A screen lives in one feature (its folder) and keeps one identity, address
 * and version history. Other features of the same project may use it. When a
 * feature is approved it is locked: its review, prototype and handover show
 * the versions it approved, whatever happens to its screens later. A later
 * feature that changes a shared screen makes a new version on top of the
 * latest; features locked at older versions keep theirs. Reopening a feature
 * unlocks it, and it needs approving again.
 */

/** An approval that still holds its feature at the versions it froze. */
export function isLocked(approval: Approval | null): approval is Approval {
  return !!approval && !approval.reopened_at;
}

/** The versions a locked feature shows, by screen id; null when it is not locked. */
export async function lockedVersions(host: WaveHost, flowId: string): Promise<Map<string, number> | null> {
  const approval = await host.store.latestApproval(flowId);
  if (!isLocked(approval)) return null;
  return new Map(approval.members.map((m) => [m.screen_id, m.content_version]));
}

export type ScreenUse = {
  flow: Pick<WaveFlow, "id" | "name" | "path">;
  /** The feature the screen lives in, or one that uses it. */
  home: boolean;
  /** The version the feature is locked at, or null when it follows the latest. */
  lockedAt: number | null;
};

/** Every feature that shows a screen: where it lives and where it is used. */
export async function screenUsage(host: WaveHost, screenId: string): Promise<ScreenUse[]> {
  const out: ScreenUse[] = [];
  const home = await host.resources.flowOf(screenId);
  const ids = [...(home ? [home.id] : []), ...((await host.store.usedBy?.(screenId)) ?? [])];
  for (const id of [...new Set(ids)]) {
    const flow = id === home?.id ? home : await host.resources.flow(id);
    if (!flow) continue;
    const locked = await lockedVersions(host, id);
    out.push({ flow: { id: flow.id, name: flow.name, path: flow.path }, home: id === home?.id, lockedAt: locked?.get(screenId) ?? null });
  }
  return out;
}

/**
 * What changing a shared screen does to the features that show it, said before
 * the change: locked ones keep their version, open ones show the new one.
 * Empty when only one feature shows the screen.
 */
export function describeUsage(name: string, uses: ScreenUse[], current: number): string[] {
  if (uses.length < 2 && !uses.some((u) => u.lockedAt !== null)) return [];
  const lines = [`${name} (version ${current}) is shown by ${uses.length} feature${uses.length === 1 ? "" : "s"}:`];
  for (const u of uses) {
    const where = u.home ? "lives here" : "uses it";
    lines.push(
      u.lockedAt !== null
        ? `- ${u.flow.name} (${where}): approved and locked at version ${u.lockedAt}; it keeps that version.`
        : `- ${u.flow.name} (${where}): open; it will show the new version.`,
    );
  }
  return lines;
}

/** Adds a screen from another feature of the same project to this feature. */
export async function useScreen(host: WaveHost, flowId: string, screenId: string): Promise<HostResult<{ usage: ScreenUse[] }>> {
  if (!host.viewer || !host.store.addUse) return { ok: false, error: "This host does not share screens between features.", status: 501 };
  const flow = await host.resources.flow(flowId);
  if (!flow?.is_flow) return { ok: false, error: "That folder is not a feature.", status: 404 };
  const screen = await host.resources.screen(screenId);
  if (!screen) return { ok: false, error: "Screen not found.", status: 404 };
  const home = await host.resources.flowOf(screenId);
  if (home?.id === flowId) return { ok: false, error: `${screen.name} already lives in this feature.`, status: 409 };
  if (host.projects) {
    const [a, b] = [await host.projects.projectOf(flowId), await host.projects.projectOf(screenId)];
    if (!a || !b || a.id !== b.id) return { ok: false, error: "A feature can only use screens from its own project.", status: 409 };
  }
  if (await lockedVersions(host, flowId)) return { ok: false, error: `${flow.name} is approved and locked. Reopen it first (wave_reopen_flow).`, status: 409 };
  const r = await host.store.addUse(flowId, screenId, host.viewer.id);
  if (!r.ok) return r;
  return { ok: true, usage: await screenUsage(host, screenId) };
}

export async function unuseScreen(host: WaveHost, flowId: string, screenId: string): Promise<HostResult> {
  if (!host.store.removeUse) return { ok: false, error: "This host does not share screens between features.", status: 501 };
  if (await lockedVersions(host, flowId)) return { ok: false, error: "This feature is approved and locked. Reopen it first.", status: 409 };
  return host.store.removeUse(flowId, screenId);
}

export async function reopenFlow(host: WaveHost, flowId: string): Promise<HostResult> {
  if (!host.store.reopen) return { ok: false, error: "This host cannot reopen features.", status: 501 };
  if (!(await lockedVersions(host, flowId))) return { ok: false, error: "This feature is not approved and locked.", status: 409 };
  return host.store.reopen(flowId);
}
