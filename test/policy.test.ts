import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVISORY_POLICY_GUIDANCE,
  IA_BUSCAR_LEGACY_POLICY_GUIDANCE,
  LEGACY_POLICY_GUIDANCE,
  NATIVE_RESEARCH_TOOLS,
  POLICY_GUIDANCE,
  PREVIOUS_POLICY_GUIDANCE,
  classifyToolCall,
  injectPolicyGuidance,
  isNonSourceRudderMcpResearchCall,
  isSourceRudderCall,
  removeOwnedPolicyGuidance,
} from "../src/policy.js";
import {
  IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT,
  IdenticalAttemptGuard,
  fingerprintToolAttempt,
} from "../src/retry-guard.js";

test("guidance offers only fresh TUI-local one-shot confirmation, never a guard override", () => {
  assert.match(POLICY_GUIDANCE, /ONE EXECUTION/);
  assert.match(POLICY_GUIDANCE, /TUI-local human confirmation/);
  assert.match(POLICY_GUIDANCE, /RPC, print, JSON/);
  assert.match(POLICY_GUIDANCE, /No global disable/);
  assert.doesNotMatch(POLICY_GUIDANCE, /no approval or fallback path/);
  assert.match(POLICY_GUIDANCE, /without asking/);
  assert.match(POLICY_GUIDANCE, /Only after the most recent/);
  assert.match(POLICY_GUIDANCE, /tool_result isError/);
  assert.match(POLICY_GUIDANCE, /tools\.mcp__sourcerudder__<tool>\(\{\.\.\.\}\)/);
  for (const tool of ["search_web", "search_doc_oficial", "search_github", "search_github_issue", "search_github_pr", "search_stackoverflow", "search_reddit", "search_news", "fetch_url", "fetch_and_extract", "deep_research"]) {
    assert.ok(POLICY_GUIDANCE.includes(`mcp__sourcerudder__${tool}`));
  }
});

test("recognizes direct, namespaced, and generic SourceRudder MCP routes", () => {
  const routes: Array<[string, unknown]> = [
    ["sourcerudder_search_web", { query: "Pi extensions" }],
    ["sourcerudder_fetch_anything", { url: "https://example.test" }],
    ["mcp__sourcerudder", { tool: "search_web", query: "Pi extensions" }],
    ["mcp__sourcerudder__search_web", { query: "Pi extensions" }],
    ["mcp", { server: "sourcerudder", tool: "search_web" }],
    ["mcp", { server: "source-rudder", tool: "fetch_url" }],
    ["mcp", { tool: "sourcerudder_search_web" }],
  ];

  for (const [toolName, args] of routes) {
    assert.equal(isSourceRudderCall(toolName, args), true, toolName);
    assert.deepEqual(classifyToolCall(toolName, args), {
      allowed: true,
      classification: "sourcerudder",
      reason: "SourceRudder MCP route is permitted for web research.",
    });
  }
});

test("does not trust a SourceRudder-named tool from an explicit foreign MCP server", () => {
  const spoofedRoute = { server: "brave", tool: "sourcerudder_search_web" };
  assert.equal(isSourceRudderCall("mcp", spoofedRoute), false);
  assert.equal(
    classifyToolCall("mcp", spoofedRoute).classification,
    "mcp-web-research",
  );

  assert.equal(
    isSourceRudderCall("mcp", { server: "sourcerudder", tool: "search_web" }),
    true,
  );
  assert.equal(isSourceRudderCall("mcp", { tool: "sourcerudder_search_web" }), true);
});

test("blocks each exact Pi-native and OpenCode-compatible research tool", () => {
  for (const toolName of NATIVE_RESEARCH_TOOLS) {
    const decision = classifyToolCall(toolName);
    assert.equal(decision.allowed, false, toolName);
    assert.equal(decision.classification, "native-web-research", toolName);
  }

  assert.equal(classifyToolCall("Web_Search").allowed, true);
});

test("blocks explicit non-SourceRudder MCP web research actions", () => {
  const routes: Array<[string, unknown]> = [
    ["mcp__brave__web_search", {}],
    ["mcp", { server: "other-research", tool: "fetch_url" }],
    ["mcp", { server: "other-research", tool: "source_check" }],
    ["mcp", { server: "other-research", tool: "browser_open" }],
    ["mcp", { server: "other-research", tool: "search_news" }],
    ["mcp", { server: "other-research", tool: "image_search" }],
    ["mcp", { server: "other-research", tool: "search_reddit" }],
    ["mcp", { server: "other-research", tool: "package_search" }],
    ["mcp", { server: "other-research", tool: "github_search" }],
    ["mcp__brave__search", {}],
    ["mcp", { server: "github", tool: "get_issue" }],
  ];

  for (const [toolName, args] of routes) {
    assert.equal(isNonSourceRudderMcpResearchCall(toolName, args), true, toolName);
    assert.equal(
      classifyToolCall(toolName, args).classification,
      "mcp-web-research",
      toolName,
    );
  }
});

