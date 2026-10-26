# ADR 0335: Langfuse settings are editable in the plugin's settings sheet

- Status: Accepted
- Date: 2026-10-22
- Deciders: PI-Desktop maintainers
- Related: [ADR 0334](0334-langfuse-ships-as-an-opt-in-example-plugin.md) ·
  [ADR 0159](0159-plugin-generated-settings-and-local-shortcuts.md) ·
  [ADR 0280](0280-plugin-owned-ui-localizes-from-host-locale.md) ·
  [07-plugins/16-trusted-extensions](../spec/07-plugins/16-trusted-extensions.md) ·
  [07-plugins/11-plugin-storage-isolation](../spec/07-plugins/11-plugin-storage-isolation.md) ·
  [03-runtime/09-logging-and-observability](../spec/03-runtime/09-logging-and-observability.md)

## Context

[ADR 0334](0334-langfuse-ships-as-an-opt-in-example-plugin.md) shipped the Langfuse
example plugin opt-in and unconfigured by default: the user writes
`<agentDir>/langfuse.json` or exports `LANGFUSE_*`. That works, and it keeps the
product free of any shipped endpoint, but configuring it means knowing a file
path outside the app and a variable list, and there is no way to see what is
currently set.

PI-Desktop already has the two halves of a nicer path:

- `contributes.settings` renders a typed sheet for an installed plugin
  (`PluginSettingsSheet.tsx`), with no extra permission and no plugin UI code,
  and `setPluginSettings` validates and persists the values
  (`plugin-runtime.ts`) to the plugin's own data directory,
  `<data>/plugins/data/<plugin-id>/settings.json` (spec 07-plugins/11 §4).
- Upstream's `loadConfig()` reads `process.env.LANGFUSE_*` before it reads
  `langfuse.json`, and its kill switch is
  `LANGFUSE_TRACING_ENABLED=false` — so an existing, documented door already
  accepts configuration from the environment.

Three facts constrain how a sheet can reach the extension, which runs in the
agent sidecar rather than in the plugin host process:

1. **A trusted extension has no plugin API.** `pi.plugin.getSettings()` lives in
   the plugin host; the sidecar's `ExtensionAPI` does not carry it, and giving
   it one would be a new cross-process contract.
2. **The plugin cannot write `langfuse.json`.** `fs.write` roots are only
   `workspace` and `userSelected` (`fs-policy.ts`), so the file the extension
   reads by default is outside what the plugin may touch. Round-tripping the
   sheet into that file would need a user-selected directory on every change.
3. **`secret: true` does not exist yet in this release.** Both validators refuse
   it (`plugin-sdk/index.ts` `validateManifest`, `crates/host-core/src/plugins/validation.rs`):
   "cannot be secret in this release". There is no secure storage for plugin
   settings, so a credential row is an ordinary text field.

Separate from storage, the extension has two different read times, which is
what "when does a saved value take effect" actually means:

| Read | Where | Consequence |
| --- | --- | --- |
| `loadConfig()` | inside the extension factory, which the Runner calls for every session | a new session sees the saved value |
| `PI_LANGFUSE_MAX_CHARS`, `LANGFUSE_MEDIA_UPLOAD_ENABLED` | top-level `const` of upstream's module | only a fresh module evaluation sees the saved value |

The Runner keeps loaded factories in a process-level `factoryCache` keyed by the
extension's spec id, and the factory cache is not cleared outside tests. Inside
one sidecar process the module is therefore evaluated once, and the module-level
constants are frozen at that first evaluation.

## Decision

1. **Declare the nine settings as `contributes.settings` rows and let the host
   store them.** No panel code, no new storage, no new permission: the sheet is
   generated, the values land in the plugin's data directory, and the existing
   validation applies. The rows are enabled, base URL, public key, secret key,
   user id, environment, release, max characters, upload images.

2. **Map saved values onto the variables upstream already reads, rather than
   inventing a plugin-private config format or patching the dependency.**
   `src/langfuse-settings.js` holds one table (`SETTING_ENV`) from row key to
   `LANGFUSE_*` / `PI_LANGFUSE_MAX_CHARS`; `src/config-bridge.js` installs it
   and delegates to the untouched upstream extension. A test asserts the sheet's
   rows and that table are the same set, so a renamed row or a renamed variable
   fails instead of becoming a silently dead field.

3. **The bridge is the contributed extension; upstream is imported lazily
   inside the factory.** The committed artifact's default export applies the
   saved settings and only then evaluates the upstream module, so
   import-time constants see the panel values in the process that starts after
   the change. A static import would evaluate upstream before any apply, making
   two of the nine rows permanently inert; both the artifact-shape test and the
   runtime layer test pin this ordering.

4. **A saved value wins only when it is not empty.** An empty field installs
   nothing, preserving ADR 0334's contract that `LANGFUSE_*` and
   `langfuse.json` configure the plugin without the sheet. The resolved order is
   non-empty plugin setting, then environment, then config file.

