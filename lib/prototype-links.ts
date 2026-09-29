import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/wave-host";

/**
 * Prototype links: a feature's prototype for somebody without an account.
 *
 * The token is the permission. Only its SHA-256 is stored, so a link is shown
 * once, when it is made; losing it means making another. Editors of the
 * feature make, list and revoke links (the table's policies say so). Opening
 * one needs no account: resolvePrototypeLink looks the hash up with the service
 * role and answers with the feature it opens, and the routes that use it serve
 * that feature's screens and nothing else.
 */

type Db = SupabaseClient;

export type PrototypeLink = {
  id: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
};

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export const prototypeLinkUrl = (token: string) => `${siteOrigin()}/play/${token}`;

export async function createPrototypeLink(
  db: Db,
  flowId: string,
  opts: { label?: string; expiresInDays?: number | null } = {},
): Promise<{ ok: true; link: PrototypeLink; url: string } | { ok: false; error: string; status: number }> {
  const { data: flow } = await db.from("nodes").select("id, kind, is_flow").eq("id", flowId).maybeSingle();
  const f = flow as { id: string; kind: string; is_flow: boolean } | null;
  if (!f) return { ok: false, error: "Not found.", status: 404 };
  if (f.kind !== "folder" || !f.is_flow) return { ok: false, error: "Only a feature (flow) has a prototype.", status: 409 };
  const days = opts.expiresInDays;
  if (days !== undefined && days !== null && (!Number.isFinite(days) || days < 1 || days > 365)) {
    return { ok: false, error: "expires_in_days must be between 1 and 365.", status: 400 };
  }
  const token = newToken();
  const id = crypto.randomUUID();
  const { data: auth } = await db.auth.getUser();
  const row = {
    id,
    flow_id: flowId,
    token_hash: await sha256(token),
    label: (opts.label ?? "").trim().slice(0, 200),
    created_by: auth.user?.id ?? null,
    expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
  };
  const { error } = await db.from("wave_prototype_links").insert(row);
  if (error) return { ok: false, error: /row-level security/i.test(error.message) ? "You cannot share this feature." : error.message, status: 403 };
  return {
    ok: true,
    link: { id, label: row.label, created_at: new Date().toISOString(), expires_at: row.expires_at, revoked_at: null },
    url: prototypeLinkUrl(token),
  };
}

export async function listPrototypeLinks(db: Db, flowId: string): Promise<PrototypeLink[]> {
  const { data } = await db
    .from("wave_prototype_links")
    .select("id, label, created_at, expires_at, revoked_at")
    .eq("flow_id", flowId)
    .order("created_at", { ascending: false });
  return (data as PrototypeLink[] | null) ?? [];
}

export async function revokePrototypeLink(db: Db, id: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const { data, error } = await db
    .from("wave_prototype_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 403 };
  return data ? { ok: true } : { ok: false, error: "Not found, or already revoked.", status: 404 };
}

/**
 * The feature a link opens, or null for a token that is unknown, revoked,
 * expired, or whose folder is no longer a feature. One answer for all of them.
 */
export async function resolvePrototypeLink(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("wave_prototype_links")
    .select("flow_id, expires_at, revoked_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  const row = data as { flow_id: string; expires_at: string | null; revoked_at: string | null } | null;
  if (!row || row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  const { data: node } = await admin.from("nodes").select("kind, is_flow").eq("id", row.flow_id).maybeSingle();
  const n = node as { kind: string; is_flow: boolean } | null;
  return n && n.kind === "folder" && n.is_flow ? row.flow_id : null;
}
