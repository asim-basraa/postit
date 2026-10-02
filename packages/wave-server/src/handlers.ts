import { assignIds, slugify, zip } from "@wave/spec";
import { INSPECTOR_SOURCE, injectInspector } from "@wave/inspector";
import { PROTOTYPE_SOURCE, injectPrototype } from "@wave/prototype";
import type { WaveHost } from "./host";
import { addWaiver, approveFlow, flowHandover, flowOverview, removeWaiver } from "./flow";
import { reopenFlow } from "./shared";
import { editScreen, loadScreenView, readEditRequest } from "./view";
import { versionHtml } from "./versions";
import { draftFeatureApi, prototypeOf, publishFlow, saveFeatureApi } from "./prototype";
import { applyAnswersToDraft, catalogueOverview, dryRunFeature, parseSheet, preflightDraft, type Draft } from "./project";

/**
 * Wave's HTTP API, for a host to mount under one path of its own.
 *
 *   GET    inspector.js                  the inspector script
 *   GET    prototype.js                  the prototype runtime (MSW mock server and bindings)
 *   GET    screens/:id?v=                everything the review screen shows
 *   GET    screens/:id/frame?v=          the screen's HTML with the inspector added
 *   GET    screens/:id/prototype         the screen's current HTML with the prototype runtime added
 *   POST   flows/:id/reopen              unlock an approved feature
 *   POST   screens/:id/edit              { op: set | wrap | unwrap | upgrade, version, ... }
 *   GET    flows/:id                     the flow overview
 *   PATCH  flows/:id                     { is_flow }
 *   POST   flows/:id/approve
 *   POST   flows/:id/waivers             { key, message, note }
 *   DELETE flows/:id/waivers             { key }
 *   GET    flows/:id/handover?format=    zip (default), md or json
 *   POST   flows/:id/dry-run             { screens: [{name, html}], sheet? } the question sheet
 *   GET    flows/:id/prototype           the screens, start screen and mock API a prototype plays
 *   POST   flows/:id/api                 { generate: true, save?, overwrite? } drafts the API from the screens
 *   PUT    flows/:id/api                 { openapi?, mocks? } saves the API (JSON or YAML) and mock files
 *   POST   flows/:id/publish             { screens: [{name, html}], openapi?, mocks? } publishes a whole flow
 *   GET    projects/:id/catalogue        components, usage, tokens, assets
 *   PATCH  projects/:id                  { is_project }
 *   POST   projects/:id/assets           { name, data } (base64) uploads an asset
 *   POST   tools/preflight               { target?, name, html }
 *   POST   tools/assign-ids              { html }
 *   POST   tools/apply-answers           { target?, name, html, sheet | answers }
 *
 * Standard Request in, Response out, so it mounts in Next's app router, a
 * Hono or Express adapter, or a worker alike.
 */
export type WaveHandlerOptions = {
  /** Makes the host for the person making this request. */
  host: (request: Request) => Promise<WaveHost>;
  /** Where the handlers are mounted, used to point the frame at the inspector. Default "/api/wave". */
  basePath?: string;
  /** Changes with each deploy, so the inspector script can be cached for ever. */
  build?: string;
};

/**
 * The review frame's policy. The document is somebody's markup running
 * scripts, so it goes into an opaque origin with no allow-same-origin, and the
 * inspector talks to the host only by postMessage.
 */
const FRAME_POLICY = ["sandbox allow-scripts allow-popups", "frame-ancestors 'self'"].join("; ");

const json = (body: unknown, status = 200) => Response.json(body, { status });
const notFound = () => json({ error: "Not found." }, 404);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return null;
  }
}

