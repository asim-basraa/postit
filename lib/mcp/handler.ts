import type { NextRequest } from "next/server";
import { resolveSession } from "@/lib/mcp/session";
import { TOOLS } from "@/lib/mcp/tools";
import {
  allowToken,
  failuresSpent,
  recordFailure,
  callerAddress,
} from "@/lib/mcp/rate-limit";

/**
 * The MCP endpoint.
 *
 * Speaks JSON-RPC 2.0 over a single POST, which is the stateless shape of MCP's
 * streamable HTTP transport. Written directly rather than through the SDK
 * because the SDK expects Node's req/res and this is a Web Request handler; the
 * subset a stateless server needs is small enough that adapting it would be
 * more machinery than implementing it.
 *
 * It holds no session state of its own. Every request carries its token, and
 * the token is what establishes who is asking, so there is nothing to expire,
 * pin to an instance, or get out of step.
 */

const PROTOCOL_VERSION = "2025-06-18";

type JsonRpcRequest = {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
};

/**
 * One request, whatever route carried it.
 *
 * The token arrives either in an Authorization header or in the path, and
 * nothing after this line cares which: both are the same bearer credential and
 * are answered identically, including the refusals. Two copies of this would be
 * two places for the rules to drift.
 */
export async function handleMcp(
  request: NextRequest,
  token: string | null,
): Promise<Response> {
  const address = callerAddress(request);

  if (!token) {
    recordFailure(address);
    return unauthorized();
  }

  // Asked before the token is looked at, so a flood of guesses cannot be
  // turned into a flood of database round trips. It counts refusals only: a
  // token that works is throttled by its own bucket below, which is generous
  // because using a token is the point.
  if (failuresSpent(address)) return tooMany();

  const session = await resolveSession(token);
  if (!session) {
    recordFailure(address);
    return unauthorized();
  }

  if (!allowToken(session.tokenId)) return tooMany();

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, "Parse error");
  }

  const { id = null, method } = body;

  // Notifications carry no id and expect no response. `initialized` is the one
  // a client sends after the handshake.
  if (id === null && typeof method === "string" && method.startsWith("notifications/")) {
    return new Response(null, { status: 202 });
  }

  switch (method) {
    case "initialize":
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "postit", version: "1.0.0" },
        instructions: SERVER_INSTRUCTIONS,
      });

    case "ping":
      return rpcResult(id, {});

    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      });

    case "tools/call": {
      const name = body.params?.name;
      const tool = TOOLS.find((t) => t.name === name);

      if (!tool) {
        return rpcError(id, -32602, `No such tool: ${String(name)}`);
      }

      const args = (body.params?.arguments ?? {}) as Record<string, unknown>;

      try {
        const result = await tool.run(session, args);

        // A tool that refuses reports it through isError rather than a
        // JSON-RPC error: the call itself succeeded, and the client should see
        // the reason as content it can act on.
        return "error" in result
          ? rpcResult(id, {
              content: [{ type: "text", text: result.error }],
              isError: true,
            })
          : rpcResult(id, {
              content: [{ type: "text", text: result.text }],
            });
      } catch {
        // Deliberately opaque. An exception here could carry a database message
        // naming a table or a constraint, which is not the caller's business.
        return rpcResult(id, {
          content: [{ type: "text", text: "That call failed." }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${String(method)}`);
  }
}

function rpcResult(id: string | number | null, result: unknown): Response {
  return Response.json({ jsonrpc: "2.0", id, result });
}

function rpcError(
  id: string | number | null,
  code: number,
  message: string,
): Response {
  return Response.json({ jsonrpc: "2.0", id, error: { code, message } });
}

/**
 * One answer for no token, a wrong token, a revoked token and an expired one.
 *
 * Distinguishing them would tell an attacker which of their guesses was once a
 * real token, which is exactly the signal worth withholding.
 */
function unauthorized(): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
    { status: 401, headers: { "www-authenticate": "Bearer" } },
  );
}

function tooMany(): Response {
  return Response.json(
    { jsonrpc: "2.0", id: null, error: { code: -32002, message: "Too many requests" } },
    { status: 429, headers: { "retry-after": "60" } },
  );
}

/**
 * What a GET gets.
 *
 * Some clients probe for a server-sent event stream. This server is stateless
 * and pushes nothing, so it says so plainly rather than leaving a client
 * waiting on a stream that will never carry anything.
 */
export function probeAnswer(): Response {
  return new Response("This MCP endpoint accepts POST only.", {
    status: 405,
    headers: { allow: "POST" },
  });
}

/**
 * What every connected client is told on connecting. Claude Design reads it,
 * which is how it knows to follow Wave Design without anyone pasting anything.
 */
export const SERVER_INSTRUCTIONS = [
  "Post-it keeps a team's documents, and reviews HTML mockups with Wave.",
  "",
  "Before you create, change or upload any HTML mockup, screen or design-system component in Post-it: load the Wave Design skill (get_skill with space wave, path skills/designer/wave-design) and follow it exactly. Wave's skills are in the Wave space, which only its members can read; if you cannot read it, say so and stop. It asks which project and feature the work is for, and says which of the four Wave skills comes next:",
  "- skills/designer/wave-brief writes the project's DESIGN.md (the defaults every element inherits), first, once per project.",
  "- skills/designer/wave-design-system builds the tokens and component specimens from it; the designer approves them before any screen is uploaded.",
  "- skills/designer/wave-feature writes the feature's FEATURE.md from the designer's prompt, then generates the screens with their data-wave-* attributes in place.",
  "- skills/engineering/wave-figma is where to start when the design is in Figma: it runs three stages (wave-figma-brief, wave-figma-design-system, wave-figma-feature) as interviews, runs every command itself, and refuses a file Wave cannot convert exactly with a readiness report for the designer.",
  "- skills/designer/wave-review asks only the questions still open (grouped), runs the dry run, preflights, uploads (wave_publish_flow) and makes the prototype.",
  "- \"Wave dry run\" means wave_dry_run: a question sheet for product, nothing uploaded.",
  "- Never upload a screen that has not passed preflight_html, and always show the designer the result and get their confirmation first.",
  "- After uploading, give the designer the Post-it link and ask them to compare it with the original before asking for review.",
  "",
  "To build an approved flow in code, load the Wave Build skill (skills/engineering/wave-build).",
].join("\n");
