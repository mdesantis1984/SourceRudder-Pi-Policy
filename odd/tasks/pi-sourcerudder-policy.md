# Pi SourceRudder Policy

## Objective

Create a Pi package that makes SourceRudder the mandatory web-research path for agents and skills running through Pi's tool system, while preserving the separately configured SourceRudder MCP server.

## Problem

The existing OpenCode companion injects SourceRudder-first guidance and blocks native research tools. Pi exposes different tool names and MCP gateway shapes, so copying the OpenCode hooks would not enforce the intended boundary.

## Why

Operators need one auditable policy layer that prevents agents and skills from silently falling back to Pi-native or third-party web-research tools when SourceRudder is available.

## Scope

- Package a Pi extension using the documented extension event API.
- Inject idempotent SourceRudder-first system guidance for every agent turn.
- Allow the configured SourceRudder MCP routes.
- Block Pi-native web research tools and identifiable non-SourceRudder MCP web-search/fetch routes.
- Preserve the OpenCode policy's session-scoped identical-attempt guard: allow eleven unresolved identical SourceRudder attempts and block the twelfth; clear state after a successful result.
- Add focused tests, package checks, installation/rollback documentation, and CI suitable for a standalone repository.

## Non-goals

- Bundle, configure, start, or publish the SourceRudder MCP server.
- Claim network isolation or intercept traffic hidden inside an external MCP server process.
- Block Bash, local file/code search, or unrelated MCP capabilities.
- Copy the source repository's untracked campaign assets.

## Constraints

- Technical artifacts are written in English; operator-facing primary docs remain bilingual where practical.
- The extension must fail closed for known alternative web-research tools without broadly blocking local search tools.
- Existing host system text must survive policy refreshes.
- SourceRudder detection must support direct tool names, the generic `mcp` gateway, and namespaced MCP proxy calls.
- No push, pull request, release, or package publication is authorized.
- The pre-existing `.directory` file is local metadata and must not be committed.

## Effective test mode

- TDD: off.
- Source: no target-project or session TDD configuration exists; source tests alone do not enable TDD.
- Verification runner: `npm test`, with `npm run typecheck` and `npm run check:package` as package checks.

## Delivery strategy

- Strategy: `ask-on-risk`.
- Forecast: approximately 650–850 authored changed lines across runtime, tests, package metadata, and concise bilingual operations documentation.
- Chain strategy: `feature-branch-chain`, explicitly selected by the user. Each task closes as a reviewable local commit on `feat/pi-sourcerudder-policy`; PR creation remains a later user decision.

## Tasks

- [ ] **PSP-001 — Implement the policy domain and retry guard**
  - Define SourceRudder route detection across direct, generic MCP, and namespaced MCP calls.
  - Define precise alternative web-research blocking without blocking local/code search.
  - Implement idempotent policy-guidance replacement and session-scoped identical-attempt accounting.
  - Add focused unit tests for allow/block classification, guidance preservation, 11/12 behavior, and successful reset.
  - Checks: focused Node tests and TypeScript typecheck.
  - Commit evidence: pending.

- [ ] **PSP-002 — Integrate the Pi extension runtime**
  - Register `before_agent_start`, `tool_call`, `tool_result`, and session cleanup hooks using Pi's documented API.
  - Wire runtime blocking reasons and SourceRudder success tracking.
  - Add handler-level tests covering agents/skills and MCP gateway shapes.
  - Checks: full test suite and TypeScript typecheck.
  - Commit evidence: pending.

- [ ] **PSP-003 — Package and document safe operation**
  - Add Pi package metadata, build/package validation, CI, and minimal repository hygiene.
  - Document installation, verification, policy boundary, rollback, and the external-MCP limitation in English and Spanish.
  - Checks: `npm run check` and an installed-package smoke test or an explicit environment limitation.
  - Commit evidence: pending.

## Acceptance criteria

1. Pi system guidance consistently directs web research to SourceRudder and does not duplicate owned guidance.
2. Direct calls to known Pi-native web research tools are blocked with no approval or fallback path.
3. Identifiable non-SourceRudder MCP web-search/fetch calls are blocked, while SourceRudder and unrelated local/MCP tools remain allowed.
4. The twelfth identical unresolved SourceRudder attempt is blocked per session, and a successful result resets that fingerprint.
5. Package installation and rollback are documented and mechanically checked.
6. Tests demonstrate the boundary and explicitly document what the extension cannot intercept.

## Progress

- Repository initialized on `feat/pi-sourcerudder-policy` with no commits yet.
- Source OpenCode behavior and Pi extension APIs mapped read-only.
- Current SourceRudder server observed with 29 tools, so the Pi port will use robust SourceRudder route detection rather than the source plugin's obsolete nine-tool list.
- `feature-branch-chain` selected for reviewable local work-unit commits.
- PSP-001 is in progress.

## Verification evidence

- Pending implementation.

## Next step

Implement PSP-001 with one bounded writer.
