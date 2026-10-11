import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import sourceRudderPolicyExtension from "../src/index.js";
import { OneShotConsent } from "../src/one-shot-consent.js";

// Characterization only: no production permission gate, network, browser, or credentials.
// Resolve by package directory, not package exports (which hide internal dispatch modules).
const root = process.env.PI_DISPATCH_RUNTIME_ROOT
  ? resolve(process.env.PI_DISPATCH_RUNTIME_ROOT)
  : resolve(dirname(fileURLToPath(import.meta.url)), "../node_modules/@earendil-works/pi-coding-agent");
const coreRoot = join(root, "node_modules/@earendil-works/pi-agent-core");
async function version(directory: string): Promise<string> {
  return JSON.parse(await readFile(join(directory, "package.json"), "utf8")).version;
}
const versions = { codingAgent: await version(root), agentCore: await version(coreRoot) };
assert.ok(
  (versions.codingAgent === "0.85.1" && versions.agentCore === "0.85.1") ||
    (versions.codingAgent === "1.0.3" && versions.agentCore === "1.0.3"),
  `Uncharacterized runtime pair: ${JSON.stringify(versions)}; extend the proof before claiming support`,
);
// Dynamic imports intentionally use runtime JS: the two installed internal APIs differ.
const { ExtensionRunner } = await import(pathToFileURL(join(root, "dist/core/extensions/runner.js")).href);
const { AgentSession } = await import(pathToFileURL(join(root, "dist/core/agent-session.js")).href);
const dispatch = await import(pathToFileURL(join(coreRoot, "dist/agent-loop.js")).href);
const live = versions.codingAgent === "1.0.3";
assert.equal(typeof dispatch.runToolCall, live ? "function" : "undefined");

type Input = { request: { query: string; labels: string[] } };
type CallEvent = {
  type: "tool_call";
  toolName: string;
  toolCallId: string;
  input: Input;
  parentToolCallId?: string;
};
type Hook = (event: CallEvent) => unknown | Promise<unknown>;
type Route = "model" | "direct" | "nested";
const approved = (): Input => ({ request: { query: "approved", labels: ["original"] } });
const parameters = {
  type: "object",
  properties: {
    request: {
      type: "object",
      properties: {
        query: { type: "string" },
        labels: { type: "array", items: { type: "string" } },
      },
      required: ["query", "labels"],
      additionalProperties: false,
    },
  },
  required: ["request"],
  additionalProperties: false,
};
function freezeJson(value: unknown): void {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) freezeJson(child);
    Object.freeze(value);
  }
}
function confirmationGate(protect = true, allow = true): Hook {
  return async (event) => {
    // A deterministic asynchronous stand-in for completed human confirmation.
    const confirmed = structuredClone(event.input);
    await Promise.resolve();
    if (!allow) return { block: true, reason: "Confirmation denied" };
    assert.deepEqual(event.input, confirmed);
    assert.deepEqual(confirmed, approved());
    if (protect) {
      // Protect the ORIGINAL alias, not a clone. Freeze before returning to later hooks.
      // Event freezing also prevents tool identity and input-reference replacement.
      freezeJson(event.input);
      Object.freeze(event);
    }
  };
}

