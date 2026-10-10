import assert from "node:assert/strict";
import test from "node:test";
import type {
  BeforeAgentStartEvent,
  ExtensionAPI,
  SessionShutdownEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";

import sourceRudderPolicyExtension from "../src/index.js";
import {
  LEGACY_POLICY_GUIDANCE,
  POLICY_GUIDANCE,
  PRE_REDIRECT_POLICY_GUIDANCE,
} from "../src/policy.js";

const POLICY_EVENTS = [
  "before_agent_start",
  "tool_call",
  "tool_result",
  "session_shutdown",
  "session_start",
  "session_before_switch",
  "session_before_fork",
  "session_before_tree",
  "session_tree",
  "session_before_compact",
  "session_compact",
] as const;

type PolicyEvent = (typeof POLICY_EVENTS)[number];
type PolicyTestContext = {
  sessionManager: {
    getSessionId(): string;
  };
};
type Handler = (event: unknown, ctx: PolicyTestContext) => unknown | Promise<unknown>;

class FakeExtensionAPI {
  private readonly handlers = new Map<PolicyEvent, Handler>();

  asExtensionAPI(): ExtensionAPI {
    const on = ((event: string, handler: Handler) => {
      if (!POLICY_EVENTS.includes(event as PolicyEvent)) {
        throw new Error(`Unsupported policy event registered: ${event}`);
      }
      this.handlers.set(event as PolicyEvent, handler);
    }) as ExtensionAPI["on"];

    const api: Pick<ExtensionAPI, "on"> = { on };
    return api as ExtensionAPI;
  }

  registeredEvents(): PolicyEvent[] {
    return [...this.handlers.keys()];
  }

  async dispatch(
    event: PolicyEvent,
    payload: unknown,
    ctx: PolicyTestContext,
  ): Promise<unknown> {
    const handler = this.handlers.get(event);
    assert.ok(handler, `Missing ${event} handler`);
    return handler(payload, ctx);
  }
}

function createContext(sessionId: string): PolicyTestContext {
  return {
    sessionManager: {
      getSessionId: () => sessionId,
    },
  };
}

function createBeforeAgentStartEvent(systemPrompt: string): BeforeAgentStartEvent {
  return {
    type: "before_agent_start",
    prompt: "Research this topic.",
    systemPrompt,
    systemPromptOptions: { cwd: "/test" },
  };
}

function createToolCall(
  toolName: string,
  input: Record<string, unknown>,
  toolCallId: string,
): ToolCallEvent {
  return {
    type: "tool_call",
    toolName,
    input,
    toolCallId,
  } satisfies ToolCallEvent;
}

function createToolResult(
  toolName: string,
  input: Record<string, unknown>,
  toolCallId: string,
  content: ToolResultEvent["content"],
  isError = false,
): ToolResultEvent {
  return {
    type: "tool_result",
    toolName,
    input,
    toolCallId,
    content,
    isError,
    details: { source: "test" },
  } satisfies ToolResultEvent;
}

function createSessionShutdownEvent(): SessionShutdownEvent {
  return { type: "session_shutdown", reason: "quit" };
}

function installPolicy(): FakeExtensionAPI {
  const registry = new FakeExtensionAPI();
  sourceRudderPolicyExtension(registry.asExtensionAPI());
  return registry;
}

function sourceRudderInput(query = "Pi extension policy"): Record<string, unknown> {
  return { query };
}

function successfulContent(): ToolResultEvent["content"] {
  return [{ type: "text", text: "success" }];
}

function hasSystemPrompt(result: unknown): result is { systemPrompt: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "systemPrompt" in result &&
    typeof result.systemPrompt === "string"
  );
}

function isBlockedResult(result: unknown): result is { block: true; reason: string } {
  return (
    typeof result === "object" &&
    result !== null &&
    "block" in result &&
    result.block === true &&
    "reason" in result &&
    typeof result.reason === "string"
  );
}

async function dispatchSourceRudderCall(
  registry: FakeExtensionAPI,
  ctx: PolicyTestContext,
  toolCallId: string,
  input = sourceRudderInput(),
): Promise<unknown> {
  return registry.dispatch(
    "tool_call",
    createToolCall("sourcerudder_search_web", input, toolCallId),
    ctx,
  );
}

