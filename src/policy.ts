export const POLICY_SENTINEL = "[SOURCERUDDER-POLICY:pi-v1]";
const LEGACY_POLICY_SENTINEL = "[SOURCERUDDER-POLICY:v1.0.0]";
const IA_BUSCAR_POLICY_SENTINEL = "[IA-BUSCAR-POLICY:v0.2.2]";

export const NATIVE_RESEARCH_TOOLS = [
  "web_search",
  "source_check",
  "fetch_content",
  "get_search_content",
  "websearch",
  "webfetch",
] as const;

const LOCAL_OR_CODE_ACTIONS = new Set([
  "grep",
  "find",
  "search_code",
  "search_graph",
  "mem_search",
  "fetch_file",
  "fetch_files",
  "fetch_path",
  "read_file",
  "read_files",
  "read_path",
  "read_directory",
  "read_dir",
  "list_files",
  "get_file",
  "open_file",
]);

const WEB_FETCH_TARGETS = new Set([
  "url",
  "uri",
  "web",
  "internet",
  "page",
  "content",
  "html",
  "http",
  "https",
  "document",
]);

const WEB_RESEARCH_SERVERS = new Set([
  "brave",
  "tavily",
  "exa",
  "perplexity",
  "serpapi",
  "google",
  "bing",
  "duckduckgo",
  "firecrawl",
  "jina",
  "browserbase",
  "playwright",
  "github",
  "gitlab",
  "npm",
  "pypi",
  "reddit",
  "stackoverflow",
  "hackernews",
  "newsapi",
  "unsplash",
  "pexels",
]);

const RESEARCH_READ_VERBS = new Set([
  "search",
  "query",
  "lookup",
  "get",
  "list",
  "read",
  "fetch",
  "open",
  "browse",
  "view",
  "retrieve",
  "info",
  "details",
  "metadata",
]);

/**
 * This guidance belongs to the Pi policy extension, not the external MCP
 * process. It deliberately states the enforcement boundary rather than
 * promising network isolation that Pi cannot provide.
 */
export const POLICY_GUIDANCE = `${POLICY_SENTINEL}
SourceRudder-first research policy:

1. Use the separately configured SourceRudder MCP for web research. Choose its
   specialized web, documentation, GitHub, community, or URL-retrieval tool as
   appropriate before considering another research route.
2. Pi-native web_search, source_check, fetch_content, get_search_content,
   websearch, and webfetch are blocked. Identifiable non-SourceRudder MCP web
   research routes are also blocked; there is no approval or fallback path.
3. This policy enforces only tool calls visible to Pi. It does not configure,
   bundle, or start SourceRudder, and it cannot intercept hidden network traffic
   performed inside the separately running external SourceRudder MCP process.
4. Local and code-oriented tools, including grep, find, search_code,
   search_graph, and mem_search, are outside this web-research block.
5. Eleven identical unresolved SourceRudder calls are permitted in a session;
   the twelfth is blocked. A successful result clears only that session and
   call fingerprint.
`;

/** Exact historic OpenCode blocks are removed only when the whole owned block is present. */
export const LEGACY_POLICY_GUIDANCE = `
${LEGACY_POLICY_SENTINEL}
Research policy (SourceRudder-first; native tools blocked):

1. Use the SourceRudder MCP tools before any native OpenCode research tool. Select the
    specialized tool for the evidence: official documentation uses
    sourcerudder_search_doc_oficial; general web research uses sourcerudder_search_web;
    GitHub repositories/source uses sourcerudder_search_github; issues use
    sourcerudder_search_github_issue; pull requests use sourcerudder_search_github_pr;
    technical/community evidence uses sourcerudder_search_stackoverflow and
    sourcerudder_search_reddit; and URL retrieval/extraction uses
    sourcerudder_fetch_url or sourcerudder_fetch_and_extract.
2. Native OpenCode websearch and webfetch are blocked by this policy. They have no
   approval path and no fallback path.
3. This scope blocks only native websearch and webfetch. It does not block Bash,
   other MCP tools, or provider-side actions outside these OpenCode hooks, and it
   does not claim that every request must use online research.
4. Eleven identical unresolved SourceRudder attempts are permitted; the twelfth is
   blocked. A reliable successful after hook clears that unresolved-attempt state.
   Missing after hooks remain unresolved, not confirmed failures, because the SDK
   does not expose a documented synchronous failed-MCP signal.
5. Do not use doom_loop to bypass this policy or to repeat research indefinitely.
`;

