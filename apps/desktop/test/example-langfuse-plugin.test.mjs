import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

/**
 * The opt-in Langfuse example plugin (ADR 0334, ADR 0335).
 *
 * Two properties matter and neither is visible from the manifest alone:
 *
 *  1. It must stay opt-in and carry no endpoint or credentials. This repository
 *     is a public distribution; a shipped sink would put an internal address
 *     and ingest keys into a public artifact.
 *  2. The committed artifact must be self-contained. A marketplace install
 *     strips `node_modules` (host-core `install.rs`), and the devkit packer
 *     ignores it (`walk.ts`), so any bare specifier the sidecar cannot supply
 *     is a runtime resolution failure rather than a build error.
 *
 * A third group guards the settings bridge: the rows the sheet renders must be
 * exactly the variables the extension reads, the settings path must be the one
 * Electron main writes, and the two safety rules of the bridge must hold.
 *
 * The byte-reproduction check needs the pinned upstream package. Point
 * `PI_LANGFUSE_BUNDLE_FROM` at a directory containing
 * `node_modules/@langfuse/pi-observability-plugin` to run it offline; without
 * that, the check is skipped rather than silently reaching for the network.
 */
const pluginDir = resolve("../../examples/plugins/pi-langfuse");
const repoRoot = resolve("../../");
const read = (relative) => readFileSync(resolve(pluginDir, relative), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const rootPackage = JSON.parse(readFileSync(resolve("../../package.json"), "utf8"));
const bridge = await import(pathToFileURL(join(pluginDir, "src", "langfuse-settings.js")).href);

/** Exactly the modules `createVirtualModules` supplies (loader.ts). */
const VIRTUAL_EXTENSION_MODULES = new Set([
  "typebox",
  "typebox/compile",
  "typebox/value",
  "@sinclair/typebox",
  "@sinclair/typebox/compile",
  "@sinclair/typebox/value",
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-ai/compat",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "@mariozechner/pi-agent-core",
  "@mariozechner/pi-ai",
  "@mariozechner/pi-ai/compat",
  "@mariozechner/pi-coding-agent",
  "@mariozechner/pi-tui",
]);

const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, `node:${name}`]));

/** Top-level `import`/`export ... from` specifiers in a bundled file. */
function bareSpecifiers(source) {
  const found = [
    ...source.matchAll(
      /^\s*(?:import|export)[^;\n]*?\bfrom\s*"([^"]+)"|^\s*import\s*"([^"]+)"/gm,
    ),
  ].map((match) => match[1] ?? match[2]);
  return [...new Set(found)];
}

test("Langfuse ships as an ordinary, opt-in plugin", () => {
  assert.equal(manifest.id, "pi.langfuse");
  // Off by default: a stock install must not report anything anywhere.
  assert.equal(manifest.enabledByDefault, false);
  assert.deepEqual([...manifest.permissions], ["agent.extension"]);
  assert.deepEqual([...manifest.contributes.agentExtensions], ["agent/langfuse.mjs"]);
  // The contributed path has to exist in the shipped tree.
  assert.ok(
    existsSync(resolve(pluginDir, manifest.contributes.agentExtensions[0])),
    "the contributed extension must be shipped beside the manifest",
  );
  // It contributes an extension and nothing else, so `main` stays inert.
  assert.match(read("main.js"), /module\.exports = \{\}/);
});

test("the plugin is not bundled into the desktop app", () => {
  const appPackage = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  const copied = (appPackage.build?.extraResources ?? []).map((entry) => entry.from);
  assert.ok(
    copied.includes("resources/plugins"),
    "the bundled-plugin directory is still the only plugin source copied",
  );
  // The id shares the `pi.` namespace the bundled plugins use, and that is
  // exactly why this assertion matters: the name is not what makes a plugin
  // bundled, the copy rule is, and this one stays outside it.
  assert.ok(
    !existsSync(resolve("resources/plugins/pi.langfuse")),
    "Langfuse must not appear as a bundled plugin",
  );
});

