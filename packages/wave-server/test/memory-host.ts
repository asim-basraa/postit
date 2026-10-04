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
  const docs = new Map<string, { id: string; content: string; version: number }>();
  const runs: { id: string; flowId: string; at: string; feature: number | null; ran_at: string; target: string; passed: boolean; steps: number; failed: number; reportId: string | null }[] = [];
  const apis = new Map<string, { openapi: string | null; mocks: Record<string, string>; requirements: string | null }>();
  /** Screens a feature uses from another feature: [flow, screen]. */
  const uses: [string, string][] = [];

  const screenOf = (id: string): WaveScreen | null => {
    const f = files.get(id);
    return f && !f.json ? { id, name: f.name, path: `${f.flow ?? ""}/${f.name}`, content_version: f.version } : null;
  };

  const host: WaveHost = {
    viewer: opts.viewer === false ? null : { id: "u1", label: "u1@test" },
    documents: {
      async read(folderId, name, subfolder) {
        return docs.get(`${folderId}/${subfolder ? `${subfolder}/` : ""}${name}`) ?? null;
      },
      async write(folderId, name, content, _type, subfolder) {
        const key = `${folderId}/${subfolder ? `${subfolder}/` : ""}${name}`;
        const prev = docs.get(key);
        docs.set(key, { id: key, content, version: (prev?.version ?? 0) + 1 });
        return { ok: true, id: key };
      },
    },
    api: {
      async read(folderId) {
        const a = apis.get(folderId);
        if (!a) return null;
        return {
          openapi: a.openapi ? { id: `${folderId}/api/openapi`, content: a.openapi, version: 1 } : null,
          mocks: { ...a.mocks },
          requirements: a.requirements !== null ? { id: `${folderId}/api/data-requirements`, content: a.requirements } : null,
        };
      },
      async write(folderId, w) {
        const a = apis.get(folderId) ?? { openapi: null, mocks: {}, requirements: null };
        const written: string[] = [];
        if (w.openapi !== undefined) (a.openapi = w.openapi), written.push("api/openapi");
        if (w.requirements !== undefined) (a.requirements = w.requirements), written.push("api/data-requirements");
        for (const [k, v] of Object.entries(w.mocks ?? {})) {
          if (v === null) delete a.mocks[k];
          else a.mocks[k] = v;
          written.push(`api/mocks/${k}`);
        }
        apis.set(folderId, a);
        return { ok: true, written };
      },
    },
    links: {
      screen: (id) => `https://host.test/review/${id}`,
      prototype: (id) => `https://host.test/prototype/${id}`,
    },
    resources: {
      async put(folderId, name, html) {
        const existing = [...files.entries()].find(([, f]) => f.flow === folderId && f.name.toLowerCase() === name.toLowerCase());
        if (existing) {
          existing[1].html = html;
          existing[1].version += 1;
          return { ok: true, id: existing[0], version: existing[1].version, created: false };
        }
        const id = `s${files.size + 1}`;
        files.set(id, { name, html, version: 1, flow: folderId });
        return { ok: true, id, version: 1, created: true };
      },
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
        const used = new Set(uses.filter(([f]) => f === flowId).map(([, s]) => s));
        return [...files.entries()]
          .filter(([id, f]) => f.flow === flowId || (used.has(id) && !f.json))
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
      async reopen(flowId) {
        const a = await host.store.latestApproval(flowId);
        if (a) a.reopened_at = "2026-10-02T00:00:00Z";
        return { ok: true };
      },
      async uses(flowId) {
        return uses.filter(([f]) => f === flowId).map(([, s]) => s);
      },
      async usedBy(screenId) {
        return uses.filter(([, s]) => s === screenId).map(([f]) => f);
      },
      async addUse(flowId, screenId) {
        if (!uses.some(([f, s]) => f === flowId && s === screenId)) uses.push([flowId, screenId]);
        return { ok: true };
      },
      async removeUse(flowId, screenId) {
        const i = uses.findIndex(([f, s]) => f === flowId && s === screenId);
        if (i >= 0) uses.splice(i, 1);
        return { ok: true };
      },
      async recordTestRun(flowId, run) {
        const members = (await host.resources.members(flowId)).filter((m) => m.kind === "screen").map((m) => `${m.id}@${m.content_version}`);
        const page = docs.get(`${flowId}/tests/flow-feature`);
        const id = `run${runs.length + 1}`;
        runs.push({ id, flowId, at: members.join(","), feature: page ? page.version : null, ran_at: new Date(runs.length * 1000).toISOString(), ...run });
        return { ok: true, id };
      },
      async latestTestRun(flowId, target = "prototype") {
        const r = [...runs].reverse().find((x) => x.flowId === flowId && x.target === target);
        if (!r) return null;
        const members = (await host.resources.members(flowId)).filter((m) => m.kind === "screen").map((m) => `${m.id}@${m.content_version}`);
        const page = docs.get(`${flowId}/tests/flow-feature`);
        const current = r.at === members.join(",") && r.feature !== null && r.feature === (page?.version ?? null);
        return { id: r.id, ran_at: r.ran_at, run_by_email: "u1@test", target: r.target, passed: r.passed, steps: r.steps, failed: r.failed, report_id: r.reportId, current };
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
          reopened_at: null,
        });
        return { ok: true };
      },
    },
  };

  return { host, files, flows, comments, docs, apis, uses };
}
