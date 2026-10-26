# ADR 0334: Langfuse tracing ships as an opt-in example plugin

- Status: Accepted
- Date: 2026-10-22
- Deciders: PI-Desktop maintainers
- Related: [07-plugins/16-trusted-extensions](../spec/07-plugins/16-trusted-extensions.md) ·
  [03-runtime/09-logging-and-observability](../spec/03-runtime/09-logging-and-observability.md) ·
  [ADR 0214](0214-trusted-extensions.md)

## Context

Agent runs are observable locally — logs, the transcript, the audit table — but
a team that wants span-level tracing (one generation per model call, one span
per tool run, token usage and cost) has to wire it themselves. Upstream pi
maintains an extension for exactly this surface,
`@langfuse/pi-observability-plugin` (MIT, marked experimental): it subscribes to
the `ExtensionAPI` events ADR 0214 adopted, maps them onto Langfuse
observations, truncates payloads, redacts Langfuse keys, and reads
`<agentDir>/langfuse.json`.

A downstream internal fork of this project ships that extension as a **bundled,
enabled-by-default** plugin whose endpoint and ingest keys are main-process
constants pointing at a corporate Langfuse instance. That shape is right for
that fork and wrong here, for three reasons that are properties of this
repository rather than of the extension:

1. **This is a public distribution.** Releases, installers, and this repository
   are public. A baked-in sink would publish a private network address and
   ingest credentials in a public artifact. The fork's own decision record
   accepts those keys "for an internal distribution, not for a public one".
2. **The product has no remote telemetry pipeline.**
   `03-runtime/09-logging-and-observability.md` states there is none. A plugin
   that exports conversations by default would move that boundary without
   saying so.
3. **There is no account or session-title plumbing to attribute a trace to.**
   The fork tags traces with a signed-in username and names them after the
   host's `sessions.title`. This project has no account system, and
   `extensionSessionName` is written only by an extension's own
   `setSessionName`, never from a host record.

Two properties of the extension channel decide how it can ship at all:

- The sidecar loads an extension **by path** through `jiti/static` with
  `tryNative: false` and a fixed `virtualModules` map; an extension directory
  has no `node_modules` to resolve from (spec 16 §4.2).
- A distributed plugin cannot carry a dependency tree. The devkit packer
  ignores `node_modules` (`walk.ts`), and host-core skips those segments when
  extracting a `.piplug` (`plugins/install.rs`). The bounded npm installer
  (`npm-installer.ts`) runs only on the **local import** path
  (`agent-extensions-ipc.ts`), so it cannot help a marketplace install.

Finally, the loader's coding-agent shim did not export `getAgentDir`. That is
the only runtime value the unmodified upstream package imports from the kernel,
and `loadConfig()` calls it unconditionally — so the extension could not load.

## Decision

1. **Ship it as an opt-in example plugin, not a bundled one.**
   `examples/plugins/pi-langfuse/` is an ordinary plugin: `agent.extension`,
   `contributes.agentExtensions`, a no-op `main`, and
   **`enabledByDefault: false`**. Nothing is added to
   `apps/desktop/resources/plugins/` and `extraResources` is unchanged, so a
   stock install contains no tracing code and makes no tracing request.
   Distribution is the official marketplace repository
   (`vastsa/pi-desktop-plugins`); the directory here is the development,
   reference, and test surface, which is what `examples/plugins` is for.

2. **No endpoint and no credentials are shipped.** The user supplies their own
   `publicKey` / `secretKey` / `baseUrl` through `~/.pi/agent/langfuse.json` or
   `LANGFUSE_*`. With neither key present the upstream factory returns before
   subscribing to any turn event, so an unconfigured install exports nothing
   and says `langfuse: off (no keys)`. `LANGFUSE_TRACING_ENABLED=false` is the
   kill switch. A test asserts that neither the manifest nor the artifact
   contains an ingest key or a private address.

3. **The artifact is a committed, self-contained bundle.**
   `scripts/bundle-langfuse-extension.mjs` generates
   `agent/langfuse.mjs` from the version pinned in the root `package.json`
   devDependencies. The kernel stays external so the extension shares the
   sidecar's kernel instance; everything else is inlined, because a distributed
   plugin tree has no `node_modules`. The generator installs its build input
   into a temporary directory (or reuses one via `--from` /
   `PI_LANGFUSE_BUNDLE_FROM`), so the OpenTelemetry and Langfuse stacks never
   enter the product dependency tree. `--check` reproduces the artifact byte for
   byte and fails on drift.