let failureId = 0;
async function failSourceRudder(registry: FakeExtensionAPI, ctx: PolicyTestContext): Promise<void> {
  const id = `failure-${++failureId}`;
  const input = sourceRudderInput();
  await dispatchSourceRudderCall(registry, ctx, id, input);
  await registry.dispatch("tool_result", createToolResult("sourcerudder_search_web", input, id, successfulContent(), true), ctx);
}

test("browser MCP actions bypass consent in TUI and headless hooks without executing tools", async () => {
  const registry = installPolicy();
  for (const mode of ["tui", "rpc"]) {
    const ctx = { ...createContext(`browser-${mode}`), mode, hasUI: true, cwd: "/test",
      ui: { confirm: async () => assert.fail("Browser MCP must not request research consent") } };
    for (const server of ["playwright", "browserbase"]) {
      for (const tool of ["browser_tabs", "browser_snapshot", "browser_navigate", "browser_click", "browser_fill", "browser_evaluate", "search_web", "unknown_action"]) {
        for (const event of [
          createToolCall(`mcp__${server}__${tool}`, { action: "select", index: 0 }, `${mode}-${server}-${tool}`),
          createToolCall("mcp", { server, tool, arguments: { action: "select", index: 0 } }, `${mode}-${server}-${tool}-wrapper`),
        ]) {
          assert.equal(await registry.dispatch("tool_call", event, ctx), undefined);
          assert.equal(Object.isFrozen(event.input), false, "No consent dispatch lease is created");
        }
      }
    }
  }
});

test("refresh removes the actual previous narrow-browser one-shot guidance", async () => {
  const oldGuidance = `[SOURCERUDDER-POLICY:pi-v1]
SourceRudder-first research policy:

1. Use the separately configured SourceRudder MCP for web research first; select
   its specialized web, documentation, GitHub, community, or URL-retrieval tool.
2. Pi-native web_search, source_check, fetch_content, get_search_content,
   websearch, webfetch and identifiable non-SourceRudder MCP research are denied
   by default. Only fresh TUI-local human confirmation can permit ONE EXECUTION
   of the exact displayed operation, arguments and target in the live session.
   RPC, print, JSON and unavailable UI always deny, even if hasUI is true.
3. No global disable, automatic provider switching, model-callable grant or
   approval argument/flag exists. Decline, cancel, timeout, error, abort, changed
   context or replay denies. Every retry needs a new call ID and human approval;
   neither tool errors nor later hook denials restore permission. Input is frozen
   before dispatch; input-mutating tools may fail without rollback or auto retry.
4. This policy enforces only tool calls visible to Pi. It does not configure,
   bundle, or start SourceRudder, and it cannot intercept hidden network traffic
   performed inside the separately running external SourceRudder MCP process.
5. Local/code tools (grep, find, search_code, search_graph, mem_search) and narrowly
   recognized read-only Playwright inspection remain available without consent.
6. Eleven identical unresolved SourceRudder calls are permitted in a session;
   the twelfth is blocked. A successful result clears only that session and
   call fingerprint. Human confirmation cannot override this retry guard.
`;
  const registry = installPolicy();
  const result = await registry.dispatch("before_agent_start",
    createBeforeAgentStartEvent(`Host safety.${oldGuidance}`), createContext("migration"));
  assert.ok(hasSystemPrompt(result));
  assert.equal(result.systemPrompt, `Host safety.\n\n${POLICY_GUIDANCE}`);
  assert.doesNotMatch(result.systemPrompt, /recognized read-only Playwright inspection/);
});

test("registers the documented Pi hooks and refreshes one separated policy block", async () => {
  const registry = installPolicy();
  assert.deepEqual(registry.registeredEvents(), POLICY_EVENTS);

  const hostPrompt = "Host safety instructions.\n\nSkill instructions.";
  const first = await registry.dispatch(
    "before_agent_start",
    createBeforeAgentStartEvent(`${hostPrompt}${LEGACY_POLICY_GUIDANCE}${PRE_REDIRECT_POLICY_GUIDANCE}${POLICY_GUIDANCE}`),
    createContext("prompt-session"),
  );
  assert.ok(hasSystemPrompt(first));
  assert.equal(first.systemPrompt, `${hostPrompt}\n\n${POLICY_GUIDANCE}`);
  assert.equal(first.systemPrompt.split(POLICY_GUIDANCE).length - 1, 1);

  const second = await registry.dispatch(
    "before_agent_start",
    createBeforeAgentStartEvent(first.systemPrompt),
    createContext("prompt-session"),
  );
  assert.ok(hasSystemPrompt(second));
  assert.equal(second.systemPrompt, first.systemPrompt);
});

