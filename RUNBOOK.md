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
checks the packed manifest, validates bilingual documentation, and packs,
production-installs, and loads the extension in a temporary directory. It neither
changes Pi settings nor invokes a model/provider.

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

   Expected signal: `verify-installed: PASS ...`. It runs `npm pack` with scripts
disabled, installs the tarball with production dependencies in a temporary
directory, and imports the declared extension entry through this repository's
TypeScript loader.

2. In a reloaded Pi session, verify that SourceRudder is already offered by its
   separate MCP configuration. The injected guidance should direct web research to
   SourceRudder.
3. Confirm known native research tools are rejected and local/code tools remain
   available. Do not treat this as a network-traffic inspection.
4. For an identical SourceRudder tool/input in one session, eleven unresolved
   calls are permitted and the twelfth is blocked. A matching successful result
   clears only that session fingerprint.

The extension does not bundle or test SourceRudder connectivity. A passing local
harness proves packaging and loadability, not external MCP availability.

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
