import type { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { assetKey, readAssetObject } from "@/lib/artifacts";

/**
 * A project's asset, served publicly: /a/<project>/<sha-256>.<ext>.
 *
 * Public on purpose, like the mockups that use it: a review frame, a public
 * share link and a handover all load it without an account. The address is
 * the file's hash, so it never changes and can be cached for ever.
 *
 * Nothing served here can act on this domain. Only images and fonts are ever
 * stored, and every response carries a sandbox policy, so an SVG opened
 * directly cannot run a script here.
 */
const POLICY = "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; font-src 'self'; sandbox";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ project: string; file: string }> }) {
  const { project, file } = await params;
  const m = /^([0-9a-f]{64})\.([a-z0-9]{2,5})$/.exec(file);
  if (!/^[0-9a-f-]{36}$/.test(project) || !m) return new Response("Not found.", { status: 404 });
  const [, hash, ext] = m;

  const admin = createAdminClient();
  const { data } = await admin
    .from("wave_assets")
    .select("mime, ext")
    .eq("project_id", project)
    .eq("hash", hash)
    .maybeSingle<{ mime: string; ext: string }>();
  if (!data || data.ext !== ext) return new Response("Not found.", { status: 404 });

  const bytes = await readAssetObject(assetKey(project, hash, ext));
  if (!bytes) return new Response("Not found.", { status: 404 });

  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": data.mime,
      "cache-control": "public, max-age=31536000, immutable",
      "content-security-policy": POLICY,
      "x-content-type-options": "nosniff",
      // Fonts are fetched with CORS, and the review frame is an opaque origin.
      "access-control-allow-origin": "*",
      "cross-origin-resource-policy": "cross-origin",
    },
  });
}
