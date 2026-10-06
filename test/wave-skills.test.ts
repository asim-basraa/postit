import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { parseFrontmatter } from "@postit/renderer";
import { createWaveTools } from "@wave/mcp";
import { FIGMA_READ_ONLY } from "@wave/skills";
import { STARTER_SKILLS, WAVE_SKILL_PAGES } from "@/content/skills";
import { TOOLS } from "@/lib/mcp/tools";
import { SERVER_INSTRUCTIONS } from "@/lib/mcp/handler";

const WAVE = ["Wave Design", "Wave Brief", "Wave Design System", "Wave Feature", "Wave Review", "Wave Figma", "Wave Figma Brief", "Wave Figma Design System", "Wave Figma Feature", "Wave Build", "Wave Figma Gate"];

describe("Wave's skills", () => {
  // Wave Figma also names the Figma MCP server's own tools.
  // The read-only rule also names the Figma tools that write, to forbid them.
  const FIGMA = ["use_figma", "get_design_context", "get_screenshot", "generate_figma_design", "create_new_file", "upload_assets", "add_code_connect_map", "send_code_connect_mappings"];
  const known = new Set([...TOOLS.map((t) => t.name), ...createWaveTools().map((t) => t.name), ...FIGMA]);

  test("all eleven are published, each a complete skill file", () => {
    for (const title of WAVE) {
      const s = WAVE_SKILL_PAGES.map((p) => p.skill).find((x) => x.title === title);
      expect(s, title).toBeDefined();
      const fm = parseFrontmatter(s!.body);
      expect(fm.error, title).toBeNull();
      expect(fm.data.name).toBe(title);
      expect(String(fm.data.description).length).toBeGreaterThan(40);
    }
  });

  test("name only tools that exist", () => {
    for (const title of WAVE) {
      const body = WAVE_SKILL_PAGES.map((p) => p.skill).find((x) => x.title === title)!.body;
      const named = [...body.matchAll(/`((?:wave|get|list|read|create|update|attach|mark|ask|check|preflight|upload|share|set)_[a-z_]+)`/g)].map((m) => m[1]);
      for (const n of named) expect(known.has(n), `${title} names ${n}`).toBe(true);
    }
  });

  test("every Wave skill says, word for word, that Wave never changes Figma", () => {
    for (const { skill } of WAVE_SKILL_PAGES) expect(skill.body, skill.title).toContain(FIGMA_READ_ONLY);
    expect(SERVER_INSTRUCTIONS).toContain("Wave never changes a Figma file");
  });

  test("no Wave skill offers to edit Figma", () => {
    for (const { skill } of WAVE_SKILL_PAGES) {
      expect(skill.body, skill.title).not.toMatch(/Do you want me to edit|Edit it now|two clear yeses|offer the Figma edit/i);
    }
  });

  test("the router and the connection instructions point at every stage", () => {
    const router = WAVE_SKILL_PAGES.map((p) => p.skill).find((x) => x.title === "Wave Design")!.body;
    for (const path of ["wave-brief", "wave-design-system", "wave-feature", "wave-review", "wave-figma"]) {
      expect(router).toContain(path);
      const folder = WAVE_SKILL_PAGES.find((p) => p.skill.title.toLowerCase().replace(/ /g, "-") === path)!.folder;
      expect(SERVER_INSTRUCTIONS).toContain(`skills/${folder}/${path}`);
    }
  });

  test("Wave's skills are not starter skills, so they are never shown or seeded outside the Wave space", () => {
    for (const s of STARTER_SKILLS) expect(s.title.startsWith("Wave")).toBe(false);
    expect(WAVE_SKILL_PAGES).toHaveLength(12);
  });

  test("the published skill files are exactly the code's (npx vite-node scripts/write-wave-skill-files.ts)", () => {
    for (const { folder, skill } of WAVE_SKILL_PAGES) {
      const slug = skill.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      expect(readFileSync(`docs/wave/skills/${folder}/${slug}.md`, "utf8"), slug).toBe(skill.body);
    }
  });
});
