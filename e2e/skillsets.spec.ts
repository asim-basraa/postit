import {
  test,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { gunzipSync } from "node:zlib";
import { registerAndConfirm, createSpace } from "./auth";

const RUN = Date.now().toString(36);
const OWNER = `skills-owner-${RUN}@maqsoodlabs.com`;
const READER = `skills-reader-${RUN}@maqsoodlabs.com`;
const STRANGER = `skills-nobody-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `skills-shelf-${RUN}`;

// The page is called one thing and the skill another, which is the case the
// layout has to get right: the folder comes from the frontmatter.
const SHARED = `---
name: monthly-invoicing
description: "Use when: somebody asks about billing, invoices or the month end"
license: MIT
---

# Monthly invoicing

Open Zoho, list the customers, skip the ones already billed.
`;

const PRIVATE_SKILL = `---
name: internal-only
description: Not for sharing
---

The part nobody outside is given.
`;

test.describe.configure({ mode: "serial" });

/**
 * Skillsets, and the files they hand to an agent.
 *
 * The suite is arranged around one claim: a skillset is a space, so what comes
 * out of /k is whatever that person was shared and nothing else. Three people
 * therefore ask for the same skillset and must get three different answers —
 * both skills, one skill, and a 404 — without any of them being a special case
 * in the route.
 */
test.describe("Skillsets", () => {
  let ownerCtx: BrowserContext;
  let readerCtx: BrowserContext;
  let strangerCtx: BrowserContext;
  let owner: Page;
  let reader: Page;
  let stranger: Page;
  let api: APIRequestContext;
  let spaceId: string;
  const id: Record<string, string> = {};
  const tokens: Record<string, string> = {};

  /** Mints a token through the page that mints them, as a person would. */
  async function mint(page: Page, name: string): Promise<string> {
    await page.goto("/settings/mcp");
    await page.getByLabel("Name this token").fill(name);
    await page.getByRole("button", { name: "Create token" }).click();

    const value = page.locator("#copyable-token");
    await expect(value).toBeVisible();
    return ((await value.textContent()) ?? "").trim();
  }

  /** The files in a skillset archive, by path. */
  async function fetchArchive(token: string, slug = SPACE) {
    const res = await api.get(`/k/${token}/${slug}.tar.gz`);
    if (res.status() !== 200) return { status: res.status(), files: {} };

    const raw = gunzipSync(await res.body());
    const files: Record<string, string> = {};

    for (let at = 0; at + 512 <= raw.length; ) {
      const name = raw.toString("ascii", at, at + 100).replace(/\0.*$/, "");
      if (!name) break;
      const size = parseInt(
        raw.toString("ascii", at + 124, at + 136).replace(/\0.*$/, "").trim(),
        8,
      );
      const start = at + 512;
      if (!name.endsWith("/")) {
        files[name] = raw.toString("utf8", start, start + size);
      }
      at = start + Math.ceil(size / 512) * 512;
    }

    return { status: res.status(), files };
  }

  /**
   * Waits for the server to agree with what the dialog already shows.
   *
   * The toggle is optimistic, which is right for a person: the box moves and
   * the install panel appears the moment it is clicked, while the write is
   * still on its way. It does mean the UI has stopped being evidence that the
   * server knows, so anything asserting a consequence of the mark has to ask
   * the server, and wait for it.
   */
  async function expectArchive(token: string, status: number) {
    await expect
      .poll(
        async () => (await api.get(`/k/${token}/${SPACE}.tar.gz`)).status(),
        { timeout: 10_000 },
      )
      .toBe(status);
  }

  test.beforeAll(async ({ browser }) => {
    api = await playwrightRequest.newContext({
      baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    });

    readerCtx = await browser.newContext();
    reader = await readerCtx.newPage();
    await registerAndConfirm(reader, READER, PASSWORD);

    strangerCtx = await browser.newContext();
    stranger = await strangerCtx.newPage();
    await registerAndConfirm(stranger, STRANGER, PASSWORD);

    ownerCtx = await browser.newContext();
    owner = await ownerCtx.newPage();
    await registerAndConfirm(owner, OWNER, PASSWORD);
    await createSpace(owner, "Skills Shelf", SPACE);

    spaceId = (await owner
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    const skills: [string, string][] = [
      ["Invoicing (v2, final)", SHARED],
      ["Internal Only", PRIVATE_SKILL],
    ];

    for (const [name, body] of skills) {
      const created = await owner.request.post("/api/v1/nodes", {
        data: { space_id: spaceId, kind: "file", name, content_type: "skill" },
      });
      expect(created.status(), await created.text()).toBe(201);
      id[name] = (await created.json()).node.id;

      const saved = await owner.request.patch(`/api/v1/nodes/${id[name]}`, {
        data: { content: body, content_version: 1 },
      });
      expect(saved.status(), await saved.text()).toBe(200);
    }

    // One of the two, to one of the two other people.
    const shared = await owner.request.post(
      `/api/v1/nodes/${id["Invoicing (v2, final)"]}/grants`,
      { data: { email: READER, role: "viewer" } },
    );
    expect(shared.status(), await shared.text()).toBe(201);

    tokens.owner = await mint(owner, "Owner laptop");
    tokens.reader = await mint(reader, "Reader laptop");
    tokens.stranger = await mint(stranger, "Stranger laptop");
  });

  test.afterAll(async () => {
    await api.dispose();
    await ownerCtx.close();
    await readerCtx.close();
    await strangerCtx.close();
  });

  test("a space is not a skillset until its owner says so", async () => {
    // Nothing is served before the mark, which is what makes the mark mean
    // something rather than being decoration on a list.
    const before = await fetchArchive(tokens.owner);
    expect(before.status).toBe(404);

    await owner.goto(`/s/${SPACE}`);
    await owner.getByRole("button", { name: "Skillset" }).click();

    const dialog = owner.getByRole("dialog", { name: /Skillset settings/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("checkbox").check();

    // The install command appears only once it is one, and carries the address
    // this page was reached on rather than something from configuration.
    await expect(dialog.getByText("npx skills add").first()).toBeVisible();
    await expect(dialog.getByText(`/k/YOUR_TOKEN/${SPACE}.tar.gz`)).toBeVisible();

    // And the mark really landed, rather than only being shown. Asserted here
    // so the tests below do not depend on the order they happen to run in for
    // the write to have caught up.
    await expectArchive(tokens.owner, 200);
  });

  test("and then says so where spaces are listed", async () => {
    await owner.goto("/spaces");
    const row = owner.locator(".space-list li", { hasText: "Skills Shelf" });
    await expect(row.locator(".space-kind")).toHaveText("skillset");
  });

  test("its owner is served every skill, laid out as the standard wants", async () => {
    const { status, files } = await fetchArchive(tokens.owner);
    expect(status).toBe(200);

    // A folder per skill, named from the frontmatter rather than the page: the
    // page is called "Invoicing (v2, final)" and the skill is not.
    expect(Object.keys(files).sort()).toEqual([
      "internal-only/SKILL.md",
      "monthly-invoicing/SKILL.md",
    ]);

    const skill = files["monthly-invoicing/SKILL.md"];
    expect(skill).toContain('name: "monthly-invoicing"');
    expect(skill).toContain("Use when: somebody asks about billing");
    expect(skill).toContain('license: "MIT"');
    expect(skill).toContain("Open Zoho");
  });

  test("somebody given one skill is served that skill and no other", async () => {
    // The whole feature, in one assertion. No code in the serving route knows
    // the difference between these two callers.
    const { status, files } = await fetchArchive(tokens.reader);
    expect(status).toBe(200);
    expect(Object.keys(files)).toEqual(["monthly-invoicing/SKILL.md"]);
  });

  test("somebody given nothing is told there is nothing there", async () => {
    const { status } = await fetchArchive(tokens.stranger);
    // 404 rather than 403: a skillset you were not given must not answer
    // differently from one that does not exist.
    expect(status).toBe(404);
  });

  test("a made-up token reaches nothing at all", async () => {
    const res = await api.get(`/k/post_not_a_real_token/${SPACE}.tar.gz`);
    expect(res.status()).toBe(404);
  });

  test("one skill can be fetched on its own", async () => {
    const res = await api.get(
      `/k/${tokens.reader}/${SPACE}/monthly-invoicing/SKILL.md`,
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/markdown");

    const body = await res.text();
    expect(body).toContain('name: "monthly-invoicing"');
    expect(body).toContain("Open Zoho");
  });

  test("but not one that was never shared with the asker", async () => {
    const res = await api.get(
      `/k/${tokens.reader}/${SPACE}/internal-only/SKILL.md`,
    );
    expect(res.status()).toBe(404);
  });

  test("a token says which skillsets it can reach", async () => {
    const res = await api.get(`/k/${tokens.reader}`);
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.skillsets).toHaveLength(1);
    expect(body.skillsets[0].slug).toBe(SPACE);
    expect(body.skillsets[0].archive).toContain(tokens.reader);

    // And a token whose owner was given nothing lists nothing.
    const empty = await api.get(`/k/${tokens.stranger}`);
    expect((await empty.json()).skillsets).toHaveLength(0);
  });

  test("the archive is never cached by anything in between", async () => {
    // What this answers depends on who asked, so a shared cache getting it
    // wrong would hand one person's skillset to another.
    const res = await api.get(`/k/${tokens.owner}/${SPACE}.tar.gz`);
    expect(res.headers()["cache-control"]).toContain("no-store");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["content-disposition"]).toContain(`${SPACE}.tar.gz`);
  });

  test("unmarking it stops the files without touching who can read what", async () => {
    await owner.goto(`/s/${SPACE}`);
    await owner.getByRole("button", { name: "Skillset" }).click();
    const dialog = owner.getByRole("dialog", { name: /Skillset settings/ });
    await dialog.getByRole("checkbox").uncheck();
    await expect(dialog.getByText("npx skills add")).toHaveCount(0);

    await expectArchive(tokens.owner, 404);

    // The reader still has the page itself: the mark was never a permission.
    await reader.goto(`/s/${SPACE}/invoicing-v2-final`);
    await expect(reader.locator("article.prose")).toContainText("Open Zoho");
  });
});
