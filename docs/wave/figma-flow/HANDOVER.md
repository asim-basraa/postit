# Handover: the Figma flow for Wave

Read this first in a new session. It says what we are building, every decision already taken, where things stand on staging, and the next steps in order. Everything here was true on 2 October 2026.

## 1. Working rules (from Asim, non-negotiable)

- **If a resource cannot be reached (a host, a tool, a file, a seat limit), stop and say exactly what failed. Never take an alternative route around it.** Asim called the earlier workarounds cheating. Check access with one call before starting work that depends on it.
- Never use emojis or the long dash character in replies.
- Branch: `claude/epic-bell-0fj70o` in `asim-basraa/postit`. App changes are pushed to that branch and to `staging` (`git push origin HEAD:claude/epic-bell-0fj70o` and `git push origin HEAD:staging`). Never rewrite history; if `staging` moved, merge it in. No pull request unless asked.
- Commit trailers: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: <the new session's URL>`. No model ids in anything pushed.
- Do not edit a designer's screens or Figma file without asking. Writing to Figma is a change to the user's file.
- Show DESIGN.md, FEATURE.md, tokens and specimens to Asim and get agreement before saving them to Post-it.

## 2. What we are building

Wave has one author today: Claude Design plus the Wave skills (Wave Brief, Wave Design System, Wave Feature, Wave Review; router Wave Design; Wave Build for Claude Code). That flow stays as it is and keeps being refined.

The new **Figma flow** runs in Claude Code, driven by an engineer, and follows the same four steps with Figma as the source:

| Step | Claude Design flow | Figma flow |
| --- | --- | --- |
| 1. Brief | Wave Brief writes DESIGN.md | DESIGN.md drafted from the Figma file, gaps asked in the terminal |
| 2. Design system | Wave Design System draws tokens and specimens | Tokens from Figma variables and styles; Figma components become Post-it specimen pages |
| 3. Feature | Wave Feature writes FEATURE.md and screens | Screens converted from Figma frames, pixel-matched; FEATURE.md from frames and prototype links |
| 4. Review | Questions, dry run, publish | Same rules engine, questions asked in the terminal, publish |

The contract both flows write is documented in the doc "The Wave Contract": https://claude.ai/code/artifact/07eabd81-8f54-4dc3-b15b-afa148a7ad8d

## 3. Decisions taken

Figma to HTML
- Build our own converter inside Wave (`@wave/figma`), no third-party converter. FigmaToCode was ruled out (plugin-only, GPL-3).
- Deterministic conversion: take `get_design_context` reference code (React + Tailwind), render it to static HTML, compile only the Tailwind classes used to real CSS, map Figma variables to token CSS variables, fix font names. No AI rewrite of the markup.
- Fidelity: pixel-match per frame, one frame per breakpoint. Pass mark proposed: structural difference at most 0.25% (raw difference reported for information). Confirm the number with Asim after more frames.
- Look lock: the semantic pass must not change how a screen looks. Proven by a pixel-identical screenshot before and after, plus a DOM diff. With screens built from component instances, no element swaps are needed.
- Breakpoint frames would merge into one screen with media queries. Keel is 1440 only for now.

Tokens and design system
- **Figma is the source of truth.** Where Figma and a DTCG export disagree, Figma wins. Tokens are built from Figma's variables, text styles and effect styles; the engineer's export is no longer needed.
- Fonts: use free fonts when they exist; otherwise stop and ask the engineer for the font files. Keel uses Geist and Geist Mono (free).

Questions and API
- In the Figma flow the engineer answers every question in the terminal. No link from Wave to the engineer's repo.
- No OpenAPI in the engineering flow, but the prototype must still work: add a per-action succeed/fail switch in the viewer, simulated loading, and carry typed form values between screens through prototype state.

Screens shared across flows (applies to both flows)
- A screen belongs to the project, with one identity, one URL and versions. Features reference screens pinned to a version.
- A feature that changes a screen creates a new version; others keep theirs.
- **Lock on approval**: an approved feature's pins are frozen forever.
- **Master app prototype** per project shows every screen at its **latest approved** version.
- **Conflicts: warn, then build on top**: if a screen has an unapproved change in another feature, say so and build on it (one straight line of versions).
- Applies to the designer flow too (publish matches the same screen in the project, not the same name in the feature).
- No migration of old projects needed (they were deleted; see 4).