test("first research attempts redirect without consent and name callable replacements", async () => {
  const registry = installPolicy();
  let prompts = 0;
  const ctx = { ...createContext("redirect"), mode: "tui", hasUI: true, cwd: "/test",
    ui: { confirm: async () => { prompts++; return false; } } };
  for (const name of ["web_search", "websearch", "source_check", "fetch_content", "webfetch", "get_search_content", "mcp__brave__web_search"]) {
    const result = await registry.dispatch("tool_call", createToolCall(name, {}, name), ctx);
    assert.ok(isBlockedResult(result));
    assert.match(result.reason, /\[policy_denial=sourcerudder_first\]/);
    assert.match(result.reason, /fetch|content/.test(name) ? /mcp__sourcerudder__fetch_url/ : /mcp__sourcerudder__search_web/);
    if (!/fetch|content/.test(name)) {
      assert.match(result.reason, /mcp__sourcerudder__search_doc_oficial/);
      assert.match(result.reason, /mcp__sourcerudder__search_github/);
    }
    assert.match(result.reason, /tools\.mcp__sourcerudder__/);
  }
  assert.equal(prompts, 0);
});

test("SourceRudder error enables consent and subsequent success clears it", async () => {
  const registry = installPolicy();
  let prompts = 0;
  const ctx = { ...createContext("eligibility"), mode: "tui", hasUI: true, cwd: "/test",
    ui: { confirm: async () => { prompts++; return false; } } };
  const input = sourceRudderInput();
  await dispatchSourceRudderCall(registry, ctx, "failure", input);
  await registry.dispatch("tool_result", createToolResult("sourcerudder_search_web", input, "failure", successfulContent(), true), ctx);
  await registry.dispatch("tool_call", createToolCall("web_search", {}, "eligible"), ctx);
  assert.equal(prompts, 1);
  await dispatchSourceRudderCall(registry, ctx, "success", input);
  await registry.dispatch("tool_result", createToolResult("sourcerudder_search_web", input, "success", successfulContent()), ctx);
  await registry.dispatch("tool_call", createToolCall("web_search", {}, "ineligible"), ctx);
  assert.equal(prompts, 1);
});

for (const lifecycle of ["session_shutdown", "session_start", "session_before_switch", "session_before_fork", "session_before_tree", "session_tree", "session_before_compact", "session_compact"] as const) {
  test(`${lifecycle} clears eligibility and stale SourceRudder results cannot restore it`, async () => {
    const registry = installPolicy();
    let prompts = 0;
    const ctx = { ...createContext("reset"), mode: "tui", hasUI: true, cwd: "/test",
      ui: { confirm: async () => { prompts++; return false; } } };
    await failSourceRudder(registry, ctx);
    const input = sourceRudderInput("late result");
    await dispatchSourceRudderCall(registry, ctx, "late", input);
    await registry.dispatch(lifecycle, { type: lifecycle, reason: "test" }, ctx);
    await registry.dispatch("tool_result", createToolResult("sourcerudder_search_web", input, "late", successfulContent(), true), ctx);
    const result = await registry.dispatch("tool_call", createToolCall("web_search", {}, "after-reset"), ctx);
    assert.ok(isBlockedResult(result));
    assert.match(result.reason, /policy_denial=sourcerudder_first/);
    assert.equal(prompts, 0);
  });
}

