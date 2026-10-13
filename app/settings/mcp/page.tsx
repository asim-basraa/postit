import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient, currentUser } from "@/lib/supabase/server";
import { revokeApp } from "./actions";
import { listSpaces } from "@/lib/spaces";
import { listTokens } from "@/lib/mcp/tokens";
import { Tokens } from "./Tokens";
import { AppHeader } from "@/components/AppHeader";

export const metadata = { title: "Connect to Claude" };
export const dynamic = "force-dynamic";

export default async function McpSettingsPage() {
  const user = await currentUser();
  if (!user) redirect("/login");

  // Sequential, not Promise.all. Two Supabase calls dispatched together on one
  // request's client can each decide the session needs refreshing, and refresh
  // tokens rotate: the loser goes out unauthenticated and comes back empty
  // rather than failing. An empty list of tokens is not a visible error.
  const tokens = await listTokens();
  const spaces = await listSpaces();
  // Apps connected by signing in (OAuth). Empty, rather than an error, while
  // the project's OAuth server is off.
  const { data: grants } = await (await createClient()).auth.oauth.listGrants();

  // From the request rather than from configuration. The address in these
  // snippets has to be the one you reached this page on: a misconfigured
  // NEXT_PUBLIC_SITE_URL would otherwise hand somebody a config pointing at
  // the wrong Post-it, which fails as an authentication error and reads like a
  // bad token.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host");
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const base = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_SITE_URL ?? "");

  return (
    <main className="shell">
      <AppHeader email={user.email} />

      <p className="crumb">
        <Link href="/account">Your account</Link>
      </p>

      <h1>Connect Post-it to Claude</h1>
      <p className="lede">
        Add <code>{`${base}/api/mcp`}</code> as a connector in Claude and sign in when it asks: no token
        needed. Claude then acts as you and can reach exactly what you can reach, never more.
      </p>

      <h2>Connected apps</h2>
      {grants && grants.length > 0 ? (
        <ul className="folder-contents">
          {grants.map((g) => (
            <li key={g.client.id}>
              <strong>{g.client.name || g.client.id}</strong>{" "}
              <span className="field-hint">since {new Date(g.granted_at).toLocaleDateString("en-GB")}</span>{" "}
              <form action={revokeApp} style={{ display: "inline" }}>
                <input type="hidden" name="client_id" value={g.client.id} />
                <button className="btn btn-secondary btn-small" type="submit">
                  Disconnect
                </button>
              </form>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No apps connected by signing in.</p>
      )}

      <h2>Tokens</h2>
      <p>
        For scripts, CI, or a client that cannot sign in: a token that acts as you, optionally limited to one
        space.
      </p>

      <Tokens
        initialTokens={tokens}
        spaces={spaces.map((s) => ({ id: s.id, name: s.name }))}
        endpoint={`${base}/api/mcp`}
      />
    </main>
  );
}
