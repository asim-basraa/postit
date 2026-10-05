import type { Page } from "playwright";
import { PROTOTYPE_SOURCE } from "@wave/prototype";

/**
 * Where a run plays its steps. The prototype target plays the feature's
 * screens with the prototype runtime, as the viewer does: it follows the
 * runtime's navigation messages and carries the prototype's state from screen
 * to screen. The app target opens the built app's routes. Steps act on test
 * ids, so they are the same against both.
 */
export interface Target {
  readonly page: Page;
  readonly name: string;
  /** Opens a screen from the start. */
  open(screen: string): Promise<void>;
  /** Waits for whatever the last action set off: a navigation, a loading state. */
  settle(): Promise<void>;
  /** Fails unless the page is that screen. */
  amOn(screen: string, timeout: number): Promise<void>;
}

/** What the prototype target needs: the screens and what the viewer sends with each. */
export type PrototypeBundle = {
  screens: { slug: string; html: string }[];
  api: unknown;
  variants: unknown[];
  variantCss: string;
};

type Message = { type?: string; to?: { kind: string; screen?: string }; state?: unknown; message?: string };

export class PrototypeTarget implements Target {
  readonly name = "prototype";
  private current: string | null = null;
  private history: string[] = [];
  private state: unknown = { data: {}, params: {} };
  private queue: Message[] = [];
  private ready = false;
  readonly notices: string[] = [];

  constructor(
    readonly page: Page,
    private readonly bundle: PrototypeBundle,
  ) {}

  private async setUp() {
    if (this.ready) return;
    this.ready = true;
    await this.page.exposeFunction("__waveTest", (json: string) => {
      const m = JSON.parse(json) as Message;
      if (m.type === "wave-proto:state") this.state = m.state ?? this.state;
      else if (m.type === "wave-proto:notice" && m.message) this.notices.push(m.message);
      else if (m.type === "wave-proto:navigate") this.queue.push(m);
    });
    // Nothing outside the page is what is tested; fonts and images are not waited for.
    await this.page.route(/^https?:/, (r) => r.abort());
    // The screen itself, at an address of its own (registered last, so it wins over the abort).
    await this.page.route(`${PROTOTYPE_ADDRESS}**`, (r) => r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: this.html }));
  }

  private html = "";

  private async show(slug: string) {
    const screen = this.bundle.screens.find((s) => s.slug === slug);
    if (!screen) throw new Error(`The feature has no screen "${slug}".`);
    // The page's own messages come back to it (it is its own parent): pass the runtime's to the run.
    const listen = `<script>window.addEventListener("message",function(e){var d=e.data;if(d&&typeof d.type==="string"&&/^wave-proto:(navigate|state|notice)$/.test(d.type)&&window.__waveTest)window.__waveTest(JSON.stringify(d))});</script>`;
    const runtime = `<script>${PROTOTYPE_SOURCE.replace(/<\/script/gi, "<\\/script")}</script>`;
    this.html = /<head\b[^>]*>/i.test(screen.html) ? screen.html.replace(/<head\b[^>]*>/i, (m) => m + listen + runtime) : listen + runtime + screen.html;
    // An address of its own, as the viewer's frame has: the runtime answers the mock API at
    // paths on the page's origin, which a page set as content (about:blank) does not have.
    await this.page.goto(`${PROTOTYPE_ADDRESS}${slug}`, { waitUntil: "domcontentloaded" });
    await this.page.evaluate(
      (init) => window.postMessage(init, "*"),
      { type: "wave-proto:init", screen: slug, api: this.bundle.api, state: this.state, choices: {}, speed: 0, reveal: null, outcome: "success", variants: this.bundle.variants, variantCss: this.bundle.variantCss },
    );
    await this.page.waitForFunction(() => !document.documentElement.classList.contains("wave-proto-pending"), null, { timeout: 10_000 });
    this.current = slug;
  }

  async open(screen: string) {
    await this.setUp();
    this.history = [];
    this.queue = [];
    this.state = { data: {}, params: {} };
    await this.show(screen);
  }

  async settle() {
    // Frames for the click to land, then any navigation it set off, one at a time.
    for (let i = 0; i < 40; i++) {
      await this.page.waitForTimeout(25);
      const next = this.queue.shift();
      if (!next) {
        if (i >= 3) return;
        continue;
      }
      if (next.state) this.state = next.state;
      if (next.to?.kind === "back") {
        const prev = this.history.pop();
        if (prev) await this.show(prev);
      } else if (next.to?.kind === "screen" && next.to.screen) {
        if (this.current) this.history.push(this.current);
        await this.show(next.to.screen);
      }
      i = 0;
    }
  }

  async amOn(screen: string, timeout: number) {
    await this.settle();
    if (this.current !== screen) throw new Error(`On the "${this.current}" screen, not "${screen}".`);
    // On the page: a root sized to the screen is 0px tall when the page itself has no height.
    await this.page.getByTestId(screen).first().waitFor({ state: "attached", timeout }).catch(() => {
      throw new Error(`The screen is ${screen}, but its root has no test id "${screen}".`);
    });
  }
}

/** Where the runner serves each screen. Nothing goes to the network: the route answers it, and the runtime answers the mock API. */
const PROTOTYPE_ADDRESS = "https://prototype.wave.invalid/";

/** The built app, at an address: each screen opened at its route from FEATURE.md. */
export class AppTarget implements Target {
  constructor(
    readonly page: Page,
    readonly name: string,
    private readonly routes: Record<string, string | null>,
  ) {}

  async open(screen: string) {
    const route = this.routes[screen];
    if (!route) throw new Error(`There is no route for the "${screen}" screen; give it one in FEATURE.md.`);
    if (/[:{]/.test(route)) throw new Error(`The route ${route} needs a value for its parameter; open the screen by a step that gets there instead.`);
    await this.page.goto(new URL(route, this.name).toString(), { waitUntil: "domcontentloaded" });
  }

  async settle() {
    await this.page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => undefined);
  }

  async amOn(screen: string, timeout: number) {
    await this.page.getByTestId(screen).first().waitFor({ state: "visible", timeout }).catch(() => {
      throw new Error(`Not on the "${screen}" screen: no element with test id "${screen}" (the screen's root) is visible. The page is ${this.page.url()}.`);
    });
  }
}
