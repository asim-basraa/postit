import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { editMockup, type EditRequest } from "@/lib/mockup-view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Writes spec attributes into a mockup, as a new version.
 *
 *   { op: "set", version, pid, set: { bind: "user/firstName", sample: null } }
 *   { op: "wrap", version, pid, start, end, attrs: { content: "dynamic", bind: "..." } }
 *   { op: "unwrap", version, pid }
 */
export async function POST(request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const version = Number(body.version);
  const pid = typeof body.pid === "string" ? body.pid : "";
  if (!Number.isInteger(version) || !pid) {
    return Response.json({ error: "version and pid are required." }, { status: 400 });
  }

  const strings = (v: unknown, allowNull: boolean) => {
    if (!v || typeof v !== "object") return null;
    const out: Record<string, string | null> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val.slice(0, 2000);
      else if (val === null && allowNull) out[k] = null;
      else return null;
    }
    return out;
  };

  let req: EditRequest;
  if (body.op === "set") {
    const set = strings(body.set, true);
    if (!set) return Response.json({ error: "set must map attribute names to strings or null." }, { status: 400 });
    req = { op: "set", version, pid, set };
  } else if (body.op === "wrap") {
    const attrs = strings(body.attrs, false) as Record<string, string> | null;
    const start = Number(body.start);
    const end = Number(body.end);
    if (!attrs || !Number.isInteger(start) || !Number.isInteger(end)) {
      return Response.json({ error: "wrap needs start, end and attrs." }, { status: 400 });
    }
    req = { op: "wrap", version, pid, start, end, attrs };
  } else if (body.op === "unwrap") {
    req = { op: "unwrap", version, pid };
  } else {
    return Response.json({ error: "op must be set, wrap or unwrap." }, { status: 400 });
  }

  const result = await editMockup(id, req);
  return result.ok
    ? Response.json(result)
    : Response.json(result, { status: result.status });
}