test("only correlated SourceRudder results change eligibility and errors are not replayable", async () => {
  const registry = installPolicy();
  let prompts = 0;
  const ctx = { ...createContext("correlated"), mode: "tui", hasUI: true, cwd: "/test",
    ui: { confirm: async () => { prompts++; return false; } } };
  const input = sourceRudderInput();
  await dispatchSourceRudderCall(registry, ctx, "source", input);
  for (const result of [
    createToolResult("sourcerudder_search_web", input, "unknown", [], true),
    createToolResult("sourcerudder_fetch_url", input, "source", [], true),
    createToolResult("sourcerudder_search_web", { query: "wrong" }, "source", [], true),
  ]) await registry.dispatch("tool_result", result, ctx);
  await registry.dispatch("tool_call", createToolCall("web_search", {}, "not-eligible"), ctx);
  assert.equal(prompts, 0);
  await registry.dispatch("tool_result", createToolResult("sourcerudder_search_web", input, "source", [], true), ctx);
  await registry.dispatch("tool_call", createToolCall("web_search", {}, "eligible"), ctx);
  assert.equal(prompts, 1);
  const other = { ...ctx, sessionManager: { getSessionId: () => "other" } };
  await registry.dispatch("tool_call", createToolCall("web_search", {}, "other-session"), other);
  assert.equal(prompts, 1);
  await dispatchSourceRudderCall(registry, ctx, "success", input);
  await registry.dispatch("tool_result", createToolResult("sourcerudder_search_web", input, "success", []), ctx);
  await registry.dispatch("tool_result", createToolResult("sourcerudder_search_web", input, "source", [], true), ctx);
  await registry.dispatch("tool_call", createToolCall("web_search", {}, "replayed-error"), ctx);
  assert.equal(prompts, 1);
});

test("explicit local TUI approval allows one blocked research invocation", async () => {
  const registry = installPolicy();
  const ctx = Object.assign(createContext("consent-session"), {
    mode: "tui", hasUI: true, cwd: "/test", ui: { confirm: async () => true },
  });
  await failSourceRudder(registry, ctx);
  const event = createToolCall("web_search", { query: "approved" }, "consented-call");
  assert.equal(await registry.dispatch("tool_call", event, ctx), undefined);
  assert.ok(Object.isFrozen(event.input));
  assert.ok(isBlockedResult(await registry.dispatch("tool_call", event, ctx)));
});

test("protected non-browser research prompts only after SourceRudder failure and denies without approval", async () => {
  const registry = installPolicy();
  let prompts = 0;
  const ctx = { ...createContext("non-browser"), mode: "tui", hasUI: true, cwd: "/test",
    ui: { confirm: async () => { prompts++; return false; } } };
  await failSourceRudder(registry, ctx);
  for (const name of ["web_search", "mcp__brave__web_search"]) {
    assert.ok(isBlockedResult(await registry.dispatch("tool_call", createToolCall(name, {}, name), ctx)));
  }
  assert.equal(prompts, 2);
});

test("SourceRudder guard and browser MCP never prompt", async () => {
  const registry = installPolicy();
  const ctx = Object.assign(createContext("guard-tui"), { mode: "tui", hasUI: true, cwd: "/test",
    ui: { confirm: async () => assert.fail("allowed calls and guard errors must not prompt") } });
  assert.equal(await registry.dispatch("tool_call", createToolCall("mcp__playwright__browser_tabs", { action: "list" }, "inspect"), ctx), undefined);
  assert.equal(await registry.dispatch("tool_call", createToolCall("mcp__playwright__browser_get_config", {}, "inspect-config"), ctx), undefined);
  assert.equal(await registry.dispatch("tool_call", createToolCall("mcp", { server: "playwright", tool: "browser_get_config", arguments: {} }, "inspect-config-wrapper"), ctx), undefined);
  for (let i = 0; i < 11; i++) assert.equal(await dispatchSourceRudderCall(registry, ctx, `attempt-${i}`), undefined);
  const guarded = await dispatchSourceRudderCall(registry, ctx, "twelfth");
  assert.ok(isBlockedResult(guarded));
  assert.match(guarded.reason, /\[policy_denial=retry_guard\]$/);
  assert.doesNotMatch(guarded.reason, /one_shot_denial|ONE EXECUTION/);
});

