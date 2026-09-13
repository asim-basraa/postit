import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { registerAndConfirm, createSpace } from "./auth";
import { makeAdmin } from "./admin";

/**
 * Seeing the team you are on.
 *
 * QA asked two questions of the teams feature and both were fair. If somebody
 * is added to a team and nothing is shared with it, what did adding them do?
 * And if a member cannot see inside the team, how is it meant to work at all?
 *
 * The first answer is "nothing, on purpose" — a team is a name to share with,
 * not a bundle of access — and the product never said so. The second was a real
 * gap: the owner could see the team, its roster and what it reached, and the
 * people on it could see none of the three. So a folder appeared in their list
 * with no account of where it came from.
 *
 * These tests hold the member's side of it to account, and check that widening
 * what a member can see did not widen what they can do.
 *
 * Teams belong to the company rather than to a space now, so the person who
 * makes one is the platform's administrator and is deliberately nobody else
 * here: not the space owner, and not on the team.
 */
const RUN = Date.now().toString(36);
const ADMIN = `tv-admin-${RUN}@maqsoodlabs.com`;
const OWNER = `tv-owner-${RUN}@maqsoodlabs.com`;
const MEMBER = `tv-member-${RUN}@maqsoodlabs.com`;
const OTHER = `tv-other-${RUN}@maqsoodlabs.com`;
const STRANGER = `tv-stranger-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `runbooks-${RUN}`;
const TEAM = `Duty Engineers ${RUN}`;
const MEMBER_SPACE = `member-notes-${RUN}`;

test.describe.configure({ mode: "serial" });

test.describe("Seeing the team you are on", () => {
  let adminCtx: BrowserContext;
  let ownerCtx: BrowserContext;
  let memberCtx: BrowserContext;
  let otherCtx: BrowserContext;
  let strangerCtx: BrowserContext;
  let boss: Page;
  let owner: Page;
  let member: Page;
  let other: Page;
  let stranger: Page;
  let spaceId: string;
  let teamId: string;
  let folderId: string;

  test.beforeAll(async ({ browser }) => {
    memberCtx = await browser.newContext();
    member = await memberCtx.newPage();
    await registerAndConfirm(member, MEMBER, PASSWORD);

    strangerCtx = await browser.newContext();
    stranger = await strangerCtx.newPage();
    await registerAndConfirm(stranger, STRANGER, PASSWORD);

    // A second person on the team, so "who else is on it" has somebody in it
    // who is neither the reader nor the owner. Kept open, because they are also
    // the person a page shared with the team has to actually reach.
    otherCtx = await browser.newContext();
    other = await otherCtx.newPage();
    await registerAndConfirm(other, OTHER, PASSWORD);

    adminCtx = await browser.newContext();
    boss = await adminCtx.newPage();
    await registerAndConfirm(boss, ADMIN, PASSWORD);
    await makeAdmin(ADMIN);

    ownerCtx = await browser.newContext();
    owner = await ownerCtx.newPage();
    await registerAndConfirm(owner, OWNER, PASSWORD);
    await createSpace(owner, "Runbooks", SPACE);

    spaceId = (await owner
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    const folder = await owner.request.post("/api/v1/nodes", {
      data: { space_id: spaceId, kind: "folder", name: "On Call" },
    });
    expect(folder.status(), await folder.text()).toBe(201);
    folderId = (await folder.json()).node.id;

    const team = await boss.request.post("/api/v1/teams", {
      data: { name: TEAM },
    });
    expect(team.status(), await team.text()).toBe(201);
    teamId = (await team.json()).team.id;

    for (const email of [MEMBER, OTHER]) {
      const added = await boss.request.post(
        `/api/v1/teams/${teamId}/members`,
        { data: { email } },
      );
      expect(added.status(), await added.text()).toBe(201);
    }
  });

  test.afterAll(async () => {
    await adminCtx.close();
    await ownerCtx.close();
    await memberCtx.close();
    await otherCtx.close();
    await strangerCtx.close();
  });

  test("a team that reaches nothing says so, rather than looking broken", async () => {
    await member.goto("/teams");

    const card = member.locator(".my-team", { hasText: TEAM });
    await expect(card).toBeVisible();
    await expect(card).toContainText("Nothing has been shared with this team");
    // The claim QA could not check: it is not a fault, and it says which.
    await expect(card).toContainText("ordinary state of a new team");
  });

  test("and the member can see who else is on it", async () => {
    await member.goto("/teams");

    const card = member.locator(".my-team", { hasText: TEAM });
    await card.locator("summary").click();

    await expect(card.locator(".team-members")).toContainText(OTHER);
    await expect(card.locator(".team-members")).toContainText(MEMBER);
  });

  test("sharing a folder with the team tells the member that is why", async () => {
    const shared = await owner.request.post(
      `/api/v1/nodes/${folderId}/grants`,
      { data: { team_id: teamId, role: "viewer" } },
    );
    expect(shared.status(), await shared.text()).toBe(201);

    await member.goto("/teams");

    const card = member.locator(".my-team", { hasText: TEAM });
    await expect(card).toContainText("Being on this team is why you can read");

    const row = card.locator(".team-reach-list li", { hasText: "On Call" });
    await expect(row).toBeVisible();
    await expect(row).toContainText("viewer");

    // And it is a way in, not only an explanation.
    await row.getByRole("link", { name: "On Call" }).click();
    await expect(member).toHaveURL(new RegExp(`/s/${SPACE}/on-call`));
  });

  test("the administrator sees the roster but not what the team reaches", async () => {
    // The line this holds: administering the platform is a power over accounts,
    // not over pages. An administrator runs the roster and cannot read what has
    // been shared with it, exactly as they cannot read anything else they have
    // not been given. So the screen does not show them a list that would be
    // empty whatever the team actually holds, and says why instead.
    await boss.goto("/teams");

    const card = boss.locator(".team-card", { hasText: TEAM });
    await card.locator("summary").click();

    await expect(card.locator(".team-members")).toContainText(MEMBER);
    await expect(card).not.toContainText("What this team can reach");
    await expect(card).toContainText("is shown to the people on it");
  });

  test("seeing the team is not administering it", async () => {
    // The screen is theirs, because their own teams are on it. The making and
    // filling of teams is not, and nor is it the space owner's: that was the
    // whole point of taking teams out of spaces.
    await member.goto("/teams");
    await expect(
      member.getByRole("button", { name: "Create team" }),
    ).toHaveCount(0);

    for (const who of [member, owner]) {
      const refused = await who.request.post(
        `/api/v1/teams/${teamId}/members`,
        { data: { email: STRANGER } },
      );
      expect(refused.status()).toBe(404);
    }
  });

  test("and somebody on no team is told nothing about anybody's", async () => {
    await stranger.goto("/spaces");
    await expect(stranger.locator(".teams-link")).toHaveCount(0);

    await stranger.goto("/teams");
    await expect(stranger.locator("main")).toContainText(
      "You are not on any teams",
    );
    await expect(stranger.locator(".my-team")).toHaveCount(0);

    // The roster is not private, and that is deliberate: it is a list of
    // colleagues, and being able to read one before handing it a document is
    // what makes sharing with a group something other than a leap. What a team
    // *reaches* is a list of documents, and stays shut.
    const roster = await stranger.request.get(
      `/api/v1/teams/${teamId}/members`,
    );
    expect(roster.status()).toBe(200);
    const body = await roster.json();
    expect(body.members.map((m: { email: string }) => m.email)).toContain(
      MEMBER,
    );
    expect(body.reach).toEqual([]);
  });

  test("a member can share a page of their own with the team", async () => {
    // The gap QA found from the other end. Somebody is put on a team, writes
    // something in their own space, and wants the team to read it. Teams used
    // to be grantable only inside the space that defined them, so the picker
    // did not offer this one and naming it was refused.
    await createSpace(member, "Member Notes", MEMBER_SPACE);

    const memberSpaceId = (await member
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    const page = await member.request.post("/api/v1/nodes", {
      data: { space_id: memberSpaceId, kind: "file", name: "Handover" },
    });
    expect(page.status(), await page.text()).toBe(201);

    await member.goto(`/s/${MEMBER_SPACE}/handover`);
    await member.getByRole("button", { name: "Share" }).first().click();

    const dialog = member.getByRole("dialog");
    // By role rather than by label: a <label> wrapping a <select> has the
    // option text in its own text content, so getByLabel("Team") matches the
    // "Share with" select too, through its "A team" option.
    await dialog
      .getByRole("combobox", { name: "Share with" })
      .selectOption("team");

    // Named by the size of the group rather than by a space it no longer has.
    const picker = dialog.getByRole("combobox", { name: "Team" });
    await expect(picker).toContainText(`${TEAM} (2 people)`);

    await picker.selectOption({ label: `${TEAM} (2 people)` });
    // And it says what sharing with a group actually commits you to, before you
    // do it rather than after.
    await expect(dialog).toContainText("decides who is on");

    await dialog.getByRole("button", { name: "Share", exact: true }).click();
    await expect(dialog.locator(".share-list")).toContainText(TEAM);
  });

  test("and it reaches the people on that team, across the space boundary", async () => {
    await other.goto(`/s/${MEMBER_SPACE}/handover`);
    await expect(other.locator("h1")).toContainText("Handover");

    await other.goto("/teams");
    const card = other.locator(".my-team", { hasText: TEAM });
    await expect(card.locator(".team-reach-list")).toContainText("Handover");
  });

  test("but not whoever made the team, who is not on it", async () => {
    // Making a team used to put you on it, back when the maker was necessarily
    // the owner of the space and so plainly one of the group. An administrator
    // making a team for other people is not one of them, and a share reaching
    // them silently would be every administrator reading everything ever shared
    // with any team.
    expect((await boss.goto(`/s/${MEMBER_SPACE}/handover`))?.status()).toBe(404);
  });

  test("nor anybody else at all", async () => {
    expect(
      (await stranger.goto(`/s/${MEMBER_SPACE}/handover`))?.status(),
    ).toBe(404);
  });

  test("and any team is yours to share with, being on it or not", async () => {
    // The rule used to be "a team you can see", meaning one whose space you own
    // or one you are on, because only those two could read the roster. Every
    // roster is readable now, so the thing that rule stood for holds for every
    // team and the restriction is gone. What must not widen with it is what the
    // share reaches, which the test below pins down.
    await createSpace(stranger, "Stranger Space", `stranger-${RUN}`);
    const strangerSpaceId = (await stranger
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    const page = await stranger.request.post("/api/v1/nodes", {
      data: { space_id: strangerSpaceId, kind: "file", name: "Theirs" },
    });
    expect(page.status(), await page.text()).toBe(201);
    const pageId = (await page.json()).node.id;

    const offered = await stranger.request.get(`/api/v1/nodes/${pageId}/teams`);
    expect(offered.status()).toBe(200);
    const names = (await offered.json()).teams.map(
      (t: { team_name: string }) => t.team_name,
    );
    expect(names).toContain(TEAM);

    const shared = await stranger.request.post(
      `/api/v1/nodes/${pageId}/grants`,
      { data: { team_id: teamId, role: "viewer" } },
    );
    expect(shared.status(), await shared.text()).toBe(201);

    // It reaches the people on the team, and stops there.
    await other.goto(`/s/stranger-${RUN}/theirs`);
    await expect(other.locator("h1")).toContainText("Theirs");
    expect((await boss.goto(`/s/stranger-${RUN}/theirs`))?.status()).toBe(404);
  });

  test("the member's own spaces page offers the way in", async () => {
    await member.goto("/spaces");

    const link = member.locator(".teams-link").getByRole("link");
    await expect(link).toContainText("You are on one team");
    await link.click();
    await expect(member).toHaveURL(/\/teams$/);
  });
});
