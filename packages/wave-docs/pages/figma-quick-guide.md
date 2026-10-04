# Figma to Wave: quick guide for engineers

Talk to Claude; it runs everything. Details in the [[wave/figma-engineer-guide|engineer's guide]].

## Once

- Claude Code with the **Figma** connector (edit access to the file) and the
  **Post-it** connector (token from `/settings/mcp`, pinned to the space).
- Node 20+ and Playwright with Chromium (Claude checks).

## Say

> Bring this Figma file into Wave: `<link>`

## What happens

| Stage | Claude does | You | The designer |
| --- | --- | --- | --- |
| 1. Brief | Reads the file, drafts DESIGN.md | Answer a few questions (copy, access, analytics, data); approve DESIGN.md | |
| 2. Design system | Checks the file; builds tokens and specimens; writes the design-system page and JSON | Answer the odd question | Fixes Figma if the readiness report says so; reviews and approves the specimens in Post-it |
| 3. Feature | Checks and converts the screens; publishes; makes the prototype | Answer the FEATURE.md interview (fields, data, actions); approve publishing | Fixes Figma if needed; reviews and approves the screens in Post-it |
| Handover | | "Build `<project>` `<feature>` from Wave" | |

## Good to know

- **Not ready?** Wave refuses a file it cannot convert exactly and writes a
  **Figma readiness report** with a link to every component, screen and layer
  to fix. Send it to the designer.
- **Editing Figma?** Claude asks twice. Say no unless the designer agreed.
- **Paused?** Say "carry on with `<project>`" any time; the progress page
  remembers where you were.
- **Figma changed?** Say "Figma changed for `<project>`".
- Claude never approves, never asks for a token, and stops if it cannot reach
  something.