4. **The upstream package is used unmodified — no patch.** The fork's patch
   adds session-title trace names, an account tag, and a production-only status
   line. None of the three applies here: there is no account, no host-owned
   session title, and a status line is useful feedback for a capability the
   user deliberately turned on. Traces keep upstream's `Pi Turn` name. The
   artifact banner records that it was built from published bytes.

5. **The loader shim exports `getAgentDir`** — `PI_CODING_AGENT_DIR`, else
   `~/.pi/agent`, matching pi. This is an additive export on the compatibility
   subset, not a new permission or host API, and it is what any extension that
   persists settings beside pi's needs.

6. **The proxy stays the user's decision.** The fork injects its sink host into
   the sidecar's bypass list because the sink is a fixed internal address the
   user never chose. Here the sink is the user's own endpoint, so the plugin
   README tells them to add its host to the existing proxy bypass setting.
   The frozen network stack is not modified.

7. **Scope of the exported data is documented, not implied.** Prompts and
   assistant text, tool arguments and results (truncated at
   `PI_LANGFUSE_MAX_CHARS`, default 20000), model id, provider, usage and cost,
   session id, working directory, git branch, and — **by default** —
   conversation images. Redaction covers Langfuse ingest keys only; other
   credentials appearing in a prompt or tool result are exported as-is. The
   README states both facts, and the manifest carries them as `safetyNotes`.

## Consequences

- A stock install is unchanged: no tracing code, no network request, no new
  permission prompt. The observability spec's "no remote telemetry pipeline"
  statement remains true of the product; the spec now also says that a
  third-party extension the user installs and configures may export to their
  own sink.
- Anyone who wants tracing gets it by installing one plugin and writing one
  config file, and can turn it off three different ways.
- The repository carries ~1.7 MB of generated code. That is the price of the
  no-`node_modules` distribution rule; the drift check measures it rather than
  estimating it, and rollback is a `git revert` of the artifact commit.
- The plugin asks for the highest-risk grant (`agent.extension`) and the devkit
  reports it as `permission.high-risk`, so enabling it is an explicit user
  grant rather than a shipping decision.
- Upgrading is a reviewed three-step bump: raise the pin, regenerate, review the
  **upstream** diff. Hand-editing the artifact fails the drift check.
- Publishing to the marketplace repository is a separate change in a separate
  repository and is not part of this decision.

## Alternatives

### Bundle it enabled-by-default with a shipped sink, as the internal fork does

Rejected. It would publish a private address and ingest keys in a public
artifact and move the product's stated telemetry boundary. The fork's own
record scopes that trade-off to internal distribution.

### Ship it as a marketplace plugin that declares npm dependencies

Rejected for now. The bounded installer only runs on the local-import path;
host-core strips `node_modules` when installing a `.piplug`, so a dependency
declaration would install cleanly and then fail to resolve at load. Revisit if
marketplace installs ever gain dependency resolution.

### Instrument the sidecar or host-core directly

Rejected. The model calls and tool runs happen in the JavaScript sidecar, and
the extension hooks are the events that already exist. An exporter in Rust
host-core would need the whole span model re-plumbed over RPC.

### Write a first-party extension instead of vendoring upstream

Rejected for v1. Upstream owns the pi event mapping, the Langfuse span
semantics, the truncation, and the config file. Reconsider if upstream
abandons the plugin or if a span it does not emit becomes necessary.

### Add a Settings surface for the sink

Rejected for this change. The extension already reads a config file and
`LANGFUSE_*`, which covers a personal or self-hosted sink without a new host
contract. A settings row can follow if the file proves too blunt.

## References

- `examples/plugins/pi-langfuse/` — the plugin, its README, and the artifact
- `scripts/bundle-langfuse-extension.mjs` — the generator and `--check`
- `packages/agent-runtime/src/extensions/loader.ts` — the `getAgentDir` export
- `packages/agent-runtime/src/extensions/loader.test.ts` — shim contract
- `packages/agent-runtime/src/extensions/langfuse-extension.test.ts` — user path
  against a local stub sink
- `apps/desktop/test/example-langfuse-plugin.test.mjs` — opt-in shape, no
  credentials, import allowlist, artifact reproduction
- `docs/spec/07-plugins/16-trusted-extensions.md` §4.2 — the loader contract
- `docs/spec/03-runtime/09-logging-and-observability.md` — the telemetry boundary
- langfuse/pi-observability-plugin — upstream extension (MIT)