Skills
- Figma flow skills are served by Post-it via `get_skill`, like Wave Build, with the scripts in a package.

## 4. State of staging (Supabase project `xtabecsqvvgitblwmftr`, Railway staging)

- Deleted on Asim's instruction: Wave projects "Keel - Dummy Project", "Nimbus", "Shopfront". Only "spicy" remained. Their 85 HTML files are still in the `artifacts` storage bucket, unreferenced (SQL cannot delete storage objects; needs the Storage API). Offer a cleanup job.
- **Created: project "Keel"** in the Design space, id `e644e0e1-15ef-46e1-99b7-aaecd818eb7a`, path `/s/design/keel`.
- **Saved: Keel DESIGN.md** (approved by Asim), page id `2140dc11-631e-4313-bf96-04aa1c6e93eb`. Copy in `data/keel-DESIGN.md`.
- **Not saved yet: Keel tokens.** Built and validated (303 tokens, 0 problems) in `data/keel-tokens-figma.json`. Ask Asim before saving to the project's `design-system/tokens` page.

## 5. Figma

- Use **`39lO3zxf1SU4lmjSGlljwS`** ("Keel - New File"). Connected account `asim@maq.dev`, Full seat in asim's team, with edit access (needed: `use_figma` requires edit access even for read-only scripts).
- Do not use the old file `5Com7iQmv0VdLMBP3ELKQG`: it sits on a plan where the account has a View seat and hits the MCP call limit.
- Before calling `get_design_context` load `skill://figma/figma-design-to-code/SKILL.md`; before `use_figma` load `skill://figma/figma-use/SKILL.md`.
- Tool output is capped at about 20 KB. For bigger data, return a compact form plus a checksum (djb2 over the string), save it locally and verify the checksum. `data/keel-figma-vars.txt` was saved this way (284 lines, length 12164 characters, checksum 1362011111).

Pages: `0:1` Cover, `1:85` ---, `28:129` Design System, `1:86` Screens. Flow start: `28:398`.

Screens (all 1440 wide, built from component instances):

| Frame | Id | Prototype links |
| --- | --- | --- |
| Qualification Form 01 About you DS | `28:398` | Continue to 02 |
| Qualification Form 02 Your project DS | `28:534` | Stepper to 01, Back to 01, Continue to 03 |
| Qualification Form 03 Budget & timing DS | `28:728` | Steppers to 01 and 02, Back to 02, See if we're a fit to 04 |
| Qualification Form 04 Qualified DS | `28:897` | Back to website opens https://keel.studio in a new tab |

Design System page `28:129`, sections Brand + Icons, Buttons, Form controls, Navigation + Content:
- Component sets: Icon `28:153` (Arrow right, Arrow left, Chevron down, Plus, Check, Check small), Button `28:197` (Primary, Secondary, Ghost, Link x Default, Hover, Disabled; label, show icon), Text field `28:234` (Default, Filled, Focus, Error, Disabled; label, value, optional, helper), Select `28:271`, Chip `28:280`, Checkbox `28:286`, Radio `28:291`, Option card `28:325` (Checkbox or Radio x Default, Hover, Selected), Segment item `28:330`, Header `28:357` (Step, Complete), Stepper item `28:386` (Upcoming, Current, Completed).
- Components: Logo `28:131`, Segmented control `28:331`, Summary stat `28:387`, Next step item `28:390`, Success mark `28:397`.
- Variables: Primitives 105, Semantics 179. Text styles: 15 (Keel/display ... Keel/lede), all bound to `type/<name>/*` variables. Effect styles: 5 shadows (focus-ring, focus-ring-error, focus-ring-field, selected-inset, segment-thumb) bound to colour and spread variables, plus Keel/blur/bar bound to `blur/bar` (16 px).

## 6. Network

