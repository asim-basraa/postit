"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Disconnects an app the user allowed: its tokens stop working. */
export async function revokeApp(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") ?? "");
  if (!clientId) return;
  const supabase = await createClient();
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId });
  if (error) console.error("revoking OAuth grant failed: %s", error.message);
  revalidatePath("/settings/mcp");
}
