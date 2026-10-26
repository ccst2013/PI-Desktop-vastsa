# Langfuse Tracing (`pi.langfuse`)

Opt-in tracing of agent turns, model calls, and tool runs to a [Langfuse](https://langfuse.com)
instance **you** configure.

This plugin ships **no endpoint and no credentials**. Until you add your own
keys it registers no hooks and exports nothing. It is disabled by default and
is not bundled into PI-Desktop — a stock install carries no tracing code.

- Upstream: [`@langfuse/pi-observability-plugin`](https://github.com/langfuse/pi-observability-plugin) (MIT), pinned in the root `package.json`
- Upstream: [`@langfuse/pi-observability-plugin`](https://github.com/langfuse/pi-observability-plugin) (MIT), pinned in the root `package.json`
- `agent/langfuse.mjs` is a generated, committed bundle of that package plus this plugin's own settings bridge (`src/config-bridge.js`), which installs your saved settings as the environment upstream reads
- Decision records: `docs/adr/0334-langfuse-ships-as-an-opt-in-example-plugin.md` (why it is opt-in) and `docs/adr/0335-langfuse-settings-editable-in-the-plugin-sheet.md` (the settings sheet)

## What it sends, and where

One trace per turn, one generation per model call, one span per tool run,
exported over OTLP HTTP to:

```text
POST <your baseUrl>/api/public/otel/v1/traces
Authorization: Basic base64(publicKey:secretKey)
```

Exported fields:

| Data | Notes |
| --- | --- |
| Prompt and assistant text | Truncated at `PI_LANGFUSE_MAX_CHARS` (default 20000); the trace records `truncated`, `orig_len`, and a sha256 of the full text |
| Tool arguments and results | Same truncation |
| Images in the conversation | **Uploaded by default** — see the switch below |
| Model id, provider, token usage, cost | Includes cache read/write tokens |
| Session id, working directory, git branch | Branch is read with `git rev-parse --abbrev-ref HEAD` at session start |
| Release, environment | Only if you set them |

### Read this before enabling

- **Redaction is narrow.** The extension masks Langfuse ingest keys
  (`pk-lf-…` / `sk-lf-…`) and the two keys of your configured sink. It does
  **not** recognise other credentials. An API key, token, or password that
  appears in a prompt, a file you read, or a tool result is exported as-is.
- **Your conversations leave the machine.** Treat the sink as a store of
  everything you typed and everything the agent read.
- Use a sink you control. A self-hosted instance on your own network keeps the
  data inside your boundary.

## Configure from the plugin sheet

The nine settings below are declared in `manifest.json`, so PI-Desktop renders
them for you on the plugin's own **Settings** sheet in the Plugin Center — no
other plugin UI is involved. Saving writes them to this plugin's data
directory:

```text
<data>/plugins/data/pi.langfuse/settings.json
```

`<data>` is the installation's own root: the packaged profile, or the
development profile when you run a checkout. It is not `~/.pi/agent`, and a
development host never writes into the packaged tree.

| Row | Variable it sets | Notes |
| --- | --- | --- |
| Trace to Langfuse | `LANGFUSE_TRACING_ENABLED` | Off stops every export |
| Langfuse base URL | `LANGFUSE_BASE_URL` | Your instance |
| Public key / Secret key | `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Both required, or nothing is exported |
| User id | `LANGFUSE_USER_ID` | Optional attribution |
| Trace environment / Release | `LANGFUSE_TRACING_ENVIRONMENT` / `LANGFUSE_RELEASE` | Optional tags |
| Max characters per field | `PI_LANGFUSE_MAX_CHARS` | Default 20000 |
| Upload conversation images | `LANGFUSE_MEDIA_UPLOAD_ENABLED` | On by default |

**The secret key is stored and shown in plain text.** This release has no
secure storage for plugin settings, so the row is an ordinary text field, and
anyone who can read that file holds an ingest credential. The file is never
written to the logs and never echoed back, and the value is not sent anywhere
except as the `Authorization` header of your own sink. If that is not
acceptable, keep using `langfuse.json` below and leave the row empty.

### When a saved value takes effect

The extension reads its configuration when the session's agent runtime is
built, and two rows when the module is first evaluated. Saving alone changes
only the file, so:

| | Applies after |
| --- | --- |
| Trace on/off, base URL, keys, user id, environment, release | **Reload the plugin** — disable and enable it in the Plugin Center, then start the next turn |
| Max characters, upload conversation images | **Restart the app** |

Reloading the plugin retires the session's runtime and builds a new one, which
re-reads the file. The app is not interrupted: your conversations and history
stay, and the next prompt runs with the new configuration.

The last two rows are the exception because the upstream extension reads them
once, when its module is loaded, and the sidecar keeps that module for the life
of the process. Only an app restart loads it again.

### Precedence

A saved value that is **not empty** wins. An empty field sets nothing, so the
lower layers keep working:

```text
non-empty plugin setting  >  LANGFUSE_* environment variable  >  langfuse.json
```

Two things are deliberately not overridden. An inherited
`LANGFUSE_TRACING_ENABLED=false` (or `LANGFUSE_MEDIA_UPLOAD_ENABLED=false`) is
never raised back to on by a saved setting — a configuration write is not a
re-authorization of something you switched off. And clearing a field that
previously had a value gives back what the environment carried, so a stale
panel value cannot outlive the row it came from.

## Configure by hand
## Configure

Create `~/.pi/agent/langfuse.json` (or `$PI_CODING_AGENT_DIR/langfuse.json`):

```json
{
  "publicKey": "pk-lf-...",
  "secretKey": "sk-lf-...",
  "baseUrl": "https://langfuse.example.internal",
  "userId": "optional-attribution",
  "environment": "development",
  "release": "optional-release-tag"
}
```

Then enable **Langfuse Tracing** in the Plugin Center and grant the
`agent.extension` permission.

Environment variables override the file:

| Variable | Effect |
| --- | --- |
| `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` | Credentials; both are required or nothing is exported |
| `LANGFUSE_BASE_URL` (or `LANGFUSE_HOST`) | Sink base URL. Defaults to `https://cloud.langfuse.com` when unset — set it explicitly for a self-hosted instance |
| `LANGFUSE_TRACING_ENABLED=false` | Kill switch. The extension registers nothing |
| `LANGFUSE_MEDIA_UPLOAD_ENABLED=false` | Stop uploading conversation images |
| `PI_LANGFUSE_MAX_CHARS` | Text truncation limit (default 20000) |
| `LANGFUSE_USER_ID` | Optional attribution on every trace |
| `LANGFUSE_TRACING_ENVIRONMENT` / `LANGFUSE_RELEASE` | Trace environment and release tags |
| `PI_LANGFUSE_DEBUG=true` | Log extension diagnostics to stderr |

## Turn it off

Any one of these stops all export:

- `LANGFUSE_TRACING_ENABLED=false`
- Disable the plugin in the Plugin Center
- Remove the keys from `langfuse.json`

The status line reads `langfuse: off (no keys)` when no credentials resolve,
`langfuse ✓` at session start, and `langfuse ✓ (trace sent)` after a settled
turn.

## Proxy

The sink is reached directly by the extension's own HTTP client. If you use a
proxy in **Settings → Network**, add your sink's host to the proxy bypass list
so the export is not carried through it. A sink on a private network is
typically unreachable through an internet proxy, and the only symptom would be
traces that never arrive.

Export failures never fail a turn: the flush has a 3s budget (15s at exit when
images are pending) and a missed export is only a diagnostic.

## Develop

```bash
# Regenerate the committed artifact from the pinned upstream package
node scripts/bundle-langfuse-extension.mjs

# Fail if the artifact no longer matches that pin
node scripts/bundle-langfuse-extension.mjs --check
```

Equivalently, `pnpm build:langfuse-extension` and
`pnpm check:langfuse-extension`.

The generator installs the pinned package into a temporary directory, so the
OpenTelemetry and Langfuse stacks never enter the product dependency tree. Use
`--from <dir>`, or set `PI_LANGFUSE_BUNDLE_FROM=<dir>`, to build from an
already-installed tree (offline / CI). `<dir>` must contain
`node_modules/@langfuse/pi-observability-plugin`.

`apps/desktop/test/example-langfuse-plugin.test.mjs` runs the reproduction
check only when `PI_LANGFUSE_BUNDLE_FROM` is set, so the default test suite
never reaches for the network.

Load this directory with **Load dev plugin** to try it locally.

Upgrading is a three-step, reviewed bump: raise the pin in the root
`package.json`, regenerate, review the **upstream** diff. Never hand-edit
`agent/langfuse.mjs` — the drift test rejects it.