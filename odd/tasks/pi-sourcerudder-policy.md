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
- Running authored count: approximately 1,364 lines through PSP-002, excluding generated lockfiles. Slice 1 contains `4c554373e67c2eaf005e7e014a7d746a1233cbda`; slice 2 contains `d51d304e761ac0f2920dd735c34b88fb82a9d7ca`. Both cohesive enforcement units exceeded the advisory per-task heuristic because their policy/runtime behavior and regression proof remain atomic.

## Tasks

- [x] **PSP-001 — Implement the policy domain and retry guard**
  - Define SourceRudder route detection across direct, generic MCP, and namespaced MCP calls.
  - Define precise alternative web-research blocking without blocking local/code search.
  - Implement idempotent policy-guidance replacement and session-scoped identical-attempt accounting.
  - Add focused unit tests for allow/block classification, guidance preservation, 11/12 behavior, and successful reset.
  - Checks: focused Node tests and TypeScript typecheck passed; independent semantic verification passed after one bounded correction.
  - Commit evidence: `4c554373e67c2eaf005e7e014a7d746a1233cbda` (`feat(policy): enforce SourceRudder research boundary`).

- [x] **PSP-002 — Integrate the Pi extension runtime**
  - Register `before_agent_start`, `tool_call`, `tool_result`, and session cleanup hooks using Pi's documented API.
  - Wire runtime blocking reasons and SourceRudder success tracking.
  - Add handler-level tests covering agents/skills and MCP gateway shapes.
  - Checks: typecheck, full 21-test suite, 10-test handler harness, diff check, independent semantic verification, and parent spot check passed.
  - Commit evidence: `d51d304e761ac0f2920dd735c34b88fb82a9d7ca` (`feat(extension): enforce SourceRudder policy in Pi runtime`).

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

- Repository initialized on `feat/pi-sourcerudder-policy`.
- Bootstrap commit `91b397a4c37c92c590ca7cd70cd484b36a6ba757` records repository hygiene and this ODD plan.
- Source OpenCode behavior and Pi extension APIs mapped read-only.
- Current SourceRudder server observed with 29 tools, so the Pi port will use robust SourceRudder route detection rather than the source plugin's obsolete nine-tool list.
- `feature-branch-chain` selected for reviewable local work-unit commits.
- The Pi session was reloaded in the initialized repository; the local file and Engram mirror were reconciled with no conflict.
- PSP-001 completed. Independent verification initially found retry-state eviction bypass and local MCP fetch overblocking; both were corrected and regression-tested before commit.
- PSP-002 initial implementation required a resume after the first delegated run timed out after writing `src/index.ts`; the resumed writer completed the first implementation and 19 tests passed.
- Independent verification found three high-severity fail-open/reset risks and one medium test-fidelity gap: an explicit non-SourceRudder server could spoof a SourceRudder tool name, `source_check` was not blocked when re-exposed through MCP, result resets trusted only `toolCallId`, and tests fabricated event shapes excluded by Pi 0.85.1 types.
- The correction continuation timed out after editing the intended policy/runtime/test files and entering a verification command; it returned no trustworthy command results. A fresh bounded writer recovered the partial work, completed real-shape tests, and passed all checks.
- PSP-002 completed. Fresh independent verification found no remaining findings; explicit MCP server identity, `source_check`, exact result correlation, duplicate call IDs, session cleanup, and real Pi event shapes are covered.

## Verification evidence

- `git diff --cached --check`: passed before bootstrap commit.
- Writer: `npm install --ignore-scripts` passed with 0 vulnerabilities; `npm run typecheck` passed; `npm test` passed (8/8).
- Independent verifier: `npm run typecheck`, `npm test`, and `git diff --check` passed, but semantic review found retry-state eviction bypass and local MCP fetch overblocking.
- Native assessment: unavailable (empty native output), so verification followed the high-risk fallback plan.
- Correction writer: `npm run typecheck`, `npm test` (10/10), and `git diff --check` passed.
- Fresh independent re-verifier: no findings; typecheck, 10/10 tests, and diff check passed.
- Parent spot check: `npm test` passed (10/10).
- PSP-002 writer: `npm install --ignore-scripts` passed with 0 vulnerabilities; `npm run typecheck`, `npm test` (19/19), handler harness (9/9), and `git diff --check` passed.
- PSP-002 independent verifier: all commands passed, but semantic review found three high-severity fail-open/reset risks and one medium mock/type divergence; PSP-002 is not yet committable.
- PSP-002 native assessment: unavailable (empty native output), so verification followed the high-risk fallback plan.
- PSP-002 recovery writer: `npm run typecheck`, `npm test` (21/21), handler harness (10/10), and `git diff --check` passed.
- PSP-002 fresh independent re-verifier: no findings; all four checks passed.
- PSP-002 parent spot check: `npm test` passed (21/21).

## Blocker

None.

## Next step

PSP-002 is closed. Begin PSP-003 to package, validate, and document installation and rollback.
