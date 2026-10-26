# Example Plugins

Sample plugins for development, specification, and integration tests. Start
with the [zero-to-one plugin development guide](../../docs/plugin-development.md)
before using these as API references.

## hello

Reference example covering:

- `commands`
- `ui.panel`
- `agentTools`
- `skills`
- `settings`
- `themes`
- resident `services`
- inter-plugin `bus`
- `permissions`

Related specs:

- `docs/spec/07-plugins/01-plugin-system.md`
- `docs/spec/07-plugins/02-plugin-manifest-schema.md`
- `docs/spec/07-plugins/03-plugin-api.md`
- `docs/spec/07-plugins/05-plugin-lifecycle.md`
- `docs/spec/07-plugins/09-plugin-command-palette.md`

Panel chrome contract:

- PI-Desktop owns exactly a transparent 46px drag band and the minimal
  top-right three-button window-control capsule on every platform.
- Normal-flow panel content is offset below that band automatically. Do not
  add another 46px top padding.
- If a panel adds fixed or sticky top UI, anchor it at
  `top: var(--pi-plugin-titlebar-height, 46px)`. The plugin owns that UI and
  should add `-webkit-app-region: no-drag` to its interactive controls.

## ui-slots-lab

Test plugin for the renderer UI slots (`docs/plugin-plan/`). It puts one
visible sample in every slot, each marked `data-lab="<slot>[:<side>]"`:

- `userAction` / `assistantAction` items; the assistant bar's right side has
  four items, so the fourth sits in the ⋯ menu
- two stacked `entryExtra` blocks under a reply
- the `toolCard` of its own `lab_probe` tool
- the `blockRenderer` for `lab.ui-slots:chart` fences (`label,value` lines)
- `composerControl` controls on both toolbar sides

The samples exercise the contract a person should see working: `plugin.call`
round trips (`Echo`, `Refuse` → `LAB_REFUSED`, `Stall` →
`PLUGIN_CALL_TIMEOUT`), `composer.insertText`, a `Crash` control the host
must contain, `Grow` past the entryExtra collapsed height, and deliberate
contract failures that hand the block back to the host: `lab_probe`
with `mode: "crash"`, and a chart whose first line is `crash` or `tall`
(taller than the 4000px clamp).

Covered by `apps/desktop/test/plugin-ui-slots-lab.test.mjs` and the Electron
E2E.

## Planned examples

- `panel-basic`
- `agent-tool-basic`
- `skill-pack`
- `marketplace-mock-publisher`

## Official marketplace repository

Published plugins live in [`vastsa/pi-desktop-plugins`](https://github.com/vastsa/pi-desktop-plugins).

Local examples here remain useful for development loading (`Load dev plugin`).
Marketplace installs should come from that repository's `catalog.json` + `packages/*.piplug`.


## Practical template

Prefer the official warehouse template:

- https://github.com/vastsa/pi-desktop-plugins/tree/main/plugins/demo.workspace-summary
- Contribution guide: https://github.com/vastsa/pi-desktop-plugins/blob/main/CONTRIBUTING.md

## Fetch redirect probe

[fetch-redirect](fetch-redirect/README.md) is a local-only fixture plugin for
host-enforced follow/error/manual policies and capability detection.

## Langfuse tracing

[pi-langfuse](pi-langfuse/README.md) is an **opt-in** `agent.extension` example:
it traces agent turns, model calls, and tool runs to a Langfuse instance you
configure. It ships no endpoint and no credentials, is disabled by default, and
is not bundled into the app — an unconfigured install exports nothing.

It is also the reference for a self-contained agent extension: the committed
`agent/langfuse.mjs` is generated from a pinned upstream package by
`scripts/bundle-langfuse-extension.mjs`, because a distributed plugin cannot
carry a `node_modules` tree. Read its README before enabling — conversation
content and images leave the machine, and redaction covers Langfuse keys only.
Decision record: `docs/adr/0334-langfuse-ships-as-an-opt-in-example-plugin.md`.

Its nine configuration rows are declared in the manifest, so PI-Desktop renders
them on the plugin's own Settings sheet and stores them in the plugin's data
directory; the extension reads them through the environment variables upstream
already defines. A saved value applies when the plugin is reloaded, and the two
rows the upstream module reads once at import (max characters, image upload)
need an app restart — the plugin README states which is which. Decision record:
`docs/adr/0335-langfuse-settings-editable-in-the-plugin-sheet.md`.
