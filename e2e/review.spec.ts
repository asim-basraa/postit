import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { registerAndConfirm, createSpace } from "./auth";

/**
 * Asking for a review, and getting one.
 *
 * The first thing these assert is the thing most easily lost: review is opt-in.
 * A page nobody has asked to have reviewed carries no status, says nothing, and
 * is marked nowhere. It is a page, not a draft waiting for somebody.
 *
 * After that, the two halves of the rule. Sending a page for review is the
 * author's, approving it belongs to anybody in the space, and those are
 * deliberately different powers: a reviewer who may only read is the ordinary
 * case, and somebody holding a grant on the page from outside the space is not
 * a reviewer at all.
 */
const RUN = Date.now().toString(36);
const AUTHOR = `rv-author-${RUN}@maqsoodlabs.com`;
const COLLEAGUE = `rv-colleague-${RUN}@maqsoodlabs.com`;
const OUTSIDER = `rv-outsider-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `proposals-${RUN}`;

test.describe.configure({ mode: "serial" });

test.describe("Review", () => {
  let authorCtx: BrowserContext;
  let colleagueCtx: BrowserContext;
  let outsiderCtx: BrowserContext;
  let author: Page;
  let colleague: Page;
  let outsider: Page;
  let spaceId: string;
  let pageId: string;

  const href = `/s/${SPACE}/proposal`;

  test.beforeAll(async ({ browser }) => {
    colleagueCtx = await browser.newContext();
    colleague = await colleagueCtx.newPage();
    await registerAndConfirm(colleague, COLLEAGUE, PASSWORD);

    outsiderCtx = await browser.newContext();
    outsider = await outsiderCtx.newPage();
    await registerAndConfirm(outsider, OUTSIDER, PASSWORD);

    authorCtx = await browser.newContext();
    author = await authorCtx.newPage();
    await registerAndConfirm(author, AUTHOR, PASSWORD);
    await createSpace(author, "Proposals", SPACE);

    spaceId = (await author
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    const made = await author.request.post("/api/v1/nodes", {
      data: { space_id: spaceId, kind: "file", name: "Proposal" },
    });
    expect(made.status(), await made.text()).toBe(201);
    pageId = (await made.json()).node.id;

    // The colleague is in the space and holds nothing on the page itself.
    const added = await author.request.post(`/api/v1/spaces/${spaceId}/members`, {
      data: { email: COLLEAGUE },
    });
    expect(added.status(), await added.text()).toBe(201);

    // The outsider can read this one page and is not in the space.
    const shared = await author.request.post(`/api/v1/nodes/${pageId}/grants`, {
      data: { email: OUTSIDER, role: "viewer" },
    });
    expect(shared.status(), await shared.text()).toBe(201);
  });

  test.afterAll(async () => {
    await authorCtx.close();
    await colleagueCtx.close();
    await outsiderCtx.close();
  });

  test("a page nobody asked about carries no status at all", async () => {
    await author.goto(href);

    await expect(author.locator(".review-state")).toHaveCount(0);
    await expect(author.locator(".tree-badge-review")).toHaveCount(0);
    // What the author gets instead is the offer, and only the author.
    await expect(
      author.getByRole("button", { name: "Ask for review" }),
    ).toBeVisible();

    await outsider.goto(href);
    await expect(
      outsider.getByRole("button", { name: "Ask for review" }),
    ).toHaveCount(0);

    // Nor somebody who can change the page. Being in the space carries editor
    // on everything in it, and being able to fix a typo in somebody's page is
    // not standing to put it up to be judged.
    await colleague.goto(href);
    await expect(
      colleague.getByRole("button", { name: "Ask for review" }),
    ).toHaveCount(0);
  });

  test("the author sends it for review, and the sidebar says so", async () => {
    await author.goto(href);
    await author.getByRole("button", { name: "Ask for review" }).click();

    await expect(author.locator(".review-state")).toHaveText("Under review");
    await expect(author.locator(".tree-badge-review")).toBeVisible();

    // And is not offered the other half of it. An approval you can give
    // yourself records nothing.
    await expect(author.getByRole("button", { name: "Approve" })).toHaveCount(0);
    await expect(
      author.getByRole("button", { name: "Withdraw" }),
    ).toBeVisible();
  });

  test("somebody in the space approves it", async () => {
    await colleague.goto(href);
    await expect(colleague.locator(".review-state")).toHaveText("Under review");

    // First, while it is still open: somebody who was shared the page but is
    // not in the space is not a reviewer, and the database says so rather than
    // the screen merely omitting the button.
    const outside = await outsider.request.post(
      `/api/v1/nodes/${pageId}/review`,
      { data: { status: "approved" } },
    );
    expect(outside.status()).toBe(409);
    expect(await outside.text()).toContain("in this space");

    await colleague.getByRole("button", { name: "Approve" }).click();

    await expect(colleague.locator(".review-state")).toHaveText("Approved");
    await expect(colleague.locator(".review-who")).toContainText("by");
    // Finished, so it stops asking for attention in the tree.
    await expect(colleague.locator(".tree-badge-review")).toHaveCount(0);
  });

  test("reading a page is not being in the room where it is reviewed", async () => {
    await outsider.goto(href);

    // They see where it got to, which is the point of saying it on the page.
    await expect(outsider.locator(".review-state")).toHaveText("Approved");
    // And are offered nothing: not approving, not withdrawing.
    await expect(
      outsider.getByRole("button", { name: "Approve" }),
    ).toHaveCount(0);
    await expect(outsider.getByRole("button", { name: "Clear" })).toHaveCount(0);

    // And cannot ask for one either: they did not write it.
    const refused = await outsider.request.post(
      `/api/v1/nodes/${pageId}/review`,
      { data: { status: "in_review" } },
    );
    expect(refused.status()).toBe(409);
    expect(await refused.text()).toContain("who wrote this");
  });

  test("an approval of text that has since changed says so", async () => {
    const saved = await author.request.patch(`/api/v1/nodes/${pageId}`, {
      data: { content: "# Proposal\n\nSecond thoughts.\n", content_version: 1 },
    });
    expect(saved.status(), await saved.text()).toBe(200);

    await author.goto(href);
    await expect(author.locator(".review-state")).toHaveText("Approved");
    await expect(author.locator(".review-stale")).toContainText("changed since");
  });

  test("and the author can clear it, leaving the page as it was", async () => {
    await author.goto(href);
    await author.getByRole("button", { name: "Clear" }).click();

    await expect(author.locator(".review-state")).toHaveCount(0);
    await expect(
      author.getByRole("button", { name: "Ask for review" }),
    ).toBeVisible();
  });

  test("a page you cannot read has no review state to find", async () => {
    const hidden = await author.request.post("/api/v1/nodes", {
      data: { space_id: spaceId, kind: "file", name: "Nobody Elses" },
    });
    const hiddenId = (await hidden.json()).node.id;

    const answer = await outsider.request.post(
      `/api/v1/nodes/${hiddenId}/review`,
      { data: { status: "in_review" } },
    );
    expect(answer.status()).toBe(404);
  });
});
