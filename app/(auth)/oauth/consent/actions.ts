"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The reader's answer to an app asking for access to their Post-it.
 *
 * Supabase Auth runs the OAuth server; this only records the decision, on the
 * reader's own session, and sends the browser back to the app with the code
 * (or the refusal) that Supabase hands us. The id is checked by Supabase
 * against the signed-in user, so a forged one is refused there.
 */
export async function decide(formData: FormData): Promise<void> {
  const authorizationId = String(formData.get("authorization_id") ?? "");
  const allow = formData.get("decision") === "allow";
  if (!authorizationId) redirect("/spaces");

  const supabase = await createClient();
  const { data, error } = allow
    ? await supabase.auth.oauth.approveAuthorization(authorizationId, { skipBrowserRedirect: true })
    : await supabase.auth.oauth.denyAuthorization(authorizationId, { skipBrowserRedirect: true });

  if (error || !data?.redirect_url) {
    redirect(`/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}&failed=1`);
  }
  redirect(data.redirect_url);
}