export function createWaveHandlers(options: WaveHandlerOptions) {
  const base = (options.basePath ?? "/api/wave").replace(/\/$/, "");
  const build = options.build ?? "dev";

  return async function handle(request: Request, path: string[]): Promise<Response> {
    const method = request.method.toUpperCase();
    const url = new URL(request.url);
    const [kind, id, action, ...rest] = path;
    if (rest.length) return notFound();

    if ((kind === "inspector.js" || kind === "prototype.js") && !id && method === "GET") {
      return new Response(kind === "inspector.js" ? INSPECTOR_SOURCE : PROTOTYPE_SOURCE, {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "public, max-age=31536000, immutable",
          "x-content-type-options": "nosniff",
        },
      });
    }

    if (!id) return notFound();
    const host = await options.host(request);
    // Nobody signed in is told nothing, not even whether the thing exists.
    if (!host.viewer) return notFound();

    if (kind === "tools" && method === "POST" && !action) {
      const body = await readJson(request);
      if (!body) return json({ error: "Invalid JSON." }, 400);
      const html = typeof body.html === "string" ? body.html : null;
      if (html === null) return json({ error: "html is required." }, 400);
      const draft: Draft = { name: typeof body.name === "string" ? body.name : "screen", html };
      const target = typeof body.target === "string" ? body.target : null;
      if (id === "assign-ids") return json(assignIds(html));
      if (id === "preflight") return json(await preflightDraft(host, target, draft));
      if (id === "apply-answers") {
        const answers =
          typeof body.sheet === "string"
            ? parseSheet(body.sheet)
            : new Map(Object.entries((body.answers ?? {}) as Record<string, string>).filter(([, v]) => typeof v === "string"));
        const r = await applyAnswersToDraft(host, target, draft, answers);
        return json({ html: r.html, applied: r.applied, skipped: r.skipped, counts: r.report.counts });
      }
      return notFound();
    }

    if (kind === "projects") {
      if (!host.projects) return notFound();
      if (action === "catalogue" && method === "GET") {
        const overview = await catalogueOverview(host, id);
        return overview ? json(overview) : notFound();
      }
      if (!action && method === "PATCH") {
        const body = await readJson(request);
        if (!body || typeof body.is_project !== "boolean") return json({ error: "is_project must be true or false." }, 400);
        const r = await host.projects.setProject(id, body.is_project);
        return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
      }
      if (action === "assets" && method === "POST") {
        if (!host.assets) return notFound();
        const body = await readJson(request);
        if (!body || typeof body.data !== "string") return json({ error: "data (base64) is required." }, 400);
        let bytes: Uint8Array;
        try {
          bytes = Uint8Array.from(atob(body.data.replace(/^data:[^,]*,/, "")), (c) => c.charCodeAt(0));
        } catch {
          return json({ error: "data is not valid base64." }, 400);
        }
        const r = await host.assets.put(id, typeof body.name === "string" ? body.name : "asset", bytes);
        return r.ok ? json({ asset: r.asset, existing: r.existing }, r.existing ? 200 : 201) : json({ error: r.error }, r.status);
      }
      return notFound();
    }

    const v = Number(url.searchParams.get("v"));
    const version = Number.isInteger(v) && v > 0 ? v : null;

    if (kind === "screens") {
      if (!action && method === "GET") {
        const view = await loadScreenView(host, id, version);
        return view ? json(view) : notFound();
      }
      if (action === "frame" && method === "GET") {
        const screen = await host.resources.screen(id);
        if (!screen) return new Response("Not found.", { status: 404 });
        const html = await versionHtml(host, screen, version ?? screen.content_version);
        if (html === null) return new Response("Not found.", { status: 404 });
        return new Response(injectInspector(html, `${base}/inspector.js?b=${encodeURIComponent(build)}`), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": FRAME_POLICY,
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            "cache-control": "private, no-store",
          },
        });
      }
      if (action === "prototype" && method === "GET") {
        const screen = await host.resources.screen(id);
        // ?v= plays an older version: a locked feature's approved one.
        const html = screen ? await versionHtml(host, screen, version ?? screen.content_version) : null;
        if (html === null) return new Response("Not found.", { status: 404 });
        return new Response(injectPrototype(html, `${base}/prototype.js?b=${encodeURIComponent(build)}`), {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "content-security-policy": FRAME_POLICY,
            "x-content-type-options": "nosniff",
            "referrer-policy": "no-referrer",
            "cache-control": "private, no-store",
          },
        });
      }
      if (action === "edit" && method === "POST") {
        const req = readEditRequest(await readJson(request));
        if ("error" in req) return json({ error: req.error }, 400);
        const result = await editScreen(host, id, req);
        return json(result, result.ok ? 200 : result.status);
      }
      return notFound();
    }

    if (kind === "flows") {
      if (!action && method === "GET") {
        const overview = await flowOverview(host, id);
        return overview ? json(overview) : notFound();
      }
      if (!action && method === "PATCH") {
        const body = await readJson(request);
        if (!body) return json({ error: "Invalid JSON." }, 400);
        if (typeof body.is_flow !== "boolean") return json({ error: "is_flow must be true or false." }, 400);
        const r = await host.resources.setFlow(id, body.is_flow);
        return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
      }
      if (action === "reopen" && method === "POST") {
        const r = await reopenFlow(host, id);
        return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
      }
      if (action === "prototype" && method === "GET") {
        const view = await prototypeOf(host, id);
        return view ? json(view) : notFound();
      }
      if (action === "api" && method === "POST") {
        const body = await readJson(request);
        if (!body || body.generate !== true) return json({ error: "Send { generate: true }." }, 400);
        const r = await draftFeatureApi(host, id, { save: body.save === true, overwrite: body.overwrite === true });
        return r.ok ? json({ openapi: r.openapi, requirements: r.requirements, saved: r.saved }) : json({ error: r.error }, r.status);
      }
      if (action === "api" && method === "PUT") {
        const body = await readJson(request);
        if (!body) return json({ error: "Invalid JSON." }, 400);
        const openapi = typeof body.openapi === "string" ? body.openapi : body.openapi && typeof body.openapi === "object" ? JSON.stringify(body.openapi) : null;
        const mocks = body.mocks && typeof body.mocks === "object" ? (body.mocks as Record<string, unknown>) : null;
        const r = await saveFeatureApi(host, id, { openapi, mocks });
        return r.ok ? json({ written: r.written, problems: r.problems }) : json({ error: r.error }, r.status);
      }
      if (action === "publish" && method === "POST") {
        const body = await readJson(request);
        const list = Array.isArray(body?.screens) ? (body!.screens as unknown[]) : null;
        if (!list) return json({ error: "screens: [{name, html}] is required." }, 400);
        const drafts: Draft[] = [];
        for (const x of list) {
          const o = x as Record<string, unknown>;
          if (typeof o?.html !== "string" || typeof o?.name !== "string") return json({ error: "Every screen needs a name and html." }, 400);
          drafts.push({ name: o.name, html: o.html });
        }
        const openapi = typeof body!.openapi === "string" ? body!.openapi : body!.openapi && typeof body!.openapi === "object" ? JSON.stringify(body!.openapi) : null;
        const mocks = body!.mocks && typeof body!.mocks === "object" ? (body!.mocks as Record<string, unknown>) : null;
        const r = await publishFlow(host, id, { screens: drafts, openapi, mocks });
        return r.ok ? json({ screens: r.screens, api: r.api }) : json({ error: r.error }, r.status);
      }
      if (action === "approve" && method === "POST") {
        const r = await approveFlow(host, id);
        return r.ok ? json({ ok: true }) : json({ error: r.error }, r.status);
      }
      if (action === "waivers" && (method === "POST" || method === "DELETE")) {
        const body = await readJson(request);
        if (!body || typeof body.key !== "string") return json({ error: "key is required." }, 400);
        if (method === "DELETE") {
          const r = await removeWaiver(host, id, body.key);
          return r.ok ? new Response(null, { status: 204 }) : json({ error: r.error }, r.status);
        }
        if (typeof body.note !== "string") return json({ error: "key and note are required." }, 400);
        const r = await addWaiver(host, id, body.key, String(body.message ?? ""), body.note);
        return r.ok ? json({ ok: true }, 201) : json({ error: r.error }, r.status);
      }
      if (action === "dry-run" && method === "POST") {
        const body = await readJson(request);
        const list = Array.isArray(body?.screens) ? (body!.screens as unknown[]) : null;
        if (!list || !list.length) return json({ error: "screens: [{name, html}] is required." }, 400);
        const drafts: Draft[] = [];
        for (const x of list) {
          const o = x as Record<string, unknown>;
          if (typeof o?.html !== "string") return json({ error: "Every screen needs html." }, 400);
          drafts.push({ name: typeof o.name === "string" ? o.name : "screen", html: o.html });
        }
        const r = await dryRunFeature(host, id, drafts, typeof body!.sheet === "string" ? body!.sheet : null);
        return "error" in r ? json({ error: r.error }, 404) : json(r);
      }
      if (action === "handover" && method === "GET") {
        const result = await flowHandover(host, id);
        if (!result.ok) {
          return json({ error: result.error, blockers: result.blockers ?? [] }, result.error === "Not found." ? 404 : 409);
        }
        const format = url.searchParams.get("format");
        if (format === "md") {
          return new Response(result.handover.markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
        }
        if (format === "json") return json(result.handover.json);
        const folder = slugify(result.flow.name) || "flow";
        const bytes = zip(result.handover.files.map((f) => ({ ...f, name: `${folder}/${f.name}` })));
        return new Response(bytes as unknown as BodyInit, {
          headers: {
            "content-type": "application/zip",
            "content-disposition": `attachment; filename="${folder}-handover.zip"`,
            "cache-control": "private, no-store",
          },
        });
      }
      return notFound();
    }

    return notFound();
  };
}