export const ADVISORY_POLICY_GUIDANCE = `
${LEGACY_POLICY_SENTINEL}
Research policy (SourceRudder-first, mandatory):

1. Use the SourceRudder MCP tools before any native OpenCode research tool. Select the
    specialized tool for the evidence: official documentation uses
    sourcerudder_search_doc_oficial; general web research uses sourcerudder_search_web;
    GitHub repositories/source uses sourcerudder_search_github; issues use
    sourcerudder_search_github_issue; pull requests use sourcerudder_search_github_pr;
    technical/community evidence uses sourcerudder_search_stackoverflow and
    sourcerudder_search_reddit; and URL retrieval/extraction uses
    sourcerudder_fetch_url or sourcerudder_fetch_and_extract.
2. These sourcerudder_* names are MCP tools and are distinct from OpenCode native
    websearch and webfetch. Never treat the native names as aliases for SourceRudder.
3. Native websearch/webfetch fallback is eligible only after 11 consecutive,
    genuine SourceRudder transport, timeout, protocol, or unusable-response failures.
   Valid empty results, warnings, 404/no-match responses, and structurally valid
    degraded responses do not count. Any successful SourceRudder response resets the
   conceptual failure count.
4. Native fallback always requires explicit human approval. Do not silently use
   native tools, and do not claim that a failed MCP call was counted unless the
   host provides a reliable failure signal.
5. Do not use doom_loop to bypass this policy or to repeat research indefinitely.
`;

export const IA_BUSCAR_LEGACY_POLICY_GUIDANCE = `
${IA_BUSCAR_POLICY_SENTINEL}
Research policy (IA-Buscar-first, mandatory):

1. Use the IA-Buscar MCP tools before any native OpenCode research tool. Select the
   specialized tool for the evidence: official documentation uses
   ia-buscar_search_doc_oficial; general web research uses ia-buscar_search_web;
   GitHub repositories/source uses ia-buscar_search_github; issues use
   ia-buscar_search_github_issue; pull requests use ia-buscar_search_github_pr;
   technical/community evidence uses ia-buscar_search_stackoverflow and
   ia-buscar_search_reddit; and URL retrieval/extraction uses
   ia-buscar_fetch_url or ia-buscar_fetch_and_extract.
2. These ia-buscar_* names are MCP tools and are distinct from OpenCode native
   websearch and webfetch. Never treat the native names as aliases for IA-Buscar.
3. Native websearch/webfetch fallback is eligible only after 11 consecutive,
   genuine IA-Buscar transport, timeout, protocol, or unusable-response failures.
   Valid empty results, warnings, 404/no-match responses, and structurally valid
   degraded responses do not count. Any successful IA-Buscar response resets the
   conceptual failure count.
4. Native fallback always requires explicit human approval. Do not silently use
   native tools, and do not claim that a failed MCP call was counted unless the
   host provides a reliable failure signal.
5. Do not use doom_loop to bypass this policy or to repeat research indefinitely.
`;

const OWNED_POLICY_BLOCKS = [
  POLICY_GUIDANCE,
  LEGACY_POLICY_GUIDANCE,
  ADVISORY_POLICY_GUIDANCE,
  IA_BUSCAR_LEGACY_POLICY_GUIDANCE,
] as const;

export type ToolPolicyClassification =
  | "sourcerudder"
  | "native-web-research"
  | "mcp-web-research"
  | "other";