test("the manifest and artifact carry no endpoint or credentials", () => {
  // A shipped sink is what this design exists to avoid.
  for (const relative of ["manifest.json", "main.js", "agent/langfuse.mjs"]) {
    const source = read(relative);
    assert.doesNotMatch(
      source,
      /\b(?:pk|sk)-lf-[0-9a-f]{8,}/,
      `${relative} must not contain a Langfuse ingest key`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:10|127|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
      `${relative} must not contain a hard-coded private address`,
    );
  }
});

test("the artifact banner names both parts and the pinned upstream version", () => {
  const pinned = rootPackage.devDependencies["@langfuse/pi-observability-plugin"];
  assert.ok(pinned, "the upstream package must be pinned in the root package.json");
  assert.match(pinned, /^\d+\.\d+\.\d+$/, "the pin must be an exact version");
  const banner = read("agent/langfuse.mjs")
    .split("\n")
    .slice(0, 10)
    .join("\n");
  assert.ok(
    banner.includes(`@langfuse/pi-observability-plugin@${pinned}`),
    "the artifact banner must name the pinned version",
  );
  // Part 2 is the published package, untouched; part 1 is this repository's
  // own bridge, so a reader of the artifact can tell the two apart.
  assert.match(banner, /config-bridge\.js/);
  assert.match(banner, /unmodified/);
});

test("the artifact imports nothing the sidecar cannot supply", () => {
  const bare = bareSpecifiers(read("agent/langfuse.mjs"));
  const unresolved = bare.filter(
    (id) => !id.startsWith(".") && !NODE_BUILTINS.has(id) && !VIRTUAL_EXTENSION_MODULES.has(id),
  );
  assert.deepEqual(unresolved, []);
  // The kernel must stay external, or the extension forks the sidecar's kernel
  // and silently receives none of its events.
  assert.ok(
    bare.includes("@earendil-works/pi-coding-agent"),
    "the kernel import must remain external",
  );
});

test("the artifact carries the CJS interop the sidecar bundle contract requires", () => {
  // The OpenTelemetry stack is CommonJS. Without a real `require`, loading the
  // artifact fails at the first `Dynamic require of "util"`.
  assert.match(read("agent/langfuse.mjs"), /createRequire as __piCreateRequire/);
});

test("the artifact applies the settings before the extension is evaluated", () => {
  // The two import-time rows only work if upstream's module body runs after the
  // bridge installs the environment, so the delegation must be a deferred
  // import inside the factory, not a static one.
  const artifact = read("agent/langfuse.mjs");
  const applyAt = artifact.indexOf("function applyLangfuseSettings");
  const initAt = artifact.indexOf("MAX_CHARS = Number(process.env.PI_LANGFUSE_MAX_CHARS");
  const factoryAt = artifact.lastIndexOf("applyLangfuseSettings();");
  assert.ok(applyAt > 0 && initAt > 0 && factoryAt > 0, "both halves are in the artifact");
  assert.ok(factoryAt > applyAt, "the factory applies settings before delegating");
  assert.ok(
    /\(init_src\(\), src_exports\)/.test(artifact.slice(factoryAt, factoryAt + 400)),
    "the upstream module is imported lazily, after the apply",
  );
});

test("every settings row maps to a variable upstream reads", () => {
  const declared = (manifest.contributes.settings ?? []).map((setting) => setting.key);
  assert.deepEqual(declared.slice().sort(), Object.keys(bridge.SETTING_ENV).slice().sort());
  assert.deepEqual(
    Object.values(bridge.SETTING_ENV),
    bridge.OWNED_ENV_KEYS,
    "the owned keys are exactly the mapped variables",
  );
  // These names are upstream's contract; a rename here would silently make a
  // panel row dead rather than fail anything.
  assert.equal(bridge.SETTING_ENV.baseUrl, "LANGFUSE_BASE_URL");
  assert.equal(bridge.SETTING_ENV.publicKey, "LANGFUSE_PUBLIC_KEY");
  assert.equal(bridge.SETTING_ENV.secretKey, "LANGFUSE_SECRET_KEY");
  assert.equal(bridge.SETTING_ENV.enabled, "LANGFUSE_TRACING_ENABLED");
  assert.equal(bridge.SETTING_ENV.maxChars, "PI_LANGFUSE_MAX_CHARS");
  assert.equal(bridge.SETTING_ENV.uploadImages, "LANGFUSE_MEDIA_UPLOAD_ENABLED");
});

