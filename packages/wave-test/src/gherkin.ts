/**
 * Gherkin as Wave writes it, and as people add to it: a Feature, an optional
 * Background, Scenarios, and steps (Given, When, Then, And, But, *). Tags,
 * comments and description lines are allowed and ignored.
 */

export type Keyword = "Given" | "When" | "Then";
export type Step = { keyword: Keyword; text: string; line: number };
export type Scenario = { name: string; line: number; steps: Step[] };
export type Feature = { name: string; background: Step[]; scenarios: Scenario[] };

export function parseFeature(source: string): { feature: Feature; problems: string[] } {
  const feature: Feature = { name: "", background: [], scenarios: [] };
  const problems: string[] = [];
  let into: Step[] | null = null;
  let last: Keyword = "Given";
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    const n = i + 1;
    if (!line || line.startsWith("#") || line.startsWith("@")) return;
    let m = /^Feature:\s*(.*)$/.exec(line);
    if (m) {
      feature.name = m[1].trim();
      into = null;
      return;
    }
    if (/^Background:/.test(line)) {
      into = feature.background;
      return;
    }
    m = /^(?:Scenario|Example):\s*(.*)$/.exec(line);
    if (m) {
      const s: Scenario = { name: m[1].trim() || `Scenario ${feature.scenarios.length + 1}`, line: n, steps: [] };
      feature.scenarios.push(s);
      into = s.steps;
      last = "Given";
      return;
    }
    if (/^(Scenario Outline|Scenario Template|Examples|Rule):/.test(line)) {
      problems.push(`Line ${n}: ${line.split(":")[0]} is not supported; write each case as its own Scenario.`);
      into = null;
      return;
    }
    m = /^(Given|When|Then|And|But|\*)\s+(.+)$/.exec(line);
    if (m && into) {
      const kw = m[1] === "Given" || m[1] === "When" || m[1] === "Then" ? (m[1] as Keyword) : last;
      last = kw;
      (into as Step[]).push({ keyword: kw, text: m[2].trim(), line: n });
      return;
    }
    if (m && !into) problems.push(`Line ${n}: a step outside a Scenario or Background.`);
    // Anything else is description text.
  });
  if (!feature.scenarios.length) problems.push("No Scenario.");
  return { feature, problems };
}
