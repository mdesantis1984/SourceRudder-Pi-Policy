import assert from "node:assert/strict";
import { readFile, realpath } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Use npm's installed packaging engine directly: even `npm pack --dry-run`
// writes its cache. Build and inspect the tar stream in memory, without scripts,
// installers, cache writes, or temporary artifacts.
const npmRequire = createRequire(await realpath(process.env.npm_execpath ?? "/usr/bin/npm"));
const packlist = npmRequire("npm-packlist");
const Arborist = npmRequire("@npmcli/arborist");
const tar = npmRequire("tar");
const expectedFiles = [
  "LICENSE",
  "README.es.md",
  "README.md",
  "RUNBOOK.es.md",
  "RUNBOOK.md",
  "docs/architecture.es.md",
  "docs/architecture.md",
  "package.json",
  "src/index.ts",
  "src/one-shot-consent.ts",
  "src/policy.ts",
  "src/retry-guard.ts",
].sort();
const forbiddenPrefixes = [".github/", "node_modules/", "odd/", "scripts/", "test/"];
const forbiddenFiles = new Set([".directory", "package-lock.json"]);

async function readJson(relativePath) {
  return JSON.parse(await readFile(join(root, relativePath), "utf8"));
}

function assertPackageMetadata(metadata) {
  assert.equal(metadata.name, "pi-sourcerudder-policy");
  assert.equal(metadata.private, true, "publication must remain disabled");
  assert.equal(metadata.license, "MIT");
  assert.equal(metadata.type, "module");
  assert.equal(metadata.engines?.node, ">=22.19.0");
  assert.equal(
    metadata.peerDependencies?.["@earendil-works/pi-coding-agent"],
    "*",
    "Pi core runtime peers must remain wildcard-compatible",
  );
  assert.equal(
    metadata.devDependencies?.["@earendil-works/pi-coding-agent"],
    "0.85.1",
  );
  assert.deepEqual(metadata.pi, { extensions: ["./src/index.ts"] });
  assert.deepEqual(metadata.files, [
    "src",
    "README.es.md",
    "RUNBOOK.md",
    "RUNBOOK.es.md",
    "docs/architecture.md",
    "docs/architecture.es.md",
  ]);
  assert.deepEqual(metadata.dependencies ?? {}, {});
  assert.deepEqual(metadata.bundledDependencies ?? [], []);
}

async function assertExternalMcpBoundary() {
  const runtimeFiles = ["src/index.ts", "src/policy.ts", "src/retry-guard.ts", "src/one-shot-consent.ts"];
  const sources = await Promise.all(
    runtimeFiles.map((file) => readFile(join(root, file), "utf8")),
  );
  const policySource = sources[1];

  assert.match(policySource, /separately configured SourceRudder MCP/);
  assert.match(policySource, /cannot intercept hidden network traffic/);
  for (const source of sources) {
    assert.doesNotMatch(source, /node:(?:child_process|http|https|net)\b/);
    assert.doesNotMatch(source, /\bfetch\s*\(/);
  }
}

{
  const metadata = await readJson("package.json");
  assertPackageMetadata(metadata);
  await assertExternalMcpBoundary();

  const tree = await new Arborist({ path: root }).loadActual();
  const packedFiles = (await packlist(tree)).sort();
  assert.deepEqual(packedFiles, expectedFiles, "npm pack must honor the allowlist");
  for (const path of packedFiles) {
    assert.equal(forbiddenFiles.has(path), false, `forbidden package file: ${path}`);
    assert.equal(
      forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
      false,
      `forbidden package artifact: ${path}`,
    );
  }

  const entries = [];
  const reader = tar.t({ onentry(entry) { entries.push(entry.path.replace(/^package\//, "")); } });
  const completed = new Promise((resolve, reject) => {
    reader.on("end", resolve);
    reader.on("error", reject);
  });
  const archive = tar.c({ cwd: root, prefix: "package/", portable: true }, packedFiles);
  archive.on("error", error => reader.destroy(error));
  archive.pipe(reader);
  await completed;
  assert.deepEqual(entries.sort(), expectedFiles, "in-memory tar must honor npm's packlist");
  console.log(`check-package: PASS ${entries.length} allowlisted files, npm packlist and in-memory tar; no cache/artifact writes`);
}