for (const lifecycle of ["session_shutdown", "session_before_switch", "session_before_fork", "session_before_tree", "session_before_compact"] as const) {
  test(`${lifecycle} revokes pending consent; start binds replacement, not stale manager`, async () => {
    const registry = installPolicy();
    let release!: (b: boolean) => void;
    const ctx = Object.assign(createContext("old"), { mode: "tui", hasUI: true, cwd: "/test",
      ui: { confirm: () => new Promise<boolean>(r => { release = r; }) } });
    await failSourceRudder(registry, ctx);
    const pending = registry.dispatch("tool_call", createToolCall("web_search", { query: "old" }, "old-call"), ctx);
    await new Promise(r => setImmediate(r));
    await registry.dispatch(lifecycle, { type: lifecycle, reason: "quit" }, ctx);
    release(true);
    assert.ok(isBlockedResult(await pending));
    ctx.ui.confirm = async () => true;
    assert.ok(isBlockedResult(await registry.dispatch("tool_call", createToolCall("web_search", {}, "stale"), ctx)));
    const next = { ...ctx, sessionManager: { getSessionId: () => "new" } };
    await registry.dispatch("session_start", { type: "session_start", reason: "new" }, next);
    const reset = await registry.dispatch("tool_call", createToolCall("web_search", {}, "new-ineligible"), next);
    assert.ok(isBlockedResult(reset));
    assert.match(reset.reason, /policy_denial=sourcerudder_first/);
    await failSourceRudder(registry, next);
    assert.equal(await registry.dispatch("tool_call", createToolCall("web_search", {}, "new-call"), next), undefined);
    assert.ok(isBlockedResult(await registry.dispatch("tool_call", createToolCall("web_search", {}, "old-again"), ctx)));
  });
}
for (const mode of ["rpc", "print", "json", undefined]) {
  test(`${mode} integration denies even a model approval field and hasUI true`, async () => {
    const registry = installPolicy();
    const ctx = Object.assign(createContext("non-tui"), { mode, hasUI: true, cwd: "/test",
      ui: { confirm: async () => assert.fail("not human authority") } });
    await failSourceRudder(registry, ctx);
    assert.ok(isBlockedResult(await registry.dispatch("tool_call", createToolCall("web_search", { approval: true }, "model-approval"), ctx)));
  });
}

test("diagnostic integration correlates concurrent denials without prompting or execution", async () => {
  const registry = installPolicy(); let prompts = 0; let executions = 0;
  const base = { ...createContext("secret-session"), mode: "tui" as string | undefined, hasUI: true, cwd: "/secret-cwd",
    ui: { confirm: async () => { prompts++; return true; } } };
  const invoke = async (ctx: typeof base, id: string, input: Record<string, unknown> = { query: "secret-query" }) => {
    const result = await registry.dispatch("tool_call", createToolCall("web_search", input, id), ctx);
    if (!isBlockedResult(result)) executions++;
    return result;
  };
  await failSourceRudder(registry, base);
  const results = await Promise.all([
    invoke({ ...base, mode: undefined }, "secret-call-a"),
    invoke({ ...base, mode: "secret-mode" }, "secret-call-b"),
    invoke({ ...base, hasUI: false }, "secret-call-c"),
    invoke(base, "secret-call-d", { "secret-key": undefined }),
  ]);
  for (const [i, code] of ["mode_missing", "mode_untrusted", "no_ui", "canonical_input"].entries()) {
    assert.ok(isBlockedResult(results[i]));
    assert.ok(results[i].reason.endsWith(`[one_shot_denial=${code}]`));
    assert.doesNotMatch(results[i].reason, /secret/);
  }
  const replay = await invoke(base, "secret-call-a");
  assert.ok(isBlockedResult(replay)); assert.match(replay.reason, /\[one_shot_denial=replay\]$/);
  assert.equal(prompts, 0); assert.equal(executions, 0);
});

test("blocked stage traces distinguish queue and pending UI with private fixed fields", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const registry = installPolicy(); let release!: (b: boolean) => void;
  const ctx = { ...createContext("secret-session"), mode: "tui", hasUI: true, cwd: "/secret-cwd",
    ui: { confirm: () => new Promise<boolean>(r => { release = r; }) } };
  await failSourceRudder(registry, ctx);
  const invoke = (id: string) => registry.dispatch("tool_call", createToolCall("web_search", { query: "secret-query" }, id), ctx);
  const first = invoke("secret-first"); const second = invoke("secret-second");
  const replay = await invoke("secret-first");
  assert.ok(isBlockedResult(replay));
  assert.match(replay.reason, /\[one_shot_stages=none\] \[one_shot_denial=replay\]$/);
  await new Promise(r => setImmediate(r)); t.mock.timers.tick(30_000);
  const entered = await first; const queued = await second;
  assert.ok(isBlockedResult(entered)); assert.ok(isBlockedResult(queued));
  assert.deepEqual(Object.keys(entered).sort(), ["block", "reason"]);
  assert.match(entered.reason, /\[one_shot_stages=queue_entered,queue_left,confirm_entered,cancelled\] \[one_shot_denial=timeout\]$/);
  assert.match(queued.reason, /\[one_shot_stages=queue_entered,cancelled\] \[one_shot_denial=timeout\]$/);
  for (const result of [entered, queued, replay]) assert.doesNotMatch(result.reason, /secret|\/secret-cwd/);
  const snapshot = JSON.stringify([entered, queued]);
  release(true); await new Promise(r => setImmediate(r));
  assert.equal(JSON.stringify([entered, queued]), snapshot);
  ctx.ui.confirm = async () => false;
  const rejected = await invoke("secret-rejected"); assert.ok(isBlockedResult(rejected));
  assert.match(rejected.reason, /\[one_shot_stages=queue_entered,queue_left,confirm_entered,confirm_resolved\] \[one_shot_denial=not_confirmed\]$/);
  ctx.ui.confirm = async () => true;
  assert.equal(await invoke("secret-approved"), undefined);
});

