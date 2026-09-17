import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVISORY_POLICY_GUIDANCE,
  IA_BUSCAR_LEGACY_POLICY_GUIDANCE,
  LEGACY_POLICY_GUIDANCE,
  NATIVE_RESEARCH_TOOLS,
  POLICY_GUIDANCE,
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

test("recognizes direct, namespaced, and generic SourceRudder MCP routes", () => {
  const routes: Array<[string, unknown]> = [
    ["sourcerudder_search_web", { query: "Pi extensions" }],
    ["sourcerudder_fetch_anything", { url: "https://example.test" }],
    ["mcp__sourcerudder", { tool: "search_web", query: "Pi extensions" }],
    ["mcp__sourcerudder__search_web", { query: "Pi extensions" }],
    ["mcp", { server: "sourcerudder", tool: "search_web" }],
    ["mcp", { server: "source-rudder", tool: "fetch_url" }],
    ["mcp", { server: "other", tool: "sourcerudder_search_web" }],
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
