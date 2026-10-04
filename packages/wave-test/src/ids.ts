import type { Page } from "playwright";

/**
 * The handover check for a built app: every test id the approved screens
 * carry is on the app's page for that screen. An id the design shows only on a
 * condition (a field that appears for "Other", an error message) may be
 * missing until the condition holds, so it is listed apart and does not fail.
 */

export type ScreenIds = { screen: string; route: string | null; missing: string[]; conditional: string[]; extra: string[]; skipped?: string };
export type IdsResult = { pass: boolean; screens: ScreenIds[] };

type Screen = { slug: string; route: string | null; html: string };

/** The test ids a screen's HTML carries, and which of them show only on a condition. */
async function designIds(page: Page, html: string): Promise<{ always: string[]; conditional: string[] }> {
  await page.setContent(html.replace(/<script\b[\s\S]*?<\/script>/gi, ""), { waitUntil: "domcontentloaded" });
  return page.evaluate(() => {
    const always: string[] = [];
    const conditional: string[] = [];
    document.querySelectorAll("[data-testid]").forEach((e) => {
      const id = e.getAttribute("data-testid")!;
      (e.closest("[hidden],[data-wave-visible-if],[data-wave-state-of]") ? conditional : always).push(id);
    });
    return { always, conditional };
  });
}

export async function checkIds(page: Page, base: string, screens: Screen[]): Promise<IdsResult> {
  await page.route(/^https?:/, (r) => (r.request().url().startsWith(new URL(base).origin) ? r.continue() : r.abort()));
  const out: ScreenIds[] = [];
  for (const s of screens) {
    const design = await designIds(page, s.html);
    if (!s.route || /[:{]/.test(s.route)) {
      out.push({ screen: s.slug, route: s.route, missing: [], conditional: [], extra: [], skipped: s.route ? `The route ${s.route} needs a value; check this screen with a scenario that gets there.` : "No route in FEATURE.md." });
      continue;
    }
    await page.goto(new URL(s.route, base).toString(), { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
    const onPage = new Set(await page.evaluate(() => [...document.querySelectorAll("[data-testid]")].map((e) => e.getAttribute("data-testid")!)));
    const expected = new Set([...design.always, ...design.conditional]);
    out.push({
      screen: s.slug,
      route: s.route,
      missing: design.always.filter((id) => !onPage.has(id)),
      conditional: design.conditional.filter((id) => !onPage.has(id)),
      extra: [...onPage].filter((id) => (id === s.slug || id.startsWith(`${s.slug}.`)) && !expected.has(id)),
    });
  }
  return { pass: out.every((s) => !s.missing.length), screens: out };
}
