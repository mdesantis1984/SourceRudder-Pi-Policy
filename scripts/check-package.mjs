import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-sourcerudder-package-"));
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
  const runtimeFiles = ["src/index.ts", "src/policy.ts", "src/retry-guard.ts"];
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

try {
  const metadata = await readJson("package.json");
  assertPackageMetadata(metadata);
  await assertExternalMcpBoundary();

  const { stdout } = await execute(
    npm,
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temporaryRoot],
    { cwd: root, maxBuffer: 1024 * 1024 },
  );
  const manifests = JSON.parse(stdout);
  assert.equal(manifests.length, 1, "npm pack must produce one manifest");

  const [manifest] = manifests;
  assert.equal(typeof manifest.filename, "string");
  await access(join(temporaryRoot, manifest.filename));

  const packedFiles = manifest.files.map(({ path }) => path).sort();
  assert.deepEqual(packedFiles, expectedFiles, "npm pack must honor the allowlist");
  for (const path of packedFiles) {
    assert.equal(forbiddenFiles.has(path), false, `forbidden package file: ${path}`);
    assert.equal(
      forbiddenPrefixes.some((prefix) => path.startsWith(prefix)),
      false,
      `forbidden package artifact: ${path}`,
    );
  }

  console.log(
    `check-package: PASS ${manifest.entryCount} allowlisted files, ${manifest.unpackedSize} bytes unpacked`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
