import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { decide } from "./actions";

export const metadata = { title: "Allow access to Post-it" };
export const dynamic = "force-dynamic";

/**
 * Where an app such as Claude asks for access to somebody's Post-it.
 *
 * Supabase Auth is the OAuth server: it registers the app, checks its
 * redirect address and PKCE, and issues the tokens. It sends the reader here,
 * with an authorization id, to say yes or no. What the app gets is what the
 * reader has: the same row-level rules decide what it can read and change.
 */
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string; failed?: string }>;
}) {
  const { authorization_id: authorizationId, failed } = await searchParams;

  if (!authorizationId) {
    return (
      <>
        <h1>Nothing to allow</h1>
        <p>This page is opened by an app asking for access. Start again from the app.</p>
      </>
    );
  }

  const here = `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !data) {
    return (
      <>
        <h1>This request has expired</h1>
        <p>
          The app&apos;s request could not be found, or it has already been answered. Go back to the app and
          connect again.
        </p>
      </>
    );
  }

  // Asked and answered before: Supabase sends the app on without asking again.
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  const scopes = data.scope.split(/\s+/).filter(Boolean);

  return (
    <>
      <h1>Allow {data.client.name || "this app"} to use your Post-it?</h1>

      {failed ? (
        <p className="msg msg-error" role="alert">
          That did not go through. Try again, or start again from the app.
        </p>
      ) : null}

      <p>
        <strong>{data.client.name || "An app"}</strong>
        {data.client.uri ? <> ({data.client.uri})</> : null} is asking to act as{" "}
        <strong>{data.user.email}</strong>. It will be able to read, write and comment on everything you can, and
        nothing you cannot.
      </p>
      {scopes.length ? <p className="field-hint">Requested: {scopes.join(", ")}</p> : null}
      <p className="field-hint">
        It will return to {data.redirect_uri}. You can disconnect it at any time from Settings, MCP.
      </p>

      <form action={decide} className="auth-form">
        <input type="hidden" name="authorization_id" value={data.authorization_id} />
        <button className="btn" type="submit" name="decision" value="allow">
          Allow
        </button>
        <button className="btn btn-secondary" type="submit" name="decision" value="deny">
          Deny
        </button>
      </form>
    </>
  );
}
