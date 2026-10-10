import assert from "node:assert/strict";
import test from "node:test";
import { OneShotConsent, type ConsentStage } from "../src/one-shot-consent.js";

function fixture(confirm: (...args: any[]) => Promise<any> = async () => true) {
  let session = "session";
  const ctx = { mode: "tui", hasUI: true, cwd: "/private/target", signal: undefined as AbortSignal | undefined,
    sessionManager: { getSessionId: () => session }, ui: { confirm } };
  const gate = new OneShotConsent();
  const event = (id = "call") => ({ type: "tool_call", toolName: "web_search", toolCallId: id,
    input: { query: "secret-query", nested: { value: [1] } }, parentToolCallId: undefined as string | undefined });
  return { gate, ctx, event, switchSession: () => { session = "replacement"; } };
}

test("explicit TUI consent consumes once and freezes original graph/event", async () => {
  const f = fixture(); const e = f.event();
  assert.equal(await f.gate.request(e, f.ctx, "blocked"), true);
  assert.ok(Object.isFrozen(e)); assert.ok(Object.isFrozen(e.input.nested.value));
  assert.equal(await f.gate.request(e, f.ctx, "blocked"), false);
  assert.equal(await f.gate.request(f.event("retry"), f.ctx, "blocked"), true);
  assert.doesNotMatch(JSON.stringify(f.gate.audit()), /secret-query|private|web_search|call/);
});
for (const answer of [false, undefined, null, "true", { approved: true }]) {
  test(`non-explicit consent denies: ${JSON.stringify(answer)}`, async () => {
    const f = fixture(async () => answer);
    assert.equal(await f.gate.request(f.event(), f.ctx, "blocked"), false);
  });
}
for (const mode of ["rpc", "print", "json", undefined]) {
  test(`mode ${mode} cannot claim human authority even with hasUI`, async () => {
    const f = fixture(async () => assert.fail("must not prompt")); f.ctx.mode = mode as any;
    assert.equal(await f.gate.request(f.event(), f.ctx, "blocked"), false);
  });
}
test("missing UI and throwing UI fail closed", async () => {
  const f = fixture(async () => { throw new Error("private error"); });
  assert.equal(await f.gate.request(f.event(), f.ctx, "blocked"), false);
  f.ctx.hasUI = false;
  assert.equal(await f.gate.request(f.event("next"), f.ctx, "blocked"), false);
});
for (const change of ["args", "input", "session", "manager", "cwd", "name", "id", "parent", "mode", "signal", "revoke"] as const) {
  test(`pending ${change} mismatch denies`, async () => {
    let resolve!: (value: boolean) => void;
    const f = fixture(() => new Promise(r => { resolve = r; })); const e = f.event();
    const pending = f.gate.request(e, f.ctx, "blocked"); await new Promise(r => setImmediate(r));
    switch (change) {
      case "args": e.input.nested.value.push(2); break;
      case "input": e.input = structuredClone(e.input); break;
      case "session": f.switchSession(); break;
      case "manager": f.ctx.sessionManager = { getSessionId: () => "session" }; break;
      case "cwd": f.ctx.cwd = "/different"; break;
      case "name": e.toolName = "webfetch"; break;
      case "id": e.toolCallId = "different"; break;
      case "parent": e.parentToolCallId = "parent"; break;
      case "mode": f.ctx.mode = "rpc"; break;
      case "signal": f.ctx.signal = AbortSignal.abort(); break;
      case "revoke": f.gate.revoke(); break;
    }
    resolve(true); assert.equal(await pending, false);
  });
}
test("parallel unique calls serialize, duplicate collision denies without replacing pending", async () => {
  const releases: ((b: boolean) => void)[] = []; let active = 0;
  const f = fixture(() => { assert.equal(++active, 1); return new Promise<boolean>(r => releases.push(b => { active--; r(b); })); });
  const first = f.gate.request(f.event(), f.ctx, "blocked");
  const second = f.gate.request(f.event("parent/2"), f.ctx, "blocked");
  assert.equal(await f.gate.request(f.event(), f.ctx, "blocked"), false);
  await new Promise(r => setImmediate(r)); assert.equal(releases.length, 1);
  releases[0](true); assert.equal(await first, true);
  await new Promise(r => setImmediate(r)); assert.equal(releases.length, 2);
  releases[1](false); assert.equal(await second, false);
});
test("abort cancels dialog and queued calls; late true never revives permission", async () => {
  const controller = new AbortController();
  const f = fixture((_title, _body, options) => new Promise(r => options.signal.addEventListener("abort", () => r(true))));
  f.ctx.signal = controller.signal;
  const p = f.gate.request(f.event(), f.ctx, "blocked");
  const q = f.gate.request(f.event("queued"), f.ctx, "blocked");
  await new Promise(r => setImmediate(r)); controller.abort();
  assert.equal(await p, false); assert.equal(await q, false);
});
test("timeout option is documented and timeout cancellation denies", async () => {
  const f = fixture(async (_title, _body, options) => { assert.equal(options.timeout, 30_000); return false; });
  assert.equal(await f.gate.request(f.event(), f.ctx, "blocked"), false);
});
test("revocation invalidates old closure and queue even after activation", async () => {
  let resolve!: (b: boolean) => void;
  const f = fixture(() => new Promise(r => { resolve = r; }));
  const p = f.gate.request(f.event(), f.ctx, "blocked"); const q = f.gate.request(f.event("queued"), f.ctx, "blocked");
  await new Promise(r => setImmediate(r)); f.gate.revoke(); f.gate.activate(); resolve(true);
  assert.equal(await p, false); assert.equal(await q, false);
});
test("model approval fields are only displayed args, never authority", async () => {
  const f = fixture(async () => false); const e = f.event();
  Object.assign(e.input, { approved: true, humanApproval: true, bypass: true });
  assert.equal(await f.gate.request(e, f.ctx, "blocked"), false);
});
for (const bad of [NaN, Infinity, -0, undefined, 1n, new Date(), () => true]) {
  test(`non JSON value ${String(bad)} denies before UI`, async () => {
    const f = fixture(async () => assert.fail("unrepresentable args prompted")); const e = f.event();
    (e.input as any).bad = bad;
    assert.equal(await f.gate.request(e, f.ctx, "blocked"), false);
  });
}
test("cycles/accessors/symbols/sparse arrays/oversized args deny, controls escaped", async () => {
  for (const bad of [(() => { const o: any = {}; o.self = o; return o; })(),
    Object.defineProperty({}, "getter", { enumerable: true, get() { assert.fail("getter invoked"); } }),
    { [Symbol("hidden")]: true }, Array(3), "x".repeat(9000)]) {
    const f = fixture(async () => assert.fail("bad args prompted")); const e = f.event(); (e.input as any).bad = bad;
    assert.equal(await f.gate.request(e, f.ctx, "blocked"), false);
  }
  const f = fixture(async (title, body) => { assert.doesNotMatch(title + body, /\u001b|\u202e/); assert.match(body, /ONE EXECUTION/); return true; });
  const e = f.event(); e.input.query = "\u001b[2J\u202e";
  assert.equal(await f.gate.request(e, f.ctx, "blocked"), true);
});
test("manager replacement must not silently reactivate a stale context", async () => {
  const f = fixture();
  assert.equal(await f.gate.request(f.event("first"), f.ctx, "blocked"), true);
  const replacement = { ...f.ctx, sessionManager: { getSessionId: () => "new-session" } };
  assert.equal(await f.gate.request(f.event("replacement"), replacement, "blocked"), false);
  assert.equal(await f.gate.request(f.event("stale"), f.ctx, "blocked"), false);
});
test("queue overflow ID is reserved and cannot be reopened", async () => {
  const releases: ((b: boolean) => void)[] = [];
  const f = fixture(() => new Promise<boolean>(r => releases.push(r)));
  const calls = Array.from({ length: 8 }, (_, i) => f.gate.request(f.event(`queued-${i}`), f.ctx, "blocked"));
  assert.equal(await f.gate.request(f.event("overflow"), f.ctx, "blocked"), false);
  f.gate.revoke();
  await new Promise(r => setImmediate(r));
  for (const release of releases) release(false);
  await Promise.all(calls);
  f.gate.activate();
  f.ctx.ui.confirm = async () => true;
  assert.equal(await f.gate.request(f.event("overflow"), f.ctx, "blocked"), false);
});
test("deadline aborts even a UI that returns late true", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let resolve!: (b: boolean) => void;
  let signal!: AbortSignal;
  const f = fixture((_title, _body, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); });
  const pending = f.gate.request(f.event(), f.ctx, "blocked");
  await new Promise(r => setImmediate(r));
  t.mock.timers.tick(30_000);
  assert.equal(signal.aborted, true);
  assert.equal(await pending, false);
  resolve(true);
});

