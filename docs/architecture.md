# Architecture

[English](architecture.md) · [Español](architecture.es.md) · [Runbook](../RUNBOOK.md)

Pi SourceRudder Policy is a thin extension package around the existing policy
domain. It governs visible Pi tool events; SourceRudder remains a separately
configured external MCP server.

## Package boundary

`package.json` declares the documented Pi manifest:

```json
{
  "pi": { "extensions": ["./src/index.ts"] }
}
```

Pi loads the TypeScript extension entry through its extension loader. The package
has no runtime dependencies or bundled MCP server. Its Pi runtime peer
compatibility is intentionally the wildcard `*`: Pi bundles this core API for
extensions and supplies it at install time. Development tests instead pin
`@earendil-works/pi-coding-agent` exactly to `0.85.1` for reproducibility and
require Node.js `>=22.19.0`, matching that Pi release.

## Runtime flow

```text
Pi agent turn
  -> before_agent_start: preserve host text and append one policy block
  -> tool_call: classify the visible route, block known alternatives, track SourceRudder
  -> tool_result: reset only a matching successful SourceRudder fingerprint
  -> session_shutdown: clear session-local tracking
```

The extension does not create tools, providers, MCP clients, subprocesses, or
network connections.

## Classification boundary

| Route | Decision |
| --- | --- |
| `sourcerudder_*`, `mcp__sourcerudder*`, or an `mcp` call explicitly identifying SourceRudder | Allowed as SourceRudder. |
| Exact native names `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Blocked. |
| Identifiable non-SourceRudder MCP web-research route | Blocked. |
| Ambiguous, local/code, Bash, memory, and unrelated MCP capability | Outside the web-research block. |

An explicit foreign MCP server identity takes precedence over a
SourceRudder-looking tool name. The policy deliberately does not make ambiguous
routes into a broad block.

## Retry guard

State is held only in extension memory and is keyed by Pi session plus a stable
serialization of tool name and input. Eleven unresolved matching calls are
allowed; the twelfth is blocked. A successful result resets only its matching
fingerprint. Failed, missing, different-session, different-tool, or different-
input results do not reset it. Session shutdown removes that session state.

## Verification and operational limits

- `check:package` validates the actual `npm pack` manifest, the Pi manifest, the
  runtime files, the external-MCP boundary, and the absence of forbidden local
  artifacts.
- `verify:installed` packs, production-installs, and imports the declared entry
  in a temporary directory using the repository TypeScript loader. It does not
  call Pi, a model, a provider, or modify Pi settings.
- The policy cannot inspect network traffic hidden inside the external
  SourceRudder MCP process. It therefore does not claim network isolation or
  SourceRudder availability.

See the [runbook](../RUNBOOK.md) for scope selection, reload, removal, and
rollback.