async function invoke(route: Route, hooks: Hook[], mutateTool = false, production?: "helper" | "extension", answer = true) {
  const seen: Input[] = [];
  const references: Input[] = [];
  const order: string[] = [];
  const events: CallEvent[] = [];
  const consent = new OneShotConsent();
  const ctx = { mode: "tui", hasUI: true, cwd: "/fake", signal: undefined,
    sessionManager: { getSessionId: () => "fake-session" }, ui: { confirm: async () => answer } };
  const handlers = new Map<string, any[]>();
  if (production === "extension") sourceRudderPolicyExtension({
    on(name: string, handler: any) { handlers.set(name, [...(handlers.get(name) ?? []), handler]); },
  } as any);
  if (production === "extension") {
    const input = { query: "fake SourceRudder failure" };
    for (const handler of handlers.get("tool_call") ?? []) await handler({
      type: "tool_call", toolName: "mcp__sourcerudder__search_web", toolCallId: "source-failure", input,
    }, ctx);
    for (const handler of handlers.get("tool_result") ?? []) await handler({
      type: "tool_result", toolName: "mcp__sourcerudder__search_web", toolCallId: "source-failure", input,
      content: [], isError: true,
    }, ctx);
  }
  if (production === "helper") handlers.set("tool_call", [async (event: CallEvent) =>
    await consent.request(event, ctx, "Fake classifier denial") ? undefined : { block: true, reason: "Confirmation denied" }]);
  const runner = new ExtensionRunner(
    [...(production ? [{ path: "production-policy", handlers }] : []), ...hooks.map((hook, index) => ({
      path: `fake-extension-${index}`,
      handlers: new Map([["tool_call", [async (event: CallEvent) => {
        order.push(`hook-${index}`);
        events.push(event);
        return hook(event);
      }]]]),
    }))],
    {}, process.cwd(), {}, {},
  );
  if (production) runner.createContext = () => ctx;
  const tool = {
    name: production ? "web_search" : "fake_research", label: "Fake research", description: "Deterministic no-I/O tool",
    parameters,
    execute: async (_id: string, args: Input) => {
      order.push("execute");
      references.push(args);
      seen.push(structuredClone(args));
      // This side effect happens after recording entry. Frozen-input compatibility is
      // fail-closed, NOT a guarantee that every custom tool succeeds or rolls back effects.
      if (mutateTool) args.request.query = "tool-normalized";
      return { content: [{ type: "text", text: "fake success" }], details: {} };
    },
  };
  const call = { type: "toolCall", id: "approved-call", name: tool.name, arguments: approved() };
  const assistant = {
    role: "assistant", content: [call], stopReason: "toolUse", api: "fake",
    provider: "fake", model: "fake", timestamp: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };
  // Bypass session construction (auth/resource setup), but use its REAL hook adapter
  // and REAL nested method. Only collaborators that would access I/O are fake.
  const session = Object.create(AgentSession.prototype);
  session.agent = { state: { messages: [assistant], tools: [tool] }, toolExecution: "sequential" };
  session._extensionRunner = runner;
  session.settingsManager = { getImageAutoResize: () => false };
  session._getCallableTools = () => [tool];
  session._findLastAssistantMessage = () => assistant;
  session._emit = () => {};
  session._installAgentToolHooks();
  const context = { messages: [assistant], tools: [tool], systemPrompt: "" };
  let outcome;
  if (route === "nested") {
    outcome = await session._executeNestedToolCall("parent-call", tool.name, call.arguments, {});
  } else if (route === "direct") {
    outcome = await dispatch.runToolCall(call, {
      assistantMessage: assistant, context,
      beforeToolCall: session.agent.beforeToolCall,
      afterToolCall: session.agent.afterToolCall,
    });
  } else {
    // The fake provider emits one call and then stops; no provider registry or network.
    let requests = 0;
    const messages = await dispatch.runAgentLoop(
      [{ role: "user", content: "fake prompt", timestamp: 0 }],
      { ...context, messages: [] },
      { model: { provider: "fake" }, convertToLlm: (messages: unknown[]) => messages,
        beforeToolCall: session.agent.beforeToolCall, afterToolCall: session.agent.afterToolCall,
        toolExecution: "sequential" },
      () => {}, undefined,
      () => {
        assert.ok(++requests <= 2, "Fake provider must not retry indefinitely");
        const message = requests === 1 ? assistant : { ...assistant, content: [], stopReason: "stop" };
        return {
          async *[Symbol.asyncIterator]() { yield { type: "done", message }; },
          result: async () => message,
        };
      },
    );
    const result = messages.find((message: { role: string }) => message.role === "toolResult");
    assert.ok(result, "Real loop must produce a tool result");
    outcome = { isError: result.isError, result };
  }
  return { outcome, seen, references, order, events };
}
function assertDenied(result: Awaited<ReturnType<typeof invoke>>, error: RegExp): void {
  assert.equal(result.outcome.isError, true);
  assert.deepEqual(result.seen, [], "No fake execute may see unapproved arguments");
  assert.match(JSON.stringify(result.outcome), error);
}