test("denial and malformed arguments consume ID before a later repaired replay", async () => {
  let prompts = 0;
  const f = fixture(async () => { prompts++; return false; });
  assert.equal(await f.gate.request(f.event("declined"), f.ctx, "blocked"), false);
  f.ctx.ui.confirm = async () => { prompts++; return true; };
  assert.equal(await f.gate.request(f.event("declined"), f.ctx, "blocked"), false);
  const malformed = f.event("malformed"); (malformed.input as any).value = undefined;
  assert.equal(await f.gate.request(malformed, f.ctx, "blocked"), false);
  assert.equal(await f.gate.request(f.event("malformed"), f.ctx, "blocked"), false);
  assert.equal(prompts, 1);
});
for (const isError of [false, true]) {
  test(`result error=${isError} cannot restore consent; mismatched results cannot audit success`, async () => {
    let prompts = 0;
    const f = fixture(async () => { prompts++; return true; }); const e = f.event("parent/1");
    e.parentToolCallId = "parent";
    assert.equal(await f.gate.request(e, f.ctx, "blocked"), true);
    f.gate.outcome({ ...e, parentToolCallId: "wrong", isError }, f.ctx);
    f.gate.outcome({ ...e, isError }, { ...f.ctx, sessionManager: { getSessionId: () => "session" } });
    assert.deepEqual(f.gate.audit().map(e => e.status), ["consumed"]);
    f.gate.outcome({ ...e, isError }, f.ctx);
    assert.deepEqual(f.gate.audit().map(e => e.status), ["consumed", isError ? "error" : "success"]);
    assert.equal(await f.gate.request(f.event("parent/1"), f.ctx, "blocked"), false);
    assert.equal(await f.gate.request(f.event("parent/2"), f.ctx, "blocked"), true);
    assert.equal(prompts, 2);
    for (const entry of f.gate.audit()) assert.deepEqual(Object.keys(entry).sort(), ["request", "status"]);
    assert.doesNotMatch(JSON.stringify(f.gate.audit()), /private|secret-query|parent|blocked/);
    const snapshot = f.gate.audit(); (snapshot[0] as any).status = "forged";
    assert.equal(f.gate.audit()[0].status, "consumed");
  });
}
test("aborted UI cannot be replaced until its closure settles", async () => {
  const releases: ((b: boolean) => void)[] = [];
  const f = fixture(() => new Promise<boolean>(r => releases.push(r)));
  const first = f.gate.request(f.event("old"), f.ctx, "blocked");
  await new Promise(r => setImmediate(r));
  f.gate.revoke();
  assert.equal(await first, false);
  f.gate.activate();
  const next = f.gate.request(f.event("next"), f.ctx, "blocked");
  await new Promise(r => setImmediate(r));
  assert.equal(releases.length, 1);
  releases[0](true);
  await new Promise(r => setImmediate(r));
  assert.equal(releases.length, 2);
  releases[1](true);
  assert.equal(await next, true);
});

