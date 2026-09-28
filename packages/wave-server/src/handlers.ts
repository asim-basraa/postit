import { slugify, zip } from "@wave/spec";
import { INSPECTOR_SOURCE, injectInspector } from "@wave/inspector";
import type { WaveHost } from "./host";
import { addWaiver, approveFlow, flowHandover, flowOverview, removeWaiver } from "./flow";
import { editScreen, loadScreenView, readEditRequest } from "./view";
import { versionHtml } from "./versions";

/**
 * Wave's HTTP API, for a host to mount under one path of its own.
 *
 *   GET    inspector.js                  the inspector script
 *   GET    screens/:id?v=                everything the review screen shows
 *   GET    screens/:id/frame?v=          the screen's HTML with the inspector added
 *   POST   screens/:id/edit              { op: set | wrap | unwrap | upgrade, version, ... }
 *   GET    flows/:id                     the flow overview
 *   PATCH  flows/:id                     { is_flow }
 *   POST   flows/:id/approve
 *   POST   flows/:id/waivers             { key, message, note }
 *   DELETE flows/:id/waivers             { key }
 *   GET    flows/:id/handover?format=    zip (default), md or json
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

    if (kind === "inspector.js" && !id && method === "GET") {
      return new Response(INSPECTOR_SOURCE, {
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
