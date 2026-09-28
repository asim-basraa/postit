import type { SupabaseClient } from "@supabase/supabase-js";
import type { Approval, HostResult, NewScreenVersion, ScreenVersion, SpecNodes, VersionListing, Waiver, WaveStore } from "./types";

/**
 * Wave's store on Supabase: the wave_* tables and functions from
 * sql/schema.sql, read and written with the client of the person asking, so
 * row level security decides every answer through the host's wave_can_*.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

const VERSION_SELECT = "id, screen_id, content_version, snapshot_key, screen, nodes, findings, extras, created_at, updated_at";

function refused(message: string, fallback: string): HostResult {
  if (/not found/i.test(message)) return { ok: false, error: "Not found.", status: 404 };
  if (/row-level/i.test(message)) return { ok: false, error: fallback, status: 403 };
  return { ok: false, error: message, status: 409 };
}

export function supabaseWaveStore(db: Db): WaveStore {
  return {
    async version(screenId, version) {
      const { data } = await db
        .from("wave_screen_versions")
        .select(VERSION_SELECT)
        .eq("screen_id", screenId)
        .eq("content_version", version)
        .maybeSingle();
      return (data as ScreenVersion | null) ?? null;
    },

    async previousNodes(screenId, before) {
      const { data } = await db
        .from("wave_screen_versions")
        .select("nodes")
        .eq("screen_id", screenId)
        .lt("content_version", before)
        .order("content_version", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as { nodes: SpecNodes } | null)?.nodes ?? null;
    },

    async versions(screenId) {
      const { data } = await db
        .from("wave_screen_versions")
        .select("content_version, created_at, updated_at")
        .eq("screen_id", screenId)
        .order("content_version", { ascending: false });
      return (data as VersionListing[] | null) ?? [];
    },

    async saveVersion(row: NewScreenVersion) {
      const { data, error } = await db
        .from("wave_screen_versions")
        .upsert(row, { onConflict: "screen_id,content_version" })
        .select(VERSION_SELECT)
        .maybeSingle();
      return { version: (data as ScreenVersion | null) ?? null, error: error?.message ?? null };
    },

    async waivers(flowId) {
      const { data } = await db.rpc("wave_flow_waivers", { p_flow_id: flowId });
      return (data as Waiver[] | null) ?? [];
    },

    async putWaiver(flowId, w) {
      const { data: auth } = await db.auth.getUser();
      if (!auth.user) return { ok: false, error: "Not found.", status: 404 };
      const { error } = await db
        .from("wave_waivers")
        .upsert(
          { flow_id: flowId, check_key: w.key, message: w.message, note: w.note, created_by: auth.user.id },
          { onConflict: "flow_id,check_key" },
        );
      return error ? refused(error.message, "Only somebody who can edit this flow can waive a check.") : { ok: true };
    },

    async deleteWaiver(flowId, key) {
      const { error } = await db.from("wave_waivers").delete().eq("flow_id", flowId).eq("check_key", key);
      return error ? refused(error.message, "Only somebody who can edit this flow can withdraw a waiver.") : { ok: true };
    },

    async latestApproval(flowId) {
      const { data } = await db.rpc("wave_flow_approval", { p_flow_id: flowId }).maybeSingle();
      return (data as Approval | null) ?? null;
    },

    async approve(flowId) {
      const { error } = await db.rpc("wave_approve_flow", { p_flow_id: flowId });
      return error ? refused(error.message, error.message) : { ok: true };
    },
  };
}
