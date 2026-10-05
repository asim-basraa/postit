import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkIds } from "./ids";
import { callTool } from "./mcp";
import { runReport } from "./report";
import { runFeature, type RunResult } from "./run";
import { STEPS } from "./steps";
import { AppTarget, PrototypeTarget, type Target } from "./targets";

/**
 * wave-test: runs a feature's Gherkin against its prototype or the built app.
 * People ask Claude (the Wave Test skill); Claude runs this. Prints the run as
 * JSON and exits 1 when anything failed.
 */

const HELP = `wave-test <command> [options]

  run --link <upload link> --feature <id> [--target prototype|<app address>] [--record]
      [--screenshots dir] [--report report.md] [-o result.json] [--timeout ms] [--chromium path]
      Fetches the feature's Gherkin and screens from the host (wave_test_bundle) and runs it.
      Against the prototype it plays the screens with the prototype runtime; against an address
      it opens each screen's route there. --record publishes the report in the feature
      (tests/e2e-report) and records the run, which approving the feature waits for.
  run --bundle bundle.json [--target ...] [...]
      The same, from a bundle saved with "bundle".
  run --feature-file flow.feature --target <app address> --routes routes.json [...]
      For CI: a feature file and the routes ({ "<screen>": "/path" }), against the app.
  ids (--link <upload link> --feature <id> | --bundle bundle.json) --target <app address> [-o result.json]
      The handover check: opens each screen's route in the built app and lists every test id
      the approved screens carry that the page does not. Ids shown only on a condition are listed
      apart. Exit 1 when any is missing.
  bundle --link <upload link> --feature <id> -o bundle.json
      Saves what a run needs, to run offline or in CI.
  steps
      The step library.
`;

function args(argv: string[]) {
  const pos: string[] = [];
  const opt: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o") opt.o = argv[++i];
    else if (a.startsWith("--")) {
      const k = a.slice(2);
      opt[k] = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : "true";
    } else pos.push(a);
  }
  return { pos, opt };
}

const write = (file: string, data: string) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};

const need = (opt: Record<string, string>, k: string) => {
  if (!opt[k]) throw new Error(`--${k} is required.`);
  return opt[k];
};

async function loadPlaywright(): Promise<typeof import("playwright")> {
  try {
    return await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  }
}