test("dispatch proof records and bounds the installed version pair", (t) => {
  t.diagnostic(`coding-agent=${versions.codingAgent}; nested agent-core=${versions.agentCore}; root=${root}`);
});
for (const route of ["model", "direct", "nested"] as const) {
  test(`${route}: dispatch contract`, { skip: route !== "model" && !live
    ? "0.85.1 has no runToolCall/nested session API; model dispatch is tested instead" : false }, async (t) => {
    for (const production of ["helper", "extension"] as const) {
      await t.test(`${production}: production approval freezes original dispatch graph`, async () => {
        const result = await invoke(route, [(event) => {
          assert.ok(Object.isFrozen(event));
          assert.ok(Object.isFrozen(event.input.request.labels));
        }], false, production);
        assert.equal(result.outcome.isError, false);
        assert.deepEqual(result.seen, [approved()]);
        assert.strictEqual(result.references[0], result.events[0].input);
        if (route === "nested") assert.equal(result.events[0].parentToolCallId, "parent-call");
      });
      for (const field of ["property", "input", "name", "id", "parent"] as const) {
        await t.test(`${production}: later ${field} mutation cannot execute an unapproved variant`, async () => {
          assertDenied(await invoke(route, [event => {
            if (field === "property") event.input.request.query = "unapproved";
            if (field === "input") event.input = approved();
            if (field === "name") event.toolName = "other";
            if (field === "id") event.toolCallId = "other";
            if (field === "parent") event.parentToolCallId = "other";
          }], false, production), /read only|not extensible|Cannot assign/i);
        });
      }
      await t.test(`${production}: declined confirmation denies real dispatch`, async () => {
        assertDenied(await invoke(route, [() => assert.fail("later hook ran")], false, production, false), /blocks|Confirmation denied/);
      });
      await t.test(`${production}: tool mutation fails after approved entry`, async () => {
        const result = await invoke(route, [], true, production);
        assert.equal(result.outcome.isError, true);
        assert.deepEqual(result.seen, [approved()]);
      });
    }
    await t.test("unprotected later hook executes changed but schema-valid input", async () => {
      const result = await invoke(route, [confirmationGate(false), (event) => {
        event.input.request.query = "unapproved";
      }]);
      assert.equal(result.outcome.isError, false);
      assert.equal(result.seen[0].request.query, "unapproved");
      assert.strictEqual(result.references[0], result.events[0].input);
      assert.strictEqual(result.events[0], result.events[1]);
      assert.deepEqual(result.order, ["hook-0", "hook-1", "execute"]);
    });
    await t.test("approved unchanged input executes original frozen alias", async () => {
      const result = await invoke(route, [confirmationGate(), (event) => {
        assert.ok(Object.isFrozen(event));
        assert.ok(Object.isFrozen(event.input.request.labels));
      }]);
      assert.equal(result.outcome.isError, false);
      assert.deepEqual(result.seen, [approved()]);
      assert.strictEqual(result.references[0], result.events[0].input);
      assert.equal(result.events[0].toolName, "fake_research");
      assert.equal(result.events[0].toolCallId, route === "nested" ? "parent-call/1" : "approved-call");
      if (route === "nested") assert.equal(result.events[0].parentToolCallId, "parent-call");
    });
    const mutations: [string, Hook][] = [
      ["nested property", (event) => { event.input.request.query = "unapproved"; }],
      ["nested array", (event) => { event.input.request.labels.push("unapproved"); }],
      ["input reassignment", (event) => { event.input = { request: { query: "unapproved", labels: [] } }; }],
      ["name reassignment", (event) => { event.toolName = "different-tool"; }],
      ["id reassignment", (event) => { event.toolCallId = "different-call"; }],
    ];
    for (const [label, mutation] of mutations) {
      await t.test(`protected later ${label} fails closed`, async () => {
        assertDenied(await invoke(route, [confirmationGate(), mutation]), /read only|not extensible|Cannot assign/i);
      });
    }
    await t.test("an earlier hook's retained nested reference cannot mutate after confirmation", async () => {
      let retained: Input["request"] | undefined;
      const result = await invoke(route, [
        (event) => { retained = event.input.request; }, confirmationGate(),
        async () => { await Promise.resolve(); retained!.query = "unapproved"; },
      ]);
      assertDenied(result, /read only|Cannot assign/i);
      assert.equal(retained!.query, "approved");
    });
    await t.test("a caught retained-reference write leaves only original input executable", async () => {
      let retained: Input | undefined;
      const result = await invoke(route, [
        (event) => { retained = event.input; }, confirmationGate(),
        () => { assert.throws(() => { retained!.request.query = "unapproved"; }, TypeError); },
      ]);
      assert.equal(result.outcome.isError, false);
      assert.deepEqual(result.seen, [approved()]);
    });
    await t.test("denied confirmation stops before later hooks and execute", async () => {
      const result = await invoke(route, [confirmationGate(true, false), () => assert.fail("later hook ran")]);
      assertDenied(result, /Confirmation denied/);
      assert.deepEqual(result.order, ["hook-0"]);
    });
    await t.test("throwing hook prevents dispatch", async () => {
      assertDenied(await invoke(route, [() => { throw new Error("Fake hook failure"); }]), /Fake hook failure/);
    });
    await t.test("input-mutating tool fails on frozen args; not universal tool compatibility", async () => {
      const baseline = await invoke(route, [confirmationGate(false)], true);
      assert.equal(baseline.outcome.isError, false);
      assert.equal(baseline.references[0].request.query, "tool-normalized");
      const protectedResult = await invoke(route, [confirmationGate()], true);
      assert.equal(protectedResult.outcome.isError, true);
      assert.match(JSON.stringify(protectedResult.outcome), /read only|Cannot assign/i);
      assert.deepEqual(protectedResult.seen, [approved()], "Tool entered with approved input before its own failure");
      assert.equal(protectedResult.references[0].request.query, "approved");
    });
  });
}
