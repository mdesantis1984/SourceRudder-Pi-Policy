# Pi SourceRudder Policy

[English](README.md) · [Español](README.es.md)

A private Pi package that keeps visible web-research tool calls on a separately
configured SourceRudder MCP route. It packages the existing policy runtime; it
does not configure, start, bundle, or publish SourceRudder.

## Quick path

1. Configure and verify the SourceRudder MCP separately before installing this package.
2. In this repository, run `npm ci --ignore-scripts` and `npm run check`.
3. Install globally with `pi install /absolute/path/to/pi-sourcerudder-policy`, then run `/reload` in Pi.
4. Confirm `npm run verify:installed` reports a packaged, production-installed,
   loadable extension entry. This check does not invoke a model or provider.

For a project-only installation and removal procedure, use the
[runbook](RUNBOOK.md). The runtime design is in [architecture](docs/architecture.md).

## Enforced boundary

| Visible Pi tool path | Behavior |
| --- | --- |
| SourceRudder direct, generic MCP, or namespaced MCP route | Allowed and tracked. |
| `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Blocked with no approval or fallback path. |
| Identifiable non-SourceRudder MCP web-search or fetch route | Blocked. |
| Local/code search and unrelated MCP capabilities | Not blocked by this policy. |

Every agent turn receives one sentinel-marked SourceRudder-first instruction
block. Complete prior policy blocks are replaced without removing unrelated host
system text.

### The 11/12 guard

For one session and one canonical SourceRudder tool/input fingerprint, eleven
unresolved calls are allowed and the twelfth is blocked. Only a matching,
successful Pi `tool_result` clears that fingerprint. Error, mismatched, or
missing result events remain unresolved.

## Installation scope

| Scope | Command | Effect |
| --- | --- | --- |
| Global | `pi install /absolute/path/to/pi-sourcerudder-policy` | Writes user Pi settings and makes the package available to Pi sessions using that user configuration. |
| Project | `pi install -l /absolute/path/to/pi-sourcerudder-policy` | Writes `.pi/settings.json`; Pi loads missing project packages at startup only after the project is trusted. |

Global discovery does not alter other repositories. Project discovery does not
alter other projects. Agents, skills, and subagents are covered only when their
visible tool calls run through the Pi runtime that resolved this package; another
Pi process or workspace needs its own applicable global or project installation.

## Limits and safety

- SourceRudder must already be configured; its MCP server is an external dependency.
- The extension sees Pi tool events, not network traffic hidden inside that external MCP process.
- It does not claim network isolation and does not block Bash or unrelated capabilities.
- Package validation rejects test, ODD, local metadata, scripts, workflows, lockfiles,
  and `node_modules` from the npm tarball.

## Operator references

- [Runbook](RUNBOOK.md): installation, reload, verification, removal, and rollback.
- [Architecture](docs/architecture.md): manifest, runtime flow, and enforcement limits.
- [MIT License](LICENSE)
