/**
 * Pure configuration resolution for the Langfuse example plugin (ADR 0335).
 *
 * The values are edited in the host's generated plugin-settings sheet, which
 * persists them to this plugin's own data directory (spec 07-plugins/11 §4).
 * Nothing here writes or reads the filesystem: these helpers only decide which
 * environment values a set of saved settings implies, so the whole rule is
 * testable without a sidecar, a plugin host, or a sink.
 *
 * Precedence is deliberately narrow. A UI value that is empty or absent sets
 * nothing, which leaves upstream's own order intact: an explicit `LANGFUSE_*`
 * environment variable, then `<agentDir>/langfuse.json`. The panel therefore
 * supplies a configuration; it does not erase one the user maintains by hand.
 */

import { join } from "node:path";

/** Plugin id, mirroring `manifest.json`. */
export const PLUGIN_ID = "pi.langfuse";

/**
 * One UI row to one environment variable.
 *
 * The names are upstream's existing contract — `loadConfig()` reads these
 * before the config file — so a value typed into the panel enters through the
 * same door as an exported variable, and this plugin adds no private
 * configuration format of its own.
 */
export const SETTING_ENV = {
  enabled: "LANGFUSE_TRACING_ENABLED",
  baseUrl: "LANGFUSE_BASE_URL",
  publicKey: "LANGFUSE_PUBLIC_KEY",
  secretKey: "LANGFUSE_SECRET_KEY",
  userId: "LANGFUSE_USER_ID",
  environment: "LANGFUSE_TRACING_ENVIRONMENT",
  release: "LANGFUSE_RELEASE",
  maxChars: "PI_LANGFUSE_MAX_CHARS",
  uploadImages: "LANGFUSE_MEDIA_UPLOAD_ENABLED",
};

/** Every variable this bridge may own, in declaration order. */
export const OWNED_ENV_KEYS = Object.values(SETTING_ENV);

/** String rows: an empty or non-string value sets nothing. */
const STRING_SETTINGS = [
  "baseUrl",
  "publicKey",
  "secretKey",
  "userId",
  "environment",
  "release",
];

/**
 * A switch the user or an operator may have pulled off before this plugin ran.
 *
 * `LANGFUSE_TRACING_ENABLED` is the documented kill switch (ADR 0334) and
 * media upload is the documented privacy switch, so neither may be raised from
 * off to on by a saved setting: a configuration write is not a re-authorization
 * of something that was deliberately turned off.
 */
const NEVER_UPGRADE = [
  { setting: "enabled", env: "LANGFUSE_TRACING_ENABLED", off: (v) => v.trim().toLowerCase() === "false" },
  { setting: "uploadImages", env: "LANGFUSE_MEDIA_UPLOAD_ENABLED", off: (v) => ["false", "0"].includes(v.trim().toLowerCase()) },
];

/**
 * The directory name the host gives a plugin's data directory.
 *
 * This mirrors `pluginDataDir()` in
 * `apps/desktop/electron/main/plugin-runtime.ts`, which sanitizes the id before
 * joining it under `<data>/plugins/data`. It is a second statement of one
 * documented rule, not a guess, and `example-langfuse-plugin.test.mjs` asserts
 * both sides against each other so a change on one side fails a test instead of
 * silently losing the user's configuration.
 */
export function pluginDataDirName(pluginId) {
  return String(pluginId).replace(/[^a-zA-Z0-9._-]/g, "_");
}
/** Absolute path of the settings file the host writes for this plugin. */
export function settingsFilePath(dataDir, pluginId = PLUGIN_ID) {
  return join(dataDir, "plugins", "data", pluginDataDirName(pluginId), "settings.json");
}

/**
 * The environment implied by a user's saved settings.
 *
 * Booleans become `"true"` / `"false"` because upstream compares strings:
 * `LANGFUSE_TRACING_ENABLED` disables only on `"false"`, and
 * `LANGFUSE_MEDIA_UPLOAD_ENABLED` disables on `"false"` or `"0"`. An explicit
 * `"true"` is therefore required for a saved enable to survive an inherited
 * off value, rather than leaving the key unset.
 *
 * `maxChars` is parsed by upstream with `Number()`, so a non-positive or
 * non-finite value is refused here instead of becoming an unbounded or
 * zero-length truncation; fractional input is floored.
 *
 * @param {Record<string, unknown> | null | undefined} settings
 * @param {Record<string, string | undefined>} [inherited] the environment the
 *   sidecar already carries, used only to refuse raising a switch that is off.
 * @returns {Record<string, string>}
 */
export function resolveLangfuseEnv(settings, inherited = {}) {
  const source = settings && typeof settings === "object" ? settings : {};
  const env = {};

  if (typeof source.enabled === "boolean") env[SETTING_ENV.enabled] = source.enabled ? "true" : "false";
  if (typeof source.uploadImages === "boolean") {
    env[SETTING_ENV.uploadImages] = source.uploadImages ? "true" : "false";
  }

  for (const key of STRING_SETTINGS) {
    const value = typeof source[key] === "string" ? source[key].trim() : "";
    if (value) env[SETTING_ENV[key]] = value;
  }

  if (
    typeof source.maxChars === "number" &&
    Number.isFinite(source.maxChars) &&
    source.maxChars >= 1
  ) {
    env[SETTING_ENV.maxChars] = String(Math.floor(source.maxChars));
  }

  for (const guard of NEVER_UPGRADE) {
    const wasOff = typeof inherited[guard.env] === "string" && guard.off(inherited[guard.env]);
    if (wasOff && env[guard.env] === "true") delete env[guard.env];
  }

  return env;
}

/**
 * The environment to install for one extension load.
 *
 * Keys the bridge owned last time but no longer resolves are returned as
 * `undefined` so the caller can put the inherited value back: clearing a field
 * in the panel must fall through to `langfuse.json`, not keep the old value
 * alive in a long-lived sidecar process.
 *
 * @param {Record<string, unknown> | null | undefined} settings
 * @param {{ baseline: Record<string, string | undefined>, applied: Record<string, string | undefined> }} state
 * @returns {{ next: Record<string, string | undefined> }}
 */
export function planLangfuseEnv(settings, state) {
  const desired = resolveLangfuseEnv(settings, state.baseline);
  const next = {};
  for (const key of OWNED_ENV_KEYS) {
    if (desired[key] !== undefined) next[key] = desired[key];
    else if (state.applied[key] !== undefined) next[key] = state.baseline[key];
  }
  return { next };
}