import { describe, expect, test } from "vitest";
import { parseFrontmatter } from "@postit/renderer";
import { createWaveTools } from "@wave/mcp";
import { STARTER_SKILLS } from "@/content/skills";
import { TOOLS } from "@/lib/mcp/tools";
import { SERVER_INSTRUCTIONS } from "@/lib/mcp/handler";

const WAVE = ["Wave Design", "Wave Brief", "Wave Design System", "Wave Feature", "Wave Review", "Wave Figma", "Wave Figma Brief", "Wave Figma Design System", "Wave Figma Feature", "Wave Build"];

describe("Wave's skills", () => {
  // Wave Figma also names the Figma MCP server's own tools.
  const FIGMA = ["use_figma", "get_design_context", "get_screenshot"];
  const known = new Set([...TOOLS.map((t) => t.name), ...createWaveTools().map((t) => t.name), ...FIGMA]);

  test("all seven are published, each a complete skill file", () => {
    for (const title of WAVE) {
      const s = STARTER_SKILLS.find((x) => x.title === title);
      expect(s, title).toBeDefined();
      const fm = parseFrontmatter(s!.body);
      expect(fm.error, title).toBeNull();
      expect(fm.data.name).toBe(title);
      expect(String(fm.data.description).length).toBeGreaterThan(40);
    }
  });

  test("name only tools that exist", () => {
    for (const title of WAVE) {
      const body = STARTER_SKILLS.find((x) => x.title === title)!.body;
      const named = [...body.matchAll(/`((?:wave|get|list|read|create|update|attach|mark|ask|check|preflight|upload|share|set)_[a-z_]+)`/g)].map((m) => m[1]);
      for (const n of named) expect(known.has(n), `${title} names ${n}`).toBe(true);
    }
  });

  test("the router and the connection instructions point at every stage", () => {
    const router = STARTER_SKILLS.find((x) => x.title === "Wave Design")!.body;
    for (const path of ["wave-brief", "wave-design-system", "wave-feature", "wave-review", "wave-figma"]) {
      expect(router).toContain(path);
      expect(SERVER_INSTRUCTIONS).toContain(`skills/${path}`);
    }
  });
});
