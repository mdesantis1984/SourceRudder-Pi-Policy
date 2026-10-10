# Pi SourceRudder Policy

[English](README.md) · [Español](README.es.md)

A private Pi package that defaults visible web research to a separately
configured SourceRudder MCP, with one-shot human-confirmed TUI contingency. It
does not configure, start, bundle, or publish SourceRudder.

## Quick path

1. Configure and verify the SourceRudder MCP separately before installing this package.
2. In this repository, run `npm ci --ignore-scripts` and `npm run check`.
3. Install globally with `pi install /absolute/path/to/pi-sourcerudder-policy`, then run `/reload` in Pi.
4. Confirm `npm run verify:installed` reports an offline installed-runtime loader
   and async consent smoke. It performs no fresh install or model/provider call.

For a project-only installation and removal procedure, use the
[runbook](RUNBOOK.md). The runtime design is in [architecture](docs/architecture.md).

## Enforced boundary

| Visible Pi tool path | Behavior |
| --- | --- |
| SourceRudder direct, generic MCP, or namespaced MCP route | Allowed and tracked. |
| `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Denied by default; only fresh local TUI confirmation permits one invocation. |
| Identifiable non-SourceRudder MCP web-search or fetch route | Same one-shot TUI gate; otherwise denied. |
| All tools on exact `playwright` or `browserbase` MCP servers | Outside THIS extension's research gate; no research consent required. |
| Local/code search and unrelated MCP capabilities | Not blocked by this policy. |

The browser MCP exclusion covers tab selection (`index: 0` included), snapshots,
navigation, click/fill, evaluation, research-like names and unknown operations.
Namespaced and generic MCP routes require consistent exact server identities;
foreign namespaces, lookalikes and conflicting aliases cannot gain exemption.
Other safety/account permissions remain independent. All remaining protected
research stays SourceRudder-first with the same one-shot fallback.

Every agent turn receives one sentinel-marked SourceRudder-first instruction
block. Complete prior policy blocks are replaced without removing unrelated host
system text.

### The 11/12 guard

For one session and one canonical SourceRudder tool/input fingerprint, eleven
unresolved calls are allowed and the twelfth is blocked. Only a matching,
successful Pi `tool_result` clears that fingerprint. Error, mismatched, or
missing result events remain unresolved.

## ONE EXECUTION, not a permission grant

Only classifier-disallowed research opens a local TUI confirmation showing the
exact tool, call/parent IDs, operation, full canonical JSON arguments, target/cwd,
and denial reason. Approval may disclose those arguments to the target/provider.
Only explicit `true` allows that execution. RPC, print, JSON and no-UI calls deny
(even with `hasUI: true`); model approval fields and flags confer no authority.
SourceRudder and the known browser MCP servers never require research confirmation.

- No global disable, automatic provider switching, persisted or reusable grants.
- Cancel, timeout, UI exception, abort, mutation, session/context change and replay
  deny. Every new invocation or retry needs a new ID and fresh human approval,
  including after success, tool error, timeout or a later hook denial.
- The original input graph and event are frozen before dispatch. Input-mutating
  tools may fail after entry: no rollback, universal compatibility or automatic retry.
- Dialogs serialize with a 30-second deadline including queue time; at most eight
  pending requests, 4096 non-evicting IDs per runtime and 256 audit records. Oversized
  or non-lossless JSON is denied, never truncated for approval; controls are escaped.
- Audit is in-memory status plus opaque request ID only, not arguments, dialog text,
  private cwd or fingerprints. A broken UI retains its serial slot until it settles.

Real-dispatch evidence covers installed Pi/agent-core pairs `0.85.1` (model loop;
direct/nested APIs unavailable) and `1.0.3` (model, direct and nested/codemode-style
calls). Unknown versions are not proved by the wildcard peer. Fake tools do not
prove authenticated browser connectivity or SourceRudder availability.

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
- Package validation uses npm's packlist and an in-memory tar roundtrip, rejecting
  test, ODD, local metadata, scripts, workflows, lockfiles and `node_modules`
  without writing caches or package artifacts.

## Operator references

- [Runbook](RUNBOOK.md): installation, reload, verification, removal, and rollback.
- [Architecture](docs/architecture.md): manifest, runtime flow, and enforcement limits.
- [MIT License](LICENSE)
