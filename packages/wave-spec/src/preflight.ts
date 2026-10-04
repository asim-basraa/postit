import { parseMockup } from "./parse";
import { evaluateScreen, type EvaluateOptions, type Requirement } from "./requirements";
import { screenSlug } from "./flow";
import { checkTestIds } from "./testids";

/**
 * The last check before a screen is uploaded: will it look and work the same
 * in Wave as it did in Claude Design, and is everything Wave needs in it?
 */

export type PreflightIssue = { code: string; level: "mandatory" | "recommended"; message: string };

export type PreflightReport = {
  pass: boolean;
  screen: string;
  issues: PreflightIssue[];
  counts: { mandatoryOpen: number; recommendedOpen: number; proposed: number; waived: number };
  /** The open mandatory requirements, for the designer to see. */
  open: Requirement[];
};

export function preflightHtml(html: string, name: string, options: EvaluateOptions = {}): PreflightReport {
  const parsed = parseMockup(html);
  const screen = screenSlug({ meta: parsed.screen, name });
  const issues: PreflightIssue[] = [];
  const f = parsed.facts;

  if (parsed.screen.spec === null && !parsed.screen.component) issues.push({ code: "no-spec", level: "mandatory", message: 'No <meta name="wave:spec" content="1">. Add it so Wave reads the file as a spec.' });
  if (parsed.screen.prefix === "pi") issues.push({ code: "legacy-prefix", level: "mandatory", message: "The file uses the older data-pi-* names. Upgrade it to data-wave-* before uploading." });
  if (parsed.findings.some((x) => x.code === "mixed-prefix")) issues.push({ code: "mixed-prefix", level: "mandatory", message: "The file mixes data-wave-* and data-pi-*. Use data-wave-* throughout." });
  for (const x of parsed.findings.filter((x) => x.severity === "error")) issues.push({ code: x.code, level: "mandatory", message: x.message });
  if (f.scripts.some((s) => s.usesStorage)) {
    issues.push({ code: "storage", level: "mandatory", message: "A script uses localStorage, sessionStorage, indexedDB or cookies. The review frame blocks them, so the script stops and the page will look different. Remove that code or guard it with try/catch." });
  }
  if (f.scripts.some((s) => s.usesXhr)) {
    issues.push({ code: "xhr", level: "recommended", message: "A script uses XMLHttpRequest. The prototype's mock server answers fetch, so use fetch for any call the screen makes." });
  }
  const scriptBytes = f.scripts.reduce((n, s) => n + s.length, 0);
  if (f.bodyElements < 8 && (scriptBytes > 2000 || f.scripts.some((s) => s.buildsDom))) {
    issues.push({ code: "script-built", level: "mandatory", message: "The page is built by a script at run time, so its elements cannot be identified or specified. Export the rendered page as plain HTML instead." });
  }
  if (f.scripts.some((s) => s.src && !/^https?:\/\//.test(s.src))) issues.push({ code: "local-script", level: "mandatory", message: "A script is loaded from a local path. Inline it or remove it; nothing but the HTML file is uploaded." });
  for (const href of f.stylesheets) {
    if (!/^https?:\/\//.test(href)) issues.push({ code: "local-stylesheet", level: "mandatory", message: `The stylesheet ${href} is a local file. Put its CSS in a <style> block in the page.` });
    else if (!/fonts\.googleapis\.com|use\.typekit\.net|fonts\.bunny\.net/.test(href)) {
      issues.push({ code: "external-stylesheet", level: "recommended", message: `${href} is loaded from another site. Wave cannot read it for token checks; prefer CSS in the page.` });
    }
  }
  // Test ids are given at publish; what publishing cannot do on its own is the design's to fix.
  if (!parsed.screen.component) {
    for (const p of checkTestIds(html, screen)) issues.push({ code: p.code, level: "mandatory", message: p.message });
  }
  if (f.iframes) issues.push({ code: "iframe", level: "recommended", message: `The page embeds ${f.iframes} frame(s). They load in review but cannot be inspected.` });

  const evaluated = evaluateScreen(parsed, screen, { ...options, html });
  const open = evaluated.requirements.filter((r) => r.level === "mandatory" && (r.status === "missing" || r.status === "proposed"));
  const mandatoryIssues = issues.filter((i) => i.level === "mandatory").length;
  return {
    pass: mandatoryIssues === 0 && open.length === 0,
    screen,
    issues,
    counts: {
      mandatoryOpen: evaluated.counts.mandatoryOpen,
      recommendedOpen: evaluated.counts.recommendedOpen,
      proposed: evaluated.counts.proposed,
      waived: evaluated.counts.waived,
    },
    open,
  };
}