type Bundle = {
  feature: { id: string; name: string };
  gherkin: string | null;
  featureVersion: number | null;
  screens: { pageId: string; slug: string; name: string; route: string | null; version: number; html: string }[];
  api: unknown;
  variants: unknown[];
  variantCss: string;
};

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const { opt } = args(rest);
  const conn = { link: opt.link, server: opt.server, token: opt.token };
  switch (cmd) {
    case "steps":
      process.stdout.write(STEPS.map((s) => `${s.example}\n    ${s.does}`).join("\n") + "\n");
      return 0;
    case "bundle": {
      if (!opt.feature) throw new Error("--feature is required.");
      const text = await callTool(conn, "wave_test_bundle", { feature_id: opt.feature });
      if (!opt.o) throw new Error("-o is required.");
      write(opt.o, text);
      const b = JSON.parse(text) as Bundle;
      process.stdout.write(JSON.stringify({ feature: b.feature.name, screens: b.screens.length, gherkin: !!b.gherkin }, null, 2) + "\n");
      return 0;
    }
    case "ids": {
      const bundle: Bundle = opt.bundle ? JSON.parse(readFileSync(opt.bundle, "utf8")) : JSON.parse(await callTool(conn, "wave_test_bundle", { feature_id: need(opt, "feature") }));
      const base = need(opt, "target");
      const playwright = await loadPlaywright();
      const browser = await playwright.chromium.launch(launchOptions(opt.chromium));
      try {
        const r = await checkIds(await browser.newPage(), base, bundle.screens);
        if (opt.o) write(opt.o, JSON.stringify(r, null, 2));
        process.stdout.write(JSON.stringify(r, null, 2) + "\n");
        return r.pass ? 0 : 1;
      } finally {
        await browser.close();
      }
    }
    case "run": {
      let bundle: Bundle | null = null;
      if (opt.bundle) bundle = JSON.parse(readFileSync(opt.bundle, "utf8")) as Bundle;
      else if (opt.feature && (opt.link || opt.server || process.env.POSTIT_MCP_URL)) bundle = JSON.parse(await callTool(conn, "wave_test_bundle", { feature_id: opt.feature })) as Bundle;
      const gherkin = opt["feature-file"] ? readFileSync(opt["feature-file"], "utf8") : bundle?.gherkin;
      if (!gherkin) throw new Error(bundle ? "The feature has no Gherkin yet (tests/flow-feature): publish it, and answer the samples FEATURE.md asks for." : "Give --link and --feature, --bundle, or --feature-file.");
      const where = opt.target ?? "prototype";
      const playwright = await loadPlaywright();
      const browser = await playwright.chromium.launch(launchOptions(opt.chromium));
      let result: RunResult;
      try {
        const page = await browser.newPage({ viewport: { width: Number(opt.width ?? 1440), height: Number(opt.height ?? 900) } });
        let target: Target;
        if (where === "prototype") {
          if (!bundle) throw new Error("The prototype target needs the feature's screens: give --link and --feature, or --bundle.");
          target = new PrototypeTarget(page, bundle);
        } else {
          const routes: Record<string, string | null> = opt.routes
            ? (JSON.parse(readFileSync(opt.routes, "utf8")) as Record<string, string | null>)
            : Object.fromEntries((bundle?.screens ?? []).map((s) => [s.slug, s.route]));
          target = new AppTarget(page, where, routes);
        }
        result = await runFeature(gherkin, target, { timeout: opt.timeout ? Number(opt.timeout) : undefined, screenshots: opt.screenshots });
      } finally {
        await browser.close();
      }
      const versions = bundle ? bundle.screens.map((s) => `${s.slug} v${s.version}`).join(", ") + (bundle.featureVersion ? `, Gherkin v${bundle.featureVersion}` : "") : undefined;
      const report = runReport(result, { versions });
      if (opt.report) write(opt.report, report);
      if (opt.o) write(opt.o, JSON.stringify(result, null, 2));
      let recorded: string | null = null;
      if (opt.record === "true") {
        if (!bundle) throw new Error("--record needs the feature from the host (--link and --feature).");
        recorded = await callTool(conn, "wave_record_test_run", {
          feature_id: bundle.feature.id,
          target: where,
          passed: result.passed,
          steps: result.steps,
          failed: result.failed,
          report,
          ran: { screens: Object.fromEntries(bundle.screens.map((s) => [s.pageId, s.version])), feature: bundle.featureVersion },
        });
      }
      process.stdout.write(
        JSON.stringify(
          {
            passed: result.passed,
            steps: result.steps,
            failed: result.failed,
            problems: result.problems,
            failures: result.scenarios.flatMap((s) => s.steps.filter((x) => x.status === "failed").map((x) => ({ scenario: s.name, line: x.line, step: `${x.keyword} ${x.text}`, error: x.error, testId: x.testId, screenshot: x.screenshot }))),
            notices: [...new Set(result.notices)],
            recorded,
          },
          null,
          2,
        ) + "\n",
      );
      return result.passed ? 0 : 1;
    }
    default:
      process.stdout.write(HELP);
      return cmd ? 1 : 0;
  }
}

/** Chromium does not read HTTPS_PROXY itself: pass the machine's proxy on, so hosted fonts and data load. */
function launchOptions(executablePath?: string): { executablePath?: string; proxy?: { server: string; bypass?: string } } {
  const server = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  const bypass = process.env.NO_PROXY ?? process.env.no_proxy;
  return { ...(executablePath ? { executablePath } : {}), ...(server ? { proxy: { server, ...(bypass ? { bypass } : {}) } } : {}) };
}