export interface ToolPolicyDecision {
  allowed: boolean;
  classification: ToolPolicyClassification;
  reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArgument(
  args: unknown,
  keys: readonly string[],
): string | undefined {
  if (!isRecord(args)) return undefined;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function normalizedIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSourceRudderIdentifier(value: string): boolean {
  return normalizedIdentifier(value) === "sourcerudder";
}

function isNamespacedMcpTool(name: string): boolean {
  return name.toLowerCase().startsWith("mcp__");
}

function isMcpGatewayTool(name: string): boolean {
  return name === "mcp" || isNamespacedMcpTool(name);
}

function namespacedParts(name: string): string[] {
  return name.split("__").slice(1).filter(Boolean);
}

function actionTokens(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function isExplicitLocalOrCodeAction(value: string): boolean {
  return LOCAL_OR_CODE_ACTIONS.has(value.toLowerCase());
}

function hasReadVerb(tokens: readonly string[]): boolean {
  return tokens.some((token) => RESEARCH_READ_VERBS.has(token));
}

function isKnownWebResearchServer(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return WEB_RESEARCH_SERVERS.has(normalized);
}

/**
 * Returns true only for direct sourcerudder_* calls, the mcp__sourcerudder
 * namespace, or MCP gateway calls whose explicit server identifies SourceRudder.
 * A generic gateway can use an exact SourceRudder-prefixed tool only when it
 * does not provide a server identity.
 */
export function isSourceRudderCall(toolName: string, args?: unknown): boolean {
  if (toolName.toLowerCase().startsWith("sourcerudder_")) return true;

  if (isNamespacedMcpTool(toolName)) {
    const [server] = namespacedParts(toolName);
    if (server && isSourceRudderIdentifier(server)) return true;
  }

  if (toolName !== "mcp") return false;
  const server = stringArgument(args, ["server", "serverName", "mcpServer"]);
  if (server !== undefined) return isSourceRudderIdentifier(server);

  const tool = stringArgument(args, ["tool", "toolName", "action"]);
  return tool?.toLowerCase().startsWith("sourcerudder_") ?? false;
}

/** The six exact Pi/OpenCode native research tool names are always blocked. */
export function isNativeResearchTool(toolName: string): boolean {
  return (NATIVE_RESEARCH_TOOLS as readonly string[]).includes(toolName);
}

function isExplicitWebResearchAction(action: string): boolean {
  if (isExplicitLocalOrCodeAction(action)) return false;

  const normalized = action.toLowerCase();
  if (
    [
      "websearch",
      "webfetch",
      "searchweb",
      "websearch",
      "fetchurl",
      "fetchcontent",
      "getsearchcontent",
      "sourcecheck",
      "browseropen",
      "browsersearch",
      "browseweb",
      "searchnews",
      "newssearch",
      "searchimages",
      "imagesearch",
      "searchcommunity",
      "communitysearch",
      "searchpackages",
      "packagesearch",
      "searchgithub",
      "githubsearch",
    ].includes(normalized.replace(/[^a-z0-9]/g, ""))
  ) {
    return true;
  }

  const tokens = actionTokens(action);
  if (tokens.length === 0) return false;
  if (tokens.includes("fetch")) {
    return (
      tokens.some((token) => WEB_FETCH_TARGETS.has(token)) ||
      tokens.some((token) => ["extract", "scrape", "crawl"].includes(token))
    );
  }
  if (tokens.includes("url") || tokens.includes("http") || tokens.includes("html"))
    return hasReadVerb(tokens);
  if (
    tokens.some((token) =>
      ["web", "internet", "browser", "browse", "news", "image", "images"].includes(
        token,
      ),
    )
  ) {
    return hasReadVerb(tokens) || tokens.length === 1;
  }
  if (
    tokens.some((token) =>
      [
        "community",
        "reddit",
        "stackoverflow",
        "forum",
        "github",
        "gitlab",
        "package",
        "packages",
        "npm",
        "pypi",
      ].includes(token),
    )
  ) {
    return hasReadVerb(tokens);
  }
  return false;
}

/**
 * Identifies only visible MCP routes with an explicit web-research action.
 * Ambiguous actions such as a bare `search` remain allowed unless their MCP
 * server is a known web-research provider.
 */
export function isNonSourceRudderMcpResearchCall(
  toolName: string,
  args?: unknown,
): boolean {
  if (!isMcpGatewayTool(toolName) || isSourceRudderCall(toolName, args)) {
    return false;
  }

  const parts = isNamespacedMcpTool(toolName) ? namespacedParts(toolName) : [];
  const serverFromName = parts[0];
  const actionFromName = parts.slice(1).join("_");
  const server =
    stringArgument(args, ["server", "serverName", "mcpServer"]) ??
    serverFromName;
  const action =
    stringArgument(args, ["tool", "toolName", "action"]) ?? actionFromName;

  if (!action || isExplicitLocalOrCodeAction(action)) return false;
  if (isExplicitWebResearchAction(action)) return true;

  return (
    isKnownWebResearchServer(server) && hasReadVerb(actionTokens(action))
  );
}

export function classifyToolCall(
  toolName: string,
  args?: unknown,
): ToolPolicyDecision {
  if (isSourceRudderCall(toolName, args)) {
    return {
      allowed: true,
      classification: "sourcerudder",
      reason: "SourceRudder MCP route is permitted for web research.",
    };
  }
  if (isNativeResearchTool(toolName)) {
    return {
      allowed: false,
      classification: "native-web-research",
      reason:
        "SourceRudder Policy blocks this Pi-native or OpenCode-compatible web research tool.",
    };
  }
  if (isNonSourceRudderMcpResearchCall(toolName, args)) {
    return {
      allowed: false,
      classification: "mcp-web-research",
      reason:
        "SourceRudder Policy blocks this identifiable non-SourceRudder MCP web research route.",
    };
  }
  return {
    allowed: true,
    classification: "other",
    reason: "Tool is outside the visible web-research policy boundary.",
  };
}

/** Removes only complete, byte-for-byte policy-owned current or legacy blocks. */
export function removeOwnedPolicyGuidance(entry: string): string | undefined {
  const withoutOwnedBlocks = OWNED_POLICY_BLOCKS.reduce(
    (text, block) => text.split(block).join(""),
    entry,
  );
  return withoutOwnedBlocks === "" && entry !== ""
    ? undefined
    : withoutOwnedBlocks;
}

/**
 * Preserves every unrelated system entry, removes complete owned blocks, and
 * appends exactly one current policy block. Calling it again is idempotent.
 */
export function injectPolicyGuidance(
  systemEntries: readonly string[],
): string[] {
  const preservedEntries = systemEntries.flatMap((entry) => {
    const preserved = removeOwnedPolicyGuidance(entry);
    return preserved === undefined ? [] : [preserved];
  });
  return [...preservedEntries, POLICY_GUIDANCE];
}
