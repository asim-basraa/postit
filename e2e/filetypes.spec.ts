import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { registerAndConfirm, createSpace } from "./auth";

/**
 * HTML and JSON files.
 *
 * Two more things a page can be. Everything around them is deliberately
 * unchanged — the tree, the editor, the history, who may read them — so what is
 * worth testing is the part that is new: a file arrives by being chosen rather
 * than typed, an HTML page is shown as the document it is and cannot run or
 * fetch anything while it is, and a JSON file is shown as its shape without
 * losing the text it was.
 */
const RUN = Date.now().toString(36);
const OWNER = `files-${RUN}@maqsoodlabs.com`;
const PASSWORD = "correct-horse-battery";
const SPACE = `files-${RUN}`;

/** What people upload: its own styling, and a script that wants to phone home. */
const REPORT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Quarterly</title>
    <style>body { background: rgb(253, 246, 227); } h1 { color: rgb(138, 47, 47); }</style>
  </head>
  <body>
    <h1>Revenue by region</h1>
    <p id="out">Written into the file.</p>
    <script>
      document.getElementById("out").textContent = "THE SCRIPT RAN";
      fetch("/api/v1/spaces").then(function () {
        document.body.setAttribute("data-fetched", "yes");
      });
    </script>
  </body>
</html>`;

const SETTINGS = JSON.stringify(
  {
    theme: "dark",
    retries: 3,
    enabled: true,
    missing: null,
    people: [{ name: "Asim", teams: ["Engineering"] }],
  },
  null,
  2,
);

test.describe.configure({ mode: "serial" });

test.describe("HTML and JSON files", () => {
  let ctx: BrowserContext;
  let page: Page;

  const upload = async (name: string, body: string) => {
    await page
      .getByLabel(/^Upload a file/)
      .first()
      .setInputFiles({
        name,
        mimeType: "text/plain",
        buffer: Buffer.from(body, "utf8"),
      });
  };

  test.beforeAll(async ({ browser }) => {
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await registerAndConfirm(page, OWNER, PASSWORD);
    await createSpace(page, "File Types", SPACE);
  });

  test.afterAll(async () => {
    await ctx.close();
  });

  test("an uploaded HTML file becomes a page, named after the file", async () => {
    await page.goto(`/s/${SPACE}`);
    await upload("Quarterly Report.html", REPORT);

    await page.waitForURL(/quarterly-report/);
    await expect(
      page.locator(".prose h1", { hasText: "Quarterly Report" }),
    ).toBeVisible();

    // The format is said in the tree, at the head of the name, so a column of
    // files can be read without opening any of them.
    const row = page.locator(".tree-item", { hasText: "Quarterly Report" });
    await expect(row.locator(".file-mark")).toHaveText("HTML");
  });

  test("it is shown as the document it is, and cannot run or fetch anything", async () => {
    const frame = page.frameLocator(".html-frame");

    // The author's own markup and their own stylesheet, intact.
    await expect(frame.locator("h1")).toHaveText("Revenue by region");
    const background = await frame
      .locator("body")
      .evaluate((body) => getComputedStyle(body).backgroundColor);
    expect(background).toBe("rgb(253, 246, 227)");

    // And the script that came with it did neither of the things it wanted to.
    await expect(frame.locator("#out")).toHaveText("Written into the file.");
    await expect(frame.locator("body")).not.toHaveAttribute("data-fetched", "yes");

    await expect(page.locator(".html-note")).toContainText("Scripts do not run");
  });

  test("an uploaded JSON file is shown as its shape, and as its text", async () => {
    await page.goto(`/s/${SPACE}`);
    await upload("settings.json", SETTINGS);

    await page.waitForURL(/settings/);

    const view = page.locator(".json-view");
    await expect(view.locator(".json-key", { hasText: "theme" })).toBeVisible();
    await expect(view.locator(".json-string", { hasText: "dark" })).toBeVisible();
    await expect(view.locator(".json-number", { hasText: "3" }).first()).toBeVisible();

    // Two levels arrive open and anything deeper is folded, which is the reason
    // for a tree rather than a block of text.
    await expect(view.locator(".json-branch[open]")).toHaveCount(2);

    // The first thing folded is the object inside `people`, and what it holds
    // is not on screen until somebody asks for it.
    const folded = view.locator(".json-branch:not([open])").first();
    const buried = view.locator(".json-string", { hasText: "Asim" });
    await expect(buried).not.toBeVisible();
    await folded.locator("summary").first().click();
    await expect(buried).toBeVisible();

    // And the file itself is still here to copy.
    await page.getByText("Raw JSON").click();
    await expect(view.locator(".json-raw")).toContainText('"retries": 3');

    const row = page.locator(".tree-item", { hasText: "settings" });
    await expect(row.locator(".file-mark")).toHaveText("JSON");
  });

  test("a file it cannot show is refused before anything is uploaded", async () => {
    await page.goto(`/s/${SPACE}`);
    await upload("numbers.csv", "a,b,c\n1,2,3\n");

    await expect(page.locator(".tree-error")).toContainText(
      "Markdown, HTML and JSON",
    );
    // Nothing was created, which is the point of checking before sending.
    await expect(page.locator(".tree-item", { hasText: "numbers" })).toHaveCount(0);
  });

  test("half-written JSON still saves, and says what is wrong with it", async () => {
    await page.goto(`/s/${SPACE}/settings?edit=1`);

    const area = page.getByRole("textbox", { name: /JSON source/ });
    await area.fill('{"theme": "dark",,}');
    await expect(page.locator(".msg-warn")).toContainText("not valid JSON");

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/settings$/);

    // The page opens, says why, and shows what is stored rather than nothing.
    await expect(page.locator(".json-view .msg-warn")).toContainText(
      "not valid JSON",
    );
    await expect(page.locator(".json-raw")).toContainText('{"theme": "dark",,}');
  });

  test("a new page can be turned into an HTML one, and starts as a document", async () => {
    await page.goto(`/s/${SPACE}`);
    await page.getByRole("button", { name: "New page at the top level" }).click();

    // In the dialog, and by role. By then the tree holds two files, each with
    // a "Rename <name>" button in its menu, and getByLabel matches on a
    // substring — so a bare "Name" finds three buttons as well as the field.
    const dialog = page.locator(".ask-dialog");
    await dialog.getByRole("textbox", { name: "Name" }).fill("From Scratch");

    // Waited for, because the next line asks for the page by its address and
    // a request still in flight is a 404 that looks like a broken feature.
    const [created] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/v1/nodes") && r.request().method() === "POST",
      ),
      dialog.getByRole("button", { name: "Create" }).click(),
    ]);
    expect(created.status()).toBe(201);

    await page.goto(`/s/${SPACE}/from-scratch?edit=1`);

    // Waited for rather than assumed: the type is saved before the box is
    // seeded, and a failure here should say which of the two went wrong.
    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes("/api/v1/nodes/") && r.request().method() === "PATCH",
      ),
      page.getByRole("combobox", { name: "Type" }).selectOption("html"),
    ]);
    expect(response.status()).toBe(200);

    const area = page.getByRole("textbox", { name: /HTML source/ });
    await expect(area).toHaveValue(/<!doctype html>/);
    await expect(area).toHaveValue(/<title>From Scratch<\/title>/);

    await page.getByRole("button", { name: "Save" }).click();
    await page.waitForURL(/\/from-scratch$/);
    await expect(page.locator(".html-frame")).toBeVisible();
  });
});