test("allows the reported Playwright browser_tabs list inspection", () => {
  assert.equal(
    classifyToolCall("mcp__playwright__browser_tabs", { action: "list" }).allowed,
    true,
  );
});

test("allows the exposed Playwright browser_get_config alias with empty payloads", () => {
  const routes: Array<[string, unknown]> = [
    ["mcp__playwright__browser_get_config", undefined],
    ["mcp__playwright__browser_get_config", {}],
    ["mcp", { server: "playwright", tool: "browser_get_config" }],
    ["mcp", { serverName: "playwright", toolName: "browser_get_config", arguments: {} }],
    ["mcp__playwright", { tool: "browser_get_config", args: {} }],
    ["mcp", { mcpServer: "playwright", tool: "browser_get_config", input: {} }],
    ["mcp", { server: "playwright", action: "browser_get_config", params: {} }],
  ];
  for (const [name, args] of routes) {
    assert.equal(classifyToolCall(name, args).allowed, true, JSON.stringify([name, args]));
    assert.equal(isNonSourceRudderMcpResearchCall(name, args), false);
  }
});

test("excludes all browser config payloads but rejects conflicting identities", () => {
  const routes: Array<[string, unknown]> = [
    ...[null, [], "browser_get_config", { action: "set" }, { config: {} },
      { url: "https://example.test" }, { arguments: { headless: true } },
      { arguments: null }, { arguments: {}, args: {} },
      { arguments: {}, action: "set" }].map((args): [string, unknown] =>
      ["mcp__playwright__browser_get_config", args]),
  ];
  for (const [name, args] of routes) assert.equal(classifyToolCall(name, args).allowed, true);
  const denied: Array<[string, unknown]> = [
    ["mcp__playwright__browser_get_config", { server: "browserbase" }],
    ["mcp", { server: "playwright", serverName: "brave", tool: "browser_get_config" }],
    ["mcp", { server: "brave", serverName: "playwright", tool: "browser_get_config" }],

    ["mcp__playwright__browser__get_config", {}],
    ["mcp__playwright____browser_get_config", {}],
    ["mcp__playwright__browser_get_config__", {}],

    ["mcp__brave__browser_get_config", {}],
    ["mcp__github__browser_get_config", {}],
    ["mcp__brave__browser_get_config", { server: "playwright" }],
    ["mcp__sourcerudder__search_web", { server: "playwright" }],
    ["mcp", { server: "sourcerudder", serverName: "browserbase", tool: "search_web" }],
    ["mcp", { server: "playwright", mcpServer: null, tool: "unknown" }],
  ];
  for (const [name, args] of denied) {
    assert.equal(classifyToolCall(name, args).allowed, false, JSON.stringify([name, args]));
  }
});

test("preserves existing browser_navigate allowance by explicit scope choice, without executing navigation", () => {
  assert.equal(classifyToolCall("mcp__playwright__browser_navigate", {
    url: "https://example.test",
  }).allowed, true);
});

test("allows exact read-only inspection exceptions on known browser MCP routes", () => {
  const routes: Array<[string, unknown]> = [
    ["mcp__playwright__get_config", {}],
    ["mcp__playwright__browser_tabs", { action: "list" }],
    ["mcp__browserbase__get_config", undefined],
    ["mcp", { server: "playwright", tool: "get_config" }],
    ["mcp", { serverName: "playwright", toolName: "browser_tabs", arguments: { action: "list" } }],
    ["mcp__playwright", { tool: "browser_tabs", args: { action: "list" } }],
    ["mcp", { mcpServer: "browserbase", tool: "browser_tabs", action: "list" }],
    ["mcp", { server: "playwright", action: "get_config" }],
    ["mcp__playwright__browser_tabs", { tool: "browser_tabs", input: { action: "list" } }],
    ["mcp", { server: "playwright", tool: "browser_tabs", params: { action: "list" } }],
  ];
  for (const [name, args] of routes) {
    assert.equal(classifyToolCall(name, args).allowed, true, JSON.stringify([name, args]));
    assert.equal(isNonSourceRudderMcpResearchCall(name, args), false);
  }
});

