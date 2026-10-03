import type { User } from "@supabase/supabase-js";

/**
 * The user middleware has just verified, handed to the rest of the request.
 *
 * Middleware already asks Supabase Auth who the caller is on every request (it
 * has to, to refresh the session). Asking again in the page doubled the round
 * trips to Auth for no new answer. Instead middleware writes what it learned
 * into a request header, signed, and `currentUser` reads it back.
 *
 * The header is internal: middleware always deletes whatever a client sent
 * under this name, the signature uses a server-only secret, and a stamp older
 * than a minute is refused. Anything that does not verify is treated as absent,
 * and the caller falls back to asking Auth itself, so a forged or missing
 * header can only ever cost a round trip, never grant an identity.
 *
 * Web Crypto only, because middleware runs in the edge runtime.
 */
export const REQUEST_USER_HEADER = "x-postit-user";

const MAX_AGE_MS = 60_000;

type Envelope = { u: Partial<User> | null; t: number };

function secret(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return key ? `postit-request-user:${key}` : null;
}

let keyPromise: Promise<CryptoKey> | null = null;
let keySecret: string | null = null;
function hmacKey(value: string): Promise<CryptoKey> {
  if (!keyPromise || keySecret !== value) {
    keySecret = value;
    keyPromise = crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(value),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign", "verify"],
    );
  }
  return keyPromise;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Only what pages read from a user. The whole object, with every identity and
 * all its metadata, can outgrow what a request header may carry.
 */
function slim(user: User): Partial<User> {
  return {
    id: user.id,
    aud: user.aud,
    role: user.role,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
    app_metadata: user.app_metadata,
    user_metadata: user.user_metadata,
  };
}

/** The header value for this user (or for nobody), or null if it cannot be signed. */
export async function signRequestUser(
  user: User | null,
  now = Date.now(),
): Promise<string | null> {
  const s = secret();
  if (!s) return null;
  const envelope: Envelope = { u: user ? slim(user) : null, t: now };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(envelope)));
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKey(s), new TextEncoder().encode(body)),
  );
  return `${body}.${toBase64Url(sig)}`;
}

/**
 * The user middleware verified, `null` for a request it verified as signed out,
 * or `undefined` when there is nothing trustworthy to go on.
 */
export async function readRequestUser(
  value: string | null | undefined,
  now = Date.now(),
): Promise<User | null | undefined> {
  const s = secret();
  if (!s || !value) return undefined;
  const dot = value.indexOf(".");
  if (dot <= 0) return undefined;
  const body = value.slice(0, dot);
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(s),
      fromBase64Url(value.slice(dot + 1)) as BufferSource,
      new TextEncoder().encode(body),
    );
    if (!ok) return undefined;
    const envelope = JSON.parse(new TextDecoder().decode(fromBase64Url(body))) as Envelope;
    if (typeof envelope.t !== "number" || Math.abs(now - envelope.t) > MAX_AGE_MS) {
      return undefined;
    }
    return (envelope.u as User | null) ?? null;
  } catch {
    return undefined;
  }
}