test("blocks every Pi-visible direct native web research call", async () => {
  const registry = installPolicy();
  const result = await registry.dispatch(
    "tool_call",
    createToolCall("web_search", { query: "Pi docs" }, "native-call"),
    createContext("native-session"),
  );

  assert.deepEqual(result, {
    block: true,
    reason:
      "SourceRudder Policy blocks this Pi-native or OpenCode-compatible web research tool. Retry with SourceRudder: mcp__sourcerudder__search_web (official docs: mcp__sourcerudder__search_doc_oficial; GitHub: mcp__sourcerudder__search_github). For codemode-only exposure use tools.mcp__sourcerudder__<tool>(args) with the same tool suffix and arguments. [policy_denial=sourcerudder_first]",
  });
});

test("uses explicit MCP server identity before a SourceRudder-named tool", async () => {
  const registry = installPolicy();
  const ctx = createContext("mcp-identity-session");

  const spoofed = await registry.dispatch(
    "tool_call",
    createToolCall("mcp", {
      server: "brave",
      tool: "sourcerudder_search_web",
    }, "spoofed-call"),
    ctx,
  );
  assert.ok(isBlockedResult(spoofed));
  assert.match(spoofed.reason, /mcp__sourcerudder__search_web/);
  assert.match(spoofed.reason, /policy_denial=sourcerudder_first/);

  assert.equal(
    await registry.dispatch(
      "tool_call",
      createToolCall("mcp", { server: "sourcerudder", tool: "search_web" }, "trusted-server"),
      ctx,
    ),
    undefined,
  );
  assert.equal(
    await registry.dispatch(
      "tool_call",
      createToolCall("mcp", { tool: "sourcerudder_search_web" }, "trusted-tool"),
      ctx,
    ),
    undefined,
  );
});

test("blocks non-SourceRudder MCP source_check research", async () => {
  const registry = installPolicy();
  const result = await registry.dispatch(
    "tool_call",
    createToolCall("mcp", {
      server: "other-research",
      tool: "source_check",
      query: "Pi docs",
    }, "source-check-call"),
    createContext("source-check-session"),
  );

  assert.ok(isBlockedResult(result));
  assert.match(result.reason, /mcp__sourcerudder__search_web/);
  assert.match(result.reason, /policy_denial=sourcerudder_first/);
});

test("allows unrelated visible tools, including local MCP file access", async () => {
  const registry = installPolicy();
  const result = await registry.dispatch(
    "tool_call",
    createToolCall("mcp", {
      server: "filesystem",
      tool: "read_file",
      path: "src/index.ts",
    }, "local-call"),
    createContext("local-session"),
  );

  assert.equal(result, undefined);
});

test("leaves SourceRudder calls unresolved without a result event and blocks the twelfth", async () => {
  const registry = installPolicy();
  const ctx = createContext("threshold-session");

  for (let attempt = 1; attempt <= 11; attempt += 1) {
    assert.equal(
      await dispatchSourceRudderCall(registry, ctx, `source-${attempt}`),
      undefined,
    );
  }

  const blocked = await dispatchSourceRudderCall(registry, ctx, "source-12");
  assert.ok(isBlockedResult(blocked));
  assert.match(blocked.reason, /twelve times/);
});

