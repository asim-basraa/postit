# Notes for Claude

## Wave's product docs

Wave's docs live in Post-it (the Wave space, a restricted space at `/s/wave`, with
the skills under `skills/designer` and `skills/engineering`) and their source
is `packages/wave-docs`: hand-written pages in `pages/`, references generated
into `reference/` by `npx tsx packages/wave-docs/src/generate.ts`.

After any change to Wave (the `packages/wave-*` packages, the Wave skills, the
Wave MCP tools, or Post-it's host adapter and Wave routes), check every page in
`packages/wave-docs/pages` against it and **tell the user which pages need
updating and why**, even when they did not ask. Pages most often affected:
`architecture.md` (layers, packages, host contract, flows, security),
`hosting.md` (the host contract), `roadmap.md` (status and known limits),
`concepts.md` (new terms), `index.md`, the user manual and the Figma guides.
When updating, regenerate the references, commit, and republish the changed
pages to Post-it. Keep the docs free of environment addresses and secrets: they
also go to production.
