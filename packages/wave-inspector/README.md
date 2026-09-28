# @wave/inspector

The script Wave adds to a mockup framed for review, and the messages it
exchanges with the page around it.

- `src/inspector.js` is the script. It runs inside a frame served with
  `sandbox allow-scripts allow-popups` (no `allow-same-origin`), highlights and
  selects elements, reads computed styles and the box model, pins comments,
  previews component states, and follows `data-wave-to` in interact mode. It
  reads `data-wave-*` and legacy `data-pi-*`.
- `INSPECTOR_SOURCE` is that script as a string (generated: run
  `npm run build` in this package after editing `inspector.js`; the test fails
  while they differ). Serve it from the host's own origin.
- `injectInspector(html, src)` adds the script tag.
- `src/protocol.ts`: the `wave:*` message types and `readMessage`, which
  validates every message from the frame. The frame is somebody's markup, so
  its messages are untrusted input.

Frame to page: `wave:hello`, `wave:hover`, `wave:select`, `wave:range`,
`wave:region`, `wave:styles`, `wave:pin-click`, `wave:unresolved`,
`wave:navigate`, `wave:key`, `wave:scroll`, `wave:state-previewed`.
Page to frame: `wave:mode`, `wave:select`, `wave:highlight`, `wave:pins`,
`wave:show-anchor`, `wave:clear-transient`, `wave:get-styles`, `wave:box`,
`wave:preview-state`, `wave:hide-conditional`, `wave:diff`, `wave:scroll-to`.
Every command carries `protocol: PROTOCOL_VERSION`.
