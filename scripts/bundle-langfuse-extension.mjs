#!/usr/bin/env node
/**
 * Build the Langfuse example agent extension (ADR 0334, ADR 0335).
 *
 * `examples/plugins/pi-langfuse/agent/langfuse.mjs` is generated and committed.
 * A distributed plugin cannot carry a dependency tree: `walk.ts` ignores
 * `node_modules` when packing a `.piplug`, and host-core's `install.rs` skips
 * those segments on extraction. The bounded npm installer only runs on the
 * local-import path, so a marketplace install must ship a self-contained
 * artifact.
 *
 * The bundle has two parts: the plugin's own config bridge
 * (`src/config-bridge.js`), which is the entry the sidecar loads, and the
 * upstream `@langfuse/pi-observability-plugin` it delegates to, pulled in
 * through an alias to the pinned package. Upstream source is not modified —
 * the bridge only sets environment variables before importing it.
 *
 * The upstream version is pinned in the root `package.json` devDependencies.
 * The build input is deliberately NOT installed into the product dependency
 * tree: the OpenTelemetry and Langfuse stacks exist only inside the committed
 * artifact, so a stock install carries no tracing code at all.
 *
 * Usage:
 *   node scripts/bundle-langfuse-extension.mjs           # write the bundle
 *   node scripts/bundle-langfuse-extension.mjs --check    # fail when it drifts
 *   node scripts/bundle-langfuse-extension.mjs --from DIR # pre-installed input
 *
 * `DIR` must contain `node_modules/@langfuse/pi-observability-plugin`. Without
 * `--from`, the pinned package is installed into a temporary directory.
 *
 * The kernel package stays external: the sidecar supplies it as a jiti virtual
 * module, so the extension shares the sidecar's kernel instance.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_PACKAGE = "@langfuse/pi-observability-plugin";
/** Supplied by the sidecar's virtual modules; bundling it would fork the kernel. */
const VIRTUAL_KERNEL_MODULES = ["@earendil-works/pi-coding-agent"];
/** esbuild is already a build dependency of the desktop app. */
const ESBUILD_RANGE = "^0.25.12";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const pluginDir = join(repoRoot, "examples", "plugins", "pi-langfuse");
const outfile = join(pluginDir, "agent", "langfuse.mjs");
const bridgeEntry = join(pluginDir, "src", "config-bridge.js");
const rootManifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
const pinned = rootManifest.devDependencies?.[PLUGIN_PACKAGE];
if (!pinned) {
  throw new Error(`${PLUGIN_PACKAGE} is not pinned in the root package.json devDependencies`);
}
if (!/^\d+\.\d+\.\d+$/.test(pinned)) {
  throw new Error(
    `${PLUGIN_PACKAGE} must be pinned to an exact version, got "${pinned}"; a range ` +
      "would let the committed artifact drift from the declared source",
  );
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

/** Install the pinned package outside the workspace, or reuse a caller's tree. */
function resolveBuildInput() {
  // `--from` wins, then the environment so a test or CI job can point at a
  // pre-installed tree and stay offline.
  const from = argValue("--from") ?? process.env.PI_LANGFUSE_BUNDLE_FROM;
  if (from) {
    const dir = resolve(from);
    if (!existsSync(join(dir, "node_modules", PLUGIN_PACKAGE))) {
      throw new Error(`build input ${dir} has no node_modules/${PLUGIN_PACKAGE}`);
    }
    return { dir, cleanup: () => {} };
  }
  const dir = mkdtempSync(join(tmpdir(), "pi-langfuse-build-"));
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: "pi-langfuse-bundle-input",
        private: true,
        version: "0.0.0",
        dependencies: { [PLUGIN_PACKAGE]: pinned, esbuild: ESBUILD_RANGE },
      },
      null,
      2,
    )}\n`,
  );
  // Lifecycle scripts are not needed to bundle TypeScript and must not run.
  execFileSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: dir,
    stdio: ["ignore", "ignore", "inherit"],
  });
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

const input = resolveBuildInput();
try {
  const require = createRequire(join(input.dir, "package.json"));
  const { build } = require("esbuild");
  const manifestPath = require.resolve(`${PLUGIN_PACKAGE}/package.json`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== pinned) {
    throw new Error(
      `resolved ${PLUGIN_PACKAGE}@${manifest.version} but package.json pins ${pinned}`,
    );
  }
  const entry = manifest.pi?.extensions?.[0];
  if (!entry) throw new Error(`${PLUGIN_PACKAGE} declares no pi.extensions entry`);

  // Alias the pinned package to its own resolved extension entry, so the
  // bridge can import it by bare name and the version in the artifact is
  // always the version this repository declared.
  const upstreamEntry = resolve(dirname(manifestPath), entry);
  const banner = [
    `// PI-Desktop Langfuse example extension (ADR 0334, ADR 0335).`,
    "// Generated by scripts/bundle-langfuse-extension.mjs - do not hand-edit.",
    "// Part 1: examples/plugins/pi-langfuse/src/config-bridge.js - the plugin's",
    "// own settings bridge, which installs the user's panel settings as",
    "// environment variables before importing part 2.",
    `// Part 2: ${PLUGIN_PACKAGE}@${manifest.version}, built from the unmodified`,
    "// published package; no local patch is applied to it.",
    `// Upstream: ${manifest.repository?.url ?? manifest.homepage ?? "https://github.com/langfuse/pi-observability-plugin"} (${manifest.license ?? "MIT"})`,
    "// Regenerate with: node scripts/bundle-langfuse-extension.mjs",
  ].join("\n");

  const result = await build({
    absWorkingDir: repoRoot,
    entryPoints: [bridgeEntry],
    bundle: true,
    platform: "node",
    format: "esm",
    // Electron 43 runs Node 22; nothing newer is reachable from the sidecar.
    target: "node22",
    external: VIRTUAL_KERNEL_MODULES,
    alias: { [PLUGIN_PACKAGE]: upstreamEntry },
    // The OpenTelemetry stack is CommonJS, so the ESM bundle needs a real
    // `require`: esbuild's fallback throws "Dynamic require of X is not
    // supported". Same shim the sidecar's own bundle contract uses
    // (extensions/bundle.test.ts, E2E-245).
    banner: {
      js: [
        banner,
        "import { createRequire as __piCreateRequire } from \"node:module\";",
        "const require = __piCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    // Bundled third-party code keeps its license notices.
    legalComments: "inline",
    write: false,
    logLevel: "warning",
  });

  const bundle = result.outputFiles[0].text;
  if (process.argv.includes("--check")) {
    if (!existsSync(outfile)) {
      console.error(`missing bundle: ${outfile}\nrun: node scripts/bundle-langfuse-extension.mjs`);
      process.exit(1);
    }
    if (readFileSync(outfile, "utf8") !== bundle) {
      console.error(
        `stale bundle: ${outfile}\nrun: node scripts/bundle-langfuse-extension.mjs`,
      );
      process.exit(1);
    }
    console.log(`bundle matches ${PLUGIN_PACKAGE}@${manifest.version}`);
  } else {
    writeFileSync(outfile, bundle, "utf8");
    console.log(
      `wrote ${outfile} (${PLUGIN_PACKAGE}@${manifest.version}, ${(bundle.length / 1024).toFixed(0)} KiB)`,
    );
  }
} finally {
  input.cleanup();
}