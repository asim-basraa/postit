// Excluded from the typecheck, like the other scripts.
//
// Writes each Wave skill to docs/wave/skills/<designer|engineering|gates>/<slug>.md,
// the exact text published to the Wave space's skills/ folder, so it can be
// published from a fixed address (raw GitHub) rather than copied by hand.
// test/wave-skills.test.ts fails when these files and the code disagree.
//   npx vite-node scripts/write-wave-skill-files.ts

import { mkdirSync, writeFileSync } from "node:fs";
import { WAVE_SKILL_PAGES } from "../content/skills.ts";

for (const { folder, skill } of WAVE_SKILL_PAGES) {
  const slug = skill.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  mkdirSync(`docs/wave/skills/${folder}`, { recursive: true });
  writeFileSync(`docs/wave/skills/${folder}/${slug}.md`, skill.body);
}