5. **Two protections that a naive "settings win" rule would break.**
   - A switch the inherited environment already turned off is never raised:
     `LANGFUSE_TRACING_ENABLED=false` (ADR 0334's kill switch) and
     `LANGFUSE_MEDIA_UPLOAD_ENABLED=false` (the image-privacy switch) cannot be
     flipped to on by a configuration write. Turning telemetry back on is an
     authorization decision, not a settings value.
   - A key the bridge installed and the user then cleared is returned to what
     the process inherited. The bridge records the environment it took over, so
     a long-lived sidecar does not keep exporting to a sink the user erased.
   Both are unit-tested against the pure resolver.

6. **A saved value takes effect on plugin reload; the two import-time rows take
   effect on app restart.** Disabling and re-enabling the plugin retires the
   session runtime (spec 16 §4.3), and the next turn rebuilds it, which re-runs
   the factory and re-reads the file. The max-length and image rows are frozen
   per process (§ Context), so they need a restart. The plugin README states the
   split in a table rather than promising instant effect.

7. **The secret key stays a plain text row, and the exposure is disclosed** in
   the row description, the manifest `safetyNotes`, and the README: stored in
   plain text, shown in plain text, and sent only as the sink's own
   `Authorization` header. The bridge never logs a configuration value, and a
   test asserts its log statements cannot interpolate one.

8. **The settings path is restated, guarded by a drift test.** The bridge
   derives `<data>/plugins/data/<sanitized-id>/settings.json` from
   `PI_DESKTOP_DATA_DIR` (published by Electron main at boot), falling back to
   the shipped default `~/.pi-desktop` documented in spec 11 §2. That is a
   second statement of a rule the host owns, so
   `example-langfuse-plugin.test.mjs` compares the sanitizer against
   `pluginDataDir()` in Electron main by reading its source, and the runtime
   tests write the file through the same formula. A change on one side fails a
   test instead of silently making the panel a no-op.

## Consequences

- Configuring tracing becomes a sheet in the Plugin Center instead of a file
  outside the app, with the current values visible in one place.
- No cross-process contract changed: `TrustedExtensionSpec`, the manifest
  schema, the Rust validator, the sidecar launcher, and the runtime reuse match
  are all untouched, so nothing else in the product inherits this feature's risk.
- Saved settings are not live-editable: a reload is required, and two rows need
  a restart. The alternative — watching the file or threading a config through
  the launch parameters — was considered and is recorded under Alternatives.
- The plugin ships ingest credentials in a plain-text file whenever the user
  types them into the sheet. For anyone who will not accept that, `langfuse.json`
  remains available and the row stays empty.
- When the host gains secure storage for settings, the change is local: the
  secret row becomes `secret: true` and the bridge keeps reading the same
  mapping, because the row-to-variable table is the only place names appear.
- The artifact grows by the bridge (about 100 KiB of the 1.76 MB) and gains a
  `createRequire` banner, the same CJS interop the sidecar's own bundle contract
  requires; without it the OpenTelemetry stack fails with
  "Dynamic require of \"util\" is not supported".
- Two more test files exist for this example plugin, one of which must stay
  alone in its file: the import-time layer can only be observed on a module's
  first evaluation, so it gets its own worker.

## Alternatives

### Make a saved setting take effect immediately

Rejected by the requested scope, and it is the larger change. A config value
would have to become part of the extension spec or a new per-launch parameter,
which touches `TrustedExtensionSpec` (a cross-process contract), the
`agentExtensions` manifest schema in both the TS and the Rust validator, the
launch builder, and `DesktopAgentRuntime.matches()` so the change retires the
runtime. That is an ADR of its own; nothing in the sheet depends on it, and the
reload path already reaches the same result one action later.

### Have the plugin write `<agentDir>/langfuse.json` from the sheet

Rejected. `fs.write` cannot reach that directory (roots are `workspace` and
`userSelected`), so it would need a user-picked folder and a confirmation on
every save, and it would rewrite a file the user may maintain by hand — the one
place where this plugin would be *writing* configuration into pi's own
directory.

### Give the extension a settings API in the sidecar

Rejected. It is a new `ExtensionAPI` surface and a new host round-trip for a
problem the environment variable already solves at the layer where the values
are read.

### Read the settings through `pi.plugin.getSettings()`

Not available. That API belongs to the plugin host process; a trusted extension
runs in the sidecar and has the `ExtensionAPI` only.

### Keep the file path in sync by exporting it from the host

Rejected as out of scope for an example plugin: it would mean a new shared
constant consumed by both Electron main and the plugin. The drift test gives the
same protection at the cost of one assertion.

## References

- `examples/plugins/pi-langfuse/src/langfuse-settings.js` — the row table, the
  path formula, and the pure resolver the protections are tested against
- `examples/plugins/pi-langfuse/src/config-bridge.js` — the contributed entry:
  apply the settings, then evaluate upstream
- `scripts/bundle-langfuse-extension.mjs` — bundles the bridge plus the pinned
  unmodified upstream; `--check` reproduces it
- `packages/agent-runtime/src/extensions/langfuse-extension.test.ts` — sheet
  values reach the export; a reload picks up a changed file
- `packages/agent-runtime/src/extensions/langfuse-settings-layers.test.ts` — the
  import-time layer, and that a reload does not cross it
- `apps/desktop/test/example-langfuse-plugin.test.mjs` — rows/table agreement,
  path drift against `pluginDataDir()`, no secret rows, no logged values,
  artifact ordering guard
- `apps/desktop/electron/main/plugin-runtime.ts` — `pluginDataDir()`,
  `getSettings` / `setSettings`, and the generated sheet
- `docs/adr/0159-plugin-generated-settings-and-local-shortcuts.md` — the generated
  settings sheet this decision reuses, and `0280-plugin-owned-ui-localizes-from-host-locale.md`
  plus `07-plugins/02-plugin-manifest-schema.md` §`settings` for why a row title
  stays in the author's language
- `07-plugins/16-trusted-extensions.md` §4.2 — the loader and the coding-agent shim
- `07-plugins/11-plugin-storage-isolation.md` §2, §4 — the data directory layout