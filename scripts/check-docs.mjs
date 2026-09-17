import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const documents = [
  "README.md",
  "README.es.md",
  "RUNBOOK.md",
  "RUNBOOK.es.md",
  "docs/architecture.md",
  "docs/architecture.es.md",
];
const bilingualPairs = [
  ["README.md", "README.es.md"],
  ["RUNBOOK.md", "RUNBOOK.es.md"],
  ["docs/architecture.md", "docs/architecture.es.md"],
];
const requiredText = {
  "README.md": [
    "SourceRudder must already be configured",
    "pi install /absolute/path/to/pi-sourcerudder-policy",
    "pi install -l /absolute/path/to/pi-sourcerudder-policy",
    "the twelfth is blocked",
    "hidden inside that external MCP process",
  ],
  "README.es.md": [
    "SourceRudder ya debe estar configurado",
    "pi install /absolute/path/to/pi-sourcerudder-policy",
    "pi install -l /absolute/path/to/pi-sourcerudder-policy",
    "se bloquea la duodécima",
    "oculto dentro de ese proceso MCP externo",
  ],
  "RUNBOOK.md": [
    "npm ci --ignore-scripts",
    "npm run verify:installed",
    "/reload",
    "pi remove /absolute/path/to/pi-sourcerudder-policy",
    "Pi can evaluate visible tool calls",
  ],
  "RUNBOOK.es.md": [
    "npm ci --ignore-scripts",
    "npm run verify:installed",
    "/reload",
    "pi remove /absolute/path/to/pi-sourcerudder-policy",
    "Pi puede evaluar llamadas de herramientas visibles",
  ],
  "docs/architecture.md": [
    '"extensions": ["./src/index.ts"]',
    "compatibility is intentionally the wildcard `*`",
    "@earendil-works/pi-coding-agent` exactly to `0.85.1`",
    "web_search",
    "the twelfth is blocked",
    "hidden inside the external",
  ],
  "docs/architecture.es.md": [
    '"extensions": ["./src/index.ts"]',
    "compatibilidad como peer de runtime con Pi usa intencionalmente el comodín `*`",
    "@earendil-works/pi-coding-agent` en `0.85.1`",
    "web_search",
    "se bloquea la duodécima",
    "oculto dentro del proceso MCP",
  ],
};
const sharedTerms = {
  "README.md|README.es.md": [
    "pi install /absolute/path/to/pi-sourcerudder-policy",
    "pi install -l /absolute/path/to/pi-sourcerudder-policy",
    "web_search",
    "webfetch",
  ],
  "RUNBOOK.md|RUNBOOK.es.md": [
    "npm ci --ignore-scripts",
    "npm run verify:installed",
    "/reload",
    "pi remove /absolute/path/to/pi-sourcerudder-policy",
  ],
  "docs/architecture.md|docs/architecture.es.md": [
    "./src/index.ts",
    "`0.85.1`",
    "web_search",
    "mcp__sourcerudder",
  ],
};
const localLinkPattern = /(?<!!)!?\[[^\]]*\]\(([^)]+)\)/g;

const contentByDocument = new Map(
  await Promise.all(
    documents.map(async (document) => [document, await readFile(document, "utf8")]),
  ),
);

for (const document of documents) {
  const content = contentByDocument.get(document);
  assert.ok(content, `missing documentation content for ${document}`);

  for (const match of content.matchAll(localLinkPattern)) {
    const target = match[1].trim();
    if (!target || /^(?:https?:|mailto:|#)/.test(target)) continue;
    const path = target.split("#", 1)[0];
    await access(resolve(dirname(document), path));
  }

  for (const text of requiredText[document]) {
    assert.ok(content.includes(text), `${document} must include: ${text}`);
  }
  assert.doesNotMatch(content, /npm publish|release candidate/i);
}

for (const [english, spanish] of bilingualPairs) {
  const englishContent = contentByDocument.get(english);
  const spanishContent = contentByDocument.get(spanish);
  const spanishTarget = relative(dirname(english), spanish);
  const englishTarget = relative(dirname(spanish), english);
  assert.ok(
    englishContent.includes(`](${spanishTarget})`),
    `${english} must link to ${spanishTarget}`,
  );
  assert.ok(
    spanishContent.includes(`](${englishTarget})`),
    `${spanish} must link to ${englishTarget}`,
  );

  for (const term of sharedTerms[`${english}|${spanish}`]) {
    assert.ok(englishContent.includes(term), `${english} must preserve ${term}`);
    assert.ok(spanishContent.includes(term), `${spanish} must preserve ${term}`);
  }
}

console.log(`check-docs: PASS ${documents.length} bilingual documentation surfaces`);
