import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { registerAndConfirm, createSpace } from "./auth";

const RUN = Date.now().toString(36);
const OWNER = `mcp-owner-${RUN}@maqsoodlabs.com`;
const OTHER = `mcp-other-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `connected-${RUN}`;

const SECRET_WORD = `pineapple${RUN}`;

const SKILL = `---
name: Todo List
description: Read and update the reader's todos
---

# Todo List

Ask for open items, then mark them done.
`;

test.describe.configure({ mode: "serial" });

test.describe("MCP server", () => {
  let ownerCtx: BrowserContext;
  let otherCtx: BrowserContext;
  let owner: Page;
  let other: Page;
  let api: APIRequestContext;
  let spaceId: string;
  let token: string;
  let otherToken: string;
  const id: Record<string, string> = {};

  /** One JSON-RPC call, as an MCP client would make it. */
  async function rpc(
    method: string,
    params: Record<string, unknown> | undefined,
    bearer: string | null = token,
  ) {
    const res = await api.post("/api/mcp", {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
    return { status: res.status(), body: await res.json().catch(() => ({})) };
  }

  async function call(name: string, args: Record<string, unknown>, bearer = token) {
    const { body } = await rpc("tools/call", { name, arguments: args }, bearer);
    return {
      text: body?.result?.content?.[0]?.text as string | undefined,
      isError: body?.result?.isError === true,
    };
  }

  test.beforeAll(async ({ browser }) => {
    // Read from the environment rather than the baseURL fixture: fixtures
    // scoped to a test are not available inside beforeAll.
    api = await playwrightRequest.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    });

    otherCtx = await browser.newContext();
    other = await otherCtx.newPage();
    await registerAndConfirm(other, OTHER, PASSWORD);

    ownerCtx = await browser.newContext();
    owner = await ownerCtx.newPage();
    await registerAndConfirm(owner, OWNER, PASSWORD);
    await createSpace(owner, "Connected Space", SPACE);

    spaceId = (await owner
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    const pages: [string, string, "article" | "skill"][] = [
      ["Roadmap", `# Roadmap\n\nShip the thing. Mentions ${SECRET_WORD}.\n`, "article"],
      ["Todo List", SKILL, "skill"],
    ];

    for (const [name, body, contentType] of pages) {
      const created = await owner.request.post("/api/v1/nodes", {
        data: { space_id: spaceId, kind: "file", name, content_type: contentType },
      });
      expect(created.status(), await created.text()).toBe(201);
      id[name] = (await created.json()).node.id;

      const saved = await owner.request.patch(`/api/v1/nodes/${id[name]}`, {
        data: { content: body, content_version: 1 },
      });
      expect(saved.status(), await saved.text()).toBe(200);
    }
  });

  test.afterAll(async () => {
    await api.dispose();
    await ownerCtx.close();
    await otherCtx.close();
  });

  test("a token is shown exactly once, with its configuration", async () => {
    await owner.goto("/settings/mcp");
    await owner.getByLabel("Name this token").fill("Laptop");
    await owner.getByRole("button", { name: "Create token" }).click();

    const value = owner.locator("#copyable-token");
    await expect(value).toBeVisible();
    token = ((await value.textContent()) ?? "").trim();
    expect(token).toMatch(/^post_/);

    // Every client's configuration is shown alongside, with this token and
    // this Post-it's address already in it, so connecting is copy and paste
    // rather than transcribing a secret by hand.
    for (const label of [
      "Claude Code, command line",
      "Claude Code, .mcp.json",
      "Anthropic API",
    ]) {
      const block = owner.locator(".copyable").filter({ hasText: label });
      await expect(block, `${label} should be offered`).toBeVisible();
      const text = (await block.locator("pre").textContent()) ?? "";
      expect(text, `${label} should carry the endpoint`).toContain("/api/mcp");
      expect(text, `${label} should carry the token`).toContain(token);
    }

    // Reloading must not show it again: only the hash was kept.
    await owner.reload();
    await expect(owner.locator("#copyable-token")).toHaveCount(0);
    await expect(owner.getByText("Laptop")).toBeVisible();
  });

  test("the same endpoint answers with the token in the path", async () => {
    // The Claude desktop and web apps add a connector from a URL and offer no
    // field for a header, so the token has to travel in the path for them.
    // Same endpoint, same answers, including the refusals.
    const res = await api.post(`/api/mcp/${token}`, {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(res.status()).toBe(200);
    const listed = await res.json();
    expect(listed.result.tools.length).toBeGreaterThan(0);

    // And it is the same credential, not a way around one: another account's
    // token reaches nothing here either.
    const wrong = await api.post("/api/mcp/post_not_a_real_token", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("the endpoint refuses a request with no token", async () => {
    const { status } = await rpc("tools/list", undefined, null);
    expect(status).toBe(401);
  });

  test("an unknown token is refused, and looks exactly like a revoked one", async () => {
    const unknown = await rpc("tools/list", undefined, "post_not_a_real_token");
    expect(unknown.status).toBe(401);
    expect(unknown.body?.error?.message).toBe("Unauthorized");
  });

  test("it handshakes and lists its tools", async () => {
    const init = await rpc("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "playwright", version: "1.0.0" },
    });
    expect(init.status).toBe(200);
    expect(init.body.result.serverInfo.name).toBe("postit");

    const listed = await rpc("tools/list", {});
    const names = listed.body.result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("list_spaces");
    expect(names).toContain("search");
    expect(names).toContain("get_skill");

    // Nothing destructive ships in the first version. A leaked token that can
    // only add is a far smaller problem than one that can remove.
    expect(names).not.toContain("delete_page");
    expect(names).not.toContain("move_page");

    // Commenting is offered; replying is not, and that is the design. One
    // considered review goes up as one comment, and the conversation under it
    // belongs to the people on the page.
    expect(names).toContain("add_comment");
    expect(names).toContain("list_comments");
    expect(names).not.toContain("reply_to_comment");

    const commenting = listed.body.result.tools.find(
      (t: { name: string }) => t.name === "add_comment",
    );
    expect(Object.keys(commenting.inputSchema.properties)).not.toContain(
      "parent_id",
    );
  });

  test("it reads the owner's own content", async () => {
    const spaces = await call("list_spaces", {});
    expect(spaces.text).toContain("Connected Space");

    const page = await call("read_page", { space_id: spaceId, path: "roadmap" });
    expect(page.text).toContain("Ship the thing");

    const found = await call("search", { space_id: spaceId, query: SECRET_WORD });
    expect(found.text).toContain("Roadmap");
  });

  test("skills are listed with their metadata, and stripped of it when fetched", async () => {
    const skills = await call("list_skills", { space_id: spaceId });
    expect(skills.text).toContain("Todo List");
    expect(skills.text).toContain("Read and update the reader's todos");
    // The articles are not skills and must not be in this list.
    expect(skills.text).not.toContain("Roadmap");

    const skill = await call("get_skill", { space_id: spaceId, path: "todo-list" });
    expect(skill.text).toContain("Ask for open items");
    expect(skill.text).not.toContain("description:");

    const notASkill = await call("get_skill", {
      space_id: spaceId,
      path: "roadmap",
    });
    expect(notASkill.isError).toBe(true);
  });

  test("it can build structure, not just a flat list", async () => {
    // The gap somebody hit filing seventeen pages from a repository: folders
    // are the only thing that can contain anything, and there was no way to
    // make one here, so the choice was a flat list or going to the browser.
    const made = await call("create_folder", {
      space_id: spaceId,
      name: "Handbook",
    });
    expect(made.isError, made.text).toBeFalsy();
    expect(made.text).toContain("at handbook");
    const folderId = idFrom(made.text);

    const inside = await call("create_page", {
      space_id: spaceId,
      name: "Leave",
      parent_id: folderId,
    });
    expect(inside.isError, inside.text).toBeFalsy();
    expect(inside.text).toContain("handbook/leave");

    // And a page is not a folder. That used to answer "Not found", which sends
    // somebody looking for a missing thing that is sitting in front of them.
    const refused = await call("create_page", {
      space_id: spaceId,
      name: "Nested Too Far",
      parent_id: idFrom(inside.text),
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("Only folders can contain items");
  });

  test("and can see the structure it built, and find one made elsewhere", async () => {
    // The gap that left somebody unable to find a folder created in the
    // browser: search matches content, and a folder has none, so there was no
    // way to enumerate a space at all.
    const tree = await call("list_tree", { space_id: spaceId });
    expect(tree.isError, tree.text).toBeFalsy();
    expect(tree.text).toContain("handbook (folder");
    expect(tree.text).toContain("handbook/leave (article");

    const folders = await call("list_tree", {
      space_id: spaceId,
      kind: "folder",
    });
    expect(folders.text).toContain("handbook (folder");
    expect(folders.text).not.toContain("handbook/leave");

    // And reading a folder says what is in it, rather than "(no content)",
    // which is true and useless.
    const read = await call("read_page", {
      space_id: spaceId,
      path: "handbook",
    });
    expect(read.isError, read.text).toBeFalsy();
    expect(read.text).toContain("type: folder");
    expect(read.text).toContain("handbook/leave");
  });

  test("it is told when it is asking for a folder the wrong way", async () => {
    // Both of these used to succeed quietly and produce something other than
    // what was asked for, which is worse than a refusal.
    const typed = await call("create_page", {
      space_id: spaceId,
      name: "Pretend Folder",
      content_type: "folder",
    });
    expect(typed.isError).toBe(true);
    expect(typed.text).toContain("create_folder");

    const slashed = await call("create_page", {
      space_id: spaceId,
      name: "handbook/README",
    });
    expect(slashed.isError).toBe(true);
    expect(slashed.text).toContain("cannot contain a slash");
    expect(slashed.text).toContain("parent_id");

    // Neither left anything behind.
    const tree = await call("list_tree", { space_id: spaceId });
    expect(tree.text).not.toContain("pretend-folder");
    expect(tree.text).not.toContain("handbook-readme");
  });

  test("it can write, and refuses to clobber a concurrent edit", async () => {
    const created = await call("create_page", {
      space_id: spaceId,
      name: "From Claude",
      content: "# From Claude\n\nWritten through MCP.\n",
    });
    expect(created.isError).toBe(false);
    expect(created.text).toContain("from-claude");

    const page = await call("read_page", {
      space_id: spaceId,
      path: "from-claude",
    });
    const version = Number(/version: (\d+)/.exec(page.text ?? "")?.[1]);
    expect(version).toBeGreaterThan(0);
    const nodeId = /id: ([0-9a-f-]{36})/.exec(page.text ?? "")?.[1] as string;

    const saved = await call("update_page", {
      id: nodeId,
      content: "# From Claude\n\nEdited.\n",
      version,
    });
    expect(saved.isError).toBe(false);

    // The same version again is now stale, and must be refused rather than
    // silently overwriting what the first save wrote.
    const stale = await call("update_page", {
      id: nodeId,
      content: "# From Claude\n\nClobbered.\n",
      version,
    });
    expect(stale.isError).toBe(true);
    expect(stale.text).toMatch(/someone else saved/i);
  });

  test("a token cannot reach another account's content", async () => {
    await other.goto("/settings/mcp");
    await other.getByLabel("Name this token").fill("Theirs");
    await other.getByRole("button", { name: "Create token" }).click();
    const theirs = other.locator("#copyable-token");
    await expect(theirs).toBeVisible();
    otherToken = ((await theirs.textContent()) ?? "").trim();

    // Their token sees none of the owner's spaces, and asking directly for a
    // page by id gets the same not-found a missing page would.
    const spaces = await call("list_spaces", {}, otherToken);
    expect(spaces.text).not.toContain("Connected Space");

    const page = await call("read_page", { id: id["Roadmap"] }, otherToken);
    expect(page.isError).toBe(true);
    expect(page.text).toBe("Not found.");

    // And search finds nothing, including a word that exists only in a page
    // they cannot read. Finding it would confirm the page exists.
    const found = await call(
      "search",
      { space_id: spaceId, query: SECRET_WORD },
      otherToken,
    );
    expect(found.text).not.toContain("Roadmap");
  });

  test("a token cannot write into another account's space", async () => {
    const created = await call(
      "create_page",
      { space_id: spaceId, name: "Intruder" },
      otherToken,
    );
    expect(created.isError).toBe(true);

    // And nothing was created: the owner still sees only what they made.
    const listed = await owner.request.get(`/api/v1/nodes?space_id=${spaceId}`);
    const names = (await listed.json()).nodes.map((n: { name: string }) => n.name);
    expect(names).not.toContain("Intruder");
  });

  test("it leaves a review as one comment, and the browser shows it", async () => {
    const REVIEW = [
      "Three things on this:",
      "",
      "1. The second paragraph contradicts the first.",
      "2. No owner is named for the migration step.",
      "3. The date in the header is last quarter's.",
    ].join("\n");

    const added = await call("add_comment", {
      space_id: spaceId,
      path: "roadmap",
      body: REVIEW,
    });
    expect(added.isError).toBeFalsy();
    expect(added.text).toContain("Roadmap");

    // Read back through the tool, with the author named.
    const listed = await call("list_comments", {
      space_id: spaceId,
      path: "roadmap",
    });
    expect(listed.text).toContain("contradicts the first");
    expect(listed.text).toContain(OWNER);

    // Multi-line survives as one comment rather than being split into three.
    expect(listed.text).toContain("3. The date in the header");

    // The same conversation the browser shows, not a parallel one. A space
    // page is a .space-shell rather than a <main>.
    await owner.goto(`/s/${SPACE}/roadmap`);
    await expect(owner.locator(".comments")).toContainText(
      "The second paragraph contradicts the first",
    );
  });

  test("but not on a page it cannot read", async () => {
    const refused = await call(
      "add_comment",
      { space_id: spaceId, path: "roadmap", body: "Butting in" },
      otherToken,
    );
    expect(refused.isError).toBe(true);

    const listed = await call("list_comments", {
      space_id: spaceId,
      path: "roadmap",
    });
    expect(listed.text).not.toContain("Butting in");
  });

  test("it can bring in a file, typed from its name", async () => {
    const html = await call("attach_file", {
      space_id: spaceId,
      filename: "Quarterly Report.html",
      content:
        "<!doctype html><html><body><h1>Q3</h1><script>fetch('/api/v1/spaces')</script></body></html>",
    });
    expect(html.isError, html.text).toBe(false);
    expect(html.text).toContain("as html");
    expect(html.text).toContain("quarterly-report");

    const json = await call("attach_file", {
      space_id: spaceId,
      filename: "settings.json",
      content: '{"theme":"dark"}',
    });
    expect(json.isError, json.text).toBe(false);
    expect(json.text).toContain("as json");

    // The file is stored exactly as handed over, script and all. What makes an
    // HTML page safe is where it runs, not what is kept.
    const read = await call("read_page", {
      space_id: spaceId,
      path: "quarterly-report",
    });
    expect(read.text).toContain("type: html");
    expect(read.text).toContain("fetch('/api/v1/spaces')");
    // And it comes back with the address you can send somebody, because that
    // is the whole point of an HTML page being a file.
    expect(read.text).toMatch(/address: \/m\/[0-9a-f]{32}/);

    // And it takes only what the browser's Upload takes.
    const refused = await call("attach_file", {
      space_id: spaceId,
      filename: "numbers.csv",
      content: "a,b\n1,2\n",
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("Markdown, HTML and JSON");
  });

  test("a file too large for one call arrives in pieces", async () => {
    // The limit this exists for is the client's, not the server's: half a
    // megabyte of HTML will not fit in one tool argument.
    const head = "<!doctype html><html><body>";
    const made = await call("attach_file", {
      space_id: spaceId,
      filename: "Big Report.html",
      content: head,
    });
    expect(made.isError, made.text).toBe(false);
    const bigId = idFrom(made.text);

    const chunk = "<p>" + "x".repeat(4_000) + "</p>";
    for (let i = 0; i < 3; i++) {
      const added = await call("append_to_page", { id: bigId, content: chunk });
      expect(added.isError, added.text).toBe(false);
      expect(added.text).toContain("bytes");
    }
    const last = await call("append_to_page", {
      id: bigId,
      content: "</body></html>",
    });
    expect(last.text).toContain(
      `${head.length + chunk.length * 3 + "</body></html>".length} bytes`,
    );

    const read = await call("read_page", { space_id: spaceId, path: "big-report" });
    expect(read.text).toContain("<!doctype html>");
    expect(read.text).toContain("</body></html>");
  });

  test("and a token that cannot write the page cannot grow it either", async () => {
    const mine = await call("attach_file", {
      space_id: spaceId,
      filename: "Not Yours.md",
      content: "# mine\n",
    });
    const id = idFrom(mine.text);

    const refused = await call("append_to_page", { id, content: "more" }, otherToken);
    expect(refused.isError).toBe(true);
  });

  test("create_page makes an HTML page the same way attach_file does", async () => {
    // The gap worth testing: one of these two doors used to write the bytes
    // into a column nothing reads, producing a page pointing at nothing.
    const made = await call("create_page", {
      space_id: spaceId,
      name: "Straight To HTML",
      content_type: "html",
      content: "<!doctype html><html><body><h1>Made here</h1></body></html>",
    });
    expect(made.isError, made.text).toBe(false);

    const read = await call("read_page", {
      space_id: spaceId,
      path: "straight-to-html",
    });
    expect(read.text).toContain("type: html");
    expect(read.text).toMatch(/address: \/m\/[0-9a-f]{32}/);
    expect(read.text).toContain("Made here");
  });

  test("and saving one writes the file rather than a column nothing reads", async () => {
    const page = await call("read_page", {
      space_id: spaceId,
      path: "straight-to-html",
    });
    const version = Number(/version: (\d+)/.exec(page.text ?? "")?.[1]);
    const id = /id: ([0-9a-f-]{36})/.exec(page.text ?? "")?.[1] as string;

    const saved = await call("update_page", {
      id,
      version,
      content: "<!doctype html><html><body><h1>Saved here</h1></body></html>",
    });
    expect(saved.isError, saved.text).toBe(false);

    const after = await call("read_page", {
      space_id: spaceId,
      path: "straight-to-html",
    });
    expect(after.text).toContain("Saved here");
    expect(after.text).not.toContain("Made here");
  });

  test("it can put a page under review and approve one", async () => {
    const asked = await call("ask_for_review", {
      space_id: spaceId,
      path: "from-claude",
    });
    expect(asked.isError, asked.text).toBe(false);
    expect(asked.text).toContain("under review");

    // Visible where an agent would next look, rather than needing a tool of
    // its own to ask.
    const read = await call("read_page", {
      space_id: spaceId,
      path: "from-claude",
    });
    expect(read.text).toContain("review: in_review");

    // And cannot approve it, being the person who wrote it and the person who
    // asked. A review one party starts and finishes is not a review.
    const itself = await call("approve_page", {
      space_id: spaceId,
      path: "from-claude",
    });
    expect(itself.isError).toBe(true);
    expect(itself.text).toContain("your own page");

    const cleared = await call("clear_review", {
      space_id: spaceId,
      path: "from-claude",
    });
    expect(cleared.isError, cleared.text).toBe(false);

    const last = await call("read_page", {
      space_id: spaceId,
      path: "from-claude",
    });
    expect(last.text).not.toContain("review:");
  });

  test("and neither of those reaches a page the token cannot", async () => {
    const refused = await call(
      "ask_for_review",
      { space_id: spaceId, path: "roadmap" },
      otherToken,
    );
    expect(refused.isError).toBe(true);

    const attached = await call(
      "attach_file",
      { space_id: spaceId, filename: "sneaky.md", content: "# no" },
      otherToken,
    );
    expect(attached.isError).toBe(true);
  });

  test("revoking a token stops it on the very next request", async () => {
    await owner.goto("/settings/mcp");
    await owner.getByRole("button", { name: "Revoke the token Laptop" }).click();
    await expect(owner.getByText("Laptop")).toHaveCount(0);

    const { status, body } = await rpc("tools/list", {});
    expect(status).toBe(401);
    // Indistinguishable from a token that never existed.
    expect(body?.error?.message).toBe("Unauthorized");
  });
});

/** The id out of a create tool's answer, which reads as prose for a person. */
function idFrom(answer: string | undefined): string {
  const match = /\(id: ([0-9a-f-]{36})\)/.exec(answer ?? "");
  expect(match, `no id in: ${answer}`).toBeTruthy();
  return match![1];
}
