import { specimenVariants } from "@wave/spec";
import { PROTOTYPE_SOURCE } from "@wave/prototype";

/**
 * The behaviour check: a screen played by the real prototype runtime in Chromium, every
 * control clicked, and each one asked whether anything on screen changed.
 *
 * The entry gate checks how a file is drawn; this checks what a designer will do with the
 * prototype. A chip that does not show being chosen, a currency switch whose thumb does not
 * move, a select that does not open: each fails here, before anything is published.
 */

export type BehaviourControl = {
  /** radio, checkbox, select or action (a button or link that goes somewhere). */
  kind: "radio" | "checkbox" | "select" | "action";
  /** What it says or is labelled, to find it. */
  name: string;
  /** The Figma layer it came from, for the readiness report's link. */
  figma: string | null;
  pass: boolean;
  /** What happened, in plain words. */
  detail: string;
};

export type BehaviourResult = { pass: boolean; controls: BehaviourControl[]; notices: string[] };

export type BehaviourOptions = {
  /** The project's published specimen pages: their drawn variants are what a chosen control turns into. */
  specimens: string[];
  width?: number;
  height?: number;
  executablePath?: string;
};

/** The variants and their CSS, as the prototype viewer sends them (wave-server's project context). */
export function specimenVariantsOf(pages: string[]) {
  const variants: ReturnType<typeof specimenVariants>["variants"] = [];
  const css: string[] = [];
  for (const html of pages) {
    const name = /<meta name="wave:component" content="([^"]+)">/.exec(html)?.[1];
    if (!name) continue;
    const drawn = specimenVariants(html, name.replace(/&amp;/g, "&").replace(/&quot;/g, '"'));
    variants.push(...drawn.variants);
    if (drawn.variants.length) css.push(drawn.css);
  }
  return { variants, variantCss: css.join("\n") };
}