test("bounded replay/pending state fails closed rather than evicting IDs", async () => {
  const f = fixture();
  for (let i = 0; i < 4096; i++) assert.equal(await f.gate.request(f.event(`id-${i}`), f.ctx, "blocked"), true);
  assert.deepEqual(await diagnostic(f, f.event("overflow")), { allowed: false, codes: ["id_capacity"] });
  assert.deepEqual(await diagnostic(f, f.event("id-0")), { allowed: false, codes: ["replay"] });
  assert.ok(f.gate.audit().length <= 256);
});

test("stage trace distinguishes queued timeout from entered pending confirmation", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let release!: (b: boolean) => void;
  let prompts = 0;
  const f = fixture(() => { prompts++; return new Promise(r => { release = r; }); });
  const entered: ConsentStage[] = []; const queued: ConsentStage[] = [];
  const codes: string[] = [];
  const first = f.gate.request(f.event("entered"), f.ctx, "secret-reason", c => { codes.push(c); }, s => { entered.push(s); });
  const second = f.gate.request(f.event("queued"), f.ctx, "secret-reason", c => { codes.push(c); }, s => { queued.push(s); });
  await new Promise(r => setImmediate(r));
  t.mock.timers.tick(30_000);
  assert.equal(await first, false); assert.equal(await second, false);
  assert.deepEqual(entered, ["queue_entered", "queue_left", "confirm_entered", "cancelled"]);
  assert.deepEqual(queued, ["queue_entered", "cancelled"]);
  assert.deepEqual(codes, ["timeout", "timeout"]);
  const snapshot = JSON.stringify({ entered, queued, codes });
  release(true); await new Promise(r => setImmediate(r));
  f.gate.outcome({ ...f.event("entered"), isError: false }, f.ctx);
  assert.equal(JSON.stringify({ entered, queued, codes }), snapshot);
  assert.equal(prompts, 1);
  assert.doesNotMatch(snapshot, /secret|private|web_search/);
  assert.deepEqual(await diagnostic(f, f.event("entered")), { allowed: false, codes: ["replay"] });
});

