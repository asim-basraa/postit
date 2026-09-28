# @postit/mockup-spec

The mockup spec vocabulary (v1) and everything that reads or writes it.

A mockup is an HTML file whose elements say what they are and what they do
through `data-pi-*` attributes and `pi:` meta tags. The HTML is the spec: Post-it
indexes it and never keeps a second copy. The full reference, written for the
designer and for Claude Design, is the **Design for Post-it** skill in
`content/skills.ts`; the machine-readable list is `src/vocabulary.ts`.

| Module | What it does |
| --- | --- |
| `vocabulary` | Attribute names, meta names, the id format, the path grammar. |
| `parse` | Reads screen meta and nodes (anything with `data-pi-id`) with parent chains, and reports findings: missing spec, duplicate ids or slugs, attributes without ids, unknown attributes, bad destinations, repeaters without an item, vanished ids. |
| `destination` | `screen:`, `node:`, `modal:`, `back`, `url:`. |
| `edit` | Byte-exact edits: set or remove attributes on one element, wrap words in a bound span, unwrap. Nothing else in the file changes. |
| `tokens` | W3C DTCG flattening with aliases, value normalisation, CSS variable names. |
| `css` | Literal style values that match no token, found by reading the CSS. |
| `flow` | Data dictionary, action catalog, flow graph (Mermaid), completeness checks, states, vocabulary for autocomplete. |
| `handover` / `zip` | The handover bundle for an approved flow. |
| `client` | The browser-safe subset (no HTML parser). |

Tests: `npx vitest run packages/mockup-spec`.
