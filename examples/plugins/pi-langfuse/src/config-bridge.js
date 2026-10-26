/**
 * Config bridge for the Langfuse example plugin (ADR 0335).
 *
 * This module is the extension the sidecar loads. It reads the settings the
 * user edited in the plugin's settings sheet, installs them as the environment
 * upstream already understands, and then hands control to the upstream
 * extension. It adds no configuration format of its own.
 *
 * The ordering here is load-bearing and is the reason the upstream module is
 * imported dynamically instead of statically:
 *
 *   1. the sidecar imports this file — no upstream code has run yet,
 *   2. the factory is called for a session,
 *   3. the saved settings are installed into `process.env`,
 *   4. `import()` evaluates the upstream module, whose top-level constants
 *      (`PI_LANGFUSE_MAX_CHARS`, `LANGFUSE_MEDIA_UPLOAD_ENABLED`) read that
 *      environment, and whose `loadConfig()` reads it once more per call.
 *
 * A static import would evaluate upstream at step 1, before any value from the
 * panel exists. `langfuse-extension.test.ts` asserts step 4 against the real
 * loader, so inlining the dependency here would fail a test rather than quietly
 * make two of the nine settings dead.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  OWNED_ENV_KEYS,
  PLUGIN_ID,
  planLangfuseEnv,
  settingsFilePath,
} from "./langfuse-settings.js";

/**
 * The environment the sidecar process carried before this bridge touched it.
 *
 * Captured once at module load. It is what a cleared panel field falls back to
 * — an operator's exported value survives, and a key this bridge set and no
 * longer resolves is put back exactly as it was inherited.
 */
const baseline = {};
for (const key of OWNED_ENV_KEYS) baseline[key] = process.env[key];

/** The keys currently owned by this bridge, with the value last installed. */
let applied = {};

/**
 * The installation's data directory.
 *
 * Electron main publishes its resolved root to `PI_DESKTOP_DATA_DIR` at boot
 * (`apps/desktop/electron/main/index.ts`), so a development host and a packaged
 * one both land on their own profile. The fallback is the shipped default
 * documented in spec 07-plugins/11 §2, used only when the variable is absent.
 */
function dataRoot() {
  const fromEnv = process.env.PI_DESKTOP_DATA_DIR?.trim();
  if (fromEnv) return fromEnv;
  return join(homedir(), ".pi-desktop");
}

/**
 * The plugin's saved settings, or an empty object.
 *
 * Every failure mode — missing file, unreadable file, non-JSON body, a JSON
 * array instead of an object — resolves to "no panel configuration", which
 * leaves upstream's own precedence (explicit environment, then
 * `<agentDir>/langfuse.json`) untouched. The message never includes the path's
 * contents: this file holds ingest credentials.
 */
function readSavedSettings() {
  try {
    const file = settingsFilePath(dataRoot(), PLUGIN_ID);
    if (!existsSync(file)) return {};
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.error(
      "[pi-langfuse] could not read the plugin settings; falling back to the environment and langfuse.json",
    );
    return {};
  }
}

/**
 * Install the saved settings, and withdraw the ones they no longer provide.
 *
 * @returns {string[]} the keys this bridge now owns
 */
function applyLangfuseSettings() {
  const { next } = planLangfuseEnv(readSavedSettings(), { baseline, applied });
  const installed = {};
  for (const key of OWNED_ENV_KEYS) {
    const value = next[key];
    if (value !== undefined) {
      process.env[key] = value;
      installed[key] = value;
      continue;
    }
    // Only a key this bridge set before is safe to rewrite: anything else was
    // inherited and is still exactly what the process started with.
    if (applied[key] !== undefined) {
      if (baseline[key] === undefined) delete process.env[key];
      else process.env[key] = baseline[key];
    }
  }
  applied = installed;
  return Object.keys(installed);
}

export default async function (pi) {
  applyLangfuseSettings();
  const upstream = await import("@langfuse/pi-observability-plugin");
  const factory = upstream.default;
  if (typeof factory !== "function") {
    throw new Error("the bundled Langfuse extension has no default factory function");
  }
  return factory(pi);
}