# @wave/mcp

Wave's tools for agents, as plain definitions a host adds to its own MCP
server. `createWaveTools()` returns `mark_addressed`, `set_flow`,
`check_screen`, `get_handover` and `get_handover_screen`; each `run(host, args)`
takes the `WaveHost` for the agent's session. `describeAnchorForAgent` turns a
comment's anchor into words an agent can act on.
