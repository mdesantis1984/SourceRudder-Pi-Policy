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
  -> tool_call: classify; allow browser MCP/local; track SourceRudder; redirect denied research without UI unless failure-eligible
  -> one-shot gate: reserve ID -> serialize TUI -> recheck identity -> freeze ORIGINAL -> consume
  -> tool_result: correlate outcome; update session eligibility; reset matching successful retry fingerprint
  -> shutdown/before switch/fork/tree/compact: reset eligibility; revoke awaited consent closures
  -> start/tree/compact: reset eligibility; bind a fresh live manager/session and epoch
```

The extension does not create tools, providers, MCP clients, subprocesses, or
network connections.

## Classification boundary

| Route | Decision |
| --- | --- |
| `sourcerudder_*`, `mcp__sourcerudder*`, or an `mcp` call explicitly identifying SourceRudder | Allowed as SourceRudder. |
| Exact native names `web_search`, `source_check`, `fetch_content`, `get_search_content`, `websearch`, `webfetch` | Denied without UI; fresh one-shot local TUI confirmation only after SourceRudder error. |
| Identifiable non-SourceRudder MCP web-research route | Same redirect-first denial and failure-only one-shot gate. |
| All tools on exact browser MCP servers (`playwright`, `browserbase`) | Outside THIS extension's research gate, without research consent. |
| Ambiguous, local/code, Bash, memory, and unrelated MCP capability | Outside the web-research block. |

An explicit foreign MCP server identity takes precedence over a
SourceRudder-looking tool name. The policy deliberately does not make ambiguous
routes into a broad block.

The whole-browser-MCP exclusion validates the namespaced server and every supplied
`server`, `serverName`, and `mcpServer` alias before SourceRudder classification.
They must agree on the exact browser identity (case-insensitive); conflicts,
foreign namespaces and malformed namespace boundaries fail closed. Lookalikes
receive no exemption. Tool names and operation payloads are not an allowlist:
tab selection (`index: 0` included), snapshots, navigation, click/fill, evaluation,
research-like names and unknown operations are all outside this research gate.
Other safety/account permissions remain independent. Remaining protected research
stays SourceRudder-first with failure-only eligibility; the one-shot consent
protections and retry guard remain unchanged.
Guidance refresh removes the exact prior narrow-browser one-shot block as well
as older owned blocks, preserving unrelated host text.

## Callable guidance and redirects

The active Pi block names declared `mcp__sourcerudder__<tool>` routes:
`search_web`, `search_doc_oficial`, `search_github`, `search_github_issue`,
`search_github_pr`, `search_stackoverflow`, `search_reddit`, `search_news`,
`fetch_url`, `fetch_and_extract`, `deep_research`. Without declared tools, use
codemode `tools.mcp__sourcerudder__<tool>({...})`.

Native `web_search`/`websearch`/`source_check` redirect to
`mcp__sourcerudder__search_web` (docs: `mcp__sourcerudder__search_doc_oficial`;
GitHub: `mcp__sourcerudder__search_github`). `fetch_content`/`webfetch`/
`get_search_content` redirect to `mcp__sourcerudder__fetch_url` or
`mcp__sourcerudder__fetch_and_extract`. Identifiable alternative MCP routes use
the same search/fetch guidance. The previous complete always-prompt Pi block is
also replaced; legacy OpenCode guidance remains unchanged.

## ONE EXECUTION consent boundary

`src/one-shot-consent.ts` owns ephemeral consent, not a permission store. Only
classifier-denied calls with failure eligibility enter it: retry-guard errors
never offer an override. Ineligible calls return a replacement route and
`[policy_denial=sourcerudder_first]` without invoking the consent helper.

Eligibility is session-scoped and changes only on correlated, newly resolved
SourceRudder results (same session, call ID, tool and input fingerprint).
`isError: true` enables it; success clears it, irrespective of fingerprint.
Missing/mismatched results do neither. Errors retain unresolved retry state and
pending-ID protection but are marked resolved to prevent result replay.
Every existing start/switch/fork/tree/shutdown/compaction hook resets eligibility
and advances an epoch; pre-reset pending results cannot enable consent.
No global disable, automatic provider switching, model-callable grant or approval
argument/flag is registered. RPC, print, JSON, missing mode and no UI deny even
with `hasUI: true`. Only the local TUI's explicit boolean `true` can permit a call.

The dialog displays exact tool, call/parent IDs, operation and complete canonical
JSON input, target/cwd and denial reason, with ONE EXECUTION disclosure consequences.
Controls are escaped. Lossless JSON rejects cycles, getters, hidden/symbol fields,
non-plain prototypes, sparse arrays, non-finite numbers, negative zero and capacity
overflow; oversized input is denied rather than truncated for approval.

Binding captures session ID, live manager, epoch, cwd, tool name, call ID, parent
ID, input reference/canonical JSON and signal. After the awaited dialog all must
still match. Revocation aborts old closures; manager/session mismatch denies and
revokes, never silently reactivates. Lifecycle activation alone establishes the
replacement. Cancelled navigation or failed compaction stays revoked until a fresh
start/tree/compact event or runtime reload. Cancel/timeout/UI exceptions/abort,
mutation and replay always deny.

IDs reserve synchronously before checks (including denied attempts), consume before
returning allow, and never reopen after success, error, timeout or a later hook denial.
A new invocation always requires a new ID and fresh confirmation. Limits: eight
pending dialogs, 30-second deadline including queue time, 4096 IDs without eviction
per runtime, JSON depth 32/4096 nodes, and 8192-character display budget. A cancelled
request returns denial promptly but holds its serial slot until the real UI settles;
a broken UI cannot replace another pending dialog. No automatic retry or stored grant.

The approved gate deep-freezes the ORIGINAL input graph and event, not a clone,
locking later hooks' property writes and input/name/ID/parent reassignment. Tools
that mutate input can fail after entry: no rollback or universal compatibility claim.
`test/dispatch-contract.test.ts` exercises production helper AND full extension
hooks using real dispatch/runner and deterministic fake tools. Evidence covers
Pi/agent-core `0.85.1` model loop (direct/nested APIs unavailable) and `1.0.3`
model/direct/nested calls, including codemode-style parent IDs. Uncharacterized
versions fail the proof test; the official wildcard peer and old dev pin remain.
This is not a live browser/authentication or hidden external traffic test.

Audit retains at most 256 in-memory status/opaque request-ID entries; no raw
arguments, dialog text, private cwd or fingerprints. Transient outcome correlation
uses frozen call references, bounded by the ID cap, and is cleared on revocation;
it is not persisted or exposed as audit.

## Retry guard

State is held only in extension memory and is keyed by Pi session plus a stable
serialization of tool name and input. Eleven unresolved matching calls are
allowed; the twelfth is blocked. A successful result resets only its matching
fingerprint. Failed, missing, different-session, different-tool, or different-
input results do not reset it. Session shutdown removes that session state.

## Verification and operational limits

- `check:package` uses npm's installed packlist/Arborist and an in-memory tar
  roundtrip (12 files, including the consent helper), validating the Pi manifest, the
  runtime files, the external-MCP boundary, and the absence of forbidden local
  artifacts.
- `verify:installed` uses the already installed Pi development loader and the
  repository TypeScript loader for hook registration and async consent/mode smoke.
  It does not install dependencies, write a tarball, call a model/provider or modify
  Pi settings. It does not prove a fresh production installation.
- The policy cannot inspect network traffic hidden inside the external
  SourceRudder MCP process. It therefore does not claim network isolation or
  SourceRudder availability.

See the [runbook](../RUNBOOK.md) for scope selection, reload, removal, and
rollback.
