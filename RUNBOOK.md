# Pi SourceRudder Policy runbook

[English](RUNBOOK.md) · [Español](RUNBOOK.es.md) · [Overview](README.md)

Use this procedure to enable or remove the local Pi package without changing
SourceRudder configuration. SourceRudder must already be configured and healthy.

## Quick operation

```sh
npm ci --ignore-scripts
npm run check
pi install /absolute/path/to/pi-sourcerudder-policy
```

In the target Pi session, run:

```text
/reload
```

`npm run check` must pass before installation. It typechecks, runs policy tests,
checks npm's packlist and an in-memory tar manifest, validates bilingual documentation, and
loads the entry through the already installed Pi loader with async mode/consent
fixtures. It performs no fresh installation, changes no Pi settings and invokes
no model/provider.

## Choose the installation scope

| Need | Command | Operational implication |
| --- | --- | --- |
| Apply to the user configuration | `pi install /absolute/path/to/pi-sourcerudder-policy` | Pi writes user settings; the package is available to sessions using that configuration. |
| Apply only to this repository | `pi install -l /absolute/path/to/pi-sourcerudder-policy` | Pi writes `.pi/settings.json`; project package discovery occurs at startup after project trust. |

Use only one scope unless you intentionally need both. A project entry wins over
the same global package identity. Global scope does not modify every repository;
project scope does not reach other workspaces.

Agents, skills, and subagents inherit the boundary only when their visible tool
calls execute in the Pi runtime that resolved this package. A separate process,
user configuration, or project workspace requires its own installation decision.

## Verify the installed behavior

1. Run the repository harness:

   ```sh
   npm run verify:installed
   ```

   Expected signal: `verify-installed: PASS ...`. It uses the repository TypeScript
loader and already installed Pi development loader. It verifies registered hooks,
first-attempt redirect without UI, then a fake SourceRudder error followed by
async TUI approval/replay/shutdown, and RPC/print/JSON denial. The package check
separately validates all 12 allowlisted files with npm's packlist and an in-memory
tar roundtrip, without cache or artifact writes. This does
not prove a fresh production installation.

2. In a reloaded Pi session, verify that SourceRudder is already offered by its
   separate MCP configuration. The injected guidance should direct web research to
   SourceRudder.
3. Confirm known native research tools deny without asking and name the SourceRudder
   replacement. ONE EXECUTION is offered only after a correlated SourceRudder error;
   a successful SourceRudder result or lifecycle reset clears eligibility.
   Local/code tools remain available. Do not execute live research as part
   of this smoke or treat it as a network-traffic inspection.
4. For an identical SourceRudder tool/input in one session, eleven unresolved
   calls are permitted and the twelfth is blocked. A matching successful result
   clears only that session fingerprint.

All tools on exact `playwright` and `browserbase` MCP servers are outside THIS
extension's research gate, including tab selection with `index: 0`, snapshots,
navigation, click/fill, evaluation, research-like names and unknown operations.
Generic and namespaced routes require consistent exact server identities; foreign
namespaces and contradictory aliases fail closed. Other safety/account permissions
remain independent. Remaining protected research stays SourceRudder-first and uses
the separate one-shot TUI gate below. Local tests do not prove live browser
connectivity, authenticated Chrome readiness or current-session activation.

The extension does not bundle or test SourceRudder connectivity. A passing local
harness proves packaging and loadability, not external MCP availability.

## Historical temporary no-network TUI smoke (retired)

The procedure below records the previous always-prompt behavior, not a current
activation recipe. The temporary fixture and coupled test were removed. Do not
recreate or run them as part of these checks. With redirect-first enforcement,
a first alternative attempt does not prompt; consent tests must first establish
a correlated SourceRudder error. Repository tests use deterministic fake results.

For this activation, preflight resolved the installed user package directly to
repository source on Pi `1.0.3`. No reinstall, copying or settings edits are needed;
project `.pi/settings.json` is absent. Registration alone is not loaded-state proof.

1. After checks/review, the **human** runs `/reload` in the target TUI. The temporary
   `.pi/extensions/one-shot-policy-smoke.ts` autoloads from the trusted project.
   At `session_start` it checks `pi.getAllTools()` for collisions before registering
   three distinct tools; it refuses collisions rather than shadowing tools. Loading
   and startup execute no tools. Stop if it fails to load or the expected gate is absent.
2. Call `policy_smoke_status` with `{}`: expect `executions: 0`, `disabled: false`.
   Call **only** the fake `mcp__policy_smoke__web_search` with exactly
   `{"sample":"local-only-no-network"}`. Human **rejects** the production
   ONE EXECUTION dialog; status must still report **0**.
3. Make a new invocation with a **new call ID** and the same fixed input. Human
   **approves** the displayed exact fake call in the TUI; expect the fixed LOCAL
   response and status **1**. No model-supplied approval data is permission.
4. Make another invocation with a **new call ID**, same input. A fresh dialog must
   appear; human **rejects** it. Status must remain **1**. Never automatically retry.
5. Only after updated policy is active, the parent may inspect actual Chrome with
   `mcp__playwright__browser_get_config` `{}` and `mcp__playwright__browser_tabs`
   `{"action":"list"}` as a limited connectivity check, not the exclusion's scope.
   Browser actions still require independent safety/account authorization; this
   implementation does not authorize live calls or run real blocked research.
