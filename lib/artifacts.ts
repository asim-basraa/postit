import { createAdminClient, createClient } from "@/lib/supabase/server";

/**
 * Where an HTML page's bytes live, and what address they answer at.
 *
 * A mockup exists to be sent to somebody who has no account here, so its bytes
 * are a file with a public address rather than a column protected by the same
 * rule as everything else. The token in that address is the permission. This is
 * the one place in the product where content is readable without a grant, and
 * it is deliberate: see the migration for the whole argument.
 *
 * The bucket is private. Nothing outside this module touches it, and what it
 * serves goes out through one route, under a policy that keeps somebody else's
 * markup from having any authority over this domain.
 */
export const BUCKET = "artifacts";

/** What the browser is told to call it, which is the only type we store. */
const HTML = "text/html; charset=utf-8";

export type Artifact = { key: string; token: string };

/**
 * Writes a page's bytes and answers where they went.
 *
 * The key is a random name rather than the node's id, so the public address
 * gives away nothing about what else is in the space, and so rotating the
 * token can move the file too if it ever needs to.
 */
export async function putArtifact(content: string): Promise<Artifact | null> {
  const key = `${crypto.randomUUID()}.html`;

  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(key, new Blob([content], { type: HTML }), {
      contentType: HTML,
      upsert: false,
    });

  if (error) {
    console.error("artifact upload failed: %s", error.message);
    return null;
  }

  return { key, token: await mintToken() };
}

/**
 * Keeps a copy of one version of a page's bytes.
 *
 * The page's own file is overwritten on every save, so without this an HTML
 * page had no history at all: comparing versions, showing a comment where it was
 * made, and freezing what an approval approved all need the old bytes. Private
 * like everything else in the bucket, and served only after a can_read check.
 */
export async function putSnapshot(
  nodeId: string,
  version: number,
  content: string,
): Promise<string | null> {
  const key = `snapshots/${nodeId}/${version}-${crypto.randomUUID()}.html`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(key, new Blob([content], { type: HTML }), {
      contentType: HTML,
      upsert: false,
    });
  if (error) {
    console.error("snapshot upload failed: %s", error.message);
    return null;
  }
  return key;
}

/** Replaces the bytes at a key, for a save or an append. */
export async function replaceArtifact(
  key: string,
  content: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(key, new Blob([content], { type: HTML }), {
      contentType: HTML,
      upsert: true,
    });

  if (error) console.error("artifact replace failed: %s", error.message);
  return !error;
}

/**
 * The bytes at a key, or null.
 *
 * No access decision here: every caller has already made one. The public route
 * has a token, and the application has a node it has already read.
 */
export async function readArtifact(key: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).download(key);

  if (error || !data) {
    console.error("artifact read failed: %s", error?.message ?? "no data");
    return null;
  }
  return data.text();
}

/**
 * Removes bytes whose page has gone.
 *
 * Best effort, and the failure is worth being honest about: a page deleted in
 * the database with its object left behind is a file still answering at its
 * address. That is why deleting says so rather than swallowing it, and why the
 * key is random — an orphan nobody holds the link to is unreachable in
 * practice, but it is not nothing.
 */
export async function removeArtifact(key: string): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin.storage.from(BUCKET).remove([key]);
  if (error) console.error("artifact remove failed: %s", error.message);
  return !error;
}

/** A fresh address for a page, minted by the database. */
export async function mintToken(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mint_artifact_token");
  if (error || typeof data !== "string") {
    // Never a reason to fail a write: the id is random either way.
    return crypto.randomUUID().replace(/-/g, "");
  }
  return data;
}

/** What an address points at, for anybody holding it. */
export async function artifactForToken(
  token: string,
): Promise<{ key: string; name: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("artifact_for_token", { p_token: token })
    .maybeSingle<{ artifact_key: string; name: string }>();

  if (error || !data) return null;
  return { key: data.artifact_key, name: data.name };
}
