import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { registerAndConfirm, createSpace } from "./auth";
import { makeAdmin } from "./admin";

/**
 * The people screen.
 *
 * Two properties matter more than the rest of it. An administrator can see how
 * much somebody holds and never what it says, which is the one exception this
 * product does not make. And an account that still owns spaces cannot be
 * deleted, because deleting it would take a team's writing with it.
 */
const RUN = Date.now().toString(36);
const BOSS = `admin-boss-${RUN}@maqsoodlabs.com`;
const STAFF = `admin-staff-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `staffed-${RUN}`;

test.describe.configure({ mode: "serial" });

test.describe("People", () => {
  let bossCtx: BrowserContext;
  let staffCtx: BrowserContext;
  let boss: Page;
  let staff: Page;

  test.beforeAll(async ({ browser }) => {
    staffCtx = await browser.newContext();
    staff = await staffCtx.newPage();
    await registerAndConfirm(staff, STAFF, PASSWORD);
    await createSpace(staff, "Staff Space", SPACE);

    const spaceId = await staff
      .locator(".space-shell")
      .getAttribute("data-space-id");

    const created = await staff.request.post("/api/v1/nodes", {
      data: { space_id: spaceId, kind: "file", name: "Salaries" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const node = (await created.json()).node;

    const saved = await staff.request.patch(`/api/v1/nodes/${node.id}`, {
      data: {
        content: "# Salaries\n\nNobody else should ever read this.\n",
        content_version: node.content_version,
      },
    });
    expect(saved.status(), await saved.text()).toBe(200);

    bossCtx = await browser.newContext();
    boss = await bossCtx.newPage();
    await registerAndConfirm(boss, BOSS, PASSWORD);
    await makeAdmin(BOSS);
  });

  test.afterAll(async () => {
    await bossCtx.close();
    await staffCtx.close();
  });

  test("is not there at all for somebody who does not administer it", async () => {
    expect((await staff.goto("/admin"))?.status()).toBe(404);

    // And nothing anywhere says it is there to be refused from.
    await staff.goto("/spaces");
    await expect(staff.getByRole("link", { name: "People" })).toHaveCount(0);
  });

  test("lists everybody with what they hold", async () => {
    await boss.goto("/admin");
    await expect(
      boss.getByRole("heading", { level: 1, name: "People" }),
    ).toBeVisible();

    const row = boss.locator("tr", { hasText: STAFF });
    await expect(row).toBeVisible();
    // Two spaces: the one they made, and the one every account comes with.
    // Four pages rather than two, for the same reason — a space comes with its
    // own front page, which is a page like any other and counts like one.
    await expect(row.locator("td").nth(1), "spaces").toHaveText("2");
    await expect(row.locator("td").nth(2), "articles").toHaveText("3");
    await expect(row.locator("td").nth(3), "skills").toHaveText("0");
    await expect(row.locator("td").nth(4), "storage").not.toHaveText("0 B");
  });

  test("an administrator can appoint another, and stand them down", async () => {
    const row = boss.locator("tr", { hasText: STAFF });

    await row.getByRole("button", { name: "Make admin" }).click();
    await expect(row.getByText("admin", { exact: true })).toBeVisible();

    await row.getByRole("button", { name: "Stand down" }).click();
    await expect(row.getByText("admin", { exact: true })).toHaveCount(0);

    // That the last one cannot stand themselves down is asserted in the
    // database suite instead. This database is shared by every spec in the
    // suite and a retry stands up an administrator of its own, so "the last
    // one" is not something a browser test can establish here, and a test that
    // asserts it anyway is asserting whatever else happened to be running.
  });

  test("and not one word of what any of it says", async () => {
    // The whole justification for the screen's shape. Counting somebody's
    // pages is not reading them, and the page itself must be exactly as absent
    // as it was before anybody was made an administrator.
    await expect(boss.getByText("Nobody else should ever read this")).toHaveCount(0);

    expect((await boss.goto(`/s/${SPACE}/salaries`))?.status()).toBe(404);
    expect((await boss.goto(`/s/${SPACE}`))?.status()).toBe(404);
  });

  test("somebody can be put on a team from the list of people", async () => {
    // Teams are the company's and administered from one place. Which way round
    // you ask the question is the point of this button: you are looking at the
    // person, not at the team.
    const team = await boss.request.post("/api/v1/teams", {
      data: { name: `Support ${RUN}` },
    });
    expect(team.status(), await team.text()).toBe(201);
    // By id, because the suite shares one database and the picker holds every
    // team in it, each labelled with a headcount that other specs move.
    const teamId = (await team.json()).team.id as string;

    await boss.goto("/admin");
    await boss
      .locator("tr", { hasText: STAFF })
      .getByRole("button", { name: "Teams" })
      .click();

    const dialog = boss.getByRole("dialog", { name: `Teams for ${STAFF}` });
    await expect(dialog.getByText("Not on any team.")).toBeVisible();

    await dialog.getByLabel("Team").selectOption(teamId);
    await dialog.getByRole("button", { name: "Add", exact: true }).click();

    // They are on it, and the picker stops offering what they are already on.
    await expect(dialog.locator(".share-list li")).toContainText(
      `Support ${RUN}`,
    );
    // Whether the picker has other teams left in it or vanishes entirely, the
    // one they are now on must not still be on offer.
    await expect(dialog.locator(`option[value="${teamId}"]`)).toHaveCount(0);

    // And the person themselves is told, which is the whole point of a roster
    // they did not ask to be on.
    await staff.goto("/teams");
    await expect(
      staff.locator(".my-team-name", { hasText: `Support ${RUN}` }),
    ).toBeVisible();
  });

  test("and taken off one again from the same place", async () => {
    await boss.goto("/admin");
    await boss
      .locator("tr", { hasText: STAFF })
      .getByRole("button", { name: "Teams" })
      .click();

    const dialog = boss.getByRole("dialog", { name: `Teams for ${STAFF}` });
    await dialog
      .getByRole("button", { name: `Take ${STAFF} off Support ${RUN}` })
      .click();

    await expect(dialog.getByText("Not on any team.")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  });

  test("an account that still owns spaces cannot be deleted", async () => {
    await boss.goto("/admin");
    await boss
      .locator("tr", { hasText: STAFF })
      .getByRole("button", { name: "Delete" })
      .click();
    await boss
      .getByRole("dialog", { name: `Delete ${STAFF}?` })
      .getByRole("button", { name: "Delete account" })
      .click();

    await expect(boss.locator(".msg-error")).toContainText("still owns");
    await expect(boss.locator("tr", { hasText: STAFF })).toBeVisible();
  });

  test("so the spaces are handed over first", async () => {
    await boss.locator("tr", { hasText: STAFF })
      .getByRole("button", { name: "Hand over" })
      .click();

    const dialog = boss.getByRole("dialog", { name: `Spaces owned by ${STAFF}` });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Hand to").selectOption({ label: BOSS });

    // Two of them now: the space they made, and the one their account came
    // with. Handing over is one space at a time on purpose, so this is too.
    const each = dialog.locator(".share-list li").getByRole("button", {
      name: "Hand over",
    });
    // The list arrives from a fetch, and count() is a reading rather than a
    // wait: taken while the dialog still says "Loading…" it is zero, the loop
    // below does nothing, and the spaces are never handed over at all.
    await expect(each.first()).toBeVisible();
    for (let left = await each.count(); left > 0; left--) {
      await each.first().click();
      await expect(each).toHaveCount(left - 1);
    }

    await expect(dialog.getByText("Nothing left to hand over")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();

    // Ownership is where a space's administration comes from, so the page that
    // was a 404 a moment ago is now theirs to read.
    expect((await boss.goto(`/s/${SPACE}/salaries`))?.status()).toBe(200);
    await expect(boss.locator("article.prose")).toContainText(
      "Nobody else should ever read this",
    );
  });

  test("disabling somebody stops them signing in", async () => {
    await boss.goto("/admin");
    await boss
      .locator("tr", { hasText: STAFF })
      .getByRole("button", { name: "Disable" })
      .click();

    await expect(
      boss.locator("tr", { hasText: STAFF }).getByText("disabled"),
    ).toBeVisible();

    const shut = await staffCtx.browser()?.newContext();
    const locked = await shut!.newPage();
    await locked.goto("/login");
    await locked.getByLabel("Email").fill(STAFF);
    await locked.getByLabel("Password").fill(PASSWORD);
    await locked.getByRole("button", { name: "Sign in" }).click();

    await expect(
      locked.locator("form.auth-form").getByRole("alert"),
    ).toBeVisible();
    await expect(locked).toHaveURL(/\/login/);
    await shut!.close();
  });

  test("and then the account can go", async () => {
    await boss
      .locator("tr", { hasText: STAFF })
      .getByRole("button", { name: "Delete" })
      .click();
    await boss
      .getByRole("dialog", { name: `Delete ${STAFF}?` })
      .getByRole("button", { name: "Delete account" })
      .click();

    await expect(boss.locator("tr", { hasText: STAFF })).toHaveCount(0);
  });
});
