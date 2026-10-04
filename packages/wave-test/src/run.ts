import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Locator } from "playwright";
import { parseFeature, type Step } from "./gherkin";
import { matchStep, type MatchedStep } from "./steps";
import type { Target } from "./targets";

/**
 * Runs a feature's Gherkin on a target. Each scenario plays its steps in order;
 * the first that fails stops the scenario (the rest are skipped) and leaves a
 * screenshot. Nothing is generated: each step is one of Wave's, matched and
 * played.
 */

export type StepResult = { keyword: string; text: string; line: number; status: "passed" | "failed" | "skipped"; error?: string; testId?: string; screenshot?: string };
export type ScenarioResult = { name: string; passed: boolean; steps: StepResult[] };
export type RunResult = { feature: string; target: string; passed: boolean; steps: number; failed: number; problems: string[]; scenarios: ScenarioResult[]; notices: string[]; ranAt: string };

export type RunOptions = { timeout?: number; screenshots?: string };

const CHOSEN = ["checked", "selected", "on", "active", "current"];

async function one(target: Target, testId: string, timeout: number): Promise<Locator> {
  const loc = target.page.getByTestId(testId);
  await loc.first().waitFor({ state: "attached", timeout }).catch(() => {
    throw new Error(`No element with test id "${testId}" on this screen.`);
  });
  const n = await loc.count();
  if (n > 1) throw new Error(`${n} elements have test id "${testId}"; a test id names one element.`);
  return loc;
}

async function isChosen(loc: Locator): Promise<boolean> {
  return loc.evaluate((e, chosen) => {
    const on = (x: Element) =>
      (x instanceof HTMLInputElement && x.checked) ||
      ["aria-checked", "aria-selected", "aria-pressed"].some((a) => x.getAttribute(a) === "true") ||
      chosen.includes(x.getAttribute("data-wave-state") ?? "");
    return on(e) || !!e.querySelector("input:checked") || [...e.querySelectorAll("[aria-checked],[aria-selected],[aria-pressed]")].some(on);
  }, CHOSEN);
}

async function play(target: Target, step: MatchedStep, timeout: number) {
  const page = target.page;
  switch (step.kind) {
    case "open":
      return target.open(step.screen!);
    case "on":
      return target.amOn(step.screen!, timeout);
    case "click": {
      const loc = await one(target, step.testId!, timeout);
      await loc.click({ timeout });
      return target.settle();
    }
    case "fill": {
      const loc = await one(target, step.testId!, timeout);
      const own = await loc.evaluate((e) => e.matches("input,textarea,[contenteditable=true]"));
      const field = own ? loc : loc.locator("input:not([type=radio]):not([type=checkbox]):not([type=hidden]):not([type=submit]), textarea, [contenteditable=true]").first();
      if (!own && !(await field.count())) throw new Error(`"${step.testId}" has no field to type into.`);
      await field.fill(step.value ?? "", { timeout });
      return target.settle();
    }
    case "choose": {
      const loc = await one(target, step.testId!, timeout);
      if (await isChosen(loc)) return;
      await loc.click({ timeout });
      await target.settle();
      if (!(await isChosen(loc))) throw new Error(`"${step.testId}" was clicked but does not show as chosen.`);
      return;
    }
    case "pick": {
      const loc = await one(target, step.testId!, timeout);
      const native = loc.locator("select").first();
      if (await loc.evaluate((e) => e.tagName === "SELECT")) return void (await loc.selectOption({ label: step.value! }, { timeout }));
      if (await native.count()) return void (await native.selectOption({ label: step.value! }, { timeout }));
      const box = (await loc.evaluate((e) => e.matches('[data-wave-role="select"],[aria-haspopup="listbox"]'))) ? loc : loc.locator('[data-wave-role="select"],[aria-haspopup="listbox"]').first();
      await box.click({ timeout });
      await target.settle();
      const option = page.getByRole("option", { name: step.value!, exact: true });
      await option.first().waitFor({ state: "visible", timeout }).catch(() => {
        throw new Error(`"${step.testId}" did not open a list with the option "${step.value}".`);
      });
      await option.first().click({ timeout });
      await target.settle();
      const shown = (await loc.innerText()).includes(step.value!);
      if (!shown) throw new Error(`"${step.value}" was picked but "${step.testId}" does not show it.`);
      return;
    }
    case "shows": {
      const loc = await one(target, step.testId!, timeout);
      const text = (await loc.innerText()).replace(/\s+/g, " ");
      if (!text.includes(step.value!)) throw new Error(`"${step.testId}" shows "${text.trim().slice(0, 80)}", not "${step.value}".`);
      return;
    }
    case "chosen": {
      const loc = await one(target, step.testId!, timeout);
      if (!(await isChosen(loc))) throw new Error(`"${step.testId}" is not chosen.`);
      return;
    }
    case "visible": {
      const loc = await one(target, step.testId!, timeout);
      await loc.waitFor({ state: "visible", timeout }).catch(() => {
        throw new Error(`"${step.testId}" is not visible.`);
      });
      return;
    }
    case "hidden": {
      const loc = target.page.getByTestId(step.testId!);
      if ((await loc.count()) && (await loc.first().isVisible())) throw new Error(`"${step.testId}" is visible.`);
      return;
    }
  }
}

const fileName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

export async function runFeature(source: string, target: Target, options: RunOptions = {}): Promise<RunResult> {
  const timeout = options.timeout ?? 5_000;
  const { feature, problems } = parseFeature(source);
  const scenarios: ScenarioResult[] = [];
  let steps = 0;
  let failed = 0;
  for (const scenario of feature.scenarios) {
    const all: Step[] = [...feature.background, ...scenario.steps];
    const results: StepResult[] = [];
    let broken = false;
    for (const s of all) {
      steps++;
      const base = { keyword: s.keyword, text: s.text, line: s.line };
      if (broken) {
        results.push({ ...base, status: "skipped" });
        continue;
      }
      const matched = matchStep(s.text);
      try {
        if (!matched) throw new Error(`"${s.text}" is not one of Wave's steps.`);
        await play(target, matched, timeout);
        results.push({ ...base, status: "passed" });
      } catch (e) {
        broken = true;
        failed++;
        let screenshot: string | undefined;
        if (options.screenshots) {
          mkdirSync(options.screenshots, { recursive: true });
          screenshot = join(options.screenshots, `${fileName(scenario.name)}-line-${s.line}.png`);
          writeFileSync(screenshot, await target.page.screenshot({ fullPage: true }).catch(() => Buffer.alloc(0)));
        }
        results.push({ ...base, status: "failed", error: (e as Error).message.split("\n")[0], testId: matched?.testId, screenshot });
      }
    }
    scenarios.push({ name: scenario.name, passed: !broken, steps: results });
  }
  const notices = "notices" in target ? [...((target as unknown as { notices: string[] }).notices ?? [])] : [];
  return { feature: feature.name, target: target.name, passed: !problems.length && failed === 0 && scenarios.length > 0, steps, failed, problems, scenarios, notices, ranAt: new Date().toISOString() };
}
