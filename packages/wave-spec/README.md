# @wave/spec

The mockup spec vocabulary (v1) and everything that reads or writes it.

A mockup is an HTML file whose elements say what they are and what they do
through `data-wave-*` attributes and `wave:` meta tags. The HTML is the spec:
Wave indexes it and never keeps a second copy. The full reference, written for
the designer and for Claude Design, is the **Wave Design** skill in
`@wave/skills`; the machine-readable list is `src/vocabulary.ts`.

Files written before the rename use `data-pi-*`, `pi:` and `pi-resources`. They
are read as exact aliases (a `legacy-prefix` info finding says so), edits keep
the element's own prefix, and `upgradePrefix(html)` rewrites a file to the
current names without touching anything else.

Part of the Wave SDK: see `docs/wave/README.md`.

| Module | What it does |
| --- | --- |
| `vocabulary` | Attribute names, meta names, the id format, the path grammar. |
| `parse` | Reads screen meta and nodes (anything with `data-wave-id` or `data-pi-id`) with parent chains, and reports findings: missing spec, duplicate ids or slugs, attributes without ids, unknown attributes, bad destinations, repeaters without an item, vanished ids. |
| `destination` | `screen:`, `node:`, `modal:`, `back`, `url:`. |
| `edit` | Byte-exact edits: set or remove attributes on one element, wrap words in a bound span, unwrap, upgrade `data-pi-*` to `data-wave-*`. Nothing else in the file changes. |
| `tokens` | W3C DTCG flattening with aliases, value normalisation, CSS variable names. |
| `css` | Literal style values that match no token, found by reading the CSS. |
| `flow` | Data dictionary, action catalog, flow graph (Mermaid), completeness checks, states, vocabulary for autocomplete. |
| `handover` / `zip` | The handover bundle for an approved flow. |
| `anchor` | Where a comment points (`CommentAnchor`), status labels, `describeAnchor`. |
| `client` | The browser-safe subset (no HTML parser). |

Tests: `npx vitest run packages/wave-spec`.