test("clears a SourceRudder attempt only when result name and input match", async () => {
  const registry = installPolicy();
  const ctx = createContext("correlation-session");
  const input = sourceRudderInput("matching result");

  for (let attempt = 1; attempt <= 11; attempt += 1) {
    await dispatchSourceRudderCall(registry, ctx, `source-${attempt}`, input);
  }

  await registry.dispatch(
    "tool_result",
    createToolResult("sourcerudder_search_web", input, "source-1", successfulContent()),
    createContext("different-session"),
  );
  const afterSpoofedSession = await dispatchSourceRudderCall(registry, ctx, "source-12", input);
  assert.ok(isBlockedResult(afterSpoofedSession));

  await registry.dispatch(
    "tool_result",
    createToolResult("sourcerudder_fetch_url", input, "source-1", successfulContent()),
    ctx,
  );
  const afterSpoofedName = await dispatchSourceRudderCall(registry, ctx, "source-13", input);
  assert.ok(isBlockedResult(afterSpoofedName));

  await registry.dispatch(
    "tool_result",
    createToolResult(
      "sourcerudder_search_web",
      sourceRudderInput("different result input"),
      "source-1",
      successfulContent(),
    ),
    ctx,
  );
  const afterSpoofedInput = await dispatchSourceRudderCall(registry, ctx, "source-13", input);
  assert.ok(isBlockedResult(afterSpoofedInput));

  await registry.dispatch(
    "tool_result",
    createToolResult("sourcerudder_search_web", input, "source-1", successfulContent()),
    ctx,
  );
  assert.equal(
    await dispatchSourceRudderCall(registry, ctx, "after-matching-success", input),
    undefined,
  );
});

test("blocks duplicate pending tool-call identifiers without replacing the original", async () => {
  const registry = installPolicy();
  const ctx = createContext("duplicate-session");
  const originalInput = sourceRudderInput("original request");

  assert.equal(
    await dispatchSourceRudderCall(registry, ctx, "duplicate-call", originalInput),
    undefined,
  );
  const duplicate = await dispatchSourceRudderCall(
    registry,
    ctx,
    "duplicate-call",
    sourceRudderInput("replacement request"),
  );
  assert.ok(isBlockedResult(duplicate));
  assert.match(duplicate.reason, /duplicate pending tool-call identifier/);
  assert.match(duplicate.reason, /\[policy_denial=duplicate_pending\]$/);
  assert.doesNotMatch(duplicate.reason, /one_shot_denial|ONE EXECUTION/);

  await registry.dispatch(
    "tool_result",
    createToolResult(
      "sourcerudder_search_web",
      originalInput,
      "duplicate-call",
      successfulContent(),
    ),
    ctx,
  );
  for (let attempt = 1; attempt <= 11; attempt += 1) {
    assert.equal(
      await dispatchSourceRudderCall(registry, ctx, `after-original-${attempt}`, originalInput),
      undefined,
    );
  }
});

test("leaves valid error results unresolved", async () => {
  const registry = installPolicy();
  const ctx = createContext("error-session");
  const input = sourceRudderInput("unresolved result");

  for (let attempt = 1; attempt <= 11; attempt += 1) {
    await dispatchSourceRudderCall(registry, ctx, `error-${attempt}`, input);
  }
  await registry.dispatch(
    "tool_result",
    createToolResult("sourcerudder_search_web", input, "error-1", successfulContent(), true),
    ctx,
  );
  const blocked = await dispatchSourceRudderCall(registry, ctx, "error-12", input);
  assert.ok(isBlockedResult(blocked));
});

test("cleans retry and pending-call state for only the shut-down session", async () => {
  const registry = installPolicy();
  const firstSession = createContext("first-session");
  const secondSession = createContext("second-session");
  const input = sourceRudderInput("session isolation");

  for (let attempt = 1; attempt <= 11; attempt += 1) {
    await dispatchSourceRudderCall(registry, firstSession, `first-${attempt}`, input);
  }
  await dispatchSourceRudderCall(registry, secondSession, "second-1", input);

  await registry.dispatch(
    "session_shutdown",
    createSessionShutdownEvent(),
    firstSession,
  );
  assert.equal(
    await dispatchSourceRudderCall(registry, firstSession, "first-1", input),
    undefined,
  );

  for (let attempt = 2; attempt <= 11; attempt += 1) {
    await dispatchSourceRudderCall(registry, secondSession, `second-${attempt}`, input);
  }
  const blocked = await dispatchSourceRudderCall(registry, secondSession, "second-12", input);
  assert.ok(isBlockedResult(blocked));
});