- This cloud environment's gateway refused `www.figma.com` (403) all session, even after Asim added it to the allowed domains; the setting likely applies to new sessions only. **First action in the new session: one request to `https://www.figma.com/` to check.** If still 403, stop and tell Asim.
- It was needed to download asset files referenced by `get_design_context`. **Vectors no longer need it**: `use_figma` with `node.exportAsync({ format: "SVG_STRING" })` returns Figma's own SVG through the MCP connection. All 6 icons, the Logo and the Success mark are saved in `data/svg/` (lengths checked against Figma's output). Raster images, if a file has any, would still need the host or `exportAsync` PNG.
- The icons are exported with a fixed stroke `#111113`; the design system says instances recolour the stroke, so the converter should write `stroke="currentColor"` and colour by the instance.
- Headless Chromium could not load Google Fonts; fonts were downloaded with curl from fonts.googleapis.com and loaded locally. In the real flow, fonts go to the project with `upload_asset`.

## 7. Spike results (old file, frame "01 About you")

Scripts in `spike/`:
- `convert.mjs`: reference JSX to static HTML (esbuild + React render, Tailwind v4 `compile` with only the used classes, Figma variable to token mapping, font name fix). Env `FONTS_CSS` points at a local font stylesheet.
- `diff.mjs`: Playwright render at the frame size (`executablePath: /opt/pw-browsers/chromium`), pixelmatch against Figma's PNG, worst blob and grid cells.
- `struct.mjs`: structural difference (both images blurred 1.2px, then pixelmatch), which ignores glyph rasterisation.
- `build-dtcg.mjs`: builds the DTCG file from `data/keel-figma-vars.txt` plus the text and effect style bindings.
- Dependencies used in a scratch folder: `tailwindcss@4 pixelmatch@6 pngjs@7 react@19 react-dom@19 esbuild`; Playwright and sharp from the postit repo.

Numbers: raw difference 0.63%, structural 0.13%; the same render shifted 2px scores 1.11%, so the metric catches layout errors. Every remaining difference was glyph edges. Comparison image: `data/cmp.png`.

Caveats to redo properly in the new session: the spike used a PNG screenshot of the arrow icon (the SVG could not be downloaded) and locally downloaded fonts. The spike frame was built before the file had components; redo on the DS frames of the new file.

## 8. Wave bugs found (fix before screens use the tokens)

1. `parseTokens` / `flattenTokens` in `packages/wave-spec/src/tokens.ts` do not resolve references inside composite values: shadow and typography tokens keep `{color.accent.ring}` as text, so generated CSS would be wrong.
2. A `number` token (`opacity.disabled` 0.7) is normalised as a length (`len:0.7px`).
3. The spike's hard-coded value detector matched `top-[...]` as padding; the real converter must only flag style properties.

## 9. Next steps, in order

1. Check `www.figma.com` with one request. If blocked, carry on: vectors come from `exportAsync` (see section 6); stop only if a raster image is needed.
2. Ask Asim to approve saving `data/keel-tokens-figma.json` to the Keel project's `design-system/tokens`; save it.
3. Fix the Wave token bugs in section 8, with tests (`npx vitest run packages/wave-*`).
4. Component specimens: for each component set, `get_design_context` on the set, download its assets, convert with the deterministic converter, verify fidelity, and save one specimen page per component in `design-system/components`. Show Asim and get approval (the design system must be approved before any screen is uploaded).
5. Build `@wave/figma` properly from the spike (converter, fidelity, look lock, font handling, breakpoint merge) and the shared-screens model (project screens, version pins, lock on approval, conflict warning, master prototype), plus the API-less prototype additions.
6. Feature step on the four DS frames: convert, FEATURE.md from frames and prototype links, questions in the terminal, dry run, preflight, publish, prototype.
7. Write the Figma flow skills (served by Post-it) and a manual chapter.

## 10. Useful ids

- Post-it staging MCP tools: `create_folder`, `set_project`, `wave_save_brief`, `wave_get_brief`, `get_catalogue`, `upload_asset`, `preflight_html`, `wave_dry_run`, `wave_apply_answers`, `wave_publish_flow`, `get_prototype`.
- Design space id `8ca51f80-bf3f-4e2b-bebe-932125de7b42`.
- Railway: project `3a3f54d9-0797-4a21-8c34-2c5a6918ea47`, service `f26e0898-fb99-417b-861d-fea4ef510759`, environment `b27f8115-ea40-48cf-8079-19f5d04d8f79`. Staging URL https://post.staging.maqsoodlabs.com (Railway domain web-staging-347f.up.railway.app also works)