test("no settings row asks for a secret type the host refuses", () => {
  // `secret: true` is rejected by both validators in this release
  // (plugin-sdk `validateManifest`, host-core `validation.rs`), so a manifest
  // that used it would not install at all. The plaintext trade-off is
  // documented in the row description and the README instead.
  for (const setting of manifest.contributes.settings ?? []) {
    assert.notEqual(setting.secret, true, `${setting.key} cannot be a secret row`);
  }
  const secretRow = (manifest.contributes.settings ?? []).find((s) => s.key === "secretKey");
  assert.match(secretRow.description, /plain text/i, "the plaintext storage is disclosed");
});

test("the settings path matches the directory Electron main writes", () => {
  // The bridge restates the host's layout from spec 07-plugins/11 §4. If either
  // side moves, the panel would keep saving and the extension would keep
  // reading a file that never changes, so both are pinned to the same formula.
  const hostSource = readFileSync(
    resolve(repoRoot, "apps/desktop/electron/main/plugin-runtime.ts"),
    "utf8",
  );
  const hostFormula = hostSource.match(
    /plugins", "data", ([A-Za-z]+)\.replace\(\/(\[[^\]]*\])\/g,\s*"(_)"\)/,
  );
  assert.ok(hostFormula, "the host still derives the data directory from the plugin id");
  const [, hostVar, hostPattern, hostReplacement] = hostFormula;
  assert.equal(hostVar, "pluginId", "the host still keys the directory by plugin id");
  assert.equal(
    bridge.pluginDataDirName("pi.langfuse"),
    "pi.langfuse".replace(new RegExp(hostPattern, "g"), hostReplacement),
    "the bridge sanitizes the id exactly as the host does",
  );
  assert.equal(
    bridge.settingsFilePath("/data/root"),
    join("/data/root", "plugins", "data", "pi.langfuse", "settings.json"),
  );
});

test("the bridge only installs values the user actually saved", () => {
  // Booleans become the strings upstream compares, because an unset value
  // would leave an inherited `false` in charge and a saved enable must win.
  assert.deepEqual(bridge.resolveLangfuseEnv({ enabled: true, uploadImages: false }), {
    LANGFUSE_TRACING_ENABLED: "true",
    LANGFUSE_MEDIA_UPLOAD_ENABLED: "false",
  });
  // An empty field is "not configured", never "configured as empty": that is
  // what keeps `langfuse.json` and an exported variable working.
  assert.deepEqual(bridge.resolveLangfuseEnv({ baseUrl: "", publicKey: "   ", secretKey: 7 }), {});
  assert.deepEqual(bridge.resolveLangfuseEnv({ baseUrl: "  http://h:1 " }), {
    LANGFUSE_BASE_URL: "http://h:1",
  });
  // A character count that would bound nothing is refused rather than trusted.
  for (const maxChars of [0, -1, Number.NaN, "500", null]) {
    assert.deepEqual(bridge.resolveLangfuseEnv({ maxChars }), {}, `refuses ${String(maxChars)}`);
  }
  assert.deepEqual(bridge.resolveLangfuseEnv({ maxChars: 120.7 }), {
    PI_LANGFUSE_MAX_CHARS: "120",
  });
});