test("excludes browser mutations and arbitrary payloads without an operation allowlist", () => {
  const routes: Array<[string, unknown]> = [
    ...[undefined, {}, { action: "close" }, { action: "new" }, { action: "select" },
      { action: "LIST" }, { action: ["list"] }, { action: "list", url: "https://example.test" },
      { action: "list", index: 0 }].map((args): [string, unknown] => ["mcp__playwright__browser_tabs", args]),
    ["mcp__playwright__get_config", { url: "https://example.test" }],
    ["mcp__playwright__get_config", { action: "set" }],
    ["mcp__playwright__get_config", { arguments: null }],
    ["mcp__playwright__get_config", { arguments: {}, args: {} }],
    ["mcp__playwright__get_config", { tool: "browser_search" }],
    ["mcp__playwright__browser_search", { tool: "get_config" }],

    ["mcp", { server: "playwright", tool: "get_config", toolName: "fetch_url" }],
    ["mcp", { server: "playwright", tool: "browser_tabs", arguments: { action: "list" }, action: "close" }],
    ["mcp__playwright__browser_tabs", { arguments: { action: "list", tool: "browser_open" } }],
    ["mcp__playwright__get_config", []],
    ["mcp__playwright__get_config", "get_config"],
    ["mcp__playwright__browser_tabs", { action: "select", index: 0 }],
  ];
  for (const [name, args] of routes) {
    assert.equal(classifyToolCall(name, args).allowed, true, JSON.stringify([name, args]));
  }
});

test("rejects ambiguous namespaced browser tool boundaries", () => {
  for (const name of [
    "mcp__playwright__get__config",
    "mcp__playwright____get_config",
    "mcp__playwright__get_config__",
  ]) {
    assert.equal(classifyToolCall(name, {}).allowed, false, name);
  }
});

test("excludes research-like names within exact browser servers, not lookalikes", () => {
  const routes: Array<[string, unknown]> = [
    ["mcp__playwright__get_config_web", {}],
    ["mcp__playwright__get_config_search", {}],
    ["mcp__playwright__browser_tabs_list", { action: "list" }],
    ["mcp__playwright__browser_open", {}],
    ["mcp__playwright__browser_search", {}],
    ["mcp__playwright__fetch_url", {}],
    ["mcp__playwright__get_page", {}],
    ["mcp__playwright__getConfig", {}],
    ["mcp", { server: "playwright", tool: "get_config", arguments: { query: "research" } }],
  ];
  for (const server of ["playwright", "browserbase", "Playwright", "Browserbase"]) {
    for (const action of ["browser_snapshot", "browser_navigate", "browser_click", "browser_fill", "browser_evaluate", "search_web", "unknown_action"]) {
      routes.push([`mcp__${server}__${action}`, { action: "select", index: 0 }]);
      for (const key of ["server", "serverName", "mcpServer"]) routes.push(["mcp", { [key]: server, tool: action }]);
    }
  }
  routes.push(["mcp", { server: "playwright", serverName: "Playwright", mcpServer: "playwright", action: "unknown" }]);
  for (const [name, args] of routes) {
    assert.equal(classifyToolCall(name, args).allowed, true, JSON.stringify([name, args]));
    assert.equal(isNonSourceRudderMcpResearchCall(name, args), false);
  }
  for (const server of ["brave", "github", "fake-playwright", "browserbase-proxy"]) {
    assert.equal(classifyToolCall(`mcp__${server}__search_web`, {}).allowed, false);
    assert.equal(classifyToolCall("mcp", { server, tool: "search_web" }).allowed, false);
  }
});

test("leaves local, code, memory, and unrelated MCP actions available", () => {
  const localActions = ["grep", "find", "search_code", "search_graph", "mem_search"];
  for (const action of localActions) {
    assert.equal(
      isNonSourceRudderMcpResearchCall("mcp", {
        server: "local-tools",
        tool: action,
      }),
      false,
      action,
    );
  }

  const localFileActions = [
    "fetch_file",
    "fetch_path",
    "read_file",
    "read_directory",
    "get_file",
  ];
  for (const action of localFileActions) {
    assert.equal(
      isNonSourceRudderMcpResearchCall("mcp", {
        server: "filesystem",
        tool: action,
      }),
      false,
      action,
    );
    assert.equal(classifyToolCall("mcp", { server: "filesystem", tool: action }).allowed, true);
  }
  assert.equal(isNonSourceRudderMcpResearchCall("mcp__filesystem__fetch_file"), false);
  assert.equal(
    isNonSourceRudderMcpResearchCall("mcp", {
      server: "other-research",
      tool: "fetch_url",
    }),
    true,
  );
  assert.equal(
    isNonSourceRudderMcpResearchCall("mcp", { server: "brave", tool: "fetch" }),
    true,
  );

  assert.equal(
    isNonSourceRudderMcpResearchCall("mcp", {
      server: "github",
      tool: "create_issue",
    }),
    false,
  );
  assert.equal(isNonSourceRudderMcpResearchCall("mcp__context7__search", {}), false);
  assert.equal(classifyToolCall("search_web").allowed, true);
});

