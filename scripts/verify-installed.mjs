import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

// Offline smoke against the already installed development runtime. Packaging is
// checked separately by check-package; this does NOT perform a fresh installation.
const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const metadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const piRoot = join(root, "node_modules/@earendil-works/pi-coding-agent");
const installed = JSON.parse(await readFile(join(piRoot, "package.json"), "utf8"));
assert.equal(installed.version, metadata.devDependencies["@earendil-works/pi-coding-agent"]);
assert.deepEqual(metadata.pi.extensions, ["./src/index.ts"]);
const loader = join(root, "node_modules/tsx/dist/loader.mjs");
await access(loader);

const smoke = `
import assert from "node:assert/strict";
const { default: extension } = await import(${JSON.stringify(pathToFileURL(join(root, metadata.pi.extensions[0])).href)});
const { loadExtensionFromFactory, createExtensionRuntime } = await import(${JSON.stringify(pathToFileURL(join(piRoot, "dist/core/extensions/loader.js")).href)});
const loaded = await loadExtensionFromFactory(extension, "/smoke", {}, createExtensionRuntime());
assert.ok(loaded, "installed Pi loader must accept the entry");
assert.deepEqual([...loaded.handlers.keys()], [
  "before_agent_start", "tool_call", "tool_result", "session_shutdown", "session_start",
  "session_before_switch", "session_before_fork", "session_before_tree", "session_tree",
  "session_before_compact", "session_compact",
]);
assert.equal(loaded.tools.size, 0);
assert.equal(loaded.flags.size, 0);
assert.equal(loaded.commands.size, 0);
const dispatch = async (name, event, ctx) => {
  let result;
  for (const handler of loaded.handlers.get(name) ?? []) result = await handler(event, ctx);
  return result;
};
let prompts = 0;
const ctx = { mode: "rpc", hasUI: true, cwd: "/smoke", signal: undefined,
  sessionManager: { getSessionId: () => "smoke-session" },
  ui: { confirm: async () => { prompts++; return true; } } };
const event = id => ({ type: "tool_call", toolName: "web_search", toolCallId: id, input: { query: "fake-only" } });
for (const mode of ["rpc", "print", "json", undefined]) {
  ctx.mode = mode;
  assert.equal((await dispatch("tool_call", event("deny-" + mode), ctx)).block, true);
}
assert.equal(prompts, 0);
ctx.mode = "tui";
await dispatch("session_start", { type: "session_start", reason: "startup" }, ctx);
const first = await dispatch("tool_call", event("first-native"), ctx);
assert.equal(first.block, true);
assert.match(first.reason, /policy_denial=sourcerudder_first/);
assert.match(first.reason, /mcp__sourcerudder__search_web/);
assert.match(first.reason, /tools\\.mcp__sourcerudder__/);
assert.equal(prompts, 0);
const source = { type: "tool_call", toolName: "mcp__sourcerudder__search_web",
  toolCallId: "source-failure", input: { query: "fake-only" } };
assert.equal(await dispatch("tool_call", source, ctx), undefined);
await dispatch("tool_result", { ...source, type: "tool_result", isError: true, content: [], details: {} }, ctx);
const allowed = event("approved");
assert.equal(await dispatch("tool_call", allowed, ctx), undefined);
assert.ok(Object.isFrozen(allowed));
assert.ok(Object.isFrozen(allowed.input));
assert.equal(prompts, 1);
assert.equal((await dispatch("tool_call", allowed, ctx)).block, true);
await dispatch("session_shutdown", { type: "session_shutdown", reason: "quit" }, ctx);
assert.equal((await dispatch("tool_call", event("after-shutdown"), ctx)).block, true);
const prompt = await dispatch("before_agent_start", { systemPrompt: "host" }, ctx);
assert.match(prompt.systemPrompt, /ONE EXECUTION/);
assert.match(prompt.systemPrompt, /RPC, print, JSON/);
`;
await execute(process.execPath, ["--import", pathToFileURL(loader).href, "--input-type=module", "--eval", smoke],
  { cwd: root, maxBuffer: 1024 * 1024 });
console.log(`verify-installed: PASS offline installed Pi ${installed.version} loader, registered hooks, async mode/consent smoke; no fresh install performed`);
