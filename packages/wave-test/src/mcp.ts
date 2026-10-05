/**
 * Calls one of the host's Wave tools through an upload link (Post-it's
 * wave_upload_link), which carries its own short-lived credential, or a server
 * and token from the environment. Nothing is copied through a conversation.
 */
export async function callTool(opts: { link?: string; server?: string; token?: string }, tool: string, args: Record<string, unknown>): Promise<string> {
  const server = opts.link ?? opts.server ?? process.env.POSTIT_MCP_URL;
  const token = opts.link ? null : opts.token ?? process.env.POSTIT_TOKEN;
  if (!server || (!opts.link && !token)) throw new Error("Give --link (from Post-it's wave_upload_link), or set POSTIT_MCP_URL and POSTIT_TOKEN.");
  const res = await fetch(server, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: tool, arguments: args } }),
  });
  const body = (await res.json().catch(() => null)) as { result?: { content?: { type: string; text?: string }[]; isError?: boolean }; error?: { message: string } } | null;
  if (!res.ok || !body || body.error) throw new Error(`The host answered ${res.status}: ${body?.error?.message ?? "no JSON"}`);
  const text = (body.result?.content ?? []).map((c) => c.text ?? "").join("\n");
  if (body.result?.isError) throw new Error(text || `${tool} failed.`);
  return text;
}
