import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { registerAndConfirm, createSpace } from "./auth";

/**
 * Sharing a space, from the place everybody tries to share it.
 *
 * This came from a real report: a space was shared with a team from its front
 * page, and the team could see the front page and none of the folders. Nothing
 * was broken — a space's front page sits beside its folders rather than above
 * them, so a grant on it reaches one page — but the control said "Share" while
 * standing on something that reads as the whole space, and that is our fault
 * rather than the reader's.
 *
 * So the dialog now says what it does, and offers the thing people meant.
 */
const RUN = Date.now().toString(36);
const OWNER = `ss-owner-${RUN}@maqsoodlabs.com`;
const MEMBER = `ss-member-${RUN}@maqsoodlabs.com`;
const READER = `ss-reader-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `flights-${RUN}`;

test.describe.configure({ mode: "serial" });

test.describe("Sharing a whole space", () => {
  let ownerCtx: BrowserContext;
  let memberCtx: BrowserContext;
  let readerCtx: BrowserContext;
  let owner: Page;
  let member: Page;
  let reader: Page;
  let spaceId: string;
  let homeId: string;

  test.beforeAll(async ({ browser }) => {
    memberCtx = await browser.newContext();
    member = await memberCtx.newPage();
    await registerAndConfirm(member, MEMBER, PASSWORD);

    readerCtx = await browser.newContext();
    reader = await readerCtx.newPage();
    await registerAndConfirm(reader, READER, PASSWORD);

    ownerCtx = await browser.newContext();
    owner = await ownerCtx.newPage();
    await registerAndConfirm(owner, OWNER, PASSWORD);
    await createSpace(owner, "Flights", SPACE);

    spaceId = (await owner
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    // A folder at the top of the space: beside the front page, not inside it.
    const folder = await owner.request.post("/api/v1/nodes", {
      data: { space_id: spaceId, kind: "folder", name: "Product Pack" },
    });
    expect(folder.status(), await folder.text()).toBe(201);

    const nodes = await owner.request.get(
      `/api/v1/nodes?space_id=${spaceId}`,
    );
    const list = (await nodes.json()).nodes as { id: string; path: string }[];
    homeId = list.find((n) => n.path === "index")!.id;
  });

  test.afterAll(async () => {
    await ownerCtx.close();
    await memberCtx.close();
    await readerCtx.close();
  });

  test("the dialog says what sharing the front page actually does", async () => {
    await owner.goto(`/s/${SPACE}`);
    // Scoped to the page's own actions: every row in the tree carries a
    // "Share <name>" button, and getByRole matches a name by substring.
    await owner
      .locator(".page-actions")
      .getByRole("button", { name: "Share" })
      .click();

    const dialog = owner.locator(".share-dialog");
    await expect(dialog.locator(".share-scope-note")).toContainText(
      "sit beside this page",
    );

    // And offers the whole space first, because that is what somebody
    // standing on a space's front page almost always means.
    await expect(dialog.getByLabel("Give them")).toHaveValue("space");
  });

  test("giving somebody the space gives them what is in it", async () => {
    const dialog = owner.locator(".share-dialog");
    await dialog.getByLabel("Email").fill(MEMBER);

    const [added] = await Promise.all([
      owner.waitForResponse(
        (r) => r.url().includes("/members") && r.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Add to space" }).click(),
    ]);
    expect(added.status()).toBe(201);

    await expect(dialog.locator(".msg-notice")).toContainText(
      "everything in it",
    );

    // The folder, which is the thing that was missing.
    await member.goto(`/s/${SPACE}/product-pack`);
    await expect(
      member.getByRole("heading", { level: 1, name: "Product Pack" }),
    ).toBeVisible();
  });

  test("while sharing the page alone still means the page alone", async () => {
    const shared = await owner.request.post(`/api/v1/nodes/${homeId}/grants`, {
      data: { email: READER, role: "viewer" },
    });
    expect(shared.status(), await shared.text()).toBe(201);

    await reader.goto(`/s/${SPACE}`);
    await expect(
      reader.getByRole("heading", { level: 1, name: "Flights" }),
    ).toBeVisible();

    // Not a refusal: a page they were not given is indistinguishable from one
    // that is not there, which is the rule this whole product turns on.
    const answer = await reader.request.get(`/s/${SPACE}/product-pack`);
    expect(answer.status()).toBe(404);
  });

  test("and being put in a space is something you are told about", async () => {
    await member.goto("/spaces");

    // Two lists now, because "what can I read" and "who am I grouped with"
    // are different questions.
    await expect(
      member.getByRole("heading", { name: "Content updates" }),
    ).toBeVisible();

    const row = member.locator(".shared-list li", { hasText: "Flights" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("the whole space");
    await expect(row).toContainText(OWNER);

    await row.getByRole("link", { name: "Flights" }).click();
    await expect(member).toHaveURL(new RegExp(`/s/${SPACE}$`));
  });
});