for (const result of ["reject", "throw", "abort", "revoke"] as const) {
  test(`stage trace records ${result} without late observations`, async () => {
    const controller = new AbortController();
    let release!: (b: boolean) => void;
    const f = fixture(async () => {
      if (result === "reject") return false;
      if (result === "throw") throw new Error("secret-ui-error");
      return new Promise<boolean>(r => { release = r; });
    });
    f.ctx.signal = controller.signal;
    const stages: ConsentStage[] = []; const codes: string[] = [];
    const pending = f.gate.request(f.event(), f.ctx, "secret", c => { codes.push(c); }, s => { stages.push(s); });
    await new Promise(r => setImmediate(r));
    if (result === "abort") controller.abort();
    if (result === "revoke") f.gate.revoke();
    assert.equal(await pending, false);
    assert.deepEqual(stages, ["queue_entered", "queue_left", "confirm_entered",
      ...(result === "reject" ? ["confirm_resolved"] : result === "throw" ? [] : ["cancelled"])]);
    assert.deepEqual(codes, [result === "reject" ? "not_confirmed" : result === "throw" ? "ui_error" : result === "abort" ? "aborted" : "cancelled"]);
    const snapshot = [...stages];
    release?.(true); await new Promise(r => setImmediate(r));
    assert.deepEqual(stages, snapshot);
  });
}

test("stage observers detach on exception and replay remains request-local", async () => {
  const f = fixture(async () => false);
  let observations = 0;
  assert.equal(await f.gate.request(f.event(), f.ctx, "blocked", undefined, () => {
    observations++; throw new Error("secret-observer");
  }), false);
  assert.equal(observations, 1);
  const replay: ConsentStage[] = [];
  assert.equal(await f.gate.request(f.event(), f.ctx, "blocked", undefined, s => { replay.push(s); }), false);
  assert.deepEqual(replay, []);
  const successful: ConsentStage[] = [];
  f.ctx.ui.confirm = async () => true;
  assert.equal(await f.gate.request(f.event("fresh"), f.ctx, "blocked", undefined, s => { successful.push(s); }), true);
  assert.deepEqual(successful, ["queue_entered", "queue_left", "confirm_entered", "confirm_resolved"]);
});

test("stage observer re-entry preserves the serial tail and cannot overlap dialogs", async () => {
  const prompts: string[] = []; const releases: ((b: boolean) => void)[] = [];
  const f = fixture((_title, body) => {
    prompts.push(body.includes("Call: first") ? "first" : "nested");
    return new Promise<boolean>(r => { releases.push(r); });
  });
  let nested!: Promise<boolean>;
  const first = f.gate.request(f.event("first"), f.ctx, "blocked", undefined, stage => {
    if (stage === "queue_entered") nested = f.gate.request(f.event("nested"), f.ctx, "blocked");
  });
  await new Promise(r => setImmediate(r));
  assert.deepEqual(prompts, ["first"]);
  releases[0](false); assert.equal(await first, false);
  await new Promise(r => setImmediate(r));
  assert.deepEqual(prompts, ["first", "nested"]);
  releases[1](false); assert.equal(await nested, false);
});

async function diagnostic(f: ReturnType<typeof fixture>, e = f.event()) {
  const codes: string[] = [];
  const allowed = await f.gate.request(e, f.ctx, "secret-reason", code => { codes.push(code); });
  return { allowed, codes };
}

test("diagnostic early gates are fixed, private codes and never prompt", async () => {
  const cases: [string, (f: ReturnType<typeof fixture>, e: ReturnType<ReturnType<typeof fixture>["event"]>) => void][] = [
    ["inactive", f => f.gate.revoke()],
    ["mode_missing", f => { f.ctx.mode = undefined as any; }],
    ["mode_untrusted", f => { f.ctx.mode = "secret-mode"; }],
    ["no_ui", f => { f.ctx.hasUI = false; }],
    ["aborted", f => { f.ctx.signal = AbortSignal.abort(); }],
    ["invalid_session", f => { f.ctx.sessionManager.getSessionId = () => ""; }],
    ["invalid_cwd", f => { f.ctx.cwd = "secret-path".repeat(100); }],
    ["invalid_tool", (_f, e) => { e.toolName = "secret-tool".repeat(100); }],
    ["invalid_call_id", (_f, e) => { e.toolCallId = "secret-call".repeat(100); }],
    ["invalid_parent_id", (_f, e) => { e.parentToolCallId = "secret-parent".repeat(100); }],
    ["canonical_input", (_f, e) => { Object.defineProperty(e.input, "secret-key", { enumerable: true, get() { assert.fail("getter read"); } }); }],
    ["display_capacity", (_f, e) => { e.input.query = "secret-query".repeat(700); }],
    ["context_error", f => { f.ctx.sessionManager.getSessionId = () => { throw new Error("secret-exception"); }; }],
  ];
  for (const [code, change] of cases) {
    const f = fixture(async () => assert.fail("early gate prompted")); const e = f.event(); change(f, e);
    assert.deepEqual(await diagnostic(f, e), { allowed: false, codes: [code] });
    assert.doesNotMatch(JSON.stringify(f.gate.audit()), /secret|private|web_search/);
  }
});