/** Runs in the page: finds every control, clicks it, and says whether anything changed. */
async function playControls(): Promise<{ controls: BehaviourControl[]; notices: string[] }> {
  const notices: string[] = [];
  let navigated = 0;
  window.addEventListener("message", (e) => {
    const m = e.data as { type?: string; message?: string };
    if (m?.type === "wave-proto:notice" && m.message) notices.push(m.message);
    if (m?.type === "wave-proto:navigate") navigated++;
  });
  const settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 30))));
  /** What is drawn: every element's classes, effects, visibility and words, in order. */
  const look = () =>
    [...document.body.querySelectorAll("*")]
      .map((e) => {
        const cs = getComputedStyle(e);
        // A native checkbox or radio the design shows draws its own tick; one hidden behind a drawn control does not count.
        const r = e.getBoundingClientRect();
        const tick = e instanceof HTMLInputElement && r.width > 4 && r.height > 4 && cs.opacity !== "0" && cs.appearance !== "none" ? String(e.checked) : "";
        return `${e.getAttribute("class") ?? ""}|${e.getAttribute("data-figma-effect") ?? ""}|${cs.display}|${cs.visibility}|${cs.backgroundColor}|${cs.color}|${cs.boxShadow}|${tick}|${e.children.length ? "" : (e.textContent ?? "").trim()}`;
      })
      .join("\n");
  const nameOf = (e: Element) => (e.getAttribute("aria-label") ?? (e.closest("label")?.textContent || e.textContent || "")).replace(/\s+/g, " ").trim().slice(0, 60);
  const figmaOf = (e: Element) => e.closest("[data-figma-instance]")?.getAttribute("data-figma-instance") ?? e.closest("[data-figma-id]")?.getAttribute("data-figma-id") ?? null;
  const clickable = (e: Element) => (e.closest("label") as HTMLElement | null) ?? (e as HTMLElement);
  const controls: BehaviourControl[] = [];

  // Choices: click each one not already chosen; the screen has to show it chosen.
  for (const input of [...document.querySelectorAll<HTMLInputElement>("input[type=radio],input[type=checkbox]")]) {
    const kind = input.type as "radio" | "checkbox";
    if (input.disabled) continue;
    if (kind === "radio" && input.checked) continue;
    const before = look();
    clickable(input).click();
    await settle();
    const after = look();
    const owner = input.closest("[data-wave-component]");
    const ok = before !== after;
    controls.push({
      kind,
      name: nameOf(input),
      figma: figmaOf(input),
      pass: ok,
      detail: ok
        ? "shows being chosen"
        : owner
          ? `nothing on screen changes when it is chosen (its component ${owner.getAttribute("data-wave-component")} has no chosen look the prototype can use)`
          : "nothing on screen changes when it is chosen (it is not a design-system component, so it has no chosen look)",
    });
    // Put a checkbox back, so the next control starts from the screen as drawn.
    if (kind === "checkbox") {
      clickable(input).click();
      await settle();
    }
  }

  // Selects: it has to open, and choosing an option has to show in the field.
  for (const box of [...document.querySelectorAll<HTMLElement>('[data-wave-role="select"],[data-pi-role="select"],[aria-haspopup="listbox"]')]) {
    const name = nameOf(box);
    const figma = figmaOf(box);
    const before = look();
    box.click();
    await settle();
    const menu = document.querySelector<HTMLElement>("[data-wave-proto-menu]");
    const option = menu?.querySelector<HTMLElement>("[data-wave-proto-option]");
    if (!menu || !option || !menu.getBoundingClientRect().height) {
      controls.push({ kind: "select", name, figma, pass: false, detail: "does not open: its component has no Open state with a Menu drawn" });
      continue;
    }
    const words = option.getAttribute("data-wave-proto-option") ?? "";
    option.click();
    await settle();
    const after = look();
    const shown = (box.textContent ?? "").includes(words);
    const ok = shown && before !== after;
    controls.push({ kind: "select", name, figma, pass: ok, detail: ok ? `opens its menu, and shows "${words}" when chosen` : `opens, but choosing "${words}" does not show in the field` });
  }

  // Before the buttons, the screen is filled in as a person would: a choice in every group, words
  // in every empty text field, an option in every select. A button is then judged on what it does
  // with a filled screen, not on a required field it is right to refuse.
  const groups = new Map<string, HTMLInputElement[]>();
  for (const input of [...document.querySelectorAll<HTMLInputElement>("input[type=radio],input[type=checkbox]")]) {
    if (input.disabled) continue;
    const key = input.closest("[data-wave-field],[data-pi-field],[role=radiogroup],[role=group]")?.getAttribute("data-wave-field") ?? input.name ?? "";
    groups.set(key, [...(groups.get(key) ?? []), input]);
  }
  for (const inputs of groups.values()) {
    if (inputs.some((i) => i.checked)) continue;
    clickable(inputs[0]).click();
    await settle();
  }
  const SAMPLE: Record<string, string> = { email: "name@example.com", url: "https://example.com", tel: "+44 20 7946 0000", number: "1" };
  for (const field of [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input:not([type=radio]):not([type=checkbox]):not([type=hidden]),textarea")]) {
    if (field.value || field.disabled) continue;
    const pattern = field.getAttribute("data-wave-validate") ?? "";
    field.value = /pattern:domain/.test(pattern) ? "example.com" : SAMPLE[(field as HTMLInputElement).type] ?? "Sample";
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
  for (const box of [...document.querySelectorAll<HTMLElement>('[data-wave-role="select"],[data-pi-role="select"],[aria-haspopup="listbox"]')]) {
    if (box.getAttribute("data-wave-proto-value")) continue;
    box.click();
    await settle();
    const first = document.querySelector<HTMLElement>("[data-wave-proto-menu] [data-wave-proto-option]");
    if (first) first.click();
    else box.click();
    await settle();
  }

  // Actions: a button or link that goes somewhere has to go there (or show its state).
  for (const el of [...document.querySelectorAll<HTMLElement>("[data-wave-to],[data-wave-action],[data-wave-effect],[data-pi-to],[data-pi-action]")]) {
    if (el.closest("[hidden]") || !el.getBoundingClientRect().height) continue;
    const to = el.getAttribute("data-wave-to") ?? el.getAttribute("data-pi-to") ?? "";
    // Leaving the prototype (an outside link) is the viewer's to open; nothing to see in the frame.
    if (/^url:/.test(to)) continue;
    const before = look();
    const went = navigated;
    el.click();
    await new Promise((r) => setTimeout(r, 400));
    await settle();
    const ok = navigated > went || look() !== before;
    controls.push({ kind: "action", name: nameOf(el), figma: figmaOf(el), pass: ok, detail: ok ? (navigated > went ? `goes to ${to || "its destination"}` : "shows its result") : to ? "nothing happens when it is clicked" : "nothing happens when it is clicked: it has no prototype link in Figma, and nothing it would show is drawn" });
  }
  return { controls, notices };
}

/** Plays a screen with the prototype runtime and checks every control does something visible. */
export async function behaviourCheck(html: string, options: BehaviourOptions): Promise<BehaviourResult> {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  }
  const { variants, variantCss } = specimenVariantsOf(options.specimens);
  const browser = await playwright.chromium.launch(options.executablePath ? { executablePath: options.executablePath } : {});
  try {
    const page = await browser.newPage({ viewport: { width: options.width ?? 1440, height: options.height ?? 900 } });
    // The runtime first thing in the head, as the viewer adds it; it waits for the init message.
    const runtime = `<script>${PROTOTYPE_SOURCE.replace(/<\/script/gi, "<\\/script")}</script>`;
    const withRuntime = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (m) => m + runtime) : runtime + html;
    // Outside requests (fonts, assets) are not what is checked; nothing waits on them.
    await page.route(/^https?:/, (route) => route.abort());
    await page.setContent(withRuntime, { waitUntil: "domcontentloaded" });
    // Top level, the page is its own parent: the runtime takes this as the viewer's message.
    await page.evaluate(
      ({ variants, variantCss }) =>
        window.postMessage({ type: "wave-proto:init", screen: "", api: null, state: { data: {}, params: {} }, choices: {}, speed: 0, reveal: null, outcome: "success", variants, variantCss }, "*"),
      { variants, variantCss },
    );
    await page.waitForFunction(() => !document.documentElement.classList.contains("wave-proto-pending"), null, { timeout: 10_000 });
    const { controls, notices } = await page.evaluate(playControls);
    return { pass: controls.every((c) => c.pass), controls, notices };
  } finally {
    await browser.close();
  }
}