test("injects one policy block without changing unrelated host system entries", () => {
  const hostEntries = [
    "Host safety instruction.",
    `Skill instruction.\n${LEGACY_POLICY_GUIDANCE}`,
    IA_BUSCAR_LEGACY_POLICY_GUIDANCE,
    ADVISORY_POLICY_GUIDANCE,
    PREVIOUS_POLICY_GUIDANCE,
    POLICY_GUIDANCE,
  ];

  const injected = injectPolicyGuidance(hostEntries);
  assert.deepEqual(injected, ["Host safety instruction.", "Skill instruction.\n", POLICY_GUIDANCE]);
  assert.deepEqual(injectPolicyGuidance(injected), injected);
  assert.match(POLICY_GUIDANCE, /external SourceRudder MCP process/);
  assert.match(POLICY_GUIDANCE, /cannot intercept hidden network traffic/);

  const partialPolicy = POLICY_GUIDANCE.slice(0, -1);
  assert.equal(removeOwnedPolicyGuidance(partialPolicy), partialPolicy);
});

test("allows eleven identical unresolved attempts and blocks the twelfth", () => {
  const guard = new IdenticalAttemptGuard();
  const fingerprint = fingerprintToolAttempt("sourcerudder_search_web", {
    query: "same request",
  });

  for (let attempt = 0; attempt < IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT; attempt++) {
    assert.doesNotThrow(() => guard.recordAttempt("session-a", fingerprint));
  }
  assert.throws(() => guard.recordAttempt("session-a", fingerprint), /twelve times/);
});

test("retains unresolved attempts after tracking many other fingerprints", () => {
  const guard = new IdenticalAttemptGuard();
  const protectedFingerprint = fingerprintToolAttempt("sourcerudder_search_web", {
    query: "must remain tracked",
  });

  for (let attempt = 0; attempt < IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT; attempt++) {
    guard.recordAttempt("session-a", protectedFingerprint);
  }
  for (let index = 0; index < 65; index++) {
    guard.recordAttempt(
      "session-a",
      fingerprintToolAttempt("sourcerudder_search_web", { query: `other-${index}` }),
    );
  }

  assert.throws(
    () => guard.recordAttempt("session-a", protectedFingerprint),
    /twelve times/,
  );
});

test("retains unresolved attempts after tracking many other sessions", () => {
  const guard = new IdenticalAttemptGuard();
  const protectedFingerprint = fingerprintToolAttempt("sourcerudder_search_web", {
    query: "must remain tracked",
  });

  for (let attempt = 0; attempt < IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT; attempt++) {
    guard.recordAttempt("session-a", protectedFingerprint);
  }
  for (let index = 0; index < 32; index++) {
    guard.recordAttempt(
      `other-session-${index}`,
      fingerprintToolAttempt("sourcerudder_search_web", { query: `other-${index}` }),
    );
  }

  assert.throws(
    () => guard.recordAttempt("session-a", protectedFingerprint),
    /twelve times/,
  );
});

test("uses stable fingerprints and a successful result resets only its matching attempt", () => {
  const first = fingerprintToolAttempt("sourcerudder_search_web", {
    filters: { language: "TypeScript", stars: 100 },
    query: "policy",
  });
  const reordered = fingerprintToolAttempt("sourcerudder_search_web", {
    query: "policy",
    filters: { stars: 100, language: "TypeScript" },
  });
  const other = fingerprintToolAttempt("sourcerudder_search_web", { query: "other" });
  assert.equal(first, reordered);

  const guard = new IdenticalAttemptGuard();
  for (let attempt = 0; attempt < IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT; attempt++) {
    guard.recordAttempt("session-a", first);
    guard.recordAttempt("session-a", other);
  }

  guard.recordSuccess("session-a", first);
  assert.doesNotThrow(() => guard.recordAttempt("session-a", first));
  assert.throws(() => guard.recordAttempt("session-a", other), /twelve times/);
});

test("isolates sessions and supports explicit session cleanup", () => {
  const guard = new IdenticalAttemptGuard();
  const fingerprint = fingerprintToolAttempt("sourcerudder_search_web", { query: "same" });

  for (let attempt = 0; attempt < IDENTICAL_UNRESOLVED_ATTEMPT_LIMIT; attempt++) {
    guard.recordBefore("session-a", fingerprint);
  }
  assert.throws(() => guard.recordBefore("session-a", fingerprint), /twelve times/);
  assert.doesNotThrow(() => guard.recordBefore("session-b", fingerprint));

  guard.clearSession("session-a");
  assert.doesNotThrow(() => guard.recordBefore("session-a", fingerprint));
});
