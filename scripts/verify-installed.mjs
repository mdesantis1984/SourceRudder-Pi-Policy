import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-sourcerudder-installed-"));
const packageMetadata = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const piPackageName = "@earendil-works/pi-coding-agent";
const testedPiVersion = packageMetadata.devDependencies?.[piPackageName];
assert.equal(
  typeof testedPiVersion,
  "string",
  "package.json must pin the Pi development baseline",
);
const loaderPath = join(root, "node_modules", "tsx", "dist", "loader.mjs");

function packageDirectory(installRoot, packageName) {
  return join(installRoot, "node_modules", ...packageName.split("/"));
}

try {
  await access(loaderPath);
  const { stdout } = await execute(
    npm,
    ["pack", "--ignore-scripts", "--json", "--pack-destination", temporaryRoot],
    { cwd: root, maxBuffer: 1024 * 1024 },
  );
  const manifests = JSON.parse(stdout);
  assert.equal(manifests.length, 1, "npm pack must produce one package");
  const [manifest] = manifests;
  const tarball = join(temporaryRoot, manifest.filename);
  await access(tarball);

  const installRoot = join(temporaryRoot, "install");
  await mkdir(installRoot);
  await writeFile(
    join(installRoot, "package.json"),
    '{"name":"pi-sourcerudder-smoke","private":true,"type":"module"}\n',
  );
  await execute(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--omit=dev",
      `${piPackageName}@${testedPiVersion}`,
      tarball,
    ],
    { cwd: installRoot, maxBuffer: 1024 * 1024 },
  );

  const installedPackageRoot = packageDirectory(installRoot, packageMetadata.name);
  const installedMetadata = JSON.parse(
    await readFile(join(installedPackageRoot, "package.json"), "utf8"),
  );
  assert.deepEqual(installedMetadata.pi, { extensions: ["./src/index.ts"] });
  assert.equal(installedMetadata.private, true);
  await access(join(installedPackageRoot, "src", "index.ts"));

  const installedPiMetadata = JSON.parse(
    await readFile(
      join(installRoot, "node_modules", "@earendil-works", "pi-coding-agent", "package.json"),
      "utf8",
    ),
  );
  assert.equal(installedPiMetadata.version, testedPiVersion);

  const smokePath = join(installRoot, "load-extension.mjs");
  await writeFile(
    smokePath,
    `import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const packageRoot = process.argv[2];
const metadata = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
const [entry] = metadata.pi.extensions;
const extension = await import(pathToFileURL(join(packageRoot, entry)).href);
assert.equal(typeof extension.default, "function");

const registeredEvents = [];
extension.default({
  on(event) {
    registeredEvents.push(event);
  },
});
assert.deepEqual(registeredEvents, [
  "before_agent_start",
  "tool_call",
  "tool_result",
  "session_shutdown",
]);
`,
  );
  await execute(
    process.execPath,
    ["--import", pathToFileURL(loaderPath).href, smokePath, installedPackageRoot],
    { cwd: installRoot, maxBuffer: 1024 * 1024 },
  );

  console.log(
    "verify-installed: PASS packed, production-installed, and loaded the Pi extension entry with the repository TypeScript loader",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
