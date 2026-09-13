import {
  test,
  expect,
  type Page,
  type BrowserContext,
} from "@playwright/test";
import { registerAndConfirm, createSpace } from "./auth";
import { makeAdmin } from "./admin";

/**
 * Teams, and what a grant to one reaches.
 *
 * A team used to live in a space and be administered by its owner. It belongs
 * to the company now: whoever administers Post-it makes them and decides who is
 * on them, everybody else may read the list and share their own pages with any
 * of them, and being on one still confers nothing by itself.
 *
 * Three people, because the whole question is what somebody else's membership
 * gets them and who is allowed to change it. The administrator is deliberately
 * not the space owner: those were the same person when teams were space-scoped,
 * and keeping them apart is what proves they are now two different powers.
 */
const RUN = Date.now().toString(36);
const ADMIN = `team-admin-${RUN}@maqsoodlabs.com`;
const OWNER = `team-owner-${RUN}@maqsoodlabs.com`;
const MEMBER = `team-member-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `teamed-${RUN}`;
const TEAM = `Engineering ${RUN}`;

const FOLDER = `/s/${SPACE}/handbook`;
const DEEP = `/s/${SPACE}/handbook/onboarding`;
const OUTSIDE = `/s/${SPACE}/private-note`;

test.describe.configure({ mode: "serial" });

test.describe("Slice 5: teams and team grants", () => {
  let adminCtx: BrowserContext;
  let ownerCtx: BrowserContext;
  let memberCtx: BrowserContext;
  let boss: Page;
  let owner: Page;
  let member: Page;
  let spaceId: string;
  let folderId: string;
  let teamId: string;

  test.beforeAll(async ({ browser }) => {
    memberCtx = await browser.newContext();
    member = await memberCtx.newPage();
    // The member must exist before they can be added: add_team_member resolves
    // an address to an account and refuses if there is none.
    await registerAndConfirm(member, MEMBER, PASSWORD);

    adminCtx = await browser.newContext();
    boss = await adminCtx.newPage();
    await registerAndConfirm(boss, ADMIN, PASSWORD);
    await makeAdmin(ADMIN);

    ownerCtx = await browser.newContext();
    owner = await ownerCtx.newPage();
    await registerAndConfirm(owner, OWNER, PASSWORD);
    await createSpace(owner, "Teamed Space", SPACE);

    spaceId = (await owner
      .locator(".space-shell")
      .getAttribute("data-space-id")) as string;

    const folder = await owner.request.post("/api/v1/nodes", {
      data: { space_id: spaceId, kind: "folder", name: "Handbook" },
    });
    expect(folder.status(), await folder.text()).toBe(201);
    folderId = (await folder.json()).node.id;

    // A page inside the folder, to show a team grant reaching down, and one
    // outside it, to show that it does not reach sideways.
    for (const [name, parent] of [
      ["Onboarding", folderId],
      ["Private Note", null],
    ] as const) {
      const res = await owner.request.post("/api/v1/nodes", {
        data: { space_id: spaceId, parent_id: parent, kind: "file", name },
      });
      expect(res.status(), await res.text()).toBe(201);
    }
  });

  test.afterAll(async () => {
    await adminCtx.close();
    await ownerCtx.close();
    await memberCtx.close();
  });

  test("an administrator creates a team", async () => {
    await boss.goto("/teams");
    await boss.getByLabel("New team").fill(TEAM);
    await boss.getByRole("button", { name: "Create team" }).click();

    await expect(boss.getByText(TEAM)).toBeVisible();

    const listed = await boss.request.get("/api/v1/teams");
    const { teams } = await listed.json();
    const made = teams.find((t: { name: string }) => t.name === TEAM);
    expect(made, "the team should be listed").toBeTruthy();
    teamId = made.id;
  });

  test("and making one does not put them on it", async () => {
    // It used to, because the maker was necessarily the owner of the space and
    // so plainly one of the group. An administrator making a team for other
    // people is not, and adding them silently would hand every administrator
    // everything ever shared with every team.
    const roster = await boss.request.get(`/api/v1/teams/${teamId}/members`);
    const { members } = await roster.json();
    expect(members).toHaveLength(0);
  });

  test("adding an address with no account says so", async () => {
    const res = await boss.request.post(`/api/v1/teams/${teamId}/members`, {
      data: { email: `nobody-${RUN}@maqsoodlabs.com` },
    });

    expect(res.status()).toBe(404);
    expect(await res.text()).toMatch(/no post-it account/i);
  });

  test("the administrator adds a member", async () => {
    await boss.goto("/teams");
    await boss.getByText(TEAM).click();
    await boss.getByLabel("Add by email").fill(MEMBER);
    await boss.getByRole("button", { name: "Add", exact: true }).click();

    await expect(boss.getByText(MEMBER)).toBeVisible();
  });

  test("membership alone grants nothing", async () => {
    // The team exists and they are on it, but nothing has been shared with it.
    const response = await member.goto(DEEP);
    expect(response?.status()).toBe(404);
  });

  test("somebody who neither administers the team nor is on it can share with it", async () => {
    // The rule that replaced "a team from this space": every team is shareable,
    // because every roster is readable, so you can always see who you are
    // handing something to. The owner is not on Engineering and does not run it.
    const res = await owner.request.post(`/api/v1/nodes/${folderId}/grants`, {
      data: { team_id: teamId, role: "viewer" },
    });
    expect(res.status(), await res.text()).toBe(201);
  });

  test("every member can now read the folder and what is under it", async () => {
    expect((await member.goto(FOLDER))?.status()).toBe(200);

    const deep = await member.goto(DEEP);
    expect(deep?.status()).toBe(200);
    await expect(
      member.getByRole("heading", { level: 1, name: "Onboarding" }),
    ).toBeVisible();
  });

  test("and still nothing outside it", async () => {
    const response = await member.goto(OUTSIDE);
    expect(response?.status()).toBe(404);
  });

  test("but the person who shared it is not reached by their own share", async () => {
    // Sharing with a team reaches the people on the team. Not the sharer, not
    // the administrator, not anybody else. The owner reads the folder because
    // it is in their own space, so the honest check is the administrator, who
    // has no other route to it.
    expect((await boss.goto(DEEP))?.status()).toBe(404);
  });

  test("a viewer grant to a team confers no editing", async () => {
    await member.goto(DEEP);
    await expect(
      member.getByRole("link", { name: "Edit", exact: true }),
    ).toHaveCount(0);
  });

  test("the sharing dialog names the team rather than saying 'team'", async () => {
    const res = await owner.request.get(`/api/v1/nodes/${folderId}/grants`);
    const { grants } = await res.json();
    const teamGrant = grants.find(
      (g: { grantee_type: string }) => g.grantee_type === "team",
    );
    expect(teamGrant, "the team grant should be listed").toBeTruthy();
    expect(teamGrant.grantee_name).toBe(TEAM);
  });

  test("neither a member nor a space owner can manage the team", async () => {
    // Being on a team is not a way in, and neither is having shared something
    // with it. Administering teams is its own power now.
    for (const who of [member, owner]) {
      const res = await who.request.post(`/api/v1/teams/${teamId}/members`, {
        data: { email: MEMBER, role: "manager" },
      });
      expect(res.status()).toBe(404);
    }

    // The screen is not refused to them, since it is where their own teams are.
    // What it withholds is the administration of anybody's.
    await owner.goto("/teams");
    await expect(
      owner.getByRole("button", { name: "Create team" }),
    ).toHaveCount(0);
  });

  test("but anybody signed in can see who is on it", async () => {
    // Reading a roster is not a power, and it is what makes sharing with a
    // group something other than a leap: you can see the group first. The test
    // above is what holds the powers to account.
    for (const who of [member, owner]) {
      const roster = await who.request.get(`/api/v1/teams/${teamId}/members`);
      const { members } = await roster.json();
      expect(members.map((m: { email: string }) => m.email)).toContain(MEMBER);
    }
  });

  test("removing the member removes their access", async () => {
    const roster = await boss.request.get(`/api/v1/teams/${teamId}/members`);
    const { members } = await roster.json();
    const theirs = members.find((m: { email: string }) => m.email === MEMBER);
    expect(theirs, "the member should be on the roster").toBeTruthy();

    const removed = await boss.request.delete(
      `/api/v1/teams/${teamId}/members/${theirs.user_id}`,
    );
    expect(removed.status()).toBe(204);

    expect((await member.goto(DEEP))?.status()).toBe(404);
  });

  test("deleting the team takes its grant with it", async () => {
    // Put them back first, so what is being tested is the deletion and not the
    // removal from the previous test.
    const added = await boss.request.post(`/api/v1/teams/${teamId}/members`, {
      data: { email: MEMBER },
    });
    expect(added.status(), await added.text()).toBe(201);
    expect((await member.goto(DEEP))?.status()).toBe(200);

    const deleted = await boss.request.delete(`/api/v1/teams/${teamId}`);
    expect(deleted.status()).toBe(204);

    expect((await member.goto(DEEP))?.status()).toBe(404);

    // The grant row is gone too, not merely inert: grantee_id is polymorphic
    // and carries no foreign key, so nothing cascades without the trigger.
    const grants = await owner.request.get(`/api/v1/nodes/${folderId}/grants`);
    const remaining = (await grants.json()).grants.filter(
      (g: { grantee_type: string }) => g.grantee_type === "team",
    );
    expect(remaining).toHaveLength(0);
  });
});