6. Call `policy_smoke_disable` `{}` to hide only the three fixture tools using
   re-registration with `exposure: "hidden"` and remove only their active names.
   It does not disable policy. The parent removes the temporary fixture **and its
   coupled `test/smoke-fixture.test.ts` test asset**, then the human runs a second
   `/reload`. Removal without reload does not unload existing definitions; reload
   while the file remains would create a fresh fixture/counter. Confirm fixture
   names are gone and production policy remains active.

This is an ephemeral test asset, not a shipped capability: the package allowlist
remains 12 files and excludes `.pi` and tests. The fixture only holds an in-memory
counter capped at three successful executions and returns fixed local text. It has
no network/browser/file/process actions, delegated tools or consent implementation.
Status is read-only; disable only withdraws its own definitions, with no self-delete.
Deterministic production-consent mocks prove reject/approve/new-ID reject counts
`0/1/1`, **not actual human confirmation**. Live TUI dialog and Chrome readiness
remain unproved until this parent-led procedure is observed.

## Callable research routes

Declared tools use `mcp__sourcerudder__<tool>`: `search_web`, `search_doc_oficial`,
`search_github`, `search_github_issue`, `search_github_pr`, `search_stackoverflow`,
`search_reddit`, `search_news`, `fetch_url`, `fetch_and_extract`, `deep_research`.
If not declared, use codemode `tools.mcp__sourcerudder__<tool>({...})`.
Native `web_search`/`websearch`/`source_check` redirect to
`mcp__sourcerudder__search_web` (docs: `mcp__sourcerudder__search_doc_oficial`;
GitHub: `mcp__sourcerudder__search_github`). `fetch_content`/`webfetch`/
`get_search_content` redirect to `mcp__sourcerudder__fetch_url` or
`mcp__sourcerudder__fetch_and_extract`. The initial denial carries
`[policy_denial=sourcerudder_first]`; it is not a request to seek human approval.

## Respond to ONE EXECUTION confirmation

1. Use SourceRudder first. An alternative classified as disallowed is denied
   without asking unless the session's most recent correlated SourceRudder result
   has `isError: true`. Only then can it ask through the local TUI; RPC, print,
   JSON and no UI deny, even with `hasUI`. Success and session lifecycle reset
   (including compaction) clear eligibility; stale/mismatched results cannot enable it.
2. Read the exact tool, call/parent IDs, operation, complete canonical arguments,
   target/cwd and denial reason. Approval can contact that provider/target and
   disclose the displayed arguments; oversized/unrepresentable payloads deny
   before prompting, and terminal controls are escaped rather than executed.
3. Approve only this execution or decline. No standing permission, global policy
   disable, model-callable grant, approval flag or automatic provider switching exists.
4. A retry after success, error, timeout or later hook denial needs a new ID and
   fresh confirmation. Abort, cancellation, UI exception, identity/input mutation
   or session/context change denies; no automatic retry or restored grant.

Dialogs serialize, have a 30-second deadline including queue time, and cap pending
requests at eight. IDs are reserved before allow/deny and never evicted (4096 per
runtime); capacity exhaustion denies. Audit retains at most 256 in-memory statuses
and opaque request IDs, never raw arguments, dialog text, private cwd or fingerprints.
A UI that ignores cancellation keeps its serial slot until it settles; restart or
reload the runtime rather than automatically retrying. Cancelled session navigation
or failed compaction leaves consent revoked until a real start/tree/compact event
or reload establishes a fresh lifecycle. Stale shutdown contexts do not reactivate it.

Inputs and the original event are deeply frozen before returning allow. A tool
that mutates its input may fail after entry, without rollback or universal tool
compatibility. Real-dispatch tests cover Pi/agent-core `0.85.1` model execution
(direct/nested unavailable) and `1.0.3` model/direct/nested, including codemode-style
IDs. These fake-tool tests prove no unapproved later-hook variant executes, not
live authenticated browser readiness or compatibility with unknown Pi versions.
The SourceRudder 11/12 guard remains independent and cannot be overridden by consent.

## Reload and removal

After changing package registration, run `/reload` in the affected Pi session or
start Pi again. To remove the package, use the matching scope:

```sh
pi remove /absolute/path/to/pi-sourcerudder-policy
pi remove -l /absolute/path/to/pi-sourcerudder-policy
```

Then run `/reload` or start a new Pi session. `pi remove` changes Pi settings;
the repository checks and installed-package harness do not.

## Rollback

1. Remove the package from the scope where it was installed.
2. Reload or restart the affected Pi session.
3. Confirm that the package no longer appears in `pi list` and that the policy
   guidance and tool blocks are absent from new turns.
4. Leave the separately configured SourceRudder MCP untouched unless its own
   operator procedure calls for a change.

Rollback removes only this packaging and policy layer. It does not restore or
modify external MCP configuration, network behavior, user credentials, agents,
skills, or subagents outside the selected Pi scope.

## Boundary reminder

Pi can evaluate visible tool calls. It cannot inspect network traffic hidden
inside the external SourceRudder MCP process. The policy is not network isolation;
it does not block Bash or unrelated MCP capabilities. See
[architecture](docs/architecture.md) for the exact runtime boundary.
