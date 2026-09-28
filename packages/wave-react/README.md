# @wave/react

Wave's review UI for React 18+.

- `WaveProvider` with a `WaveUi` adapter: the host's API base, link component,
  navigation, addresses and comment API.
- `ReviewApp` (one screen: frame, layers, panel, findings, comments),
  `Compare` (two versions side by side), `FlowOverview` (server-renderable;
  takes `reviewHref`, `resourceHref`, `Link` as props), `FlowToggle`,
  `FlowApproval`, `WaiveButton`, `TokenInventory`, `useFrame`.
- `wave.css`: import once. Colours are `--wave-*` variables with a plain light
  and dark default; map them to the host's theme.

`FlowOverview` writes the flow graph as `<pre class="mermaid">`; the host draws
it if it has mermaid.
