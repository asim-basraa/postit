# Figma to Wave: quick guide for engineers

The whole flow on one page. Each step, its details and what to do when it
fails are in the [[wave/figma-engineer-guide|engineer's guide]].

**The rules.** Wave takes the Figma file as drawn, or not at all: fix things
in Figma, never in the HTML. If anything cannot be reached, stop and say what
failed. Only the designer approves.

## Once per machine

1. Claude Code, with the **Figma** connector (edit access to the file) and the
   **Post-it** connector (token from `/settings/mcp`, pinned to one space).
2. Node 20+, and Playwright with Chromium.
3. `curl -o wave-figma.mjs <your Post-it>/wave/wave-figma.mjs`
4. For publishing from files: `export POSTIT_MCP_URL=<endpoint>` and
   `export POSTIT_TOKEN=<token>`. Never commit or paste a token; revoke it when done.

## Every project

| # | Step | You run or say | Done when |
| --- | --- | --- | --- |
| 1 | Start | "Bring the `<project>` design system and the `<feature>` screens in from Figma: `<link>`" | Project and feature exist; DESIGN.md approved |
| 2 | Entry gate | `script GATE`, then `wave-figma gate --report gate.json -o GATE.md --fonts` | Nothing blocks (fixed in Figma, gate run again) |
| 3 | Tokens | `script VARIABLES`, `script STYLES`, then `wave-figma tokens ... -o tokens.json` | 0 problems; saved as `design-system/tokens` |
| 4 | Fonts | `wave-figma fonts`, `upload_asset` each file, `wave-figma font-css` | `fonts.css` points at uploaded files |
| 5 | Specimens | Per component: `script COMPONENT`, `BINDINGS`, `EFFECTS`, `EXPORT_SVG`, `get_design_context`, `get_screenshot`, then `convert --component`, `align`, `fidelity`, `upgrade --plan`, `ids`, `preflight` | Fidelity passes, look lock clean, preflight clean |
| 6 | Approve and publish | Designer approves; publish to `design-system/components`; run `wave_design_system_page` | Design-system page and `design-system-ids` JSON written |
| 7 | Screens | Per frame: `script NODE_MAP`, `BINDINGS`, `EFFECTS`, `EXPORT_SVG`, `get_design_context`, `get_screenshot`, then `convert --components --specimen-pages --map --screens`, `align`, `fidelity`, `upgrade --plan`, `ids`, `preflight` | Every screen passes fidelity and preflight |
| 8 | FEATURE.md | Answer Claude's grouped questions in the terminal; waive what does not apply, with a reason | FEATURE.md approved |
| 9 | Review | "Review `<feature>` for `<project>`": dry run, answers, preflight | Dry run passes |
| 10 | Publish | `wave-figma bundle ... -o screens.json`, then `wave-figma send --tool wave_publish_flow --args '{"feature_id":"..."}' --json-file screens=screens.json` | Screens in Post-it match Figma side by side |
| 11 | Prototype | "Make `<feature>` a prototype" | Every link and action plays |
| 12 | Handover | Reviewers approve in Post-it; then "Build `<project>` `<feature>` from Wave" (Wave Build) | Feature approved and locked |

## When Figma changes

Gate again, re-convert what changed with `ids --from <published version>`
(check anything reported as `vanished`), republish, run
`wave_design_system_page` again.

## Fast fixes

| Problem | Fix |
| --- | --- |
| `use_figma` refused | Get edit access to the file |
| Checksum mismatch | Run the script in parts (`--part n`) |
| Not passed the gate / not covered | Fix in Figma; run GATE with that page or frame |
| Fidelity fails | Read `diff.png`; fix in Figma, never in the HTML |
| Font missing | Stop; ask for the files and the right to use them |
| Design-system page out of date | `wave_design_system_page` |
