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
} from "../src/policy.js";

const POLICY_EVENTS = [
  "before_agent_start",
  "tool_call",
  "tool_result",
  "session_shutdown",
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

test("registers the documented Pi hooks and refreshes one separated policy block", async () => {
  const registry = installPolicy();
  assert.deepEqual(registry.registeredEvents(), POLICY_EVENTS);

  const hostPrompt = "Host safety instructions.\n\nSkill instructions.";
  const first = await registry.dispatch(
    "before_agent_start",
    createBeforeAgentStartEvent(`${hostPrompt}${LEGACY_POLICY_GUIDANCE}${POLICY_GUIDANCE}`),
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
      "SourceRudder Policy blocks this Pi-native or OpenCode-compatible web research tool.",
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
  assert.deepEqual(spoofed, {
    block: true,
    reason:
      "SourceRudder Policy blocks this identifiable non-SourceRudder MCP web research route.",
  });

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

  assert.deepEqual(result, {
    block: true,
    reason:
      "SourceRudder Policy blocks this identifiable non-SourceRudder MCP web research route.",
  });
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