test("the bridge never raises a switch the environment already turned off", () => {
  // A configuration write is not a re-authorization of something an operator
  // or the user deliberately disabled (ADR 0334 documents the kill switch).
  const off = { LANGFUSE_TRACING_ENABLED: "false", LANGFUSE_MEDIA_UPLOAD_ENABLED: "0" };
  assert.deepEqual(bridge.resolveLangfuseEnv({ enabled: true, uploadImages: true }, off), {});
  assert.deepEqual(
    bridge.resolveLangfuseEnv({ enabled: true }, { LANGFUSE_TRACING_ENABLED: "true" }),
    { LANGFUSE_TRACING_ENABLED: "true" },
  );
  assert.deepEqual(
    bridge.resolveLangfuseEnv({ enabled: false }, { LANGFUSE_TRACING_ENABLED: "true" }),
    { LANGFUSE_TRACING_ENABLED: "false" },
  );
});

test("a cleared field gives back the value the bridge took", () => {
  const state = {
    baseline: { LANGFUSE_PUBLIC_KEY: "pk-inherited" },
    applied: { LANGFUSE_PUBLIC_KEY: "pk-panel", LANGFUSE_BASE_URL: "http://panel" },
  };
  const { next } = bridge.planLangfuseEnv({ baseUrl: "http://panel" }, state);
  assert.deepEqual(next, {
    LANGFUSE_BASE_URL: "http://panel",
    LANGFUSE_PUBLIC_KEY: "pk-inherited",
  });
  // A key the bridge owns but never inherited is deleted, not left dangling.
  assert.deepEqual(
    bridge.planLangfuseEnv({}, { baseline: {}, applied: { LANGFUSE_USER_ID: "x" } }).next,
    { LANGFUSE_USER_ID: undefined },
  );
  // A value the bridge never installed is untouched by the plan.
  assert.deepEqual(
    bridge.planLangfuseEnv({}, { baseline: { LANGFUSE_USER_ID: "operator" }, applied: {} }).next,
    {},
  );
});

test("the bridge never logs a configuration value", () => {
  // The settings file holds ingest credentials; the failure path must say what
  // went wrong without echoing what it read.
  const source = read("src/config-bridge.js");
  const calls = source.match(/console\.\w+\([\s\S]*?\);/g) ?? [];
  assert.ok(calls.length > 0, "the failure path still reports something");
  for (const call of calls) {
    assert.doesNotMatch(call, /`/, "no template literal in a log line");
    assert.doesNotMatch(call, /\$\{|settings\.|readSavedSettings\(\)/, "no value can reach the log");
  }
});

test("the README documents the sheet, the precedence, and both layers", () => {
  const readme = read("README.md");
  for (const marker of [
    "LANGFUSE_TRACING_ENABLED=false",
    "LANGFUSE_MEDIA_UPLOAD_ENABLED=false",
    "PI_LANGFUSE_MAX_CHARS",
    "/api/public/otel/v1/traces",
    "settings.json",
  ]) {
    assert.ok(readme.includes(marker), `README must document ${marker}`);
  }
  // The narrow redaction is the main privacy caveat; it must not be implied away.
  assert.match(readme, /Redaction is narrow/);
  // The two application layers are the part a user is most likely to misread.
  assert.match(readme, /Reload the plugin/i);
  assert.match(readme, /Restart the app/i);
  // Where to configure, and where the value lands, must be findable by text.
  assert.match(readme, /## Configure from the plugin sheet/);
  assert.match(readme, /plugins\/data\/pi\.langfuse\/settings\.json/);
});

test("the shipped artifact matches its pinned source", (t) => {
  const from = process.env.PI_LANGFUSE_BUNDLE_FROM;
  if (!from) {
    t.skip(
      "set PI_LANGFUSE_BUNDLE_FROM to a directory with the pinned package installed to verify reproduction offline",
    );
    return;
  }
  const output = execFileSync(
    process.execPath,
    [resolve("../../scripts/bundle-langfuse-extension.mjs"), "--check"],
    { encoding: "utf8", env: { ...process.env, PI_LANGFUSE_BUNDLE_FROM: from } },
  );
  assert.match(output, /bundle matches @langfuse\/pi-observability-plugin@/);
});