test("diagnostic observer exceptions cannot reopen a denial or observe successful authority", async () => {
  const f = fixture(async () => false); let observations = 0;
  assert.equal(await f.gate.request(f.event(), f.ctx, "blocked", () => { observations++; throw new Error("secret-observer"); }), false);
  f.ctx.ui.confirm = async () => true;
  assert.deepEqual(await diagnostic(f), { allowed: false, codes: ["replay"] });
  const e = f.event("fresh|pipe-id");
  assert.equal(await f.gate.request(e, f.ctx, "blocked", () => { assert.fail("success is not a denial"); }), true);
  assert.ok(Object.isFrozen(e)); assert.ok(Object.isFrozen(e.input.nested.value));
  assert.equal(observations, 1);
});

test("diagnostic binding and queue capacity deny without reopening reserved IDs", async () => {
  const bound = fixture(); bound.gate.activate(bound.ctx);
  const replaced = { ...bound.ctx, sessionManager: { getSessionId: () => "secret-replacement" } };
  const codes: string[] = [];
  assert.equal(await bound.gate.request(bound.event(), replaced, "blocked", code => { codes.push(code); }), false);
  assert.deepEqual(codes, ["manager_session_change"]);
  assert.deepEqual(await diagnostic(bound, bound.event("stale")), { allowed: false, codes: ["inactive"] });
  const f = fixture(async () => false);
  const queued = Array.from({ length: 8 }, (_, i) => diagnostic(f, f.event(`queued-${i}`)));
  assert.deepEqual(await diagnostic(f, f.event("overflow")), { allowed: false, codes: ["queue_capacity"] });
  await Promise.all(queued);
  assert.deepEqual(await diagnostic(f, f.event("overflow")), { allowed: false, codes: ["replay"] });
});

test("diagnostic post-dialog error, drift, abort, cancellation and timeout stay private and fail closed", async (t) => {
  const error = fixture(async () => { throw new Error("secret-ui-error"); });
  assert.deepEqual(await diagnostic(error), { allowed: false, codes: ["ui_error"] });
  const drift = fixture(async () => { drift.ctx.cwd = "/secret-changed"; return true; });
  assert.deepEqual(await diagnostic(drift), { allowed: false, codes: ["context_drift"] });
  for (const code of ["aborted", "cancelled", "timeout"]) {
    t.mock.timers.enable({ apis: ["setTimeout"] });
    const controller = new AbortController(); let release!: (b: boolean) => void;
    const f = fixture(() => new Promise(r => { release = r; })); f.ctx.signal = controller.signal;
    const pending = diagnostic(f); await new Promise(r => setImmediate(r));
    if (code === "aborted") controller.abort();
    else if (code === "cancelled") f.gate.revoke();
    else t.mock.timers.tick(30_000);
    assert.deepEqual(await pending, { allowed: false, codes: [code] });
    release(true); await new Promise(r => setImmediate(r));
    assert.deepEqual(await diagnostic(f), { allowed: false, codes: ["replay"] });
    t.mock.timers.reset();
  }
});

test("diagnostic concurrent and replayed requests have independent reasons", async () => {
  let release!: (b: boolean) => void;
  const f = fixture(() => new Promise(r => { release = r; }));
  const first = diagnostic(f);
  const malformed = f.event("malformed"); (malformed.input as any).bad = undefined;
  assert.deepEqual(await diagnostic(f, malformed), { allowed: false, codes: ["canonical_input"] });
  assert.deepEqual(await diagnostic(f), { allowed: false, codes: ["replay"] });
  await new Promise(r => setImmediate(r)); release(false);
  assert.deepEqual(await first, { allowed: false, codes: ["not_confirmed"] });
});
