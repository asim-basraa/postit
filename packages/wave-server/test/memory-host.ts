import type { Approval, ScreenVersion, Waiver, WaveComment, WaveHost, WaveMember, WaveScreen } from "../src/host";

/**
 * A whole Wave host in memory: what a new host has to provide, in the least
 * code that works. Everyone may do everything; permissions are the host's.
 */
export function memoryHost(opts: { viewer?: boolean } = {}) {
  const files = new Map<string, { name: string; html: string; version: number; flow: string | null; json?: boolean; approved?: boolean }>();
  const flows = new Map<string, { name: string; is_flow: boolean }>();
  const blobs = new Map<string, string>();
  const versions: ScreenVersion[] = [];
  const waivers: Waiver[] = [];
  const approvals: Approval[] = [];
  const comments: (WaveComment & { screen_id: string })[] = [];

  const screenOf = (id: string): WaveScreen | null => {
    const f = files.get(id);
    return f && !f.json ? { id, name: f.name, path: `${f.flow ?? ""}/${f.name}`, content_version: f.version } : null;
  };

  const host: WaveHost = {
    viewer: opts.viewer === false ? null : { id: "u1", label: "u1@test" },
    resources: {
      async screen(id) {
        return screenOf(id);
      },
      async readCurrent(s) {
        return files.get(s.id)?.html ?? null;
      },
      async save(id, html, base) {
        const f = files.get(id);
        if (!f) return { ok: false, error: "Not found.", status: 404 };
        if (f.version !== base) return { ok: false, error: "Conflict.", status: 409 };
        f.html = html;
        f.version += 1;
        return { ok: true, version: f.version };
      },
      async flowOf(id) {
        const flow = files.get(id)?.flow;
        return flow ? host.resources.flow(flow) : null;
      },
      async flow(id) {
        const f = flows.get(id);
        return f ? { id, name: f.name, path: f.name, is_flow: f.is_flow } : null;
      },
      async setFlow(id, isFlow) {
        const f = flows.get(id);
        if (!f) return { ok: false, error: "Not found.", status: 404 };
        f.is_flow = isFlow;
        return { ok: true };
      },
      async members(flowId) {
        return [...files.entries()]
          .filter(([, f]) => f.flow === flowId)
          .map(
            ([id, f]): WaveMember => ({
              id,
              name: f.name,
              path: `${flowId}/${f.name}`,
              kind: f.json ? "tokens" : "screen",
              content_version: f.version,
              review_status: f.approved ? "approved" : null,
              approved_current: !!f.approved,
              content: f.json ? f.html : null,
            }),
          );
      },
      async canEdit() {
        return true;
      },
      async isAuthor() {
        return true;
      },
    },
    comments: {
      async list(id) {
        return comments.filter((c) => c.screen_id === id);
      },
      async statuses(ids) {
        return comments.filter((c) => ids.includes(c.screen_id) && !c.parent_id).map((c) => ({ screen_id: c.screen_id, status: c.status }));
      },
    },
    blobs: {
      async putSnapshot(id, v, html) {
        const key = `snap/${id}/${v}/${blobs.size}`;
        blobs.set(key, html);
        return key;
      },
      async read(key) {
        return blobs.get(key) ?? null;
      },
      async remove(key) {
        return blobs.delete(key);
      },
    },
    store: {
      async version(id, v) {
        return versions.find((x) => x.screen_id === id && x.content_version === v) ?? null;
      },
      async previousNodes(id, before) {
        const older = versions.filter((x) => x.screen_id === id && x.content_version < before).sort((a, b) => b.content_version - a.content_version);
        return older[0]?.nodes ?? null;
      },
      async versions(id) {
        return versions.filter((x) => x.screen_id === id).map(({ content_version, created_at, updated_at }) => ({ content_version, created_at, updated_at }));
      },
      async saveVersion(row) {
        const i = versions.findIndex((x) => x.screen_id === row.screen_id && x.content_version === row.content_version);
        const v: ScreenVersion = { ...row, id: `v${versions.length}`, created_at: row.updated_at };
        if (i >= 0) versions[i] = v;
        else versions.push(v);
        return { version: v, error: null };
      },
      async waivers() {
        return waivers;
      },
      async putWaiver(_flow, w) {
        waivers.push({ id: `w${waivers.length}`, check_key: w.key, message: w.message, note: w.note, by_email: "u1@test", created_at: "" });
        return { ok: true };
      },
      async deleteWaiver(_flow, key) {
        const i = waivers.findIndex((w) => w.check_key === key);
        if (i >= 0) waivers.splice(i, 1);
        return { ok: true };
      },
      async latestApproval(flowId) {
        return approvals.filter((a) => a.id.startsWith(flowId)).at(-1) ?? null;
      },
      async approve(flowId) {
        const members = await host.resources.members(flowId);
        if (members.some((m) => !m.approved_current)) return { ok: false, error: "Not approved.", status: 409 };
        const frozen = [];
        for (const m of members.filter((m) => m.kind === "screen")) {
          const v = await host.store.version(m.id, m.content_version);
          frozen.push({ screen_id: m.id, name: m.name, path: m.path, content_version: m.content_version, snapshot_key: v?.snapshot_key ?? null });
        }
        approvals.push({
          id: `${flowId}:${approvals.length}`,
          approved_by_email: "u2@test",
          approved_at: "2026-09-28T00:00:00Z",
          members: frozen,
          tokens: [],
          waivers: waivers.map((w) => ({ key: w.check_key, message: w.message, note: w.note, by: w.by_email })),
        });
        return { ok: true };
      },
    },
  };

  return { host, files, flows, comments };
}
