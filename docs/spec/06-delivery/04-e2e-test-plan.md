# 04. E2E Test Plan

## 1. Goals

- Document every user-visible and protocol-visible behavior that MVP must verify.
- Provide a scenario catalog that maps to acceptance criteria (A–H) and milestones (M1–M6).
- Serve as the traceability backbone: scenario ID ↔ acceptance criterion ↔ spec.
- Define the required E2E gate for code-bearing task candidates containing the
  latest `origin/main`, before the pull request; do not merge into local `main`.
- Keep validation evidence tied to the commit the gate ran on, plus any later
  commit that changes the landed executable content.

## Scenario catalogs

Scenarios are grouped by product domain. Add a new scenario to the file
that owns its domain; keep its ID unique across all files.

| Domain | Catalog |
|---|---|
| Release, Platform, and Storage | [`e2e/release-and-platform.md`](e2e/release-and-platform.md) |
| Providers and Models | [`e2e/providers-and-models.md`](e2e/providers-and-models.md) |
| Conversation and Sessions | [`e2e/conversation.md`](e2e/conversation.md) |
| Tools, Permissions, and Workspace | [`e2e/tools-and-workspace.md`](e2e/tools-and-workspace.md) |
| Plugins and Extensions | [`e2e/plugins-and-extensions.md`](e2e/plugins-and-extensions.md) |
| Plans, Goals, Modes, and Automations | [`e2e/plans-goals-automation.md`](e2e/plans-goals-automation.md) |
| UI Shell | [`e2e/ui-shell.md`](e2e/ui-shell.md) |
| Live Sessions and Remote Control | [`e2e/live-and-remote.md`](e2e/live-and-remote.md) |

---

## 2. Non-goals

- Full UI-driven automated coverage; protocol and source-contract automation is
  active while the broader desktop suite remains planned.
- General performance / stress testing (post-MVP); bounded regression checks
  for desktop responsiveness are covered by the relevant functional scenarios.
- Native Windows/Linux release qualification (published artifacts exist; native
  qualification gaps remain documented).
- Hostile-plugin sandbox scenarios. Publisher provenance and the marketplace
  download boundary are now in scope (E2E-024R through E2E-024V); basic
  browse/install/update flows were already part of the catalog.
- Remote Gateway / browser control remains out of scope (ADR 0004 / baseline
  #20); the bounded local loopback MCP control plane is covered by E2E-220.

---

## 3. Test Pyramid

```
        ╱  E2E  ╲           — few, high-value, cross-system
       ╱ Integration ╲      — IPC/RPC contracts, host↔renderer
      ╱    Unit       ╲     — per-module, fast, isolated
```

| Level | Scope | Count target | Tooling |
|---|---|---|---|
| **Unit** | Single module, no IPC | Many | Vitest / Rust #[test] |
| **Integration** | IPC contract, host↔renderer, host↔sidecar | Moderate | Vitest + IPC mocks or live Electron |
| **E2E** | Full user journey through the desktop app | 100+ functional + US-UI visual catalog | protocol smoke + Electron probes now; Playwright later |

**Strategy**: document all E2E scenarios; add or update unit/integration tests
alongside code when change risk makes them necessary; use selective, high-value
E2E suites for every code-bearing pull request. Lower-level tests localize
correctness, while E2E validates cross-process runtime behavior; passing lower
levels does not waive the relevant E2E gate.

---

## 4. Tooling Intent

| Tool | Purpose | Status |
|---|---|---|
| **Vitest** | Unit + integration (TS side) | Active (`pnpm test`, shared package) |
| **Rust #[test]** | Host-core unit tests | Active (`cargo test -p host-core`) |
| **Protocol smoke** | Host RPC + tools + plugins headless | Active (`test:e2e`, 22 checks) |
| **Electron probes** | Boot bridge, session-list responsiveness, and crash supervision | Active (`test:e2e:boot`, `test:e2e:supervision`) |
| **Playwright** | Full UI-driven journeys | Planned (post-M5) |

> Decision: protocol smoke and Electron probes are active validation assets;
> broader desktop journeys remain scenario-specific and must be recorded as
> environment-limited when their required platform is unavailable.

---

## 5. Environment Requirements

| Requirement | Detail |
|---|---|
| Platform | macOS arm64 and Intel x64, Windows x64, and Linux x64 and arm64 release targets (D126/D285, D638 / ADR 0318) |
| Profile | Clean `~/.pi-desktop` profile (no prior config) |
| Fixtures | Sample project directory (`examples/fixtures/sample-project/`) |
| Sample plugin | `examples/plugins/hello` loaded from local path |
| Provider | At least one provider with a valid key (test account) |
| Display | Headless-capable Electron or real display |

---

## 6. Scenario Template

Each scenario is documented in this format:

```markdown
### E2E-<ID>: <title>

- **Preconditions**: what must be true before steps start
- **Steps**: ordered list of user / system actions
- **Expected**: observable outcome that proves correctness
- **Specs linked**: relevant spec file(s)
- **Acceptance criterion**: which A–H letter(s) this verifies
- **Milestone**: M1–M6 target
- **Status**: Draft | Documented | Partially automated | Automated | Passed
```

---

## E2E Main Integration Validation

Every code-bearing change must pass the E2E suites relevant to its regression
surface on a candidate that already contains the latest `origin/main`, before
the request branch is pushed and the pull request is opened. Code-bearing
changes include Renderer, Electron Main, Preload, Agent Runtime, Rust
host-core, sessions, transcripts, plans, plugins, MCP, permissions,
provider/model runtime, persistence, process lifecycle, packaging/runtime
startup, and build or CI behavior that affects application execution.
Documentation-only changes are exempt when they do not alter executable
behavior.

Run the selected suites from the request worktree after `pnpm check:pr-base`
passes. An E2E run on a branch that is behind `origin/main` is exploratory and
does not satisfy this gate. Do not merge the task into local `main` to create
the candidate.

### E2E environment reuse

Task-candidate E2E runs from the request worktree after the candidate is
prepared, but uses the host development environment already provisioned in the
primary checkout. Reuse the compatible Node/pnpm toolchain, `node_modules`,
Electron, Rust/Cargo targets, package-manager stores, build caches, and ignored
configuration by reference or link when needed.

Do not run `pnpm install`, `npm install`, or create a second dependency/runtime
environment solely for E2E. Isolate only mutable test state: temporary
profiles, data directories, sockets, ports, logs, and artifacts. Install or
rebuild dependencies only when the host environment is missing or incompatible
and record the reason. Clean CI and release runners may install from lockfiles.

From a fresh request worktree, run `node scripts/reuse-worktree-deps.mjs` with
the same Node version/ABI as the primary installation. It links installed
third-party packages and points `@pi-desktop/*` at this worktree; build those
workspace packages here. If the primary installation is stale, pass the path of
another checkout of this repository with matching installed dependencies and
keep it until the consuming worktree is removed. If none matches, use an
isolated install. Never install, prune, or rebuild through shared links.
The helper copies mutable `.bin` shims locally. Before `pnpm run` or `pnpm exec`,
set `pnpm_config_verify_deps_before_run=false` in the command environment to
prevent pnpm from automatically installing into the linked layout (PowerShell:
`$env:pnpm_config_verify_deps_before_run='false'`).

Use the root `package.json` as the source of truth for executable commands.
The minimum selection is:

- Cross-cutting runtime, host, or IPC: `pnpm test:e2e`.
- Electron startup, preload, or window lifecycle: `pnpm test:e2e` and
  `pnpm test:e2e:boot`. For packaged-startup regressions, also run
  `node scripts/e2e-electron-boot.mjs <packaged-executable>` against the
  installed-layout artifact with an isolated profile.
- Session-list refresh or model capability lookup: `pnpm test:e2e` and
  `pnpm test:e2e:boot`, including the synthetic large-list responsiveness check.
- Settings/composer/plugin search theme surfaces: `pnpm build:js` followed by
  `pnpm test:e2e:theme-surfaces`.
- Composer clipboard representation and text insertion: `pnpm test:e2e:composer-paste`.
- Composer slash-menu name/description layout: `pnpm build:js` followed by
  `pnpm test:e2e:composer-autocomplete`.
- Transcript render boundaries and cross-part delegation display: `pnpm test:e2e:transcript`.
- Plan host/runtime behavior: `pnpm test:e2e` and `pnpm test:e2e:plan`.
- Plan UI behavior: `pnpm test:e2e:plan` and `pnpm test:e2e:plan-ui`.
- Host supervision, crash recovery, or restart behavior: `pnpm test:e2e` and
  `pnpm test:e2e:supervision`.
- Subagent lifecycle: `pnpm test:e2e` and `pnpm test:e2e:subagents`.
- Imported-extension dependency installation or registry-boundary changes: `pnpm test:e2e:plugin-import-deps`.
- Trusted extension or plugin-extension changes: `pnpm test:e2e:trusted-extensions`.
- Session collaboration / Session Orchestrator: `pnpm test:e2e:collaboration`.
- Completion-notice silence or the silent-turn contract (D193 / D446): `pnpm test:e2e:session-completion`.
- Changes spanning multiple surfaces use the union of the applicable suites.

`pnpm test:e2e` is the default cross-system smoke suite for host RPC, IPC,
agent execution, plugins, persistence integration, and shared runtime
contracts. A required suite that cannot run because of a missing display,
platform, credential, hardware resource, or other environment capability must
be recorded as `NOT RUN` with its reason, alternative validation, and remaining
risk. The pull request may still be opened with that record so the change can
be validated in a capable environment, but the gate is not satisfied and
delivery remains incomplete until the suite passes against the integrated
`main` that carries the change.

Required results must apply to the executable commit the gate ran on, and any
later commit that changes the landed executable content requires a rerun of
the affected suites (landing fixes, conflict resolution, or commits added
during review). Otherwise the recorded result stands. Report each command,
result, tested commit, and any relevant environment limitation; never claim an
unexecuted suite passed.

## E2E Failure Policy

A failed required E2E blocks the branch push, the pull request, and declaring
the integrated delivery complete until the failure is classified as an
implementation regression, test regression, environment failure, or known
flaky infrastructure. Fix the product or test defect and rerun the affected
suite against the integrated `main`. Do not delete scenarios, weaken
assertions, or add retries that hide a deterministic failure. When a scenario
is not automated on the required platform, keep its status documented and
identify the platform validation still needed.

## 8. Traceability Matrix

| Acceptance | Scenarios |
|---|---|
| C / E / Security / Quality — Gemini work setup | E2E-LIVE-VOICE-gemini-work-schema |
| C / Quality — Continue after malformed tool output | E2E-RUNTIME-malformed-tool-call-continue-recovery |
| B / Security / Quality — Optional provider client certificate requests | E2E-PROVIDER-optional-client-certificate |
| C / E / F / Quality / Security — Session Todo checklist | E2E-CHAT-session-todo-checklist |
| C / E / Security / Quality — Live Voice four-stage interaction | E2E-LIVE-VOICE-four-stage-ui |
| C / F — Hourly task updates | E2E-SCHEDULED-manual-to-hourly |
| C / F / Quality — Saved project isolation | E2E-SCHEDULED-manual-workspace-binding |
| C / F / Quality — Desktop automations | E2E-SCHEDULED-desktop-automation-lifecycle |
| F / Security / Quality — Portable configuration sync | E2E-CONFIG-SYNC-s3-portable-configuration |
| A / C — Unicode stdio framing | E2E-RPC-unicode-separators |
| C / G / Quality — Plugins navigation | E2E-NAV-plugins-button-goes-back |
| C / D / Quality — Sidebar row states | E2E-LAYOUT-sidebar-row-states |
| C / D / Quality — Sidebar lists at high zoom | E2E-LAYOUT-sidebar-height |
| E / Quality — Browser screenshot timeout recovery | E2E-BROWSER-capture-resize |
| A / C / Quality — Sidebar material and settings return | E2E-LAYOUT-sidebar-settings |
| C / Quality — Destination loading and focus | E2E-087b |
| A / H / Quality — Renderer process crash recovery | E2E-RUNTIME-renderer-crash-recovery |
| C / F / Quality — Project folder with chats detaches and deletes safely | E2E-048c |
| B / F / Security — Provider copy | E2E-PROVIDER-copy-config-without-credentials |
| C / Quality — Self-hosted endpoint receives the session id | E2E-PROVIDER-custom-endpoint-session-identity |
| B / F / Quality — Selected model order | E2E-MODEL-selected-order-persists |
| E / F / Quality — MCP server timeout override | E2E-261 |
| A — App startup | E2E-001, E2E-002, E2E-003, E2E-004, E2E-067, E2E-076, E2E-079, E2E-092, E2E-097, E2E-143, E2E-150, E2E-168, E2E-204 |
| A / C / F / Quality — Tray session navigation | E2E-TRAY-bounded-session-navigation |
| B — Model config | E2E-005, E2E-PROVIDER-custom-endpoint-no-api-key, E2E-PROVIDER-unsigned-thinking-replay, E2E-006, E2E-007, E2E-038, E2E-050, E2E-052, E2E-055, E2E-066, E2E-080, E2E-082, E2E-102c, E2E-102d, E2E-102e, E2E-151, E2E-154, E2E-163, E2E-166, E2E-172, E2E-174, E2E-197, E2E-005G, E2E-005J, E2E-199, E2E-201, E2E-202, E2E-203, E2E-205, E2E-206, E2E-209, E2E-PLUGIN-provider-catalog-add-service |
| C — Conversation & stream | E2E-CHAT-long-history-stream-keeps-responsive, E2E-CHAT-running-status-survives-output-pauses, E2E-008, E2E-008d, E2E-008e, E2E-008a, E2E-009, E2E-010, E2E-011, E2E-011a, E2E-011b, E2E-011d, E2E-011e, E2E-011g, E2E-031, E2E-040, E2E-047, E2E-048, E2E-048A, E2E-049, E2E-052, E2E-053, E2E-054, E2E-055, E2E-059, E2E-059a, E2E-060c, E2E-060d, E2E-061, E2E-061a, E2E-062, E2E-064, E2E-065, E2E-068, E2E-071, E2E-073, E2E-074, E2E-075, E2E-081, E2E-083, E2E-084, E2E-086, E2E-087, E2E-088, E2E-088b, E2E-089, E2E-090, E2E-COMPOSER-narrow-controls, E2E-094, E2E-095, E2E-096, E2E-097, E2E-098, E2E-099, E2E-102, E2E-102a, E2E-102b, E2E-102c, E2E-102d, E2E-102g, E2E-106, E2E-109, E2E-111, E2E-114, E2E-116, E2E-117, E2E-118, E2E-119, E2E-120, E2E-121, E2E-218, E2E-259, E2E-219, E2E-AGENTS-001, E2E-142, E2E-144, E2E-145, E2E-146, E2E-146a, E2E-147, E2E-151, E2E-154, E2E-155, E2E-158, E2E-159, E2E-161, E2E-162, E2E-166, E2E-172, E2E-173, E2E-174, E2E-177, E2E-178, E2E-179, E2E-180, E2E-182, E2E-183, E2E-187, E2E-198, E2E-199, E2E-202, E2E-203, E2E-207, E2E-208, E2E-CHAT-content-width-handles, E2E-250, E2E-102i, E2E-PLUGIN-session-orchestrator-real-workers, E2E-SUBAGENT-settlement-updates-before-parent-poll, E2E-SUBAGENT-resume-a-settled-delegation |
| C — Conversation & stream (composer drafts) | E2E-011c, E2E-011c-1, E2E-011c-2 |
| D — Workspace | E2E-012, E2E-013, E2E-022B, E2E-024I, E2E-047, E2E-049, E2E-057, E2E-058, E2E-060, E2E-068, E2E-075, E2E-078, E2E-153, E2E-158, E2E-182, E2E-187, E2E-252 |
| C / D / Quality — Project session history resets after collapse | E2E-263 |
| D — Workspace (project ordering) | E2E-253 |
| E — Tools & permissions | E2E-008a, E2E-014, E2E-015, E2E-016, E2E-017, E2E-018, E2E-019, E2E-024I, E2E-024K, E2E-040, E2E-049, E2E-074, E2E-093, E2E-097, E2E-099, E2E-100, E2E-101, E2E-102, E2E-102d, E2E-102e, E2E-102g, E2E-103, E2E-105, E2E-106, E2E-107, E2E-111, E2E-112, E2E-113, E2E-114, E2E-115, E2E-116, E2E-119, E2E-121, E2E-122, E2E-142, E2E-145, E2E-147, E2E-155, E2E-158, E2E-166, E2E-181, E2E-PLUGIN-imported-pi-package-skills |
| F — Persistence | E2E-020, E2E-021, E2E-021a, E2E-038, E2E-SETTINGS-inline-capability-imports, E2E-040, E2E-042, E2E-047, E2E-048, E2E-051, E2E-054, E2E-056, E2E-061, E2E-062, E2E-064, E2E-066, E2E-068, E2E-071, E2E-072, E2E-073, E2E-082, E2E-084, E2E-096, E2E-098, E2E-102, E2E-102b, E2E-102c, E2E-102d, E2E-102g, E2E-102i, E2E-103, E2E-AGENTS-001, E2E-061a, E2E-073a, E2E-104, E2E-106, E2E-107, E2E-108, E2E-109, E2E-110, E2E-112, E2E-118, E2E-119, E2E-120, E2E-121, E2E-123, E2E-142, E2E-146, E2E-146a, E2E-148, E2E-151, E2E-158, E2E-160, E2E-168, E2E-171, E2E-177, E2E-178, E2E-183, E2E-186, E2E-005J, E2E-PROVIDER-custom-endpoint-no-api-key, E2E-PLUGIN-session-orchestrator-real-workers, E2E-PLUGIN-provider-catalog-add-service, E2E-SESSION-outbox-unclassifiable-failure-does-not-stall-the-queue |
| F — Persistence (project ordering) | E2E-251 |
| G / Update — Bundled Official Enhancements defaults | E2E-PLUGIN-bundled-enhancements-defaults |
| G / Security — Fetch redirect policy | E2E-PLUGIN-fetch-redirect-policy |
| G — Plugins | E2E-022, E2E-022A, E2E-022B, E2E-022C, E2E-023, E2E-024, E2E-024B, E2E-024C, E2E-024D, E2E-024AA, E2E-024E, E2E-024W, E2E-024F, E2E-024G, E2E-024H, E2E-024I, E2E-024J, E2E-024K, E2E-024L, E2E-024M, E2E-024N, E2E-024O, E2E-024P, E2E-025, E2E-026, E2E-105, E2E-117, E2E-120, E2E-122, E2E-123, E2E-024Q, E2E-148, E2E-152, E2E-153, E2E-PLUGIN-imported-pi-package-skills, E2E-PLUGIN-imported-pi-package-wrapper, E2E-PLUGIN-import-extension-installs-dependencies, E2E-PLUGIN-import-extension-reports-missing-dependency, E2E-PLUGIN-global-shortcut-owns-only-its-own-command, E2E-PLUGIN-permission-gate-for-real-time-capabilities, E2E-PLUGIN-background-audio-and-realtime-connection, E2E-PLUGIN-fs-root-follows-the-calling-session, E2E-PLUGIN-provider-catalog-add-service, E2E-PLUGIN-reviews-public-reads |
| H — Diagnostics | E2E-027, E2E-031, E2E-034, E2E-042, E2E-096, E2E-098, E2E-104, E2E-107, E2E-108, E2E-109, E2E-110, E2E-113, E2E-115, E2E-116, E2E-118, E2E-121, E2E-146, E2E-146a, E2E-155, E2E-159, E2E-176, E2E-194, E2E-195 |
| Security | E2E-SETTINGS-inline-capability-imports, E2E-028, E2E-029, E2E-030, E2E-024J, E2E-024K, E2E-024M, E2E-049, E2E-068, E2E-086, E2E-102c, E2E-102d, E2E-102e, E2E-105, E2E-106, E2E-107, E2E-108, E2E-109, E2E-110, E2E-112, E2E-113, E2E-115, E2E-116, E2E-117, E2E-119, E2E-121, E2E-122, E2E-123, E2E-142, E2E-148, E2E-151, E2E-153, E2E-158, E2E-187, E2E-196c, E2E-196b, E2E-196, E2E-PROVIDER-custom-endpoint-no-api-key, E2E-PLUGIN-fs-root-follows-the-calling-session, E2E-PLUGIN-provider-catalog-add-service, E2E-PLUGIN-reviews-public-reads |
| Quality | E2E-SETTINGS-inline-capability-imports, E2E-CHAT-long-history-stream-keeps-responsive, E2E-CHAT-running-status-survives-output-pauses, E2E-032, E2E-033, E2E-039, E2E-043, E2E-044, E2E-045, E2E-046, E2E-047, E2E-048, E2E-048A, E2E-049, E2E-050, E2E-053, E2E-055, E2E-056, E2E-057, E2E-058, E2E-059, E2E-060, E2E-061, E2E-062, E2E-063, E2E-064, E2E-065, E2E-066, E2E-067, E2E-068, E2E-069, E2E-070, E2E-071, E2E-072, E2E-073, E2E-074, E2E-075, E2E-076, E2E-077, E2E-078, E2E-079, E2E-080, E2E-081, E2E-082, E2E-083, E2E-084, E2E-085, E2E-086, E2E-092, E2E-093, E2E-094, E2E-095, E2E-096, E2E-097, E2E-098, E2E-099, E2E-100, E2E-101, E2E-102, E2E-102a, E2E-102b, E2E-102c, E2E-102d, E2E-102e, E2E-103, E2E-AGENTS-001, E2E-021a, E2E-024N, E2E-059a, E2E-060b, E2E-060c, E2E-061a, E2E-073a, E2E-111, E2E-114, E2E-117, E2E-118, E2E-119, E2E-120, E2E-122, E2E-123, E2E-142, E2E-143, E2E-144, E2E-145, E2E-146, E2E-147, E2E-148, E2E-150, E2E-151, E2E-153, E2E-155, E2E-158, E2E-159, E2E-160, E2E-161, E2E-162, E2E-163, E2E-168, E2E-172, E2E-173, E2E-174, E2E-011g, E2E-176, E2E-177, E2E-178, E2E-179, E2E-180, E2E-181, E2E-182, E2E-183, E2E-186, E2E-187, E2E-194, E2E-195, E2E-196a, E2E-196b, E2E-196c, E2E-198, E2E-199, E2E-200, E2E-196, E2E-201, E2E-204, E2E-202, E2E-203, E2E-205, E2E-206, E2E-207, E2E-208, E2E-209, E2E-210, E2E-UPDATE-preference-and-once-only-reminder, E2E-218, E2E-259, E2E-219, E2E-250, E2E-252, E2E-102i, E2E-SUBAGENT-settlement-updates-before-parent-poll, E2E-PLUGIN-imported-pi-package-skills, E2E-PLUGIN-fs-root-follows-the-calling-session, E2E-SUBAGENT-resume-a-settled-delegation, E2E-PLUGIN-provider-catalog-add-service |
| Quality (sidebar menu placement) | E2E-021c |
| Quality (Recent project label width) | E2E-SIDEBAR-recent-project-label-width |
| Quality (project ordering) | E2E-253 |
| Quality (work-panel tab close visibility) | E2E-WORK-PANEL-active-tab-close-visibility |
| Quality (turn changed-files disclosure) | E2E-CHAT-turn-changed-files-summary |
| C / E / G / Quality — Pi kernel upgrade | E2E-PI-130-kernel-upgrade |
| C / E / G / Quality — Pi kernel upgrade | E2E-PI-140-kernel-upgrade |
| C — Conversation & stream (IME slash alias) | E2E-255 |
| E — Tools & permissions (Skill residency) | E2E-254 |
| Quality (Skill residency and IME slash alias) | E2E-254, E2E-255 |
| C / E / F / Quality — Built-in skill activation | E2E-SKILL-builtin-activation |
| Quality — Market catalog retry recovery | E2E-MARKET-CATALOG-RETRY |
| C — Conversation & stream (plugin session import visibility) | E2E-257 |
| F — Persistence (plugin session import visibility) | E2E-257 |
| G — Plugins (session import visibility) | E2E-257 |
| Quality (plugin session import visibility) | E2E-257 |
| Quality (Windows updater cache) | E2E-260 |
| G — Plugins (Session Orchestrator) | E2E-PLUGIN-session-orchestrator-real-workers |
| Security (Session Orchestrator) | E2E-PLUGIN-session-orchestrator-real-workers |
| Quality (Session Orchestrator) | E2E-PLUGIN-session-orchestrator-real-workers |
| G — Plugins (Langfuse example) | E2E-PLUGIN-langfuse-opt-in-export, E2E-PLUGIN-langfuse-settings-sheet |
| Security (Langfuse example) | E2E-PLUGIN-langfuse-opt-in-export, E2E-PLUGIN-langfuse-settings-sheet |
| Quality (Langfuse example) | E2E-PLUGIN-langfuse-opt-in-export, E2E-PLUGIN-langfuse-settings-sheet |
| C — Conversation & stream (Session list responsiveness) | E2E-SESSION-list-refresh-keeps-desktop-responsive |
| Quality (Session list responsiveness) | E2E-SESSION-list-refresh-keeps-desktop-responsive |
| Security (imported extension dependencies) | E2E-PLUGIN-import-extension-installs-dependencies, E2E-PLUGIN-import-extension-reports-missing-dependency |
| Quality (imported extension dependencies) | E2E-PLUGIN-import-extension-installs-dependencies, E2E-PLUGIN-import-extension-reports-missing-dependency |
| F / G / Security / Quality — Imported extension npm recovery | E2E-PLUGIN-import-extension-recovers-missing-npm |
| G — Plugins (desktop tool dispatch budget) | E2E-PLUGIN-slow-tool-is-not-cut-off-by-host-dispatch |
| C — Conversation & stream (Independent session communication) | E2E-SESSION-independent-top-level-communication |
| D — Plugin security (Independent session communication) | E2E-SESSION-independent-top-level-communication |
| G — Plugins (Independent session communication) | E2E-SESSION-independent-top-level-communication |
| Quality (Independent session communication) | E2E-SESSION-independent-top-level-communication, E2E-SESSION-hover-card-model-and-links |
| C — Conversation & stream (Hover card model and links) | E2E-SESSION-hover-card-model-and-links |
| C — Conversation & stream (Chat file references) | E2E-CHAT-shorthand-file-ref-opens-the-matching-file, E2E-CHAT-file-ref-opens-the-surface-that-owns-it |
| C / Quality / Security (Conversation MP4 attachments) | E2E-CHAT-mp4-attachment-opens-in-system-player |
| G — Plugins (Chat file references) | E2E-CHAT-file-ref-opens-the-surface-that-owns-it, E2E-PLUGIN-file-view-collapse-persists |
| Quality (Chat file references) | E2E-CHAT-shorthand-file-ref-opens-the-matching-file, E2E-CHAT-file-ref-opens-the-surface-that-owns-it, E2E-PLUGIN-file-view-collapse-persists |
| C / Quality (Composer deep file mentions) | E2E-COMPOSER-deep-file-mentions |
| G — Plugins (project folder roots) | E2E-PLUGIN-file-view-switches-folder-per-project |
| Security (project folder roots) | E2E-PLUGIN-file-view-switches-folder-per-project |
| Quality (project folder roots) | E2E-PLUGIN-file-view-switches-folder-per-project |
| D — Workspace (project delete) | E2E-PROJECT-delete-removes-project-and-owned-sessions |
| F — Persistence (project delete) | E2E-PROJECT-delete-removes-project-and-owned-sessions |
| Quality (project delete) | E2E-PROJECT-delete-removes-project-and-owned-sessions |
| Quality (two-click delete) | E2E-SESSION-two-click-delete-arms-first |
| Security (plugin real-time capabilities) | E2E-PLUGIN-global-shortcut-owns-only-its-own-command, E2E-PLUGIN-permission-gate-for-real-time-capabilities, E2E-PLUGIN-background-audio-and-realtime-connection |
| C — Conversation & stream (disclosure reading position) | E2E-CHAT-disclosure-toggle-keeps-reading-position |
| E — Tools & permissions (disclosure reading position) | E2E-CHAT-disclosure-toggle-keeps-reading-position |
| D (surfaces) / Quality — Remote-host Add and Pair form disclosure | E2E-REMOTE-HOST-settings-compact-inventory |
| E — Tools & permissions (capability level move) | E2E-CAPABILITY-move-across-levels |
| F — Persistence (capability level move) | E2E-CAPABILITY-move-across-levels |
| Quality (capability level move) | E2E-CAPABILITY-move-across-levels |

| Milestone | Scenarios |
|---|---|
| Post-MVP experimental interaction maintenance | E2E-LIVE-VOICE-four-stage-ui |
| M1 | E2E-001, E2E-002, E2E-003, E2E-028, E2E-029 |
| M2 | E2E-004, E2E-005, E2E-006, E2E-007, E2E-008, E2E-008d, E2E-008e, E2E-009, E2E-010, E2E-011, E2E-011a, E2E-011b, E2E-011d, E2E-011e, E2E-011g, E2E-020, E2E-021, E2E-021a, E2E-027, E2E-031, E2E-042, E2E-087, E2E-088, E2E-088b, E2E-089, E2E-090, E2E-COMPOSER-narrow-controls, E2E-144, E2E-005J, E2E-201, E2E-202, E2E-207, E2E-206 |
| M2 (sidebar menu placement) | E2E-021c |
| M3 | E2E-012, E2E-013, E2E-014, E2E-015, E2E-016, E2E-017, E2E-018, E2E-019, E2E-040 |
| M4 | E2E-022, E2E-023, E2E-024, E2E-025, E2E-026, E2E-030, E2E-038 |
| M5 | E2E-CHAT-long-history-stream-keeps-responsive, E2E-CHAT-running-status-survives-output-pauses, E2E-008a, E2E-032, E2E-033, E2E-034, E2E-039, E2E-043, E2E-044, E2E-045, E2E-046, E2E-047, E2E-048, E2E-048A, E2E-049, E2E-050, E2E-051, E2E-052, E2E-053, E2E-054, E2E-055, E2E-056, E2E-057, E2E-058, E2E-059, E2E-060, E2E-061, E2E-062, E2E-063, E2E-064, E2E-065, E2E-066, E2E-067, E2E-068, E2E-069, E2E-070, E2E-071, E2E-072, E2E-073, E2E-074, E2E-075, E2E-076, E2E-077, E2E-078, E2E-079, E2E-080, E2E-081, E2E-082, E2E-083, E2E-084, E2E-085, E2E-086, E2E-092, E2E-093, E2E-096, E2E-097, E2E-098, E2E-099, E2E-100, E2E-101, E2E-102, E2E-102a, E2E-102b, E2E-102c, E2E-102d, E2E-102e, E2E-AGENTS-001, E2E-059a, E2E-060b, E2E-060c, E2E-061a, E2E-073a, E2E-094, E2E-095, E2E-143, E2E-145, E2E-146, E2E-146a, E2E-147, E2E-177, E2E-178, E2E-180, E2E-181, E2E-182, E2E-183, E2E-186, E2E-187, E2E-194, E2E-195, E2E-204, E2E-208, E2E-CHAT-content-width-handles, E2E-250, E2E-252, E2E-102i, E2E-BROWSER-capture-resize |
| M5 (project ordering) | E2E-253 |
| M2 (IME slash alias) | E2E-255 |
| M5 (Skill residency) | E2E-254 |
| M6 | E2E-104, E2E-105, E2E-106, E2E-107, E2E-108, E2E-109, E2E-110, E2E-111, E2E-112, E2E-113, E2E-114, E2E-115, E2E-116, E2E-117, E2E-118, E2E-119, E2E-120, E2E-103, E2E-172 |
| M6+ | E2E-121, E2E-122, E2E-148, E2E-150, E2E-151, E2E-154, E2E-155, E2E-158, E2E-159, E2E-160, E2E-161, E2E-162, E2E-163, E2E-166, E2E-168, E2E-173, E2E-174, E2E-176, E2E-179, E2E-196a, E2E-196b, E2E-196c, E2E-198, E2E-199, E2E-200, E2E-202, E2E-203, E2E-205, E2E-209, E2E-SETTINGS-inline-capability-imports, E2E-210, E2E-UPDATE-preference-and-once-only-reminder, E2E-212, E2E-213, E2E-214, E2E-215, E2E-216, E2E-217, E2E-218, E2E-259, E2E-219, E2E-257, E2E-SUBAGENT-settlement-updates-before-parent-poll, E2E-PLUGIN-fs-root-follows-the-calling-session, E2E-SUBAGENT-resume-a-settled-delegation |
| M6+ (Session Orchestrator) | E2E-PLUGIN-session-orchestrator-real-workers |
| M6+ (Selected model order) | E2E-MODEL-selected-order-persists |
| M6+ (MCP server timeout override) | E2E-261 |
| M6+ (Destination loading and focus) | E2E-087b |
| M6+ (Session list responsiveness) | E2E-SESSION-list-refresh-keeps-desktop-responsive |
| M6+ (Windows updater cache) | E2E-260 |
| M6+ (Independent session communication) | E2E-SESSION-independent-top-level-communication, E2E-SESSION-hover-card-model-and-links |
| M5 (Chat file references) | E2E-CHAT-shorthand-file-ref-opens-the-matching-file, E2E-CHAT-file-ref-opens-the-surface-that-owns-it |
| M5 (Composer deep file mentions) | E2E-COMPOSER-deep-file-mentions |
| M5 (Conversation MP4 attachments) | E2E-CHAT-mp4-attachment-opens-in-system-player |
| M6+ (Chat file references) | E2E-PLUGIN-file-view-collapse-persists |
| M6+ (project folder roots) | E2E-PLUGIN-file-view-switches-folder-per-project |
| Post-MVP | E2E-022A, E2E-022B, E2E-022C, E2E-024I, E2E-024J, E2E-024K, E2E-024L, E2E-024M (plugin roadmap R2/R3/R6) |
| Post-baseline local automation | E2E-220 |
| Post-baseline local automation (MCP `pi_session_get` large compaction) | E2E-MCP-session-get-projects-large-compaction |
| Post-MVP remote control | E2E-221, E2E-222, E2E-223, E2E-224, E2E-225, E2E-226, E2E-227, E2E-228, E2E-229, E2E-230, E2E-231, E2E-232, E2E-REMOTE-HOST-settings-compact-inventory |
| Trusted extensions (R7 v1) | E2E-DIALOG-long-text-boundaries, E2E-241, E2E-242, E2E-HOOKS-prompt-chain, E2E-HOOKS-context-every-request, E2E-HOOKS-cancel-and-dispose, E2E-TRUSTED-EXTENSION-custom-agent-stream-and-binding, E2E-243, E2E-TRUSTED-EXTENSION-temporary-session-cwd-is-scratch, E2E-244, E2E-245, E2E-PLUGIN-imported-pi-package-skills, E2E-PLUGIN-import-extension-installs-dependencies, E2E-PLUGIN-import-extension-reports-missing-dependency, E2E-PLUGIN-declared-provider-appears-in-the-native-provider-list, E2E-PLUGIN-provider-catalog-add-service |
| Trusted extensions (R7 v1 npm recovery) | E2E-PLUGIN-import-extension-recovers-missing-npm |
| Post-MVP regression coverage (plugin tool dispatch) | E2E-PLUGIN-slow-tool-is-not-cut-off-by-host-dispatch |
| M6+ (Project delete) | E2E-PROJECT-delete-removes-project-and-owned-sessions |
| M6+ (Two-click delete) | E2E-SESSION-two-click-delete-arms-first |
| C — Conversation & stream (model fallback) | E2E-SUBAGENT-ordered-model-fallback-preserves-work |
| Quality (model fallback isolation) | E2E-SUBAGENT-ordered-model-fallback-preserves-work |
| C — Conversation & stream (legacy subagent turn limit) | E2E-SUBAGENT-legacy-turn-limit-frontmatter-is-ignored |
| Quality (legacy subagent turn limit) | E2E-SUBAGENT-legacy-turn-limit-frontmatter-is-ignored |
| M6+ (disclosure reading position) | E2E-CHAT-disclosure-toggle-keeps-reading-position |
| M6+ (capability level move) | E2E-CAPABILITY-move-across-levels |
| E — Tools & permissions (builtin subagent defaults) | E2E-SUBAGENT-settings-lists-builtin-defaults |
| Quality (builtin subagent defaults) | E2E-SUBAGENT-settings-lists-builtin-defaults |
| C — Conversation & stream (opaque floating surfaces) | E2E-CHAT-opaque-floating-decision-and-retry-surfaces |
| Quality (opaque floating surfaces) | E2E-CHAT-opaque-floating-decision-and-retry-surfaces |
| M6 (opaque floating surfaces) | E2E-CHAT-opaque-floating-decision-and-retry-surfaces |
| B — Model config (catalog window provenance) | E2E-MODEL-catalog-window-correction-reaches-saved-bindings |
| F — Persistence (catalog window provenance) | E2E-MODEL-catalog-window-correction-reaches-saved-bindings |
| Quality (catalog window provenance) | E2E-MODEL-catalog-window-correction-reaches-saved-bindings |
| M6+ (catalog window provenance) | E2E-MODEL-catalog-window-correction-reaches-saved-bindings |
| C — Conversation & stream (delegate context budget) | E2E-SUBAGENT-context-overflow-compacts-before-failing, E2E-SUBAGENT-context-overflow-reports-actionable-failure, E2E-SUBAGENT-resume-seeds-within-context-budget |
| Quality (delegate context budget) | E2E-SUBAGENT-context-overflow-compacts-before-failing, E2E-SUBAGENT-context-overflow-reports-actionable-failure, E2E-SUBAGENT-resume-seeds-within-context-budget |
| M6+ (delegate context budget) | E2E-SUBAGENT-context-overflow-compacts-before-failing, E2E-SUBAGENT-context-overflow-reports-actionable-failure, E2E-SUBAGENT-resume-seeds-within-context-budget |
| C / F / Quality — The context estimate stays safe (calibration) | E2E-CONTEXT-estimate-calibration-stays-safe |
| C — Conversation & stream (unique tool-call ids) | E2E-RUNTIME-unique-tool-call-ids-per-request |
| F — Persistence (stored model binding array) | E2E-PROVIDER-stored-binding-array-reads-entry-by-entry |
| Quality (stored model binding array) | E2E-PROVIDER-stored-binding-array-reads-entry-by-entry |
| Quality (unique tool-call ids) | E2E-RUNTIME-unique-tool-call-ids-per-request |
| C — Conversation & stream (system update during a tool call, restored) | E2E-RUNTIME-system-update-during-tool-call-restore |
| Quality (system update during a tool call, restored) | E2E-RUNTIME-system-update-during-tool-call-restore |
| C — Conversation & stream (loop context ownership) | E2E-RUNTIME-loop-context-ownership |
| C / F / Quality — Transcript invalid UTF-8 recovery | E2E-TRANSCRIPT-invalid-utf8-window-remains-readable |
| Quality (loop context ownership) | E2E-RUNTIME-loop-context-ownership |
| G — Plugin host lifecycle (crash report) | E2E-PLUGIN-crash-report-names-the-exit-code |
| Quality (crash report) | E2E-PLUGIN-crash-report-names-the-exit-code |
| C / E / F / Quality — Background Bash tasks outlive their turn | E2E-265 |
| C / E / Security / Quality — Codemode sandboxed nested calls | E2E-CODEMODE-sandboxed-nested-calls |

The `US-UI-*` visual scenarios (§UI shell visual scenarios) trace to the
Codex parity decisions in [decisions-log §D](../08-meta/decisions-log.md)
rather than the A–H criteria; their gold source is the capture suite.

The release artifact paths are covered by E2E-192, E2E-192a, E2E-196a,
E2E-196b, E2E-196c, and E2E-200 (Quality, M6+).

---

The session background jobs E2E (`scripts/e2e-session-background-jobs.mjs`)
also covers ordinary Bash with a real Host and a deterministic local provider.
A short command returns its original exit code. A longer command returns a
running job, allows another tool call, and runs exactly once before
`TaskWait` receives the terminal output and exit code. The original deadline
and explicit stop are exercised after the initial return.

The vendored File Manager journeys exercise the production view:
`file-manager-directory-location-user-path.e2e.mjs` opens primary and sibling
project directories, unchanged file targets, and rejected external directories;
`file-manager-theme-user-path.e2e.mjs` checks editor controls in both themes.
`e2e-remote-file-manager.mjs` checks scoped SSH reads and local/remote switches
through the Desktop bridge. The pinned source and its document-tab, Git and
loading checks are recorded in the bundled plugin’s `UPSTREAM.md`.

## 9. How AI Must Update This Doc

When adding or changing a feature that affects user-visible or protocol-visible behavior:

1. **Add a new scenario** using the template in §6 to the domain catalog that
   owns it (see [Scenario catalogs](#scenario-catalogs)). Assign the next available ID
   (`E2E-<N>`). IDs retired by ADR 0268 are never reused.
2. **Link it** to the relevant acceptance criterion (A–H) and milestone (M1–M6
   or M6+ for the current product increment).
3. **Set status** to `Draft` unless an automated test already exists.
4. **Update the traceability matrix** in §8.
5. **Commit** the update as part of the change (per [ai-development-workflow](03-ai-development-workflow.md) R3).

---

## 10. Future Automation Mapping

When E2E automation is implemented (post-M5):

- Each `Draft` scenario → Playwright test file.
- Scenario ID becomes test case name: `e2e-001-app-launches`.
- Fixtures and test data paths defined in a `tests/e2e/fixtures/` directory.
- CI gate: all E2E scenarios must pass before release.

Automation section will be expanded in a future ADR when the tooling decision is finalized.

---

## 11. Acceptance Criteria

This test plan spec is accepted when:

- [ ] All MVP acceptance criteria (A–H) have at least one E2E scenario.
- [ ] All security acceptance items have at least one E2E scenario.
- [ ] Every scenario links to at least one spec document.
- [ ] Traceability matrix is complete (scenarios ↔ acceptance ↔ milestones).
- [ ] Scenario template is defined and all entries follow it.
- [ ] AI update rules are documented and cross-linked to workflow spec.
- [ ] Environment requirements match baseline (native macOS arm64/Intel x64,
  clean profile).

## UI shell visual scenarios

### US-UI-01 Codex-aligned shell chrome
- Open the desktop app on macOS dark theme.
- Expect charcoal main surface (`#181818`), left sidebar with current-project
  and Temporary session groups, and a floating bottom composer
  with mode/model controls and no workspace rail.
- Expect no blue-slate marketing chrome; primary send control is a circular inverted button.

### US-UI-02 Empty thread hero
- Open or create a thread with zero messages.
- Expect the centered hero copy "What can I help you build?", a short muted
  supporting line, with no developer starter cards. The optional project name
  remains a dotted-underline action when a workspace is open.

### US-UI-03 Sidebar destinations
- Expect the expanded home sidebar to show Sessions and Projects without
  standalone Plugins or Scheduled rows.
- Click the plug-shaped Plugins icon in the sidebar footer, immediately to the
  right of Settings, and expect it to replace the main pane with a dedicated
  page.
- Open Settings → Project archive and use it to open, switch, and close a local
  folder workspace.

### US-UI-04 Composer without workspace context
- With a git workspace open, composer does not show project, Local, or branch
  labels above the prompt surface.
- Operating-mode selector switches between Agent, Plan, and Goal; both contract
  modes keep the permission-mode chip and explain their Bash tradeoff.

### US-UI-05 Locale chrome
- On a zh-CN system locale, sidebar labels render in Chinese (项目 / 临时会话),
  with no extra standalone destination rows. The footer plug-shaped Plugins icon
  exposes the localized accessible name 插件.
- Empty-thread hero and supporting line are localized Chinese copy; project
  name remains a dotted-underline action when a workspace is open.
- Composer omits the 本地 workspace label and shows Agent/Plan/Goal plus the
  active model ID; both locales expose the Plan and Goal approval copy.

### US-UI-06 Session title plugin
- Create a new task and send a first prompt such as "同步代码".
- The core keeps the localized default title while the prompt is sent and after
  completion. When the Session Titles plugin is enabled and authorized, it may
  generate a title after the first completed turn using its configured prompt,
  model, and thinking level. Without the plugin, the title remains the default.
- Rename the session manually and complete another turn. The plugin must not
  replace the user-defined title.

### US-UI-08 Shortcut-only destination history
- Navigate Settings → Project archive → a project session → Plugins.
- Expect no back/forward buttons in the expanded sidebar or main titlebar.
- Press `Cmd/Ctrl+[` and `Cmd/Ctrl+]`; expect them to traverse that history.

### US-UI-09 Default session title persistence
- Open an older session that showed "New task"/"New chat" and has a first user
  message.
- Without the title plugin, its scoped sidebar row keeps the default title;
  with the plugin, the title changes only after the first turn completes and the
  plugin is authorized.

### US-UI-11 Empty draft reuse
- Click New task twice.
- Expect only one empty "New task" draft in the current project or Temporary
  group and the home hero remains visible. Empty drafts in another scope are
  not reused.

### US-UI-12 Composer without workspace rail
- On empty home, project home, and in a thread, expect no project / Local /
  branch context rail above the composer.
- The prompt shell remains one uninterrupted rounded surface with no reserved
  rail height, attached top lip, rail shadow, bottom seam, or separators.

### US-UI-13 Light theme shell parity
- Set theme to system/light on a light macOS appearance.
- Expect sidebar `#f3f3f3`, main `#ffffff`, text `#1a1c1f`, white floating composer, and home hero with project underline.
- Sidebar project/session labels, footer Settings/Plugins/notification
  icons, current-project identity, thread titles, and composer controls must remain
  readable dark-on-light (≥4.5:1). Never white/translucent text on the light
  sidebar.
- The macOS traffic-light row keeps Collapse sidebar readable at the
  right on light chrome without rendering the Logo/Home brand.

### US-UI-14 Semantic chrome tokens
- Toggle theme system → light → dark without restart.
- Shell chrome (sidebar items, composer runtime controls, icon buttons)
  follows semantic `--ds-text-*` / `--ds-bg-*` tokens in both themes; no
  hard-coded white (`gray-0`) text on light surfaces.

### US-UI-15 Codex density + elevation
- Sidebar rows use a compact ~28–32px pitch with the 12–14px hierarchy from
  US-UI-69 and 8px horizontal padding (Codex `radius-token-row` 10px).
- Floating composer uses Codex elevation-prominent: 0.5px stroke + soft 3px/20px shadow (not heavy 10–30px drop).
- Empty hero title is 28px / 34px line-height, weight 400.
- Window restores ≥1000×700 (target 1200×800) if Stage Manager collapses it.

### US-UI-16 Sidebar footer utility layout
- On the light/dark home shell, the sidebar footer is a transparent utility
  band with no separator. Settings, Plugins, and notification actions
  are grouped on the left, while the build/version chip is right-aligned.
- The notification Bell remains visible in the left action group with its
  unread badge and opens the inbox above the footer; the main titlebar has no
  duplicate Bell.
- Clicking the build/version chip checks for updates when current, or opens
  Settings → Info when an actionable update is available.
- Traffic lights sit at Codex `{x:16,y:16}` with a 46px toolbar; the expanded
  macOS sidebar places Collapse sidebar at the right in that same
  row, with no Logo/Home brand or back/forward buttons.

### US-UI-17 PI-Desktop home hero logo
- On empty chat home, the 100px `HomeMascotLogo` GIF renders above the title
  as an eight-frame waving mascot with a short idle hold. Light and dark
  themes each use a dedicated GIF and still PNG.
- Pointer hover does not change the cadence or geometry; reduced motion shows
  the matching still first frame. The mascot remains decorative.
- Title is 28px / weight 400; active project name uses dotted underline (1px, offset 4px).
- Composer does not render attachment or appshot controls before their payload
  reaches pi end to end.

### US-UI-18 Composer has no inert actions
- On chat home and a docked thread, inspect every composer control.
- Expect no file, photo, or appshot controls while those payloads are
  unsupported by the pi runtime. Exact reasoning-capable models expose the
  current Thinking level immediately to the right of Agent / Plan / Goal; unsupported
  models show no trigger. Unknown compatible models can explicitly enable
  thinking from the model menu, and changes update the durable session.
- Expect no project, Local, or branch context labels in the composer.
- Every visible composer control changes the active session, opens its menu, or
  submits/aborts the current turn.

### US-UI-19 Permanent Stage Manager bounds restore (macOS only)
- On macOS with Stage Manager, shrink or unfocus the PI window until width < 800 or height < 560.
- Expect the shell to re-assert a Codex-like footprint (~1200×800, min 800×560 capped to the display work area) and keep restoring while still collapsed (not only during the first 20s after launch).
- The recovery watchdog is macOS-only (D447). On Windows/Linux it must not run at all: the app must never re-layer or re-raise its own window unprompted. Focus another window, then confirm PI-Desktop stays behind it instead of jumping back to the top of the stack, and that a stacking check (`xprop -root _NET_CLIENT_LIST_STACKING`) never shows it returning to the top periodically.
- Windows regression: trigger tiny-bounds recovery through show, focus, or
  restore, then Alt+Tab to another app. PI-Desktop must stay behind that app
  immediately and after four seconds. Ordinary focus must not resize or raise it;
  hidden/minimized windows keep their state. Recovery must never enable
  always-on-top off macOS.
- Automated lifecycle coverage: `window-topmost-lifecycle.test.mjs` executes the
  production recovery handlers and watchdog with controlled time, including the
  unchanged macOS temporary pin and release. Native Alt+Tab validation remains
  a separate platform check.

### US-UI-20 Dark floating composer box
- Switch to dark theme on chat home.
- Expect main `#181818`, sidebar `#000000`, and the floating composer plate at elevated-primary (`#212121f5` / gray-800 96%) with elevation-prominent stroke + soft lift so the box reads against the main surface.

### US-UI-21 Composer model menu configures pi
- Create a session with provider A/model A, then open the Composer-right model ×
  reasoning menu.
- Expect the top bar to show only the task title and window actions. The
  Composer-right model × reasoning chip shows provider A/model A and the current
  reasoning level. Its menu starts with only Model and Reasoning level entries;
  Model opens the searchable provider-group list and Reasoning level opens the
  capability-filtered radio list in the same popover.
- In the searchable provider-group list, expect each provider heading to
  read as the visual parent: its `--text-md` treatment is stronger than the
  indented model rows' normal-weight `--text-sm` treatment. In zh-CN, headings
  must not force uppercase or wide Latin tracking.
- Select provider B/model B, send a prompt, and expect the main-to-sidecar
  `agent.prompt` payload and pi runtime to use B for that session.
- Switch away and back; expect B and its clamped reasoning level to remain
  selected. Selecting a model or reasoning level returns to the root without
  closing the Composer menu; outside click and Escape close it. While a turn
  runs, expect the combined control to remain available only for next-turn
  configuration unless a pending approval gates it.

### US-UI-22 Profile footer menu
- On the sidebar footer, click the `Custom` / `Local profile` trigger.
- Expect a 280px opaque elevated menu 8px above the footer. It repeats the local
  identity in a non-interactive header, then shows a divider and Settings,
  Logs, and Theme actions in that order.
- Arrow keys wrap through the three actions; Home/End jump to the boundary.
  Escape closes the menu and restores trigger focus. An outside pointer press
  closes it without stealing target focus.
- Settings navigates to the settings page, Logs opens local logs, and Theme
  cycles the current theme after closing the menu.

### US-UI-23 Project archive index
- Open Settings → Project archive.
- Expect the Settings title "Project archive" plus the one-workbench
  composition (D168/D267): a quiet intro line carrying the page description
  only, with no hero block, gradient banner, or page-level counter run; one
  toolbar with a Recent / Name sort
  segmented control, a search field, its clear affordance, the live match count,
  and the primary "Add project"; and one panel whose sections run Pinned, All
  projects, Archived as in-panel header strips, each present strip showing its
  label and row count. With no project at all the panel shows one quiet
  empty state with its own primary action.
- Expect each row to carry a colored glyph, the project name with its Active /
  Open / pinned / Archived tags, one meta line with the shortened monospace
  path, branch, and session count, a relative last-active time, and the
  hover-revealed New task and row-menu actions. Ordinary rows use a Folder glyph;
  pinned rows use a filled Star glyph and retain the pinned text tag. Archived rows stay listed and
  softened rather than hidden.
- Expand a non-active project and open one of its sessions; expect the app to
  activate that project before selecting the session, so workspace tools and
  session scope use the same project.
- Switch the sort to Name and expect rows to reorder inside every section with
  no row hidden; clear the search and expect the complete index back.

### US-UI-24 Settings full-page shell
- Open Settings (footer profile → Settings).
- Expect **full-page** Codex settings (no app sidebar/nav). Left rail has Back
  to app, search, and exactly General / AI / Shortcuts / Instructions / Models /
  Skills / MCP / Subagents / Projects, Cloud sync / Remote Hosts / Info in that
  order; packaged builds show both Cloud sync and Remote Hosts with Experimental
  badges. The content pane shows the selected destination.
- Return to the app shell and expect Plugins to remain an independent
  sidebar-footer destination.
- Drag the empty 46px top band over either the rail or content pane; the native
  window moves while Back, search, and navigation remain clickable.

### US-UI-27 Dark destination pages
- Force dark theme and open Plugins and Settings → Project archive.
- Expect black sidebar, main `#181818`, and destination cards/rows readable on elevated dark plates (not flat same-gray).

### US-UI-28 Home empty composer association
- On empty chat home (light + dark), expect the hero, optional onboarding
  checklist, and home composer in one scrollable vertical flow (D111/D204/D206),
  without a large empty gap or starter-card layer.
- The composer remains a standalone plate without an attached workspace rail.
- Starting a transcript restores the bottom-docked composer with fade veil.

### US-UI-29 Light composer plate legibility
- On light theme empty home, the white composer shell uses one uniform solid
  fill with no internal gradient or background image.
- The shell still reads as an elevated box through a hairline stroke and
  restrained soft shadow against the `#ffffff` main surface.
- Toolbar controls and placeholder remain legible (not pure white-on-white).

### US-UI-30 Composer placeholder copy
- Empty home and session composers start with their localized welcome copy:
  `chat.placeholderHome` / `chat.placeholder`.
- The selected guidance stays unchanged until the page/session context changes;
  switching context advances to localized `/`/`@` command/file guidance and the
  keyboard hint `Shift+Enter for newline · Use Send to submit`, with an opacity fade.
- Waiting, focusing, editing, clearing, or composing does not change the copy.
- Placeholder ink is legible on light and dark floating plates.

### US-UI-31 Home empty vertical stack (D111/D204/D206)
- Given empty chat home, when the window is ~1200×690, the hero and optional
  onboarding checklist render in a centered scrollable content stack above a
  bottom-reserved home composer (not dual-grow absolute portal regions).
- No starter cards or absolute overlay are present; the onboarding checklist
  remains actionable and the composer is directly available.

### US-UI-32 Dark floating box elevation
- Given dark theme empty home, when the composer shell is painted, it uses elevated-primary `#212121` on `#181818` with elevation-prominent stroke+lift identical to light (no heavier custom dark shadow).

### US-UI-33 Scoped sidebar session groups
- The home sidebar has no Recents aggregate.
- It shows one independently collapsible header per retained project path with
  nested sessions and one `Temporary sessions` / `临时会话` header for
  path-less sessions.
- Project and Temporary headers expose compact scope-specific `+` controls;
  project/session overflow menus expose pin/archive actions; nav row pitch
  remains ~32px and session row pitch ~28–31px.

### US-UI-34 Home has no developer starter cards (D206)
- On empty chat home (light + dark), no developer starter grid, card, or
  contextual quick-action row renders between the hero and composer.
- Task entry starts directly in the bottom composer, while the optional
  onboarding checklist remains actionable when present.

### US-UI-35 Empty composer plate density
- Empty-home composer is compact and content-driven with an empty or one-line
  draft; it does not reserve the former fixed ~148px empty plate.

### US-UI-36 Hero Y + night box elevation
- At ~1200×690 light home, the hero forms one centered block; the home
  scroller does not clip its top or overlap the bottom composer, and no starter
  grid is rendered.
- Dark home composer plate reads as elevated-primary `#212121f5` with elevation-prominent against `#181818` (not flat same-surface).
- Light composer renders as one uninterrupted solid surface with no context
  rail or independent top elevation.
- Model chip shows the active model ID; its menu contains only runnable
  provider/model choices and Agent.
- Placeholder and approval chip remain legible on light and dark plates.

### US-UI-39 Home mark + hero title optical
- Empty-home PI-Desktop mark is visible (not near-invisible); stroke density remains readable without a decorative ghost effect.
- Empty-home title with a project uses a readable project label span (short basenames may display as `PI-Desktop` for optical parity).

### US-UI-40 Home content width vs rem root
- At 1200×690 light empty home, composer plate outer width is ~744–760px (not ~640px).
- Home suggestion grid spans the same content column as the composer plate.

### US-UI-41 Dark hero + night box readability
- Dark empty home hero title ink is light-on-dark (`--ds-text-primary` / near white), not hardcoded `#1a1c1f`.
- Night composer plate is elevated-primary `#212121f5` on main `#181818` with elevation-prominent; light theme is not forced to the night plate fill.

### US-UI-42 Light scoped session creation chrome
- On the light sidebar, the Sessions and Projects scoped create controls remain
  icon-only with semantic hover wash; no standalone New task row is rendered.

### US-UI-43 Empty home plate Y + night elevated-primary
- Open empty home at ~1200×690 light theme.
- Composer plate is bottom-aligned and content-driven: an empty or one-line
  draft uses the compact shell rather than a fixed ~140px minimum; the surface
  remains uniformly solid with no decorative wash.
- Switch dark theme: night plate is elevated-primary (`#212121f5` / gray-800
  96%) with the same restrained elevation and no internal gradient.


### US-UI-44 Settings compact directory + merged sections
- Open Settings light theme at ~1200×690.
- Full-page shell: rail ~260px on `#f3f3f3`, main `#fff`; search pill at the
  rail top; Back to app pinned at the rail foot and vertically centred on the
  main shell's sidebar footer icon line; Appearance active pill with an
  accent-tinted fill and an accent glyph.
- Rail order is exactly Appearance / 外观, Conversation / 对话,
  Shortcuts / 快捷键, Voice / 语音, Behavior / 行为, Models / 模型,
  Instructions / 指令, Skills / 技能, MCP, Subagents / 子智能体,
  Projects / 项目, System / 系统, Cloud sync / 云同步,
  Remote Hosts / 远程主机, and Info / 信息;
  the rows are grouped under muted Preferences / 偏好, Agent / 智能体,
  Workspace / 工作区, and System / 系统 headings without divider lines,
  duplicate destinations, or placeholder rows. The selected page keeps its
  descriptive title, such as Model configuration or Project archive, and opens
  with the rail's glyph at page scale plus — where the destination declares one
  — a single subtitle line.
- Appearance content: page header and an **Interface** card with working
  system/light/dark controls, then Sidebar, Radial context menu and Startup.
  Behavior holds Session defaults (default mode, permission mode, Command
  shell), Execution and Computer use; Context management has no settings card.
  Conversation holds Display and Input & links. System holds Network, Storage,
  Power and, on Windows/Linux, Close behavior. Shortcuts holds
  the Keyboard shortcuts card.
  File-open target, language
  override, menu-bar behavior, and bottom-panel behavior are absent until
  host-backed implementations exist.
- Model configuration contains the default model selector, separate vendor
  account management with add/edit dialogs, and card-based AI service management
  with an add-provider dialog. The Defaults card reuses the compact geometry of
  every other settings row: the "Default model" label sits above the provider -
  model id line, and the quiet Change action remains separate from the current
  value. Change opens a floating listbox anchored to it: the card's height
  never changes, the model-level list is grouped by provider and scrolls once
  the configured models exceed its bounded height, it flips above the trigger
  near the viewport bottom, it is not clipped by the settings panel, and Escape,
  an outside press, or scrolling the trigger out of view closes it while focus
  returns to Change.
- Plugin load/enable/disable/uninstall remains available from the app shell's
  independent Extensions destination; its Marketplace tab always uses the
  official catalog, so Settings has no duplicate Extensions destination.
- Dark: rail `#000`, main `#181818`, cards elevated `#212121`.

### US-UI-38 Composer workspace context omitted
- On empty home, project home, and after starting a transcript, the composer
  never renders a project / Local / branch capsule.
- Workspace identity remains visible through the home hero or sidebar rather
  than being duplicated above the prompt.

### US-UI-37 Empty draft row + resize
- Empty composer prompt rows show no leading brand icon and retain visible
  placeholder ink (not a blank white/night hole).
- Auto-resize never collapses empty textarea below ~28px.
- Disabled send control is a solid gray chip on light (`#8e8e90`), full opacity with white arrow.
- Dark night plate remains elevated-primary `#212121f5` with readable elevation-prominent on `#181818`.

### US-UI-31b (superseded)
- Superseded by US-UI-31 home empty vertical stack (D111).

### US-UI-45 Composer width remains stable when the minimap appears
- Open empty home and record the composer plate width. Open a short transcript
  that fits one viewport, then grow it until the left-edge conversation minimap
  appears.
- The empty-home and docked composer plates use the same horizontal gutter and
  maximum content width. Their shell, textarea, placeholder alignment, toolbar
  padding, minimum input height, theme fill, and shadow are visually identical;
  only the parent placement and localized welcome copy differ. The minimap
  remains out of flow on the transcript's left edge and does not squeeze or
  resize the composer.
- When transcript content first overflows, the native scrollbar gutter is
  already reserved on both sides, so the transcript and composer keep one
  horizontal center instead of jumping left.

### US-UI-46 Home-with-project composer chrome
- Open a project on empty home (no transcript).
- Expect no workspace controls attached to the plate; there is no legacy draft
  mark, and the placeholder uses the PI-Desktop copy.
- Model chip shows the active model ID; the footer uses the circular local-user
  glyph, two-line Custom / Local profile identity, disclosure chevron, and
  separate Help → Settings Info control.

### US-UI-47 Projects index parity
- Open Settings → Project archive.
- Expect the Settings section title, search pill, Add project button, and the
  complete durable project list including archived rows.
- Rows expand for recent tasks; activating a project or one of its sessions
  uses `setProject` without re-picking via dialog and keeps session/workspace
  context synchronized. Sidebar pin, archive, and close metadata remains local
  to the renderer; only the explicit row-menu Delete project action removes a
  durable Project-archive row, and it removes that project's sessions with it
  (ADR 0251).


### US-UI-48 Home starter glyphs and labels are absent (D206)
- On empty home, no developer starter icon plate, title/description, or
  starter-card glyph renders in light or dark themes.
- The hero, optional onboarding checklist, and bottom composer remain the only
  empty-home task-entry surfaces.


### US-UI-49 Scoped sidebar row chrome
- Hover or select a project or temporary session row.
- Expect restrained title rows with active/hover background and compact
  overflow actions for pin/archive (not a Recents aggregate).
- Multiple retained project groups may be visible at once; sessions remain
  under exact-path groups, while closed-project sessions remain available in
  Settings → Project archive.


### US-UI-50 Destination title scale
- Open Settings → Project archive and Plugins.
- Expect large section titles (~28px) consistent with Codex destination/index pages.
- Dark home scoped session-creation controls remain quiet icon actions without
  a standalone New task row.

### US-UI-52 Settings gold chrome metrics (D070)
- Open Settings light General at ~1200×690.
- Expect ~275px `#f4f4f4` rail, single active General pill, Back + search.
- Expect the working theme selector without inert toggle or open-target rows.
- Expect Appearance in General and Permissions + Defaults in AI. The rail
  contains General, AI, Shortcuts, Instructions, Models, Skills, MCP,
  Subagents, Projects, Cloud sync and Remote Hosts (both Experimental in all
  builds), and Info. Voice may appear between AI and
  builds with developer mode on; plugin-contributed destinations follow the
  core groups. There is no Import destination.
- Resize between 800px, 1200px, and 1600px widths; the content cards fill the
  available right pane at each size without changing the rail or introducing
  horizontal scrolling.

### US-UI-53 Settings dark shell (D070)
- Dark theme Settings General: black rail, elevated cards, blue on-toggles, Back returns to chat.
- Row descriptions use theme-aware secondary text and remain clearly readable on
  the `#212121` card surface; they must not fall back to low-contrast muted ink.

### US-UI-54 Toast variants + lifecycle (D085)
- Trigger a success (save provider), an error (run with an invalid key), and an
  info toast from a test plugin.
- Expect a top-center stack on an elevated plate with a tinted variant icon (green ✓ / red ! / info) and an X dismiss per card; newest enters at the top-center anchor and pushes older cards down.
- Success/info auto-dismiss ~4s, error lingers ~8s; hovering a card pauses its countdown; X removes it immediately.
- With the stack overlapping the frameless titlebar band, hover still pauses
  the countdown and every X remains clickable instead of dragging the window.
- Repeating the same action restarts the existing toast instead of stacking a duplicate; stack never exceeds 4.
- Toast message text is selectable: dragging across a card highlights only
  its message text and `Cmd/Ctrl+C` copies it, while the card icon and its X
  dismiss control expose no selection.
- Capture rig scenes `pi-toasts-light` / `pi-toasts-dark` show the stack in both themes.

### US-UI-55 Composer textarea growth (D089)
- In both home and thread-docked composers, an empty or single-line draft
  displays one visible text line.
- Enter or paste two through seven visual lines; the textarea grows with the
  wrapped content without manual resizing.
- Add an eighth visual line; the textarea stays at seven visible lines and
  scrolls internally instead of growing the composer further.
- Delete back to one line or submit the draft; the textarea contracts to its
  one-line default.
- With a large workspace open and the `@` file menu filtering, type sustained
  text; the caret keeps up with typing without visible stalls and the menu's
  row order is unchanged. Growth through seven lines, internal scrolling past
  the seventh, and contraction on delete or submit behave as above (D264).

### US-UI-56 Codex transcript tool activity
- In light and dark themes, tool calls use transparent compact activity rows,
  not elevated cards or colored success rails.
- Historical consecutive calls appear inside a default-collapsed processing
  group. During a live turn, the latest group opens automatically so its
  process list is visible, but tool-call details stay collapsed. The latest
  thinking step opens automatically; when the turn settles, only that automatic
  thinking disclosure closes. A group or row touched by the user keeps its
  chosen state.
- Its active header shows `Processing · {elapsed}` and a localized current
  action/phase capsule such as `Editing`, `Thinking`, or `Waiting for model`;
  its completed header shows `Processed for {elapsed}`, plus a localized step
  count.
- The row shows a semantic 15–16px icon, progressive/past-tense action,
  ellipsized monospace argument hint, quiet disclosure chevron, and localized
  running/error/denied state.
- Fork-family tools show the GitFork branch icon instead of the generic tool
  glyph.
- Expanding a completed call reveals output before input. Both sections are
  independently copyable and capped with internal scrolling.
- Reloading the session preserves the action label and argument hint instead of
  degrading the row to a generic `Tool`.
- Run a turn that emits assistant text, calls multiple tools, and resumes with
  more assistant text. During streaming and after session reload, expect one
  assistant article for the whole user turn, with fragments and activity in
  original order but only one trailing model/usage row and one Copy/Fork/Retry
  toolbar. Copy includes all assistant text fragments in order.

### US-UI-57 Multi-project sidebar groups
- Open projects A and B without closing either.
- Expect a `Sessions` heading above `Projects`, containing path-less
  conversations plus new-session and sort actions. With more than five
  standalone conversations, expect a five-row-high list that scrolls to every
  remaining row without growing further.
- Right-click the `Sessions` heading or empty standalone list chrome and expect
  a one-item create menu that creates/reuses a path-less temporary session.
- Expect the following `Projects` heading to retain its new-project folder
  action, one path-keyed group per retained project, and an active-state marker
  on exactly one group. Its list consumes the remaining height and scrolls
  independently. Adjacent project groups read as a compact continuous tree
  without detached card spacing.
- Right-click the `Projects` heading or empty project-list chrome and expect a
  one-item create menu that opens the same project picker as the folder-plus
  action.
- Expect project and session lists to scroll inside the sidebar body without
  clipping behind the footer; sidebar Collapse remains in the sidebar
  header. When the work panel is open, expect its sole collapse control to be
  the viewport-fixed toggle in the window's top-right corner rather than a
  chevron in the work-panel content header.
- Collapse A by clicking its directory label, expand it from the chevron area,
  then activate B and return to A. Only A's child rows collapse; project `+`
  and overflow actions do not toggle it; the
  active project, topbar path, and transcript switch together; the composer
  remains free of workspace identity chrome.
- Close B and reopen it from Settings → Project archive. Closing removes only the sidebar tab;
  durable project/session rows remain available.

### US-UI-58 Sidebar organization actions
- Open a project and conversation overflow menu.
- Expect localized Pin/Unpin, Archive/Restore, and (for conversations) Delete
  actions with keyboard-reachable menu semantics.
- Open the sort menu from the standalone `Sessions` heading, pin one
  project/session, and choose each user-facing sort mode (Recently updated,
  Created date, Oldest first, Name). Pinned projects remain first in Projects;
  pinned conversations appear once in the global Pinned section above Sessions
  and Projects, with the selected session sort and no date headers.
- Archive a row, verify it is absent by default, enable Show archived, and
  restore it. The transcript and project binding remain unchanged.
- A legacy `manual` preference loads without presenting a drag-reorder
  affordance.

### E2E-SIDEBAR-global-pinned-conversations

- Seed an old pinned conversation in project A, today's unpinned conversation
  and eleven other normal rows in A, a pinned conversation in collapsed project
  B, one in closed project C, and a pinned Temporary conversation.
- Expect one Pinned section above Sessions and Projects, containing all four
  pins with their project names or Temporary space label. Pins have no date
  headers and do not appear a second time in ordinary history. A still shows
  ten normal rows initially, with its remaining rows behind Load more.
- Change the date across midnight and select each session sort. Pins remain
  above history; sorting changes only their internal order. Selecting B or C's
  pin activates its original conversation and project; selecting the Temporary
  pin clears workspace context. Running and unread states remain visible.
- Pin and unpin through the keyboard menu. The row moves immediately and focus
  follows its overflow control, or returns to the Sessions sort control if the
  row is now folded or belongs to a closed project. Unpin the last pin and
  expect no empty Pinned section.
- Archive a pin and a pinned conversation's project. Both disappear by default;
  Show archived reveals them and Restore preserves the pin. Delete a pinned
  conversation and expect no stale row. Reload and expect saved pins to return.
- With enough pins to overflow, scroll within Pinned and verify that Sessions,
  Projects, and the footer remain reachable in light/dark themes at minimum
  supported window size. Existing hover cards, context menus, drag/drop, and
  project pinning retain their normal behavior.

### E2E-PROJECT-delete-removes-project-and-owned-sessions

- **Preconditions**: three durable projects A, B, and C, each with at least one
  session that has a transcript; A archived and retained as a sidebar tab; B the
  active workspace; C a root of a stored two-folder project group.
- **Steps**: open Settings → Project archive, choose Delete project for A, and
  verify the confirmation dialog appears before anything is removed. Press X
  and verify A remains. Reopen the dialog and explicitly confirm. From the
  sidebar project menu, repeat for active project B: choose Delete project,
  cancel, verify B remains, then reopen and confirm. Then attempt the same
  action for C, a path the host no longer knows, and a fourth project D while
  one of D's tasks is still running.
- **Expected**: choosing Delete immediately opens the dialog for idle projects
  on both surfaces. X, Cancel, Escape, and backdrop clicks dismiss it without
  removing the project, sessions, or transcripts. The dialog names the project,
  states that its sessions and transcripts are removed permanently, and says
  the folder on disk is untouched. After explicit confirmation, the durable
  project row, owned sessions, transcripts, scratch and review files, and
  project memory are gone. The project disappears from Settings → Project
  archive and the sidebar immediately and after reload, with no retained tab,
  recent-project entry, session-derived row, or stale pin/archive/order
  preference. Other projects' sessions and transcripts are untouched. If the
  deleted project was active, the workspace falls back to another open project
  or Temporary, and the next launch does not reopen its path. A project whose
  folder was moved or deleted on disk is still removable. Deleting C is refused
  with a message and leaves the group unchanged; an unknown host path is removed
  from the archive and sidebar without a missing-project error. Deleting D
  while its task runs opens the same dialog with the running sessions named and
  a stop-and-delete confirm label; cancelling leaves it and its task untouched,
  while confirming stops exactly those turns before deleting D (see
  E2E-PROJECT-delete-running-sessions-are-named-and-stopped).
- **Specs linked**: `03-runtime/06-host-rpc-protocol.md` §Projects,
  `03-runtime/04-data-storage.md`, `04-ux/08-component-spec.md` §3.9, ADR 0251
- **Acceptance criterion**: D (workspace), F (persistence), Quality
- **Milestone**: M6+
- **Status**: Partially automated — `pnpm test:e2e` covers the host contract
  (project row, owned sessions, on-disk transcripts and scratch, project
  memory, isolation from other projects, the running-task refusal, the
  group-root refusal, and the idempotent unknown path), and
  `pnpm test:e2e:boot` round-trips `pi-desktop/project/remove` through the
  sandboxed preload; the Settings archive → dialog → sidebar journey remains
  Draft


### E2E-PROJECT-delete-running-sessions-are-named-and-stopped

- **Preconditions**: a durable project D with one session whose turn is still
  streaming, reachable both from the sidebar project menu and from Settings →
  Project archive.
- **Steps**: from each surface, open D's row menu and choose Delete project
  without stopping the turn. Expect the confirmation dialog with a
  running-session line and a stop-and-delete confirm label; press Cancel and
  expect nothing to change. Open the dialog again and confirm.
- **Expected**: the menu never replaces the dialog with a bare warning, so the
  action stays reachable while a task runs. The dialog keeps naming the
  project, its session count, and the untouched folder; while a turn is live it
  also names how many sessions are still running, its confirm button reads as
  stopping them, and that line joins the dialog's `aria-describedby` only while
  it is rendered. Cancelling deletes nothing and leaves the turn streaming.
  Confirming stops exactly the listed sessions and only then removes the
  project, its sessions, their transcripts, and its durable memory, leaving the
  folder on disk. A turn that starts between the dialog opening and the
  confirmation is still refused by the host, and the dialog reports that
  refusal with `project.deleteRunningBlocked` while removing nothing.
- **Specs linked**: `03-runtime/06-host-rpc-protocol.md` §Projects,
  `04-ux/08-component-spec.md` §3.9, ADR 0251, D421, D431
- **Acceptance criterion**: D (workspace), Quality
- **Milestone**: M6+
- **Status**: Partially automated — `apps/desktop/test/project-delete.test.mjs`
  checks that both menu handlers always open the confirmation dialog without
  deleting, and that X/Cancel only dismiss while the confirm handler owns the
  delete call; the rendered Settings/sidebar journey remains Draft

### E2E-SESSION-two-click-delete-arms-first

- **Preconditions**: a project with one idle and one running session, both
  reachable from the sidebar session menu.
- **Steps**: open the idle session menu and press Delete once. Verify it arms,
  then cancel with Escape or wait for expiry and verify the session remains.
  Reopen the menu, press Delete twice, and verify the session is removed. Repeat
  the arm/cancel/confirm sequence for the running session after it becomes idle.
- **Expected**: the first press removes nothing and relabels the item to
  `nav.deleteTaskConfirm` ("Delete?" / "确认删除？") with `data-armed="true"`;
  the menu stays open, and an outside press, Escape, or expiry clears the arm
  without removing anything. Only the second press removes a session and its
  transcript. Project deletion instead requires its explicit confirmation
  dialog (see E2E-PROJECT-delete-removes-project-and-owned-sessions).
- **Specs linked**: `04-ux/09-interaction-patterns.md` §1.6, D421, D431
- **Acceptance criterion**: Quality
- **Milestone**: M6+
- **Status**: Partially automated — `apps/desktop/test/two-step-delete.test.mjs`
  pins the session arm and expiry plus localized labels; the end-to-end journey
  remains Draft
### US-UI-59 Session-rooted background tools
- Start a visible turn in project A, switch to project B while it runs, and
  inspect both sidebar status indicators.
- Expect A's turn to continue in the background, B's composer/context to show
  only B, and tool output/artifacts from A to remain rooted in A without
  opening or activating a work-panel tab over B.
- Open a Temporary session and invoke a workspace-required tool; expect the
  normal `WORKSPACE_REQUIRED` result rather than inheritance from B.


### US-UI-60 WorkBuddy transcript plates (D101)
- Open a mixed transcript in light and dark themes.
- Expect right-aligned compact user plates, transparent full-width assistant
  prose, denser row spacing, and hover-only copy chips under each turn.
- While an assistant answer streams, expect the same transparent full-width
  prose as a completed turn — no left rail and no whole-turn tile. The tile
  belongs only to a subagent/delegation card (D319, D323).


### US-UI-60b Assistant markdown prose redesign
- Open an assistant answer with headings, table, code fence, blockquote, and task list.
- Expect the refined `.prose-chat` hierarchy and inset code chrome in both themes.
- Expand thinking markdown and confirm it stays visually subordinate to the answer.


### US-UI-60c Compact assistant error card
- Trigger a retriable provider/model failure in the transcript in light and dark themes.
- Expect the assistant error to use a restrained inline surface with a thin error rail. The localized summary, stable code, and details disclosure share one compact header; the card does not render a second bottom action row.
- Confirm the details remain expanded on first render, keep the redacted provider response and provider/model IDs, and expose an icon-only copy control with an accessible label/tooltip. On a narrow window, header actions wrap without horizontal overflow. At default and widened chat content widths, the card fills the assistant column; resizing the content band makes the card follow it, and a constrained pane does not overflow.
- Expect the compact assistant error card itself to expose one localized **Continue** action beside the details disclosure. Click it and expect the app to append the localized continuation prompt (`Continue the current task` / `继续当前任务`) to the same session and start the next turn without truncating the failed turn.
- For a terminal `PROVIDER_RATE_LIMITED` (including HTTP 429), expect the
  structured assistant error card to remain the only failure surface: it
  exposes exactly one localized **Continue** action and no **Regenerate**
  action, while the generic TurnOutcomeCard is omitted.
- Click **Continue** and expect the app to append the localized continuation
  prompt (`Continue the user's unfinished task.` / `继续用户未完成的任务`) to the
  same session and start the next turn without truncating the failed turn.
- Activate the localized **Dismiss** action. Expect the error card to disappear
  from the current transcript view while its underlying error message and raw
  diagnostic data remain unchanged; navigating away and back in the same app
  runtime keeps the dismissal.


### US-UI-61 Assistant context summary + retry (D103, D184, D244, D347)
- Complete an assistant turn that reports usage.
- Expect a model badge under the answer and the compact Context inspector in
  the composer toolbar, left of the model picker. The trigger shows the
  remaining-capacity ring and percentage; clicking it (or activating it from
  the keyboard) shows remaining tokens plus percentage, used/window counts,
  two unboxed turn/speed values, one inline exact provider-usage summary, and
  one aggregate tool-usage summary with types, calls, and approximate tokens.
  Per-tool rows, bars, badges, explanatory estimate copy, and inner section
  hairlines are not shown.
- Hovering the trigger changes nothing; the open panel closes on a second
  activation, an outside click, or Escape.
- Scroll or resize while the panel is open; expect the body-level overlay to
  flip, clamp, and remain fully visible instead of being clipped by the
  composer or transcript.
- Hover the action row and click Retry; the nearest preceding user prompt is
  re-sent.


### US-UI-62 In-place regenerate (D105)
- On a multi-turn transcript, regenerate an earlier assistant answer.
- Expect the later turns to disappear and the chosen user prompt to re-run in
  place, without stacking a second copy of the prompt.


### US-UI-63 Regenerate history pager (D109)
- Regenerate an assistant answer twice.
- After each retry, hover or focus the root user bubble and expect its action
  toolbar to expose a `1/N` pager for restoring earlier variants.


### US-UI-64 Empty home no composer overlap (D111/D204/D206)
- Open empty home at ~1200×690 and at a shorter height (~900×640).
- Expect the hero and optional onboarding checklist in a scrollable content
  region, with the home composer visibly reserved at the bottom and no starter
  cards.
- Short windows scroll the content region rather than stacking the composer over
  the checklist; when the checklist is absent, no empty spacer remains.


### US-UI-65 Durable notification inbox (D117/D130)
- Verify a focused-current completion leaves the inbox unchanged, then
  populate it through background/unfocused completed and failed task rows,
  including one long session title. Inspect the expanded sidebar footer and
  popover in light/dark themes at default and narrow supported widths.
- Expect no titlebar bell, a stable 32px footer bell in the former Help position,
  a non-overlapping `1`–`99` / `99+` badge,
  dense 360px-or-narrower list, localized kind/session/time/error content, and
  distinct text/icon/unread-dot semantics without nested cards or clipped text.
- Switch All/Unread; use Tab, arrow keys, Home/End, Enter/Space, Escape, and
  outside click. Focus order remains predictable, row activation opens the
  correct session, and Escape restores focus to the bell.
- Mark all read and Clear expose icon tooltips/accessible names, disabled and
  empty states remain understandable, and reduced-motion mode changes the
  popover instantly without suppressing focus or unread state.
- While a task banner is pending, mark its row read and then clear the inbox;
  inject a delayed duplicate event afterwards. The old row, sidebar mark, and
  native banner stay dismissed, while a new post-clear task appears once.

### US-UI-66 Application update notice layout
- In a conversation with the docked composer visible, exercise manual
  `available`, in-app `downloading`, and `downloaded` update fixtures in light
  and dark themes at default and minimum supported window sizes. Grow the
  composer draft to its maximum visible height.
- Expect one compact update notice below the titlebar in the main pane's
  top-right safe area. It never intersects the composer, including while the
  draft grows, and it does not cover an open work panel.
- Expect a stable update icon/title/message hierarchy, determinate progress for
  `downloading`, the applicable View release or Restart to update action, and a
  24px dismiss control with an accessible name. Dismissing one status stage
  does not suppress a later stage for the same version.
- When the fixture includes `releaseNotes`, expect a "What's new" section under
  the status message on both the banner and Settings → Info Updates row, using
  the product UI locale (EN or zh-CN). A fixture without notes omits the
  section. Switching language re-resolves the same version's notes without a
  new check.

### US-UI-67 Distinct sidebar task status indicators (D135)
- In light and dark themes, keep session B selected while session A progresses
  through in-progress, completed, a new in-progress turn, failed, and aborted
  states. Repeat with reduced motion enabled and inspect keyboard focus.
- Expect A to show an orange dot that breathes twice over 3.2 seconds and then
  stays steady while in progress, a green check on completion, and a red circled
  alert on failure. Starting a new turn clears A's earlier terminal mark; abort
  leaves no completed or failed mark.
- Expect selected idle B to show a static accent-blue outlined ring and active
  row background. If selected B starts work, its orange in-progress dot takes
  precedence until the turn settles; its latest terminal result remains hidden
  behind the selected ring while selected.
- Every indicator exposes localized In progress / Selected / Completed / Failed
  text through its accessible name and tooltip. Reduced motion makes the orange
  dot static without changing its color or meaning. Row height, title truncation,
  pin icon, hover actions, and focus ring remain stable in both themes.
- Open a conversation with a completed or failed mark and expect that terminal
  mark to clear immediately while its durable task notification becomes read.
  Refresh notifications and restart the app; the acknowledged mark must not
  return. A terminal notification marked read from the inbox likewise produces
  no sidebar terminal mark.
- Repeat for a running related-session marker in the hover card. After 3.2
  seconds, neither running marker has an active animation; recording an otherwise
  idle native macOS window must show no continuous frames from these markers.
  Start a new turn and reopen the hover card: the bounded animation can play again.
  GPU measurements must distinguish app frame submissions from whole-system load.
- Repeat with the three idle-reachable indicators, one per idle window: leave a
  session parked on a tool approval request, turn plan mode on, and raise a
  backend warning banner. After 3.2 seconds none of the permission dot, the
  plan-mode chip, or the warning dot has an active animation, and recording an
  otherwise idle native macOS window shows no continuous frames from them.
  Under reduced motion all three are static from the first painted frame.

### US-UI-68 Session-scoped inline permissions and artifacts (D138/D142)
- Run two sessions concurrently and keep A visible while B reaches a tool
  approval request. Inspect light/dark themes at default and narrow widths.
- Expect no backdrop, modal, page/session switch, work-panel hide, transcript
  replacement, or composer-focus change in A. B retains its pending state.
- Open B explicitly and expect one inline permission card after B's latest
  activity, with readable risk, args, workspace, and wrapping action controls.
  Switching away and back preserves the pending request without a deadline.
- Make A and B pending together, resolve each independently, and confirm neither
  action removes or changes the other card.
- Resolve A's Write/Edit permission and switch to B before completion. Expect no
  transient Review panel in B and no panel/window flash; returning to A restores
  A's prior panel selection with the inline review card in its transcript — the
  edit opened no tab — while B's tabs and Browser resource remain unchanged.

### US-UI-69 Sidebar type balance (D144/D161)
- Open the expanded sidebar in light and dark themes at default and minimum
  supported widths with at least one session, one project group, and the local
  profile footer visible.
- Expect Plugins, footer profile name, and profile menu actions to render at
  the body chrome size (`--text-base` / 14px).
- Expect session/thread titles, project/group titles, and empty-state copy at
  `--text-md` / 13px, with uppercase section labels (`SESSIONS` / `PROJECTS`)
  at `--text-sm` / 12px — never below `--text-md` for primary list content.
- Confirm row pitch remains compact (≈28–32px), titles still truncate cleanly,
  and collapsed icon-rail controls stay legible without reflowing the shell.

### US-UI-70 Disable text correction on editable fields (D145)
- Open empty home, a docked transcript, Settings search, Plugins market search,
  Projects archive search, global search (which now includes commands), provider model combo,
  message-edit textarea, and the work-panel browser URL bar in light and dark.
- Expect every text `input`/`textarea` to expose `spellcheck="false"` (React
  `spellCheck={false}`) plus `autocorrect="off"` and `autocapitalize="off"`.
- Expect no red spelling underlines while typing code-like tokens, paths, model
  ids, or URLs; checkboxes and non-text controls remain unchanged.

### US-UI-71 Composer runtime chip descenders (D150)
- Open empty home and a docked thread with a model ID that contains descenders
  (for example `gpt`, `gemini`, or any id with `g`/`y`/`p`/`q`/`j`).
- Inspect Agent/Plan/Goal, Thinking (when present), permission mode, and the
  model chip in light and dark.
- Expect every chip label to show full glyph ink — bottoms of `g`/`y`/`p` are not
  clipped by the 28px capsule — while long model IDs still ellipsize horizontally.
- **Specs linked**: `04-ux/07-ui-design-system.md` §8.2, `04-ux/08-component-spec.md` §11.5, decisions-log D150
- **Milestone**: M5
- **Status**: Partially automated (renderer source test: chip line-height + no leading-none)

### US-UI-72 Apple-inspired global corner hierarchy (D210)
- Open the empty home, a populated transcript, Settings, Plugins, Project
  archive, a menu, and a dialog at the default supported desktop size in light
  and dark themes.
- Expect fixed corners to follow the global 4/6/8/10/12/14/16/18/20/24px
  ladder, with visually larger or more elevated surfaces receiving the larger
  radii.
- Standard compact and medium buttons and fields remain rounded rectangles,
  not capsules. Pills, segmented selections, status labels, progress tracks,
  switches, equal-width circular icon controls, and dots retain their explicit
  capsule or circle shape.
- Where a rounded child sits against a rounded parent corner, expect the radii
  to read concentrically with the intervening inset. Full-width sidebar,
  titlebar, and work-panel edges remain square rather than becoming floating
  cards.
- Resize to the minimum supported window and inspect menus/dialogs near each
  edge. Rounded surfaces must not clip text, focus rings, actions, or scrollable
  content.
- **Specs linked**: `04-ux/07-ui-design-system.md` §6.2, ADR 0071
- **Milestone**: M5
- **Status**: Partially automated (radius token and shared-control source test)

### US-UI-73 Composer mode selector has stable width
- Open the empty home and a docked thread in both English and zh-CN.
- Open the Composer mode chip and switch between Agent/Plan/Goal several times.
- Expect the chip to list the three modes as checked menu items, to name only
  the committed mode, and to keep one fixed width sized for the longest built-in
  label (English "Agent" / zh-CN "智能体") plus its caret; the adjacent Thinking
  and permission controls, send button, and composer shell do not move or
  resize.
- In Goal, expect the permission chip to remain visible with the same geometry,
  show Full auto / 全自动, and stay disabled without opening a permission menu.
  The Plan/Goal approval card remains the separate execution-policy control.
- **Specs linked**: `04-ux/08-component-spec.md` §11.3
- **Milestone**: M5
- **Status**: Partially automated (renderer style/source contract)

### US-UI-74 macOS native sidebar vibrancy
- Open the desktop app on macOS in both light and dark appearances with the
  sidebar expanded, then exercise the existing collapse/expand path.
- Expect the main window to use native `sidebar` vibrancy with a thin
  theme tint behind `.sidebar` and any rendered `.sidebar-rail`: the material
  follows the app theme (`nativeTheme.themeSource`), so a dark shell stays on a
  dark plate and a light shell stays on a light plate. Desktop content stays
  perceptible through the material and the surface carries a top-to-bottom
  sheen rather than a flat fill. The dock carries no seam or hairline — the
  glass meets the opaque main pane flush, so no hard divider separates the two
  panes. Switching language or other non-theme settings does not rebuild the
  glass. Disabling or uninstalling a selected plugin theme returns native
  chrome to `system`.
- Expect `.main-pane`, `.main-titlebar`, and `.conversation-topbar` to remain
  solid theme surfaces without whole-window transparency or a strong artificial
  blur/card treatment. Sidebar collapse/expand, resize, traffic-light placement,
  and drag/no-drag hit regions remain unchanged.
- **Specs linked**: `04-ux/08-component-spec.md` §1.7, §3.4; decisions-log D304 / D348
- **Milestone**: M6
- **Status**: Partially automated (`macos-sidebar-vibrancy.test.mjs` source contract); native visual verification Draft

### US-UI-75 Light message-edit plate
- Open a populated transcript in light and dark themes and choose Edit on a
  user prompt.
- Expect the inline editor to be a `--ds-tile-deep` plate at
  `--ds-composer-radius` with no outer shadow and no hairline stroke. On
  light theme the 8% ink wash must remain distinct from the `#ffffff` chat
  surface; the composer glow must not appear or get clipped at the plate
  edges. Retry and Cancel stay legible in the footer.
- Focusing the textarea paints an inset 2px accent ring inside the plate;
  Escape or Cancel restores the bubble.

#### E2E-123: asktool renders rich options, reminds the user, and returns answers

- **Preconditions**: Agent, Plan, or Goal mode; a configured provider; a
  session with an active transcript.
- **Steps**: 1) Ask the agent to call `asktool` with a single-select question,
  a multi-select question, and question/option text with Markdown emphasis,
  inline code, and a short list. 2) Confirm each card renders the formatting
  while keeping choices keyboard/selectable. 3) Answer the first question,
  click Next, and select two answers on the multi-select question. 4) Skip the final
  question without entering text. 5) Expand the completed tool row and inspect
  its question-and-answer summary, then inspect the next model response.
- **Expected**: One question is visible at a time; the small indicators show
  answered, current, and skipped states in the composer approval area, at the
  same dock position used by Plan and Goal approval. The request has no
  countdown. Question text and options render at the compact card body size
  (`--text-md`, one step below the surrounding chat body), matching the
  permission card scale in the same dock area. The card shell uses the slim
  rail (2 px accent, 14 px × 16 px padding). Option rows and action buttons
  use the app's compact control density (30 px rows, 15 px marks, 8 px row
  gaps, compact buttons), and the card keeps a relaxed internal rhythm
  (12/14 px indicator margins, `--leading-normal` question line-height). The
  question's option list is bounded to the available viewport height; when a
  fixture contains enough options to overflow, only that list scrolls and the
  question header, custom-answer input, and Skip / Next / Submit actions remain
  reachable. Scrolling the list does not move the conversation page or hide the
  action row. A long question prompt is bounded the same way: the question body
  scrolls inside the card (`min(208px, 24dvh)`, with a `24vh` fallback) and the
  header actions stay outside that scroller. The question body is keyboard
  focusable with a visible focus ring. Next, Skip, and the step indicators open
  each question at the top of that body. The tool output is
  ordered as `question：answer`, uses `、` between multiple answers and `\n---\n`
  between questions, and
  keeps `question：` for the skipped question. Markdown renders as rich text
  without activating embedded links or loading images. Selecting a formatted
  option returns its original Markdown source label. Decline all produces empty placeholders for every
  question and still completes the tool call. The completed row shows the
  ordered questions and answers, keeps multi-select labels separate, marks
  skipped questions with localized copy, and does not expose the structured
  JSON details. Its model-facing result stays unchanged. A pending ask shows a stable
  localized title and the first question in its toast; generated session-title
  text never replaces that title. Background sessions retain the existing
  native notification policy. Exactly one soft chime plays for the ask; the
  toast and native banner do not double it. With a right-docked work panel,
  the toast stays horizontally centered within the main-content safe area and
  never intersects the panel tab strip, browser navigation controls, or URL
  field. It follows both safe-area resize and same-width horizontal shifts.
  Clicking the question toast (including from New task or Settings) opens its
  originating conversation and project, shows the pending card, and permits
  submitting an answer for that request. Enter and Space activate the focused
  message button. Dismiss and text selection do not navigate. Identical prompt
  text from two sessions preserves two independent navigation targets; ordinary
  info toasts stay non-interactive. A history-read failure produces a visible
  error and leaves both the original reminder and question pending. Retrying
  from that same reminder after the read recovers opens the correct chat and
  dismisses the reminder only after navigation succeeds.
- **Specs linked**: `03-runtime/17-asktool-questions.md`,
  `04-ux/11-asktool-question-card.md`, ADR 0077
- **Acceptance**: E (interactive tool output), C (inline card)
- **Milestone**: M5
- **Automated coverage**: `pnpm test:e2e:asktool-card` mounts the production
  component in Electron and covers long-prompt scrolling, keyboard reachability,
  visible header actions, and scroll reset on Next.
  `pnpm test:e2e:question-notification` exercises real renderer event handling,
  safe-area geometry under resize and horizontal shift, toast creation,
  session/project navigation, and answer submission in isolated Electron with
  only the IPC boundary stubbed, plus native keyboard input.
- **Status**: Partially automated (component paths and long-prompt behavior are
  covered; full application journey pending)

- **Request transition regression**: Keep a one-question request pending in chat
  B. In chat A, advance a two-question request to question two, then select B.
  B must show its first question with fresh answer state and a usable composer,
  without rendering the application error screen. Also queue two requests in
  one session: submit the first, answer the second differently, and verify both
  resolutions contain their own request IDs and selected values.

#### E2E-124: Window controls minimize to the taskbar and close to the chosen surface

- **Preconditions**: Built desktop app on macOS, Windows, and Linux; English
  and zh-CN locales are available; a normal main window is open.
- **Steps**: 1) On Windows, maximize the focused main window and click its
  taskbar button; confirm it minimizes while the PI-Desktop taskbar entry
  remains. Click the same taskbar button again; after the restore settles,
  confirm the window remains maximized within the display work area and the
  taskbar stays visible. Cover the window with another app, click the PI-Desktop
  taskbar entry, and confirm it comes to the front without entering the tray. 2) On
-  macOS, click the traffic-light minimize control and confirm it hides the
  window to the tray. On Windows/Linux, use the renderer minimize control and
  confirm the native taskbar entry remains available; click it again and
  confirm the same window restores and focuses. 3) Select Close to tray and
  close the Windows/Linux window; confirm it leaves the taskbar and is
  restored by the tray icon. Select Quit and repeat; confirm the process exits.
  4) Open the tray menu and choose Show, then repeat with Quit. 5) Repeat in
  zh-CN and invoke macOS app activation while the window is tray-hidden.
- **Expected**: Windows native taskbar toggling and the Windows/Linux renderer
  minimize controls keep the taskbar entry and round-trip through native
  minimize/restore. Restoring a maximized frameless Windows window keeps it
  within the display work area and leaves the taskbar visible. A taskbar click
  on a covered window brings it to the front.
  Close to tray is the only Windows/Linux close path that hides the window,
  while Quit exits. On macOS the menu bar icon is a readable transparent
  monochrome PI mark without the rounded application tile, and native minimize
  remains tray-resident. Show/click/double-click/app activation restores the
  existing window; the localized menu contains Show PI-Desktop and Quit
  PI-Desktop. Quit runs the normal shutdown sequence and leaves no orphan host,
  sidecar, or tray process.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  `03-runtime/07-process-model.md`,
  `04-ux/08-component-spec.md`, `04-ux/09-interaction-patterns.md`,
  `08-meta/decisions-log.md` (D216, D230, D252, D256), ADR 0078, ADR 0090,
  ADR 0117, ADR 0123
- **Acceptance**: A (app lifecycle), Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered; native cross-platform tray journey
  Draft (run only in a capable environment when this surface changes)

#### E2E-150: A second launch surfaces the running app instead of starting one

- **Preconditions**: Built desktop app on macOS, Windows, and Linux, installed
  with the default data directory; one instance is running with at least one
  session in its sidebar.
- **Steps**: 1) Launch the app again from the platform's normal entry point
  (Start menu/desktop shortcut, `.AppImage`, `open -n` on macOS) and observe
  both the window and the process list. 2) Minimize the window into the tray,
  then launch again. 3) On Windows/Linux with close behavior `tray`, close the
  window, then launch again. 4) While the app is running, launch a build with
  `PI_DESKTOP_DATA_DIR` set to an empty directory. 5) Still while the packaged
  app is running, start a development build (the `dev` script, with no
  `PI_DESKTOP_DATA_DIR`). 6) Quit the app, confirm no process remains, and
  launch once more.
- **Expected**: Steps 1–3 never create a second window, tray icon, host-core,
  agent sidecar, or log file: the existing window is restored and focused, the
  duplicate process exits, and the running instance's session list, in-flight
  turn, and `pi.sqlite` are untouched. Step 4 starts normally as an independent
  instance against its own data directory. Step 5 also starts normally: the
  development build takes its own `userData` and `~/.pi-desktop-dev`, so it
  neither waits for nor disturbs the running packaged app. Step 6 starts a clean
  single instance, proving the lock is released on exit and never leaves a stale
  block.
- **Specs linked**: `03-runtime/07-process-model.md`,
  `08-meta/decisions-log.md` (D236, D599, D002), ADR 0094
- **Acceptance**: A (app lifecycle), Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered; native cross-platform relaunch
  journey Draft (run only in a capable environment when this surface changes)

#### E2E-125: Complete bilingual VitePress documentation remains usable

- **Preconditions**: Docs dependencies are installed and the VitePress preview
  server is running from the repository.
- **Steps**: 1) Open `/` at 1440×900 and verify the English landing page,
  system map, read-by-intent journeys, reference shelf, global search,
  Guide/Specs/ADRs navigation, and language selector. 2) Switch to `/zh-CN/`
  and verify the translated hero, mirrored topic map, and Chinese specification
  links. 3) Open `/spec/03-runtime/01-ipc-protocol`, switch languages, and
  verify that `/zh-CN/spec/03-runtime/01-ipc-protocol` contains translated prose,
  preserved code identifiers, and a link back to the English source. 4) Search
  in each locale and open a matching result. 5) Repeat the homepage and a long
  table-heavy specification at 390×844 in light and dark mode.
- **Expected**: Both locale entry points and every English/Chinese specification
  pair render without broken links or page-level horizontal overflow. Landing
  and reading columns are visually centered within their available layout; the
  mobile hero presents text before the system visual. Search returns local
  results. The mobile navigation opens and closes without shifting or obscuring
  the page. Code blocks and tables remain readable through contained scrolling,
  theme contrast stays clear, and every Chinese spec identifies the English
  page as its canonical source. Directly refresh `/zh-CN/spec/README`,
  `/zh-CN/spec/03-runtime/01-ipc-protocol`, `/zh-CN/adr/`, `/spec/README`, and
  `/adr/README` on Vercel; each route resolves through the documented
  `cleanUrls` configuration instead of returning 404.
- **Specs linked**: `02-architecture/04-documentation-site.md`, ADR 0079
- **Acceptance**: Quality, documentation discoverability, responsive layout
- **Milestone**: M6+
- **Status**: Browser-rendered desktop/mobile verification is authorized for
  this documentation redesign; remote deployment refresh checks remain Draft.

#### E2E-126: Appearance card selects a global UI font

- **Preconditions**: App running on macOS with an installed system font
  distinct from the built-in token stack (for example PingFang SC); a clean
  `~/.pi-desktop` profile.
- **Steps**:
  1) Open Settings → Appearance and confirm the Interface card shows a Font row
     below Theme and Language with a trigger labeled "System default".
  2) Open the Font picker and confirm it lists System default followed by
     installed system families only — no bundled open-licensed families and no
     license badge on any row; confirm the search input filters families and the
     current selection shows a check badge; confirm the menu opens as a floating
     layer above the card (not clipped or squeezed inside it) and stays readable
     when the card is near the bottom edge of the window; with many installed
     families, confirm the list opens without an input stall and scrolls
     immediately (only the visible rows are rendered, with an overscan buffer).
  3) Select an installed system family (for example PingFang SC) and confirm the
     trigger label and the whole UI re-render in that family without a reload,
     including CJK fallback rendering for Chinese text.
  4) Reopen the picker and confirm the family is still selected, then select
     System default and confirm the UI returns to the built-in token stack
     immediately.
  5) Restart the app and reopen Settings and confirm the default is still
     applied (the override is cleared, persisting an empty
     `AppSettings.fontFamily`).
  6) With a profile whose stored stack names a formerly bundled family (for
     example `"Geist", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei",
     sans-serif`), confirm the Font row shows that family under the Saved group,
     that no font file is loaded from the app, and that the UI renders through
     the system CJK fallback tier.
- **Expected**: The Font row is a searchable picker whose trigger previews the
  current family in that face; options are System default and the installed
  system families enumerated by Electron main via
  `pi-desktop/app/systemFonts` (cached 60 s, hidden `.`-prefixed families
  excluded); the app ships no font files, so no bundled group and no license
  badge appear, and a stored stack that matches no option stays listed first
  under Saved; selection persists as a CSS stack in `AppSettings.fontFamily` and
  overrides `--font-sans` live; Chinese text stays readable through the
  system-only CJK fallback tier; the menu is a body-level floating layer that is
  never clipped by the settings card; the option list is windowed with fixed row
  heights and an overscan buffer so only the visible slice is in the DOM, keeping
  opening, scrolling, and typing responsive regardless of how many families
  are installed; System default clears the override by persisting an empty
  stack.

- **Specs linked**: `04-ux/06-settings-ia.md`, `04-ux/07-ui-design-system.md`,
  `03-runtime/01-ipc-protocol.md`, ADR 0083, ADR 0298
- **Acceptance**: A (core shell), H (localization)
- **Milestone**: M5+
- **Status**: Documented

#### E2E-193: Appearance card sets a global type scale

- **Preconditions**: App running with a clean `~/.pi-desktop` profile and an
  open conversation that shows transcript text, the composer, and the sidebar.
- **Steps**:
  1) Open Settings → Appearance and confirm the Interface card shows a Font
     size row below Font, with Grande selected and the slider at 100%.
  2) Choose Venti. Confirm chat transcript, composer, settings labels,
     sidebar session titles, and Lucide chrome icons all enlarge without a
     reload, keeping their relative steps, and that the control shows 115%.
  3) Drag the slider to 125%. Confirm Trenta becomes selected and
     every `--text-*` surface and icon grows further. Confirm the UI never
     shows a px field.
  4) Open the Browser and Files work-panel tabs, then use Zoom In and Reset
     Zoom. Confirm window zoom still scales chrome, that the type scale
     remains 125% after reset, and that both docked plugin pages follow it:
     their text and controls keep the same proportion as the app, and the
     Browser guest page still fills the area under its per-type-size toolbar.
  5) Restart the app and confirm the 125% scale is still applied
     (`AppSettings.fontScale` = 1.25).
  6) Choose Grande. Confirm the whole UI returns to 100% immediately;
     restart and confirm the default remains.
- **Expected**: Font size is Starbucks-style cup presets Tall / Grande /
  Venti / Trenta
  plus a percentage slider 80%–150% in 2.5% steps. Selection persists as
  `AppSettings.fontScale` (absent means 1) and sets `--font-scale`, multiplying
  every `--text-*` token and shared Lucide icon. Window Zoom In/Out/Reset remains
  independent.
  Docked plugin work-panel views (the bundled Browser and Files pages) repeat
  that multiplier — times the window zoom — as their own page zoom instead of
  importing the app tokens, so they stay in proportion at every setting, and a
  `pi.browser` guest rect is converted with the same factor. Detached plugin
  windows and widgets keep their own base size.
  Invalid values are rejected or clamped. No protocol or schema version bump.
- **Specs linked**: `04-ux/06-settings-ia.md`, `04-ux/07-ui-design-system.md`,
  ADR 0180, D343
- **Acceptance**: A (core shell), B (settings), H (localization)
- **Milestone**: M5+
- **Status**: Unit-covered (`packages/shared/src/font-size.test.ts`,
  `apps/desktop/test/settings-font-size.test.mjs`,
  `apps/desktop/test/plugin-view-scale.test.mjs`,
  `apps/desktop/test/browser-guest-hole-scale.test.mjs`); full UI journey Draft
  (run only in a capable environment when this surface changes)

#### E2E-127: macOS keeps the app in the Dock and Cmd+Tab

- **Preconditions**: Built desktop app on macOS; the plugin launcher shortcut
  (Option+Space) is registered; at least two Spaces and one other application
  running fullscreen.
- **Steps**:
  1) Launch the app without opening the launcher and confirm it appears in the
     Dock and in the Cmd+Tab switcher (`lsappinfo list` reports
     `type="Foreground"`, not `type="UIElement"`).
  2) Press Option+Space, confirm the launcher panel appears focused with a
     typable input, dismiss it, and confirm the app is still in Cmd+Tab.
  3) Put the main window in fullscreen, press Option+Space, and confirm the
     panel floats above it.
  4) Switch to a second regular Space and confirm Option+Space shows the panel
     there.
  5) Minimize the main window into the tray, switch to another app, then Cmd+Tab
     back to PI-Desktop and confirm the window returns focused; repeat with a
     Dock click and with the tray Show item.
  6) With the main window hidden, press Option+Space and confirm only the
     launcher appears — the main window stays hidden until it is restored.
- **Expected**: The process never adopts the accessory activation policy, so
  Dock and Cmd+Tab presence survives launcher warm-up and every launcher
  invocation; the launcher stays focusable, covers all regular Spaces and the
  app's own fullscreen window (overlaying another app's fullscreen Space is
  out of scope and activates PI-Desktop instead); activation from Cmd+Tab, App
  Exposé, the Dock, or the tray restores a tray-hidden window, while launcher
  and plugin-panel activation leaves it hidden.
- **Specs linked**: `03-runtime/07-process-model.md`, ADR 0086, ADR 0078,
  ADR 0080
- **Acceptance**: A (core shell)
- **Milestone**: M5+
- **Status**: Documented

#### E2E-128: Revealed work panel with no resource offers available views

- **Preconditions**: App running with a project open and an active conversation
  that has produced no file, URL, or review artifact, so the session's work
  panel context holds no tabs.
- **Steps**:
  1) Press `Cmd/Ctrl + J` and confirm the panel appears with an empty body that
     shows the title "New" and Review plus Browser/in-scope plugin-view rows —
     not a blank area below the title bar.
  2) Tab into the available rows and confirm each takes a visible focus ring
     and that hovering a row shows only a background fill.
  3) Activate Browser or a plugin view and confirm its singleton tab is created
     and selected; the empty body and its view list disappear.
  4) Click `+` to create a New launcher tab, activate the same view from its
     body, and confirm it selects the existing tab rather than creating a
     second one.
  5) Close the view tab and confirm the panel remains open on the New launcher
     when it was the last tab; press `Cmd/Ctrl + J` again and confirm it hides.
  6) Repeat step 1 in Chinese and in both light and dark themes, and at the
     244px panel minimum, confirming the copy wraps rather than clipping.
- **Expected**: `Cmd/Ctrl + J` reveals the panel without creating a tab, and the
  New launcher lists the same Review/plugin-view entries as its `+`-created
  page; a row creates or selects that singleton view. Each `+` click creates a
  separate closable New tab. Closing the final tab leaves the panel open on New.
  The no-tab empty body is not exposed as a `tabpanel`; explicit New tabs are
  labelled tabpanels. Their rows are buttons in a `role="group"` labelled
  Tools. Panel empty states share the app's empty-state
  proportions with no action button in the "open a project" states.
- **Specs linked**: `04-ux/08-component-spec.md` §5.2, §5.2.1, §5.3, §5.4, §5.5,
  `04-ux/07-ui-design-system.md`, ADR 0108
- **Acceptance**: A (core shell), H (localization)
- **Milestone**: M5+
- **Status**: Documented


#### E2E-129: A run row shows its command once and copies it from the head

- **Preconditions**: App running with a project open and a conversation that has
  produced at least three command rows: one that succeeded with output, one that
  failed with both output and errors, and one still running.
- **Steps**:
  1) Leave the running row collapsed while it produces output and confirm the
  row remains a compact one-line status; then click its disclosure while the
  command is still running and confirm the current output appears immediately.
  1a) Keep the command running through enough output to exceed the output area's
  visible height and confirm the output stays inside its capped scroll region,
  rather than pushing the transcript out of view. Confirm later output replaces
  the same body in place while the row remains open.
  1b) Expand the successful row and confirm the body shows the command's output
     as plain text — no `Output` heading, no bordered card, no per-block copy
     button — and that the command is not repeated inside the body, with no
     argument list in its place.
  2) Confirm each row's head states its outcome to the right of the summary:
     `Done`, `Failed`, `Denied`, or `Working…`, each with a dot in the matching
     tint, and that the running row shows the pulsing dot instead of the row
     spinner.
  2a) Run a command that exits non-zero (`pnpm test` on a failing suite, or
     `false`) and confirm the row reads `Failed` with the error dot and opens
     itself, even though the tool call completed. Confirm the exit-code chip and
     the worded outcome agree.
  2b) Interrupt a long command so the shell is killed with no exit code, and
     confirm the row reads `Failed` rather than `Done`.
  3) Hover the successful row and confirm a copy button and the chevron appear
     between the summary and the row's right edge; move the pointer away and
     confirm both fade while the status label stays visible.
  4) Activate the copy button and confirm the clipboard holds the command as it
     was issued — a multi-line command keeps its line breaks, unlike the
     single-line summary in the head — and that the button acknowledges the copy
     before returning to its idle icon.
  5) Confirm the hover fill covers the whole head, including the copy button and
     chevron, and that a row with nothing to expand takes no fill at all.
  6) Tab through the row and confirm the header is the only stop that toggles
     the body, the copy button is reachable and takes a visible focus ring
     (revealing itself on focus), and the chevron is never a tab stop.
  7) With a screen reader, expand and collapse the row and confirm the outcome
     is announced once, not twice.
  8) Ask the agent to run a command that requires approval and confirm the
     permission card still shows the command it is asking about.
  9) Enable "reduce motion" and confirm the running dot holds still and the copy
     button appears without a fade.
  10) Repeat steps 1–3 in Chinese and in both light and dark themes.
- **Expected**: A command appears exactly once per row, in the head, alongside a
  copy control that yields it verbatim and a worded outcome that does not rely
  on the dot's color. The outcome reports what the command did — a non-zero or
  missing exit code reads `Failed` regardless of the tool call's own status — and
  a row with nothing to report states nothing instead of claiming `Done`. The
  running row is collapsed by default, and expanding it during execution shows
  the cumulative `details.output` stream in the stdout channel. The body keeps
  the live output in a capped internal scroll region and updates in place without
  rerendering unrelated rows; the completed `details.stdout` value wins over any
  older partial snapshot. The expanded body holds only what the command printed,
  as bare text, and a command that printed nothing opens empty rather than
  falling back to its arguments.
  Approval cards are unaffected, since they have no head of their own.
- **Specs linked**: `04-ux/08-component-spec.md` §9.2, §9.3, §9.5, §9.10
- **Acceptance**: E (tools & permissions), H (localization)
- **Milestone**: M5+
- **Status**: Documented

#### E2E-130: Read mints a tag that an Edit consumes without re-reading

- **Preconditions**: A project-bound Agent session with a writable workspace and
  a source file of at least 300 lines. The provider fixture can emit an exact
  `Edit` payload.
- **Steps**:
  1. `Read` the file with no `offset` and record the `[path#TAG]` header, the
     `tag` field, and the `N:` prefixes on the returned lines.
  2. Emit `Edit` with that `tag` and a single `PUT N.=M:` whose body replaces two
     lines inside the read window.
  3. Confirm the successful result reports a new `tag`, then emit a second `Edit`
     with the returned tag and a `PUT >$:` append, with no intervening `Read`.
  4. `Read` a 200-line window at an `offset`, then `Edit` a line inside that
     window using the tag from the windowed read.
  5. Reopen the file on disk and compare it to the intended content byte for
     byte.
- **Expected**: The header tag is the whole-file tag, not the window's, so a
  windowed read anchors correctly; line numbers are absolute and unaffected by
  `offset`. Both edits apply, the second without any re-read, and each success
  returns the post-write tag. The file on disk matches the intended content
  exactly, with its original line endings and BOM state preserved.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §3, §4.2, §5,
  §6, §9, `03-runtime/16-tool-result-limits.md` §5, ADR 0087
- **Acceptance**: E (tools & permissions)
- **Milestone**: M5+
- **Status**: Documented

#### E2E-131: An edit on never-displayed lines is rejected and the retry succeeds

- **Preconditions**: A session that has read only lines 1–50 of a 400-line file.
  A second fixture file has one line longer than 16,384 characters.
- **Steps**:
  1. Emit `Edit` with the correct `tag` and a `PUT 300.=301:` op.
  2. Inspect the error code and confirm the message inlines the current content
     of lines 300 and 301.
  3. Retry the identical `Edit` payload, unchanged, including the same `tag`.
  4. Emit `Edit` with the correct tag and a `PUT 5.=60:` op spanning 56 unseen
     lines, and inspect the reveal.
  5. Retry that identical payload unchanged.
  6. `Read` the second fixture, confirm the long line is clipped and counted in
     `notice`, then `Edit` that clipped line.
- **Expected**: Step 1 fails with `EDIT_LINES_UNSEEN` and the file is unchanged.
  Step 3 applies, because the complete reveal merged those lines into the
  session's provenance. Step 4 fails with a reveal truncated at 40 lines that
  says to re-read the range, and step 5 fails again — a truncated reveal merges
  nothing, so the guard cannot be walked past in under-cap slices. Step 6 fails
  with `EDIT_LINES_UNSEEN`: a clipped line was never displayed.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §4.3, §9.1,
  §11, §12, `03-runtime/16-tool-result-limits.md` §2, ADR 0087
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5+
- **Status**: Documented

#### E2E-132: Gap inserts, deletes, and multi-op payloads apply against one snapshot

- **Preconditions**: A read file whose content is known line by line.
- **Steps**:
  1. Emit one `Edit` combining `PUT <1:`, `PUT >40:`, `CUT 12.=14`, and
     `PUT 80.=80:` in a single `ops` payload.
  2. Compare the result against the same four changes computed against the
     original line numbering.
  3. Emit `PUT >$:` on the same file and confirm the append lands after the final
     line with exactly one terminating newline.
  4. Emit an `ops` payload whose body row starts with a literal `-` written as
     `+- item`, and one with a literal `+` written as `++ item`.
  5. Emit an `Edit` whose `PUT` body exactly reproduces the range's current
     content.
- **Expected**: Every anchor indexes the tagged snapshot, so no op shifts
  another and the combined result equals the four independent changes. `+-` and
  `++` write a single leading `-` and `+`. Step 5 returns `EDIT_NO_CHANGE` rather
  than reporting a successful write of nothing, and leaves no review record.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §7.2, §7.3,
  §7.4, §8.1, §9.3, ADR 0087
- **Acceptance**: E (tools & permissions)
- **Milestone**: M5+
- **Status**: Documented

#### E2E-133: Block ops resolve, echo their span, and decline instead of guessing

- **Preconditions**: Read fixtures in a supported grammar (a Rust file with a
  decorated/attributed function), a Markdown file with nested headings, and a
  file in a language outside the supported grammar list.
- **Steps**:
  1. Emit `PUT N*:` anchored on the `fn` line of a function whose declaration
     carries an `#[attribute]` line above it, and inspect the echoed
     `{anchorLine, start, end, op}`.
  2. Repeat anchored on the attribute line and compare the echoed span.
  3. Emit `PUT >N*:` on the same opener and confirm the insertion lands after the
     block's last line at sibling indentation.
  4. Emit `CUT N*` anchored on a lone `}` closer.
  5. Emit `PUT N*:` on a `##` heading in the Markdown fixture and confirm the
     span reaches the next same-or-higher heading, not the next deeper one.
  6. Emit `PUT N*:` in the unsupported-language file.
  7. Introduce a syntax error into the Rust fixture, re-read, and emit a block
     op.
- **Expected**: Step 1's span starts at the `fn` line and excludes the
  attribute; step 2's includes both — the difference is visible in the echo
  before the model has to infer it. Steps 4, 6, and 7 fail with
  `EDIT_BLOCK_UNRESOLVED` and a message naming the plain-range alternative;
  neither approximates a span. Range and gap ops still work in the unsupported
  language.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §8.2, §11,
  §12, ADR 0087 §4
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5+
- **Status**: Documented

#### E2E-134: Registers move code within a call and across calls

- **Preconditions**: Two read files in the same session.
- **Steps**:
  1. In one `Edit`, emit `CUT 20.=30` followed by `PUT <5 ` with no register
     label, and confirm the lines moved within the file.
  2. In one `Edit`, emit two `CUT` ops with no labels followed by one unlabeled
     paste.
  3. Emit `CUT 40* @fn` on the first file, then in a separate `Edit` call emit
     `PUT <10 @fn` on the second file.
  4. Emit `PUT <10 @missing` for a register that was never set.
  5. Emit `PUT 10.=12 @fn` with a body row attached.
  6. Emit `PUT <1 ` with no label in a fresh `Edit` call that performed no
     capture.
  7. Delete the source file, then paste `@fn` again in a later call.
- **Expected**: Step 1 applies as one move with no duplicated or orphaned lines.
  Step 2 fails with `EDIT_REGISTER_AMBIGUOUS` instead of using the most recent
  capture. Step 3 completes the cross-file move across two calls, each with its
  own permission gate, review record, and artifacts row. Steps 4 and 6 fail with
  `EDIT_REGISTER_EMPTY` — the anonymous register did not survive the earlier
  call. Step 5 fails with `EDIT_PARSE_FAILED`. Step 7 still pastes: a register
  holds captured content, not a live reference.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §7.5, §8.3,
  §11, §13.2, ADR 0087 §5
- **Acceptance**: E (tools & permissions)
- **Milestone**: M5+
- **Status**: Documented

#### E2E-135: A drifted file recovers when remapping is provable and fails when it is not

- **Preconditions**: A read file whose tag is recorded. An external process can
  modify the file between the read and the edit.
- **Steps**:
  1. Insert 10 unrelated lines above the edit target from outside the session,
     then emit the original `Edit` with the stale `tag`.
  2. Inspect the warning on the successful result and confirm the change landed
     at the shifted location, not at the original line numbers.
  3. Repeat with a change that modifies one of the anchor lines themselves.
  4. Repeat with a change that inserts lines *between* two anchors of a
     multi-op payload, so the anchors would move by different offsets.
  5. Repeat with a `CUT` whose captured interior lines were externally edited.
  6. Repeat after the session itself has written the file twice, using the tag
     from the first write.
  7. Repeat with a duplicated anchor line whose one neighboring context line
     matches but whose other does not.
- **Expected**: Step 1 applies with a line-remap plus external-change warning.
  Steps 3, 4, 5, and 7 fail closed with `EDIT_TAG_MISMATCH` and current content;
  none of them writes. Step 6 applies with a session-chain warning instead of an
  external-change warning, because the corrective advice differs. No recovery
  path ever writes the tagged snapshot's content over the live file.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §9, §10, §11,
  ADR 0087 §6
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5+
- **Status**: Documented

#### E2E-136: A stale tag still applies for head and tail inserts

- **Preconditions**: A read file whose tag is recorded, plus an external writer.
- **Steps**:
  1. Modify the middle of the file externally, then emit `PUT >$:` with the stale
     tag.
  2. Repeat with `PUT <1:` and the same stale tag.
  3. Repeat with a payload that mixes `PUT >$:` and an anchored `PUT 50.=50:`.
  4. Emit an `Edit` whose `tag` is well formed but was never recorded for that
     path in this session.
  5. Emit an `Edit` with a `tag` that is not four hex digits.
- **Expected**: Steps 1 and 2 apply with a drift warning, because neither anchor
  can be moved by content drift. Step 3 does not take the position-stable path:
  it goes to recovery and, failing that, to `EDIT_TAG_MISMATCH`. Step 4 returns
  `EDIT_TAG_UNKNOWN` and step 5 returns `EDIT_TAG_REQUIRED`; neither is reported
  as a generic `TOOL_FAILED`.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §9, §11,
  `03-runtime/08-error-codes.md` §3.4
- **Acceptance**: E (tools & permissions)
- **Milestone**: M5+
- **Status**: Documented

#### E2E-137: Boundary repair fixes an off-by-one edge and refuses a tie

- **Preconditions**: A read source file with nested closing delimiters.
- **Steps**:
  1. Emit a `PUT N.=M:` whose range includes one trailing `}` that the body does
     not restate, and inspect the result and its warning.
  2. Emit a `PUT N.=M:` whose body restates a line that sits immediately outside
     the range.
  3. Emit a payload constructed so that two distinct repaired texts tie at the
     minimum repair cost.
  4. Emit a payload against a file that already fails to parse, and confirm the
     repair does not retain a row on parse-success evidence alone.
- **Expected**: Steps 1 and 2 apply with a warning naming exactly what was
  repaired, so a silent structural change is impossible. Step 3 returns
  `EDIT_REPAIR_AMBIGUOUS` rather than choosing; step 4 does not invent a
  retention. In every case the file either contains the repaired result described
  in the warning or is untouched.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §8.4, §11,
  ADR 0087
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5+
- **Status**: Documented

#### E2E-138: Move, remove, and rollback keep review evidence honest

- **Preconditions**: A project-bound session with Review visible and a read file
  inside the workspace root.
- **Steps**:
  1. Emit `Edit` with a `PUT` op plus `MV DEST` in the same `ops` payload.
  2. Inspect the review records for the tool call and the Review panel rows.
  3. Roll the change back and confirm both the source and the destination
     return to their pre-call state.
  4. Emit `Edit` with `REM`, then roll it back.
  5. After a rollback, emit an `Edit` using the tag the session held before the
     rollback.
  6. Emit `Edit` on a path that does not exist but whose basename and tag match
     exactly one file this session recorded, and inspect the warning.
  7. Repeat step 6 with two recorded candidates sharing that basename and tag.
  8. Emit `MV` to the source itself, `./source`, `sub/../source`, and its
     absolute path, plus a directory symlink (Windows junction) pointing back
     to its directory; on a case-insensitive filesystem also use a case-only
     alias. Repeat with a
     content-changing `PUT` in the same call, then use the original Read tag
     for a valid content edit.
- **Expected**: Step 1 records a source deletion and a destination creation under
  one tool call; step 3 restores both or neither. Step 4's rollback restores the
  captured bytes, hash-guarded on the full digest rather than the 16-bit tag.
  Step 5 fails rather than editing against content the rollback replaced. Step 6
  rebinds to the real file with a warning, and the write-permission gate is
  evaluated against the rebound path; step 7 declines instead of picking one.
  Step 8 returns `EDIT_NO_CHANGE` without writing or deleting the source, and
  the original Read tag remains usable for the following valid edit.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §9.2, §13.1,
  `03-runtime/03-tools-and-permissions.md` §4c, ADR 0043, ADR 0087
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5+
- **Status**: Documented

#### E2E-139: Snapshot provenance is per session and bounded

- **Preconditions**: A subagent-capable session (§5f), a second session on the
  same workspace, and a fixture with more files than the snapshot store's path
  bound.
- **Steps**:
  1. Read a file in the parent session, then have a delegate `Edit` that file
     using the parent's tag without reading it first.
  2. Read a file in session A and emit the same `Edit` payload from session B.
  3. Read more distinct paths than the store retains, then edit the
     first-read path with its original tag.
  4. Read one path five times with changing content between reads, then edit
     using the tag from the first read.
  5. Read a file, then read the identical unchanged file twice more at
     different offsets, and confirm one tag covers all three windows.
  6. Restart the app, then emit an `Edit` with a tag from before the restart.
  7. Write a file through a path that a save hook reformats, then `Edit` using
     the tag the write returned.
- **Expected**: Steps 1 and 2 fail — provenance is per reader, and no session
  hands another its tags. Steps 3, 4, and 6 fail with `EDIT_TAG_UNKNOWN` and an
  instruction to re-read, never with a wrong write. Step 5 applies anywhere in
  the union of the three windows without a fourth read. Step 7 applies, because
  the recorded tag describes the bytes that actually landed, and the drift is
  reported as a one-line warning rather than a whole-file diff.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §4.2, §4.4,
  §5.4, §13.5, `03-runtime/02-agent-runtime.md` §5f, ADR 0087 §3
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5+
- **Status**: Documented

#### E2E-140: Recoverable edit failures each get one retry before the guard counts three

- **Preconditions**: A session with one file read, and a way to make the file
  drift on disk between calls.
- **Steps**:
  1. Let the file drift, then emit an `Edit` with the now-stale tag whose anchors
     cannot be remapped, so it fails with `EDIT_TAG_MISMATCH`.
  2. Re-read, then emit an `Edit` anchored on lines the session never displayed,
     so it fails with `EDIT_LINES_UNSEEN` and a truncated reveal.
  3. Emit an `Edit` on that same path with a malformed op header.
  4. Emit a second `Edit` with a malformed op header.
  5. Emit a third `Edit` with a malformed op header.
- **Expected**: Steps 1 and 2 return their own codes with no `terminate` hint —
  each recoverable code spends its single grace on that path, and the turn keeps
  going, so the agent can act on what the error handed it. Steps 3 and 4 count as
  attempts 1 and 2 and still do not terminate. Step 5 terminates. A successful
  `Edit` inserted anywhere before step 5 resets the count, so the following
  failure is attempt 1 again.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §9.3, §11,
  `03-runtime/03-tools-and-permissions.md` §4d, ADR 0087, ADR 0207
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5+
- **Status**: Documented

#### E2E-141: An exhausted retry budget ends the turn with a visible, retriable row

- **Preconditions**: A session where `Edit` on one path fails with a
  non-recoverable code every time.
- **Steps**:
  1. Emit three failing `Edit` calls on the same path within one prompt.
  2. Observe the transcript after the agent loop stops.
  3. Send a follow-up prompt in the same session.
  4. Repeat with three failing `apply_patch` shell commands instead of `Edit`.
- **Expected**: The third call carries the termination hint and the loop stops,
  but the turn does not merely complete: the transcript ends on an assistant
  error row with `MUTATION_RETRY_BUDGET_EXHAUSTED`, marked retriable, naming the
  path and the next action, and the same code arrives as an error event. When the
  last error is `EDIT_PARSE_FAILED`, the row's recovery hint explains the syntax
  correction — for example, a body-bearing `PUT 48.=48` must be written as
  `PUT 48.=48:` — and does not tell the agent to re-read solely to repair the
  malformed payload. The turn is recorded as failed rather than completed with
  no final message. Step 3 proceeds normally — the guard's counters are per
  prompt. Step 4 produces the same row with `details.kind` of `patch-command`.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §9.3,
  `03-runtime/03-tools-and-permissions.md` §4d,
  `03-runtime/08-error-codes.md` §3.3, ADR 0087
- **Acceptance**: E (tools & permissions), C (chat & stream)
- **Milestone**: M5+
- **Status**: Documented
#### E2E-156: Edit tool succeeds on files with CRLF line endings

- **Preconditions**: A workspace containing a file with Windows-style CRLF
  (`\r\n`) line endings.
- **Steps**:
  1. Use Read to display the file content and record the whole-file `tag`.
  2. Issue an Edit with that `tag` and a `PUT N.=N:` whose body uses LF-only
     endings (as the model always produces from Read output).
  3. Inspect the file on disk after the edit.
- **Expected**: The Edit succeeds and returns a new `tag`. The written file
  preserves CRLF line endings throughout — both in modified and unmodified
  lines. No `MUTATION_RETRY_BUDGET_EXHAUSTED` error occurs.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §3.1,
  `03-runtime/03-tools-and-permissions.md`
- **Acceptance**: E (tools & permissions)
- **Milestone**: M5
- **Status**: Documented

#### E2E-EDIT-legacy-replacement-preserves-unmatched-text: A legacy Edit replaces only the matched text

- **Preconditions**: A workspace with an LF file containing `let x = foo;`,
  `value = 1; // keep me`, and a two-line statement, plus a CRLF copy of the
  first line.
- **Steps**:
  1. Issue an `Edit` with only `path`, `old_string` `= foo;`, and `new_string`
     `= bar;` (no `tag`, no `ops`).
  2. Issue a legacy `Edit` whose `old_string` is `value = 1;`, then one whose
     `old_string` starts mid-line and ends mid-line on the following line.
  3. Issue a legacy `Edit` whose `old_string` is a whole line including its
     newline and whose `new_string` is empty.
  4. Repeat step 1 on the CRLF file, then issue one legacy `Edit` whose
     `old_string` is not in the file.
  5. Compare every file on disk to the intended content byte for byte.
- **Expected**: Each replacement succeeds and returns a new `tag`, and only the
  matched text changes: the line reads `let x = bar;`, the trailing comment
  survives, the multi-line match keeps the text before its start and after its
  end, the whole-line deletion removes that line without leaving a blank line or
  touching its neighbours, and the CRLF file keeps CRLF endings. The missing
  `old_string` fails with `EDIT_LEGACY_MATCH_FAILED` and leaves the file
  unchanged. A replacement whose only effect would be toggling the terminal
  newline fails with `EDIT_NO_CHANGE` and leaves the file unchanged.
- **Specs linked**: `03-runtime/18-line-anchored-edit-contract.md` §11
- **Acceptance**: E (tools & permissions)
- **Milestone**: M5+
- **Status**: Automated (host-core unit tests:
  `edit_legacy_replacement_preserves_unmatched_bytes`,
  `edit_legacy_identical_replacement_leaves_file_unchanged`,
  `edit_legacy_terminal_newline_only_change_reports_no_change`,
  `edit_accepts_legacy_old_string_new_string_shape`)

#### E2E-142: Background delegation converges through TaskWait and honors permission scopes

- **Preconditions**: A project-bound Agent session whose permission mode can be
  switched between `ask`, `accept-edits`, and `auto`, with a provider whose
  stream can be driven; the five builtin subagents (`explorer`,
  `code-reviewer`, `test-runner`, `fixer`, `ui-designer`) and a global
  `~/.agents/subagents/readonly.md` definition. Builtins use the default
  `permission: inherit` behavior.
- **Steps**:
  1. Prompt a turn in which the assistant emits two `Task` calls — `explorer`
     on one direction and a second `explorer` on another — in one assistant
     message, then, without ending the turn, continues its own tool calls and
     converges with `TaskWait`.
  2. Confirm the parent's visible text keeps streaming between `Task` and
     `TaskWait` (no dead turn), that the two `Task` rows form one delegation
     card that opens once, and that `TaskWait`'s row shows both reports.
  3. With the session in `ask`, prompt a turn that delegates to `fixer` with a
     multi-file spec. Confirm its `Write`/`Edit`, `Bash`, and external-path
     calls each render a card naming `fixer`. Switch the session to
     `accept-edits` and confirm only `Write`/`Edit` inside the workspace are
     auto-allowed. Switch it to `auto` and confirm the same delegate's
     `Write`/`Edit`, `Bash`, and external `Glob`/`Write` calls all resolve
     without a second authorization card.
  4. Prompt a turn that starts three delegates and then calls `TaskWait` with
     `mode: "any"`, `minCompleted: 1`; confirm it returns as soon as the first
     settles and that the still-running delegates keep running.
  5. Prompt a turn that starts a delegate and then ends the turn without
     `TaskWait`/`TaskStop`; confirm the delegate is stopped at run end and its
     node reads `aborted`, and that the next turn's model context contains no
     delegate rows.
  6. Prompt ten `Task` calls in one turn and one more; confirm the eleventh
     fails as a tool error naming the 10-delegate cap, and that `TaskStop`
     frees a slot so an eleventh delegation can start.
  7. Reload the session; confirm the delegation card, its nodes, and the
     `TaskWait` rows persist and re-render collapsed, and that `TaskWait`
     re-reads a settled delegation's report by id without re-running it.
  8. Prompt a turn where the agent starts two Task calls and then emits visible
     text before calling TaskWait (so Task and TaskWait land in different
     activity parts); confirm the topology card shows "completed" status on
     both nodes once TaskWait returns, not stuck at "running", and that each
     node shows a non-zero runtime duration derived from the delegation
     lifecycle timestamps rather than the immediate `Task` start call.
  9. Edit `~/.agents/subagents/readonly.md` to declare `permission: auto` and reload the
     catalog; confirm the definition still loads but carries a warning, and
     that its delegate still resolves under the session's effective mode (a
     `Write` inside the workspace still raises a permission card).
  10. Prompt a turn that starts a delegate, lets `TaskWait` time out so the
      node still says running, then calls `TaskStop`; confirm the topology
      node and the `TaskStop` row both read `stopped` (not `running`). End the
      turn and reload the session; confirm the card is not labelled working
      and does not keep ticking elapsed.
  11. Inject synchronous `SubagentRun` initialization failure; confirm the
      `Task` result is an error and `TaskList` has no permanently running row.
  12. In a runtime fixture, make settled-row publication throw and confirm the
      parent's idle auto-resume still returns the report. Stop a parent blocked
      in auto-resume while a child ignores abort; confirm the parent ends and
      reports idle without a timeout loop.
- **Expected**: `Task` returns immediately with a `delegationId` and the parent
  keeps working; `TaskWait` converges with per-delegation reports and statuses;
  every terminal child state wakes the parent even if transcript publication
  fails. A synchronous child initialization failure returns a tool error and
  leaves no `running` delegation. User Stop/Dispose abort the parent wait as
  well as delegates, and cancelled sessions do not remain `AGENT_BUSY` solely
  because a child is still settling. `TaskList`/`TaskStop` drive the lifecycle;
  a `TaskStop` result and a finished turn never leave a live “Subagent working”
  card; builtin `fixer` inherits the selected session permission mode, so
  `auto` also covers explicit external paths without a duplicate authorization
  prompt while `ask` and `accept-edits` retain their approval boundaries; a
  global definition's declared scope is dropped; the per-session running cap
  of 10 is enforced; no delegate outlives its turn; reloaded transcripts keep
  their delegation topology.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f/§5f.1/§7.1,
  `03-runtime/03-tools-and-permissions.md` §10.2,
  `08-meta/decisions-log.md` (D242 amends D231), ADR 0089 and ADR 0100
- **Acceptance**: C (conversation), E (tools & permissions), F (persistence),
  Security, Quality
- **Milestone**: M6+
- **Status**: Unit coverage includes synchronous initialization failure,
  completion-publication failure, and Stop during parent auto-resume in
  `packages/agent-runtime/src/runtime.test.ts`; desktop journey pending

#### E2E-162 / E2E-173: Delegate workflow scrolling

- **Status**: Superseded by the single-scroll live process behavior in E2E-198.

#### E2E-199: Subagent editor offers preset templates and a provider-bounded model picker

- **Preconditions**: A project-bound Agent session. At least one configured,
  runnable provider with model bindings exists in Settings. The
  `~/.agents/subagents` directory is empty. Builtins are present but no project
  subagent file overrides them.
- **Steps**:
  1. Open Settings → Agent → Subagents, click **New subagent**, and confirm
     the sheet opens with a "Start from template" row of compact name
     chips (Explorer, Code reviewer, Test runner, Fixer, plus a blank
     chip). Chips show names only; the selected chip's one-line caption
     appears once under the row. Confirm there is no long subtitle, no
     per-chip Apply label, and that Advanced starts collapsed. Confirm
     hyphenated ids (`code-reviewer`, `test-runner`) render catalog names,
     not raw keys such as `presetCode-reviewerName`. At normal desktop width,
     confirm the name/description/select controls read as compact filled wells,
     the prompt editor is the only tall field, and the Save/Cancel actions stay
     visually subordinate to the form. Focus a field and confirm its accent
     ring remains visible without a permanent divider.
  2. Click the **Explorer** chip without touching any field. Confirm the
     form is pre-filled: name `Explorer`, the description from the
     builtin, the `Read / Glob / Grep / Bash` tool grant, and the full
     Explorer system prompt. Expand Advanced and confirm the model field is
     unchanged (still inherit).
  3. Reopen the sheet, click **Fixer**, and confirm the grant expands to
     `Read / Glob / Grep / Edit / Write / Bash` and the Fixer body. The
     mutating-hint line appears under the tools row. Expand Advanced and
     confirm the output limit starts empty.
  4. Expand Advanced. Open the model picker. Confirm the picker lists every
     model of every configured, runnable provider, grouped by provider
     name. Choose one and confirm the draft's `model` field becomes
     `<vendorKey-or-name>/<modelId>` (matches what the runtime resolver
     accepts in `BUILTIN_SUBAGENT_DOCUMENTS`).
  4a. Configure a custom endpoint whose display name contains a space (for
     example **My Gateway**). Confirm the picker offers it, select it, and
     confirm the sheet saves with the pin `<display name>/<modelId>` and the
     save button enabled. The picker and the draft check must never disagree
     about what is saveable.
  4b. Configure two providers with the same display name and vendor key, so
     their pins use distinct stored provider ids. Add one as a fallback model,
     save and reopen the sheet. Confirm the ordered row and its move/remove
     accessible names use the provider display name and model ID, not the id,
     while the saved pin still identifies the chosen provider. Add the second
     provider with the same model ID and confirm both rows and their accessible
     names include their provider IDs to distinguish them. Disable one provider
     and confirm its row and move/remove accessible names retain the configured
     provider name and model ID, with a localized disabled status; the row must
     not revert to a raw UUID label. Confirm the disabled provider is absent
     from the add menu, while its saved row remains movable and removable.
     Save and reopen, then re-enable the provider: its name remains visible,
     the disabled status clears, and its stored pin is unchanged. A genuinely
     missing or ambiguous provider binding keeps its raw pin with an unavailable
     status rather than borrowing another provider's name. Reorder or remove
     that row, save and reopen, and confirm all remaining pins and their order
     are preserved exactly.
  5. Confirm the picker offers no **Custom (provider/model)…** entry and the
     field renders no free-text input, so a model id can only come from the
     configured catalog. Switch the picker to **Inherit session model**, save,
     and confirm the draft's `model` field is empty and the sidecar falls back
     to the session model.
  5a. In the open model menu, confirm the list scrolls inside the menu and
     never runs past the window edge, and that typing in the filter field
     narrows the rows (including by provider name). Confirm the menu is not an
     OS-drawn select popup: it stays inside the sheet's own layer.
  6. Disable every provider that contributes a model. Reopen
     the editor, expand Advanced, and confirm the model field renders an
     empty state with an action button instead of a free-text input, and that
     the action opens Models.
  7. Switch the locale to Simplified Chinese. Confirm the preset chips
     render the translated names (`探索者`, `代码审查员`, `测试执行者`,
     `修复者`, `空白开始`) and the picker labels (`沿用当前会话的模型`,
     `前往模型设置`) resolve; no raw i18n keys appear in
     either locale.
- **Expected**: The editor offers only models the user already configured, so
  the picker is the only way to set a model and every saved pin is resolvable.
  No free-text model id is accepted. When no provider offers a runnable model
  the field explains that and links to Models instead of asking the user to
  type an id the runtime could not resolve. Picking a
  preset overwrites the draft wholesale (description, tools, body) but
  never silently clears the user's other choices (model,
  thinking level, scope).
- **Specs linked**: `04-ux/06-settings-ia.md` §7,
  `03-runtime/13-model-catalog-and-selection.md` §11,
  `03-runtime/11-provider-model-system.md` §6.4,
  ADR 0062, ADR 0089
- **Acceptance**: B (model config), C (conversation & stream), Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered
  (`packages/shared/src/subagent-presets.test.ts`,
  `apps/desktop/test/subagent-editor-presets.test.mjs`); full UI journey
  Draft (run only in a capable environment when this surface changes)

#### E2E-SUBAGENT-settings-lists-builtin-defaults

- **Preconditions**: A running app. `~/.agents/subagents` is empty. The five
  shipped builtins are present, none is switched off, and no user document
  shadows them.
- **Steps**:
  1. Open Settings → Agent → Subagents. Confirm a Built-in group lists
     `explorer`, `code-reviewer`, `test-runner`, `fixer`, and `ui-designer`
     with localized names, `Task(<handle>)` copy, tool grants, a Built-in
     badge, **Copy as mine**, and an enablement switch in the on position.
     Confirm none of those rows has Reveal or Delete.
  2. Confirm the Global group still shows localized `settings.subagentsEmpty`
     copy and the New subagent action.
  3. Switch `fixer` off from its Built-in row. Confirm the row dims with its
     switch off, the toast names it, nothing appears in `~/.agents/subagents`,
     and the row stays listed, because that switch is the way back on.
  4. Send a prompt with `fixer` switched off. Confirm the Task catalog does not
     offer it while the other four remain, then switch it back on and confirm
     the next prompt offers it again.
  5. Choose **Copy as mine** on explorer. Confirm the create sheet opens
     pre-filled from that definition (name, description, tools, body) with
     the Explorer template chip selected, not Blank. Save. Confirm
     explorer now appears only as a user-owned Global row and is omitted from
     Built-in, and the next prompt's Task catalog uses the user document.
  6. Disable the user explorer and reload the page. Confirm the user row is
     off and explorer reappears under Built-in (disabled user documents do
     not reach the loader, so the shipped definition wins again).
- **Expected**: Settings shows the defaults the agent can actually delegate to,
  and every one of them can be turned off from its own row. Builtin activation
  is app-local state rather than a document, so a switched-off default keeps its
  row; copying a builtin stays the way to retune one, and reveal and delete
  remain file-backed actions on user-owned rows only.
- **Specs linked**: `04-ux/06-settings-ia.md` §2, `03-runtime/01-ipc-protocol.md`
  §12c, `03-runtime/02-agent-runtime.md` §5f, ADR 0062, ADR 0063, ADR 0270
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M6+
- **Status**: Source/unit covered (`apps/desktop/test/agent-capability-settings.test.mjs`,
  `apps/desktop/test/subagent-wiring.test.mjs`,
  `packages/agent-runtime/src/subagent-definitions.test.ts`,
  `packages/shared/src/subagent-presets.test.ts`); full UI journey Draft
  (run only in a capable environment when this surface changes)

#### E2E-198: A subagent task opens with a live conversation process

- **Preconditions**: A project-bound Agent session with a mocked provider stream
  where one `explorer` delegate has a Task description and emits thinking,
  tool, and answer rows over time. The work panel is initially closed.
- **Steps**: 1) Expand the activity group if needed and click the `explorer`
  topology node. 2) Click the selected `explorer` node again and confirm the
  right-side dock closes, then click it once more to reopen it. 3) Observe the
  right-side dock while the delegate streams. 4) Scroll the task/process
  conversation upward and then return to the latest output. 5) Switch sessions
  and return to the original session. 6) Let a delegate start and then fail,
  open its node, and read the foot of the dock; repeat with a delegate that
  completes and one that is still running.
- **Expected**: The right dock shows a sticky identity header (avatar, name,
  and model caption on the left; status capsule and elapsed time trailing on
  the same row without wrapping), the Task call's description
  as a full-width inset grouped card under a Task section label, capped at four
  lines with an inline Show more / Show less control for longer tasks, and
  the delegate's live thinking/tool/answer process under an Activity section
  on one subtle vertical timeline using the same row components as the main
  conversation.
  The selected topology node is a full-row toggle without an extra disclosure
  chevron: its first click opens the dock and its second click closes it.
  New rows appear without a reload and follow the bottom while pinned. The
  panel has one body scrollbar; the process does not create a nested scrollbar
  or a second elevated card. At the minimum supported panel width, long
  commands, paths, and tool summaries remain contained within the dock without
  horizontal page overflow. A real upward gesture pauses follow and exposes
  jump-to-latest. The transcript remains the same height and keeps its own
  scroll state. Session switching hides the selection and returning never
  shows another session's task.
  In step 6, a delegate that starts and then fails closes the dock with an
  error card rather than a bare `Failed` capsule: the localized summary (the
  registered `errors.<code>` sentence when the runtime reported a known code,
  the localized `chat.subagentStatus.*` outcome otherwise), the stable code,
  the raw provider message behind a Show details / Hide details disclosure, and
  a copy control. The disclosure control stays reachable while the details are
  collapsed, and the delegate that completed or is still running shows no card
  at all.
- **Specs linked**: `04-ux/08-component-spec.md` §5.7,
  `04-ux/09-interaction-patterns.md` §9.1
- **Acceptance**: C (conversation), Quality
- **Milestone**: M6+
- **Status**: Documented; desktop journey pending. The failure card's data
  source is unit-tested in `subagent-topology.test.mjs`: a settled delegation's
  `error: { code, message }` read from `TaskWait` `delegations[]` and `TaskStop`
  `stopped[]`, lifecycle row ordering, entries without an error, and the
  terminal Task snapshot that carries a failure before parent polling.

#### E2E-SUBAGENT-settlement-updates-before-parent-poll

- **Preconditions**: An Agent session with two parallel delegates; one can
  finish while the other continues and the parent does not poll lifecycle tools.
- **Steps**: 1) Start both delegates and open the first delegate's detail dock.
  2) Optionally let TaskList report both as running. 3) Complete only the first
  delegate while the parent turn remains live. 4) Switch sessions and return,
  then reload history after the turn finishes. 5) Repeat with failed and stopped
  delegates, and with a delegate finishing before its Task result arrives.
- **Expected**: The settled node stops spinning immediately, its status is
  completed (green) or the actual failure/stop outcome, and its elapsed time
  stops increasing. The sibling remains running; the aggregate reads one of
  two settled. The open dock updates with the same status and failure details.
  A stale running TaskList snapshot cannot undo settlement. Reload preserves
  the actual terminal outcome and original Task identity, arguments, and usage.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §Subagents,
  `04-ux/08-component-spec.md` delegation topology
- **Acceptance criterion**: C, Quality
- **Milestone**: M6+
- **Status**: Runtime event-order and renderer projection regressions automated;
  desktop journey documented. Required suites: `test:e2e`, `test:e2e:subagents`.

#### E2E-SUBAGENT-resume-a-settled-delegation

- **Preconditions**: An Agent session on a deterministic local transport that can
  complete, fail, stop, and hold a delegate open on request. Two user
  definitions, `~/.agents/subagents/scout.md` (read-only) and
  `~/.agents/subagents/fixer.md`; a workspace file `src/report.ts` whose
  conclusion is easy to locate by file and line; and a definition model binding
  that can be removed from the configuration. The parent catalog offers `Task`,
  `TaskWait`, `TaskList`, and `TaskStop`.
- **Steps**:
  1. Delegate `scout` a brief that must end by naming one conclusion with its
     file and line number, and let it settle `completed`. Note the
     `delegationId` the Task result returns.
  2. Send a turn that passes that id as `Task.resume` and asks for the same
     conclusion plus a second occurrence the first run never reached. Expand the
     delegation card, then inspect what the parent itself received.
  3. Send a turn that only says "reuse what the scout already found", with no
     `resume` value.
  4. Start a long-running `scout` delegation and call `Task.resume` for it while
     it works; then, while a resumed run of another chain is still working, call
     `Task.resume` for that chain again.
  5. `TaskStop` one delegation, abort a second, and close the app while a third
     is still working. After relaunch, call `Task.resume` for each of those three
     ids as reported by `TaskWait`.
  6. Let a delegation fail after one successful read, then call `Task.resume`
     for it.
  7. Send one `Task` call that carries both `resume` and `model`.
  8. Remove the chain's recorded model from the configuration, then `Task.resume`
     the chain and read its delegation lifecycle details and card.
  9. Settle two `scout` chains, `resume` the older one, settle a third chain for
     the same definition, and read the reusable list the next prompt offers; then
     keep one chain running while two others settle for that definition.
  10. Accumulate more than 50,000 lines of read-only tool output in one chain,
      then call `Task.resume` with its id.
  11. Resume a `scout` chain while spelling `Task.agent` as `Explorer`, then as
      `explorer.md`, then as another definition's name.
  12. Let one chain read more than eight files and send two further prompts in
      the same session, comparing the reusable list each prompt composes.
  13. Relaunch the app and, without changing anything else, `Task.resume` a
      `completed` chain from before the restart.
  14. From a fixture session that resolves a chain but no longer holds any of its
      delegate rows, call `Task.resume` with that id.
- **Expected**:
  - Step 2 resumes from the chain: the new run answers with the earlier
    conclusion's exact file and line, and its rows contain no fresh full read of
    that file. `Task` returns a new `delegationId`, and the parent's own context
    still holds one final report for that delegation and no delegate tool rows.
  - Step 3 is a cold start: a brand-new delegate with no earlier conclusion in
    its rows, a fresh `delegationId`, and no link to the earlier chain. Leaving
    the id out never inherits context, whatever the prompt says.
  - Step 4 fails twice as tool errors. The running delegation is reported as
    still running, with the instruction to converge through `TaskWait` first;
    nothing is started, nothing is queued, and the running delegate keeps
    working.
  - Step 5 refuses `stopped`, `aborted`, and the run the app closed while it was
    still working (which reads as `interrupted` after relaunch) as not
    resumable, each naming that reason and the fresh-delegation path instead. No
    run starts.
  - Step 6 resumes the failed chain like a completed one: the reads it already
    made seed the new run, and its failed assistant row is not replayed.
  - Step 7 is refused as a tool error: a resumed run keeps the chain's model, and
    the message points at starting a new delegation to change models.
  - Step 8 still resumes, on the binding the definition resolves to now, and the
    delegation's lifecycle details carry the previous model id as
    `modelChangedFrom`. The parent sees it through the lifecycle snapshot it
    polls and the card shows it with the run, so the switch is never silent.
  - Step 9 keeps at most two reusable chains per definition: the least recently
    active settled chain is evicted whole, so every id on it answers as an
    unknown delegation with the current reusable list, while a chain whose latest
    run is still working is never evicted — the group may sit over the bound
    rather than strand a live delegate.
  - Step 10 drops the over-budget chain from the reusable list without trimming
    its history: no later prompt offers it and a `resume` for it is refused as
    having read too much to resume cheaply, while an ordinary delegation for the
    same work still succeeds from cold.
  - Step 11 matches the definition name case-insensitively and with the document
    suffix — `Explorer` and `explorer.md` both resume the chain — while a
    different definition's name is a name mismatch that lists the agents that do
    have reusable chains.
  - Step 12 offers each chain's latest `delegationId`, its objective, and at most
    eight of the files it read, with a `(+N more)` suffix past that. A chain that
    just settled is already there in the same session, with no app restart and no
    new session; running, non-resumable, over-budget, and evicted chains never
    appear.
  - Step 13 rebuilds the chain relationship from the transcript, so the
    `completed` chain is offered again after relaunch and resumes as before.
  - Step 14 fails as having no recorded history, and that same id is not listed
    among the reusable ids in the error or in any later prompt: the chain leaves
    the reusable list.
  - Throughout, the transcript shows the chain as one continuous multi-turn
    conversation under its newest Task card, with no "resumed" marker, and the
    resumed run's counters start at 0 so its turn, tool, and usage numbers
    describe the new run while the earlier rounds stay readable above it.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f, ADR 0279
- **Acceptance**: C (conversation), Quality
- **Milestone**: M6+
- **Not covered (二期)**: reviving a `stopped`/`aborted` delegation, in-chain
  compaction, task queuing, and cross-session resumption.
- **Status**: Draft — chain resolution, resume validation, the reusable list, and
  transcript chain grouping are unit/regression covered
  (`packages/agent-runtime/src/delegation-chain.test.ts`,
  `delegation-history.test.ts`, `runtime.test.ts`,
  `apps/desktop/test/assistant-turns.test.mjs`); the desktop journey needs a
  capable environment. Required suites: `test:e2e`, `test:e2e:subagents`,
  `test:e2e:transcript`.

#### E2E-SUBAGENT-context-overflow-compacts-before-failing

- **Preconditions**: An Agent session on a deterministic local transport whose
  model metadata declares a small context window (for example 16,000 tokens)
  and whose replies are scripted. The small window is injected through that
  fake provider, never a real one: real providers and paid APIs are not
  default test environments in this repository. A user definition
  `~/.agents/subagents/reader.md` declares `Read`, `Glob`, and `Grep`, and the
  workspace holds files large enough that two or three reads cross the
  delegate's hard limit.
- **Steps**:
  1. Delegate a brief that requires reading those files in sequence and record
     every request the transport receives, with its estimated size.
  2. Read the request that follows the boundary at which the delegate crosses
     its hard limit.
  3. Repeat with the crossing landing while a tool result is still pending,
     then with it landing on a completed turn.
  4. Repeat with the summary request scripted to fail.
  5. Repeat with a summary response containing only thinking blocks or
     whitespace, including a response stopped at the output limit.
  6. Run the same brief as the session Agent on the same fixture and compare
     its requests and transcript rows with a run recorded before this change.
  7. Inspect the delegation card, the transcript, the context inspector, and
     the parent's own model context after the delegate settles.
- **Expected**: The delegate keeps working instead of failing. The request
  after the crossing is below the hard limit and carries a summary plus the
  applicable retained tail; no request is sent above the window. A pending
  tool result retains as an active turn (latest user message only), a
  completed turn retains none. A failed summary degrades to the original task
  brief plus the most recent message(s), the run still completes, and the
  report and lifecycle details say it was degraded rather than presenting a
  partial answer as complete. A thinking-only or whitespace-only summary also
  follows that degradation path, preserves the recent tool evidence, and never
  installs an empty successful checkpoint. Delegate compaction adds no
  transcript row, no host-core checkpoint, no warning toast, and no
  context-inspector line; the delegate's own rows stay complete and the
  parent's model context still holds only the report. The session Agent
  behaves exactly as it did before.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5.1, §5f,
  `03-runtime/08-error-codes.md` §3.2, ADR 0299, ADR 0064, ADR 0136
- **Acceptance criterion**: C — Conversation & stream; Quality
- **Milestone**: M6+
- **Status**: Draft. Required suites: `test:e2e`, `test:e2e:subagents`.

#### E2E-SUBAGENT-output-token-limit-is-a-visible-failure

- **Preconditions**: An Agent session uses a deterministic local provider whose
  response ends with `stopReason: "length"` or `"max_tokens"` after emitting
  non-empty assistant text. The delegate has a valid report and no pending
  tool call.
- **Steps**: 1) Delegate the task and let the provider end at its output-token
  limit. 2) Read the Task result, lifecycle details, and delegation card. 3)
  Resume or retry the same work with a provider response that ends normally.
- **Expected**: The first run settles as `failed`, not `completed`, with
  `SUBAGENT_OUTPUT_TRUNCATED` and `outputTruncated: true`. The parent receives
  an explicit explanation and the bounded partial report under `Its last
  output was:`. A later turn that ends with `stop` clears the marker and
  settles as `completed`; the partial run never masquerades as a finished
  report.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f,
  `03-runtime/08-error-codes.md` §3.2
- **Acceptance**: C (conversation), H (diagnostics), Quality
- **Milestone**: M6+
- **Status**: Unit covered by `packages/agent-runtime/src/subagent.test.ts`;
  the full desktop journey remains required: `test:e2e`,
  `test:e2e:subagents`.

#### E2E-SUBAGENT-context-overflow-reports-actionable-failure

- **Preconditions**: The same injected small-window fake provider, sized so
  even the degraded context cannot fit. One definition declares two ordered
  `fallbackModels`: one whose window is no larger than the primary's and one
  that is larger. A second definition declares none.
- **Steps**:
  1. Delegate a brief that overflows past both compaction and degradation, and
     read the tool result the parent receives plus the lifecycle details.
  2. Repeat for the definition that declares the two alternatives, recording
     which alternatives the transport is actually asked for.
  3. Repeat with every alternative at the same small window.
  4. Read the delegation card and the report in English and in Chinese.
  5. Continue the parent turn, then send a new prompt.
- **Expected**: The run fails with `SUBAGENT_CONTEXT_OVERFLOW`, not retriable,
  and what the parent reads names what it can change — narrow the task,
  delegate to a model with a larger context window, read less at once. The
  provider's raw overflow sentence is not what the parent receives. An
  alternative whose own budget cannot hold the carried context is never
  requested and appears in `modelFailures` with that reason; the larger
  alternative is attempted and can succeed. With no alternative that fits, the
  outcome stays `SUBAGENT_CONTEXT_OVERFLOW` rather than the final provider
  error. The delegate's rows stay durable and visible, the session returns to
  idle, and the next prompt is not `AGENT_BUSY`.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f,
  `03-runtime/08-error-codes.md` §3.2, ADR 0299,
  ADR subagent-model-fallback
- **Acceptance criterion**: C — Conversation & stream; Quality
- **Milestone**: M6+
- **Status**: Draft. Required suites: `test:e2e`, `test:e2e:subagents`,
  `test:e2e:subagent-models`.

#### E2E-SUBAGENT-resume-seeds-within-context-budget

- **Preconditions**: The same injected small-window fake provider. One settled
  `reader` chain read enough to exceed the delegate hard limit while staying
  under `MAX_RESUMABLE_READ_LINES`; a second settled chain fits well inside
  the budget. The resumed fixture uses `vendorKey: "deepseek"` and includes a
  persisted assistant row with both answer text and thinking.
- **Steps**:
  1. `Task.resume` the over-budget chain and capture its first provider
     request in full.
  2. `Task.resume` the chain that fits and capture the same request.
  3. Ask the resumed run for a conclusion the chain reached in its most recent
     round, and for one it reached in its first round.
  4. Relaunch the app, rebuild the chain index from the transcript, and resume
     the over-budget chain again.
  5. Accumulate more than `MAX_RESUMABLE_READ_LINES` of read-only output in a
     chain and read the reusable list the next prompt offers.
  6. Inspect the resumed assistant history in the captured request and verify
     its same-model reasoning remains in `reasoning_content`.
- **Expected**: The first request of a resumed run is below the hard limit. It
  opens with the original task brief and holds the most recent turns; the
  oldest tool results are dropped first, and dropping an assistant message
  drops its tool calls with it, so no orphaned tool call reaches the provider.
  A chain that fits is seeded whole, exactly as before. The most recent
  conclusion is answered from the seeded context; the first round's may be
  gone, and the run says so rather than inventing it. A resume never fails
  with `CONTEXT_TOO_LARGE` or `SUBAGENT_CONTEXT_OVERFLOW` on its first
  request. With a vendorKey binding, restored assistant history uses the same
  `model.provider` / `model.id` identity as live requests, and its thinking
  stays in the native `reasoning_content` field. `MAX_RESUMABLE_READ_LINES`
  still removes an over-read chain from the reusable list; truncation does not
  make it resumable again.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f, ADR 0299, ADR 0279
- **Acceptance criterion**: C — Conversation & stream; Quality
- **Milestone**: M6+
- **Status**: Draft. Required suites: `test:e2e`, `test:e2e:subagents`.

#### E2E-161: A delegation lifecycle row reads as a subagent row

- **Preconditions**: A project-bound Agent session with a mocked provider stream
  that starts two delegates (`explorer`, `fixer`) with `Task`, then calls
  `TaskList`, `TaskWait` and `TaskStop`.
- **Steps**: 1) Start both delegates and inspect the collapsed `TaskList` row
  while both are running. 2) Let `explorer` complete and `fixer` fail, then
  inspect the `TaskWait` row's summary, badge and expanded body. 3) Start a
  third delegate reusing the `explorer` definition, call `TaskList`, and read
  the summary. 4) Stop a running delegate and inspect the `TaskStop` row.
  5) Confirm the delegation card's own subagent count is unchanged by all three
  lifecycle rows. 6) Repeat in Chinese.
- **Expected**: Every lifecycle row summarizes by agent name — never by its
  `delegationIds` argument, and no bare UUID appears in a collapsed row. Its
  badge uses the shared subagent status vocabulary: running while any member
  runs, `Failed` / “失败” once a member failed even though a sibling completed,
  and `Stopped by request` / “已按请求停止” for the stopped delegate — including
  when the persisted `TaskStop` snapshot still says `running`. The topology
  card's node matches that stopped outcome and is not labelled working after
  the turn ends. A repeated
  definition is counted (`explorer ×2`) rather than listed twice. The expanded
  body shows the joined reports as a notice followed by one named row per
  subagent with status, runtime and turns, and contains no pretty-printed
  `delegations[]` JSON. The delegation card still reports the number of `Task`
  calls only, so lifecycle rows never inflate the topology counts.
- **Specs linked**: `04-ux/08-component-spec.md` §9.9,
  `03-runtime/02-agent-runtime.md` §5f, ADR 0062, ADR 0089, decisions-log D269
- **Acceptance**: C (conversation), Quality

#### E2E-155: Subagent lifetime is parent-judged; runtime delivers reports

- Abort the parent while it is waiting for a provider response and while it is
  idle waiting for two delegates. Hold delegate teardown at the provider edge;
  retire the parent and one child first. Abort must remain pending, status must
  remain busy and a new prompt must be rejected until the last child retires.
  Concurrent abort requests share cleanup. A follow-up prompt is accepted after
  abort resolves, with no old-turn continuation or tool execution.

- **Preconditions**: A project-bound Agent session with a Bash-capable
  `explorer` definition and a mocked provider stream.
- **Steps**: 1) Start a delegate and let the parent stop calling tools while
  it still runs; confirm the durable turn stays open and the delegate is not
  aborted. 2) Let the delegate finish and confirm the parent is prompted with
  its report without the user sending “continue”. 3) Let a `TaskWait` expire
  while the delegate is still running and read the heartbeat the parent
  receives. 4) `TaskList` a running delegate and confirm elapsed / last-tool
  fields. 5) `TaskStop` and user Stop still abort. 6) Run a delegate whose
  document declares `maxTurns: 2` and let it pass two tool-calling turns;
  confirm the key is ignored and the delegate keeps running. 7) Start a
  delegate on another model, exhaust the parent HTTP 429 budget, and click
  Continue; confirm leftover delegates abort, the session is idle, Continue
  is accepted, and the failed assistant error surface stays visible. 8) Define
  a delegate with an explicit `maxTokens` and one without, run both, and read
  the two outgoing provider requests. 9) Start enough delegates for their
  combined reports to exceed the bounded `TaskWait` result, then let the parent
  idle.
- **Expected**: Idle and duration watchdogs never fire. Parent idle does not
  abort delegates. Completion reports are delivered into the same durable
  turn. `TaskWait` expiry reports “Still running after Ns”, includes a
  heartbeat, and states that this is not a failure. No turn count ends a
  delegate, and no status reports one. Explorer's catalog includes
  `Bash` while code-reviewer remains read-only. A terminal parent 429 aborts
  leftover delegates and Continue is not `AGENT_BUSY` (D352). In step 8 the
  capped delegate's request carries the declared output limit and the uncapped
  one carries the model's published limit, so the cap overrides the derived
  `max_tokens` / `max_completion_tokens` / `max_output_tokens` without
  disturbing the session's own requests (D383). In step 9, the reports omitted
  from the bounded `TaskWait` content are delivered once by the idle resume and
  are not replayed after they reach the parent.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f,
  `03-runtime/08-error-codes.md`, `03-runtime/09-logging-and-observability.md`,
  ADR 0166, ADR 0189, decisions-log D328 / D352 / D383
- **Acceptance**: C (conversation), E (tools & permissions), H (diagnostics), Quality
- **Milestone**: M6+
- **Status**: Covered by unit tests; full desktop journey pending. The output
  cap's parse and clamp are covered in `packages/shared`
  `subagent-definition.test.ts`, and its document round-trip in host-core
  `user_subagents` tests; the request-level assertion in step 8 stays manual.

#### E2E-157: Global scrollbars stay quiet while remaining discoverable

- **Preconditions**: PI-Desktop is open with the expanded sidebar, more
  temporary sessions than the five-row cap, and enough retained project
  sessions to overflow the Projects region.
- **Steps**: 1) Inspect the idle Sessions and Projects scrollbars in light and
  dark themes. 2) Move the pointer into each list and then away from it,
  confirming that only the hovered list's thumb appears. 3) Move the pointer
  back into each list, drag its thumb through the region, and keyboard-focus a
  row to confirm the focused list keeps its thumb available. 4) Scroll the
  list with the wheel or trackpad after moving the pointer away from the thumb.
  5) Open a long conversation and a long right-side work-panel view, including
  the file manager view when the bundled plugin is enabled, and compare their idle,
  hovered, focused, and scrolling states on Windows.
- **Expected**: Both regions remain independently scrollable and the footer
  stays fixed. Every in-app scrollbar is trackless, 6px wide, and transparent
  at rest; hovering or focusing the owning scroller reveals only its thumb,
  while scrolling reveals it for 300ms after the last scroll event. Dragging
  keeps it visible without changing the scroll region's width. Chat, code,
  Settings, and the right-side work-panel scrollbars all match this rule. A
  docked or detached plugin panel receives the same host-injected rule; an
  external page inside Browser keeps its own page-owned scrollbar.
- **Specs linked**: `04-ux/07-ui-design-system.md`,
  `04-ux/08-component-spec.md`, `04-ux/09-interaction-patterns.md`
- **Acceptance**: Quality (sidebar polish and independent navigation)
- **Milestone**: M6+
- **Status**: Unit-covered (`interaction-polish.test.mjs`); rendered scenario
  pending

#### E2E-158: Temporary sessions use isolated scratch workspaces

- **Preconditions**: PI-Desktop has a project open, a temporary session can be
  created, and the host data directory is known. The temporary session starts
  with an empty transcript.
- **Steps**:
  1. Create or select a temporary session while the project remains recently
     active, then inspect the empty-home hero.
     2. Confirm the hero uses the temporary-session copy and has no project
     underline or project switcher; confirm a project session and no active
     session still use their own hero states.
  3. In the temporary session, use Read/Glob/Grep on a file under its
     `<data_dir>/scratch/<sessionId>` root, then Write/Edit a file with a
     workspace-relative path and run a bounded Bash command.
  4. Inspect the tool results and filesystem, then switch back to the project
     and confirm the project root and git status are unchanged.
  5. Enter Plan or Goal in the temporary session and confirm submission still
     fails with the existing project-root requirement.
- **Expected**: A path-less session binds every native tool to its own
  `scratch/<sessionId>` directory, never to the visible or recently active
  project. Relative paths work inside that scratch root, containment and
  permission rules remain active, and no project artifact is created. The
  temporary hero is localized and has no project switcher; the project hero and
  the no-project generic hero are unchanged by the temporary session. Plan/Goal
  retain their project-root boundary.
- **Specs linked**: `03-runtime/03-tools-and-permissions.md` §4/§4b,
  `03-runtime/10-session-state-machine.md`, `04-ux/01-ui-ia.md`,
  `04-ux/02-i18n-english-first.md`, ADR 0124
- **Acceptance**: C (conversation), D (workspace), E (tools & permissions),
  F (persistence), Security, Quality
- **Milestone**: M6+
- **Status**: Unit-covered (`crates/host-core/src/rpc/mod.rs`,
  `temporary-session-workspace.test.mjs`); rendered desktop journey pending

#### E2E-159: A long transcript keeps a bounded mounted window

- **Preconditions**: PI-Desktop is open on a session whose transcript is
  substantially longer than one `session.get` page (several hundred messages,
  including fenced code blocks and expanded tool activity), on a memory-
  constrained Windows machine where the regression was reported.
- **Steps**:
  1. Activate the session and confirm the first paint lands at the newest
     message without a top-of-transcript flash.
  2. Record the renderer's transcript row count and heap usage, then scroll
     upward continuously to the oldest loaded message and past it so older pages
     are fetched.
  3. At each point where the view stops advancing, confirm it resumes: earlier
     rows appear without the rows under the cursor being pushed down, and the
     earlier-messages indicator appears only when a page is actually fetched.
  4. Re-record the row count and heap usage after paging far back, then scroll
     back to the bottom and send a new prompt.
  5. While the answer streams, confirm following stays pinned and typing in the
     composer stays responsive. Scroll up mid-stream and confirm follow releases
     and the jump-to-latest pill appears.
  6. Hover and click conversation minimap dashes at several heights, then switch
     to another session and back.
  7. Activate a long session whose newest page collapses to less than one
     viewport (one tool-heavy turn) and confirm the outline is present with its
     earlier-history continuation, that clicking it reveals earlier turns, and
     that it keeps advancing without a manual scroll gesture until the whole
     history is loaded and mounted.
  8. Confirm the continuation disappears once nothing earlier remains, and that a
     short completed conversation that fits one viewport still shows no rail.
- **Expected**: Mounted transcript rows stay bounded by the window rather than
  growing with how far back the user scrolled, so the recorded row count and heap
  usage after paging far back stay close to the values recorded before it.
  Upward travel is continuous: growing the window and fetching a page both keep
  the viewport anchored to the row being read. Every minimap message dash jumps to
  a real row. Streaming stays smooth with the composer responsive, pinned-follow
  and jump-to-latest behave as specified, and switching away and back paints the
  retained pane at the position it was left. Earlier history is never stranded: with rows withheld or an older
  page pending, the outline stays available with an actionable earlier-history
  continuation and keeps advancing when the top boundary remains visible, even
  when the mounted tail does not overflow one viewport (D269). The continuation
  and the rail disappear once the full history is loaded and mounted and the
  transcript fits one page.
- **Specs linked**: `04-ux/08-component-spec.md` §7 and §8,
  `03-runtime/04-data-storage.md`, ADR 0120, ADR 0127, ADR 0130, D108, D269
- **Acceptance**: C (conversation), H (diagnostics), Quality
- **Milestone**: M6+
- **Status**: Unit-covered (`transcript-window.test.mjs`,
  `conversation-minimap.test.mjs`, `interaction-performance.test.mjs`); rendered
  desktop journey and the low-memory Windows measurement pending

#### E2E-CHAT-history-loading-holds-viewport

- **Preconditions**: A built Desktop checkout and existing compatible Electron
  dependencies. Use the isolated synthetic fixture, never a live user profile.
- **Steps**:
  1. Scroll upward into the adaptive ahead-loading band (base three screens,
     at most twelve screens or `12000px`) while holding Host page IO; continue
     scrolling during IO, then complete the page. Repeat from `4000px` at speed.
  2. Start `node scripts/e2e-transcript-history-loading.mjs --manual` and click
     **Load earlier (hold)** (or reach `<= 120px`). Note the visible turn and
     its viewport offset, continuously roll the wheel upward and downward while
     the page is held, then click **Complete page**. Repeat without scrolling.
  3. Repeat with **Fail page** and an empty page. Confirm the indicator ends and
     new input can scroll or retry, without an automatic loop at rest.
  4. From both an ordinary tail and a paginated historical view (idle and
     running), trigger return-to-latest with normal and reduced motion, and
     interrupt an active trip with genuine main-scroller input vs horizontal,
     zero-delta, or `Ctrl`+wheel input and nested/editable/row controls. While a
     page is pending, return to latest, complete the old page, and also test
     hiding/unmounting mid-trip.
  5. Return after loading older pages, then scroll upward again. Reveal a real
     turn-changes card during the trip and compare with layout growth above the
     visible text. Continue with live output and a canonical rewrite.
- **Expected**: Ahead-loading mounts cached withheld history before Host IO,
  stays single-flight, does not set `overflow-y: hidden` or discard main scroll
  input, tracks the newest actual message anchor across ongoing upward movement,
  and keeps that message within `2px` when the page prepends; there is no
  early-threshold observer or eager draining at rest. The `<= 120px` hard edge,
  explicit earlier-history action, and underfilled observer use the same moving
  anchor without locking overflow or discarding input. Native wheel movement
  must occur during IO, with insertion preserving the resulting reading point.
  Nested scrolling, editable fields and title activation remain independent.
  Return-to-latest uses the same browser-native smooth scrolling as conversation
  turn markers (`auto` under reduced motion), without custom easing, timing, or
  per-frame position writes. Competing follow/layout/turn-completion owners yield; preparing a historical view
  clears `loading` on a new view identity while keeping current messages visible
  until exact-identity arrival, commits on hide/unmount, cancels in place only
  on genuine main-scroller input, and may skip unloaded intermediate ranges when
  a disjoint search/history view joins the live tail. Tail-connected older pages
  and their physical cursor survive arrival, so upward reading does not repeat
  covered reads; they remain outside model input and accept live updates. Pane
  eviction and canonical rewrites still invalidate them. Native `scrollend`
  rechecks the current bottom and smoothly finishes any remaining distance after
  a late card or layout change, without a full-height instantaneous jump.
  Runtime `isRunning` and mounted-window bounds remain unchanged, without idle TTL or reclamation.
- **Automation**: `node scripts/e2e-transcript-history-loading.mjs`, also run by
  `e2e-transcript-render.mjs`, plus `transcript-latest-navigation.test.mjs`,
  `transcript-reading.test.mjs`, and `transcript-scroll.test.mjs`. The direct
  fixture retains hard-edge native Electron wheel bursts, quiet loading, tail
  updates, six delayed layout changes, rejection, empty pages, cached-window
  growth, hide/reveal, input ownership, return-to-latest during IO, and native
  wheel movement during unlocked ahead-loading. The `SessionPane` + real store
  probe (`scripts/e2e/transcript-history-navigation.tsx`) adds four paired
  return-to-latest motion cases (ordinary tail vs paginated history × idle vs
  running, asserting `>= 3` intermediate frames, no reverse `> 2px`, and zero
  empty visible-message frames) and ahead-read cases (standalone user rows and
  mixed grouped answers moving the same visible message `100px` during pending
  IO and keeping drift `<= 2px` after prepend). A preceding-row case then grows
  the newly exposed message by `400px`: retain the original readable message
  until its intended offset leaves the viewport rather than adopting that lazy
  predecessor's unstable geometry. This runs alongside the retained quiet
  stability and pending/settled latest-button cases. Additional regressions cover
  native browser smooth travel across the prefetch threshold, resuming follow
  during pending IO, press-only interruption plus remount, delayed failed search,
  focused and restored disjoint ranges (no automatic forward reads), stream
  growth/completion, hide/unmount, and reduced-motion media emulation. An extra
  latest case changes height above the reader by `2400px`. The minimap jump
  journey then clicks latest and verifies one native smooth command with no
  instantaneous intermediate travel. Separate final travel from arrival drift.
  Delayed-layout checks require nonempty post-layout/prepaint samples within
  `2px`, retaining pre-layout rAF diagnostics rather than treating them as paint.
  Only external Host IPC is controlled;
  the ordinary-motion cases still require intermediate frames. Manual procedures:
  `tests/history-loading-scroll-test-cases.md`.
  The production `SessionPane` resource journey opens collapsed process groups,
  traverses both ends and the middle, and checks measured prose recycling plus
  restoration of visible content without additional history requests.
  `node scripts/e2e-transcript-prose-state.mjs` opens a table preview and Mermaid
  source view, moves their prose offscreen and back, and verifies both states
  survive while ordinary prose still recycles.
  A separate variant includes a 1,600-paragraph final answer. `--manual-smoke` drives the
  manual toolbar through two 100-message pages and reset, sending 24 native
  wheel events in each direction per pending page; directional movement,
  single-flight requests, and frame-gap p95 <= 100ms are checked. This is a
  measured fixture budget, not a universal zero-latency guarantee.
  `node scripts/manual-transcript-desktop.mjs --interaction-smoke` complements
  this with the complete product shell and real Host database: native upward
  wheel input crosses the initial 100-message page without mounting all 1,000
  messages, then the actual latest button reaches the bottom with nonblank
  sampled frames and <=2px tail drift during 600ms after arrival. The isolated
  instance confirms the application's normal quit dialog and exits.
  Late-reading regressions wait until the page has settled, then change content
  above the reading point by 120px, balance it with a -120px change below, and
  change an earlier paragraph inside a long answer. Nonempty pre-paint samples
  must stay within 1px. Six consecutive 20px steps additionally compare the
  actual painted text crop byte-for-byte, not merely the eventual scrollTop.
  Full-Desktop interaction smoke repeats the painted reading check after a real
  Host page. Original native smooth input, resumed follow, search, disclosure,
  hide/reveal and turn-completion paths remain required.
- **Specs linked**: `04-ux/09-interaction-patterns.md` §2.2 / §9.1 / §10.4, ADR 0130.
- **Acceptance**: C (conversation), Quality.
- **Status**: Automated Electron fixture and unit regressions implemented; run
  the candidate Electron gate per `AGENTS.md` §16 before landing, and validate
  additional OS/hardware combinations and real conversations manually.

#### E2E-160: Dragging the window across displays keeps the dropped position

- **Preconditions**: PI-Desktop is open on a machine with two displays arranged
  side by side, ideally with different work areas (a menu bar or taskbar on one
  only, or different resolutions). Run the case once with the work panel closed
  and once with it open at a committed width.
- **Steps**:
  1. Note the window position on the first display, then drag it by its
     titlebar onto the second display and release the pointer.
  2. Confirm the window stays where it was released: no jump, no snap to the
     display edge, and no vertical shift inherited from the first display.
  3. Drag the window so it straddles the boundary between the two displays and
     release it, then confirm it settles fully inside one display's work area
     without changing size.
  4. With the panel open, repeat the cross-display drag and confirm the panel
     remains an internal column at its committed renderer width; no reservation
     is re-planned and no panel-specific native geometry is applied.
  5. Drag the window back to the first display and confirm the application
     bounds continue to follow the dropped position without panel expansion.
  6. Leave the window on the second display, quit, and relaunch.
  7. Disconnect the second display while the window is on it, then reconnect it.
- **Expected**: Every pointer release leaves the window at the position the user
  dropped it on the display they dropped it on. A straddling drop is normalized
  into one work area without a resize. Relaunch reopens the window on the
  display it was last used on rather than the one it started on. Removing the
  display the window occupied still relocates it to a live display, and
  reconnecting preserves the same application bounds contract; no work-panel
  reservation is restored.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  `04-ux/09-interaction-patterns.md` §8, ADR 0132, ADR 0151
- **Acceptance**: F (persistence), Quality
- **Milestone**: M6+
- **Status**: Unit-covered (`work-panel-window.test.mjs`: cross-display drag
  adoption, previous-display replan regression, work-area clamping); the
  two-display desktop journey and the relaunch/hotplug legs are pending

#### E2E-167: Window edge resize stays smooth and persists the settled bounds

- **Preconditions**: PI-Desktop is open in a normal, non-maximized window on
  macOS, Windows, or Linux. On Windows, the left, bottom, and right rim must
  have no visible native border. Run the case with the work panel closed and once
  with it open at a committed width.
- **Steps**:
  1. Drag each reachable window edge and one corner slowly, including a brief
     pause during the gesture, then release.
  2. Confirm the window follows the pointer continuously and does not jump to
     the default size or display edge while the pointer is down.
  3. With the work panel open, drag its inner divider slowly in both directions
     and confirm the panel width changes inside the existing window while the
     native bounds stay fixed. Repeat below the panel minimum and above its
     maximum, then verify the target follows the live budget (`client width - 360px - expanded sidebar`) instead of a fixed cap.
  4. Close and relaunch the app after the resize settles.
  5. On Windows, start an edge gesture, press Escape, and verify original bounds
     return. Maximize and enter fullscreen; corners must be square in both
     states. Restore the window and confirm the selected corner preference
     returns. Record native corner hit behavior rather than assuming that DWM
     corners pass clicks through.
  6. On Windows, inspect the default 12 DIP corner request before and after
     resizing. Apply authorized theme radii of 0 and 24 DIP, then return to a
     built-in theme. Radius 0 must be square. On Windows 11, positive values
     request the same system-rounded preference and are not asserted as exact
     DIP radii; on earlier Windows builds, the existing clip retains its exact
     DIP behavior. Reject an out-of-range radius without changing the surface.
  7. On Windows, minimize and restore the window, then confirm the selected
     corner preference is applied again. Open browser and plugin child views and
     confirm their pixels stay within the top-level silhouette. On Windows 11,
     also verify alpha theme colors are flattened over the built-in theme
     background on an opaque top-level window.
- **Expected**: Native edge and corner hit regions remain available in frameless
  chrome, the minimum size remains 800×560 (capped to the display
  work area), and the recovery watchdog does not
  compete with a slow resize stream. The renderer-owned divider updates the
  bounded panel target without changing native bounds; the last settled window
  bounds and the committed panel width reopen after relaunch. Windows uses
  Electron's frameless native hit regions without the thick-frame rim; no left, bottom,
  or right native rim is visible. No temporary
  work-panel reservation width is persisted or restored.
  Windows 11 uses DWM's native rounded preference for positive radii and a
  square preference for radius 0, maximize, and fullscreen. The default request
  remains 12 DIP and authorized themes retain the integer 0..24 DIP range, but
  DWM selects the actual positive radius and the test does not require 12 and
  24 to look different. Its top-level surface is opaque, including when a
  contributed alpha color is flattened over the built-in theme background.
  Earlier Windows builds retain the existing content clip and integer shape
  hit region. Browser/plugin child views stay within the top-level outline;
  Windows 11 corner click behavior is recorded as native system behavior and
  is not treated as `setShape()` click-through.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  `04-ux/01-ui-ia.md`, `04-ux/07-ui-design-system.md`,
  `04-ux/08-component-spec.md`, `04-ux/09-interaction-patterns.md`,
  ADR 0029 / ADR 0151 / ADR 0317 / ADR 0325
- **Acceptance**: A (app shell), F (persistence), Quality
- **Milestone**: M6+
- **Status**: `test:e2e:window-controls` covers corner preferences before and
  after minimize/restore, theme radius changes, fullscreen, maximize, and
  controls in an isolated profile. The isolated `test:e2e:window-surface`
  candidate samples controlled light/dark desktop backgrounds and child-view
  bounds. Windows 11 additionally verifies the opaque DWM path and system
  preference; earlier Windows builds verify the legacy clip and shape path.
  Both Windows suites still require a dedicated Windows desktop; source tests
  do not qualify native compositing.
  `test:e2e:window-resize-native` adds physical Windows left/right/bottom/corner
  drags and the 800×560 minimum; run it on a dedicated interactive desktop,
  since another app can take foreground or pointer input during the gesture.
  Relaunch persistence remains for native qualification; macOS/Linux native
  edge behavior is unchanged.

#### E2E-168: Expanded sidebar width follows an anchored resize gesture

- **Preconditions**: PI-Desktop is open in the chat shell with the sidebar
  expanded and a retained project/session visible.
- **Steps**:
  1. Drag the sidebar's right-edge handle from its default width toward both
     directions, including a slow drag with a brief pause, then release.
  2. Confirm the main pane reflows continuously and the sidebar does not jump
     when the pointer is pressed.
  3. With the work panel open or on a small supported window, continue the
     resize toward the maximum; inspect the composer toolbar while the main
     pane reflows.
  4. Repeat with a target below 240px and above the live maximum; release and
     confirm the sidebar width stops at 240px and the live cap (at most 520px)
     while MainChat stays at or above 450px. Continue the drag below 160px and
     confirm the sidebar collapses immediately without saving the in-progress
     width.
  5. Focus the edge handle and press ArrowLeft/ArrowRight, Home, and End;
     inspect the separator's current ARIA value. ArrowLeft at 240px must not
     collapse the sidebar.
  6. Start a resize, press Escape or cancel the pointer, then restart the app.
     Collapse and re-expand the sidebar as a separate check; the preferred
     expanded width must return.
  7. Drag the handle wide, double-click it, and confirm the width returns to the
     default 275px. Repeat after a minimum-width drag and on a squeezed window
     where the live cap is the binding bound.
- **Expected**: The handle is discoverable on direct hover/focus without a
  full-height white/accent rail when the sidebar body is hovered, has no native
  window drag or text-selection side effect, and remains anchored to the press
  point. MainChat follows the live width until its 450px floor. Pointer release
  saves one clamped preferred width; Escape/cancellation restores the starting
  width without saving it. Double-clicking the handle restores the default
  275px width, clamped to the live budget so the reset never breaches the 450px
  MainChat floor. A pointer width below 160px collapses the sidebar as
  a user action and restores the preferred expanded width on reopen. Keyboard
  changes commit immediately and expose localized width semantics. The saved
  width survives relaunch and is restored after sidebar collapse; collapse does
  not convert the preferred width into the icon-rail width. MainChat never
  falls below 450px, and the composer toolbar keeps its left and right groups
  on one row without squeezed buttons. Mode/permission labels remain
  single-line and ellipsized; no toolbar text is vertically split or overlapped.
- **Specs linked**: `04-ux/01-ui-ia.md`, `04-ux/07-ui-design-system.md`,
  `04-ux/08-component-spec.md`, `04-ux/09-interaction-patterns.md`,
  ADR 0141, ADR 0238, ADR 0290, D280, D408, D459
- **Acceptance**: A (app shell), F (persistence), Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered (`sidebar-preferences.test.mjs`,
  `sidebar-resize.test.mjs`, `sidebar-resize-math.test.mjs`); rendered desktop
  drag and relaunch journey remains pending

#### E2E-162: A vendor account and an AI service offer the same model picker

- **Preconditions**: One signed-in vendor (OAuth) account and one API-key AI
  service, both with discoverable models, and at least one of them exposing a
  reasoning-capable model.
- **Steps**: 1) Open Settings → Model configuration. 2) Edit the AI service,
  expand a chosen model's Advanced disclosure, and note its context window, max
  output and thinking chips; cancel. 3) Edit the vendor account and do the same
  on one of its chosen models. 4) Toggle a thinking level on a reasoning-capable
  account model and save. 5) Reopen the account editor and read that model's
  chips. 6) For an OpenAI Codex account, inspect `gpt-6-astra` (or another
  account model also published under models.dev's `openai` provider) and confirm
  its published context/output limits and reasoning levels are present. For
  `gpt-6.1-sol`, verify a 1,050,000-token context and 128,000-token output cap.
  7) In
  the account editor, hand-type a custom model ID the catalog does not publish,
  enable a thinking level on it, and save.
- **Expected**: Both dialogs render the same picker — the same discovered list,
  the same search, the same free-form custom-model entry, the same chosen pane,
  the same Advanced disclosure and the same chips — so the account editor is no
  longer missing the advanced controls. A level enabled on an account model
  persists and reappears when the editor is reopened, including a level the
  catalog does not publish. OpenAI Codex's `openai-codex` adapter key resolves
  the matching `openai` models.dev record, so `gpt-6-astra` is not shown with
  generic 128,000 / 8,192 / no-reasoning defaults. The authenticated ChatGPT
  list comes from `GET {base}/codex/models` on the account token, so an id the
  pin does not know yet is selectable when that response includes it; pi-ai is
  only the OAuth/transport adapter; it supplies no sibling chat-model limits.
  models.dev enriches an ID only when its record matches. A model with no
  published record keeps its explicit levels, starts
  at `off` when no binding default is stored, and keeps all choices available
  for manual opt-in. The account's default model stays the head binding.
- **Specs linked**: `04-ux/06-settings-ia.md`,
  `04-ux/08-component-spec.md` §19, `03-runtime/11-provider-model-system.md`
  §10, `08-meta/decisions-log.md` (D270 refines D237/D240)
- **Acceptance**: B (model config), Quality

#### E2E-163: Advanced model settings own the default thinking level and attachment capabilities

- **Preconditions**: One AI service with discoverable models, including a
  reasoning-capable model that publishes at least three thinking levels, a
  vision-capable model, and a model models.dev describes as text-only. The
  service must persist model-local `supportsImages` overrides.
- **Steps**: 1) Open Settings → Model configuration, edit the service and expand
  a reasoning-capable model's Advanced disclosure. 2) Enable at least three
  thinking levels and pick a default that is not the lowest enabled level, then
  save. 3) Reopen the editor and read the default selector. 4) Disable the level
  currently chosen as default and read the selector again. 5) Start a new session
  on that model and open the composer reasoning menu. 6) Back in Advanced, on
  the text-only model, turn Image input on, save, reopen and confirm the switch
  reports itself as overridden. 7) Open the Composer model menu and confirm
  that this model shows the vision badge. 8) On the published vision model,
  turn Image input off and confirm its Composer row no longer shows the vision
  badge. 9) Attach an image in a session on the text-only model. 10) Tick the
  same box back to the value models.dev publishes, save, and reopen.
  11) Turn PDF input on for a model whose catalog entry omits it, save, and
  attach a PDF. 12) Configure a model, then point the service at an endpoint that
  no longer lists it, reopen the editor and read that model's capability boxes.
- **Expected**: The default thinking level is selectable among the levels the
  binding enables and nothing else; it persists across reopen and is the level
  the home draft chip and a newly persisted session start at, not the strongest
  enabled level. Disabling the chosen default moves it to a still-enabled
  level rather than leaving a level the runtime would clamp away, and the
  selector is absent when a binding enables one level or none. An answered
  Image input switch overrides the published capability in both directions and
  survives reopen. The Composer model menu shows the vision badge for the
  effective `true` override on the published text-only model, hides it for an
  explicit `false` override on the published vision model, and follows the
  published value when the override is reset to `null`. The text-only model
  transports the attached image as an image content block. Ticking a box back
  to the published value
  stores "follow the catalog" rather than an equal-valued override, so a later
  catalog correction still reaches the binding without any separate reset
  control. All seven canonical thinking chips remain available even when the
  catalog publishes no reasoning support, so an endpoint can be opted in
  explicitly. PDF input records the capability without changing transport: the PDF
  stays a bounded file reference the model reads with its file tools. Each
  capability is one checkbox with a short label and no per-row explanatory copy.
  The Advanced body is a compact sheet: the alias hint is a title tooltip, limit
  fields hide native spinners, thinking chips span the pane with the default
  selector on the label row, and attachment plus delegation checkboxes share one
  wrapping row. The first chosen row starts expanded. A configured model absent
  from live discovery still shows its published capabilities rather than reading
  as undescribed.
- **Specs linked**: `03-runtime/11-provider-model-system.md` §6.2,
  `03-runtime/12-provider-config-schema.md`,
  `03-runtime/13-model-catalog-and-selection.md` §11.2,
  `04-ux/08-component-spec.md` §11.7–11.8,
  `04-ux/06-settings-ia.md`, ADR 0218
- **Acceptance**: B (model config), Quality

#### E2E-164: Context compaction preserves the active task boundary

- **Preconditions**: A provider fixture can complete multiple sequential tasks,
  trigger inline automatic compaction at 90% of `hardLimit` (before the hard
  boundary), exercise an active-turn checkpoint during a tool loop, and restart
  a session. The desktop transcript runner also replays a deterministic local
  provider-overflow recovery through the production runtime event handler,
  transcript store projection, and assistant-turn renderer.
- **Steps**:
  1. Complete task A and task B in one session with distinct instructions and
     visible completion replies.
  2. Advance the context estimate to 91% of `hardLimit`, send task C, and capture
     the first provider request; assert that compaction is installed first.
  3. Trigger compaction during task D after tool results cross the 90% trigger
     while remaining below the hard limit; capture the follow-up provider
     request and confirm it uses the checkpoint.
  4. Force summary plus retained-tail recovery to fail once below `hardLimit`
     and once at/above it; the soft failure may proceed unchanged, while the
     hard-boundary failure must not send the provider request.
  5. Start an approved plan execution with the estimate at 91% of `hardLimit`;
     capture the first request and confirm preflight compaction runs before
     `continue()` while retaining the internal approved-plan instruction.
  6. Restart and reopen the session, then send another prompt.
  7. In the isolated overflow fixture, pause compaction after the first provider
     response exceeds the context window. Inspect the rendered assistant turn,
     then let the retry complete.
- **Expected**: Automatic session compaction starts at
   `floor(hardLimit * 0.9)` for prompt, approved-plan, and in-run turn
   preflights; the estimate includes serialized messages, the active system
   prompt, and tool schemas. A request is never issued at or above `hardLimit`.
   A failed soft-trigger summary may proceed only while below the hard budget,
   and hard-limit failure remains fail-closed. A completed-turn checkpoint has
   an empty retained tail; the next request contains its summary plus task C
   and no bare A/B prompts. An approved-plan checkpoint uses active-turn
   retention so the instruction survives before `continue()`. An active
   checkpoint retains exactly the latest active user prompt, with no older
   user prompts or pre-boundary assistant/tool messages. Restart honors
   `retainedTailMode`, and legacy multi-user tails normalize to the latest user
   message. During recoverable overflow compaction, the existing assistant
   bubble stays streaming without an error card; a successful retry completes
   that same bubble once. A failed retry surfaces its terminal error. If
   automatic summary generation fails at the hard boundary, the
   fallback retains a bounded recent user tail. The visible transcript remains
   complete and checkpoint rows remain.
- **Specs linked**: `03-runtime/02-agent-runtime.md`,
  `03-runtime/04-data-storage.md`, `03-runtime/16-tool-result-limits.md`,
  `08-meta/decisions-log.md` (D623), ADR 0064, ADR 0136
- **Acceptance**: C (chat/stream), F (persistence), Quality
- **Milestone**: M5
- **Status**: Unit-covered (`packages/agent-runtime/src/context-budget.test.ts`,
  `runtime.test.ts`, `subagent-context.test.ts`); isolated overflow recovery
  fixture passed through `pnpm test:e2e:transcript`; broader provider/UI journey Draft

#### E2E-165: A2A and Peer tools are withdrawn

- **Preconditions**: Agent mode; protocol v11 host. A user subagent definition
  lists `A2A` (or `Peer`) among its tools. Two Agent-mode sessions are open.
- **Steps**: 1) Handshake and inspect host capabilities. 2) Inspect the parent
  Agent tool list and `ToolSearch` results. 3) Load the definition that names
  `A2A`/`Peer`. 4) Start two concurrent working-tool delegates. 5) Ask whether
  one conversation can see the other.
- **Expected**: Handshake succeeds at protocol v11 and does not advertise
  `"a2a"`. `A2A` and `Peer` are absent from the parent catalog, deferred tools,
  and `ToolSearch`. The unknown tool names are dropped with a parse warning;
  remaining working tools still spawn. Concurrent delegates report only through
  `Task*` — there is no sibling or parent-to-parent channel. `a2a.*` RPC
  methods return method-not-found. Schema v14 databases have no `a2a_*`
  tables.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f.2,
  `03-runtime/03-tools-and-permissions.md` §10.2,
  `03-runtime/06-host-rpc-protocol.md` §3–§4,
  `08-meta/decisions-log.md` (D326), ADR 0165
- **Acceptance**: E (tools & permissions) + C (chat/stream) + Security
- **Milestone**: M5
- **Status**: Draft

E2E-165b, E2E-165c, and E2E-165d (A2A push, cross-session A2A, parent A2A)
are withdrawn with ADR 0165.

#### E2E-166: Subagent model selection

- **Preconditions**: Agent mode; at least one provider has two configured model
  bindings; a builtin subagent definition is available.
- **Steps**: 1) Enable the delegation checkbox for one model binding, save the
  provider, reopen it, and confirm the checkbox remains enabled; restart the
  app, reopen the provider again, and confirm it is still enabled. 2) Start a
  session and inspect the parent agent's system prompt for the delegation model
  summary. 3) Delegate a Task with `model: "provider/modelId"` pointing to the
  enabled binding. 4) Delegate a Task with `model:` pointing to a binding that
  is not enabled for subagents. 5) Delegate a Task with `model:` pointing to a
  model that is not configured at all. 6) Delegate a Task with no `model:`
  parameter and a definition that has a frontmatter model pin. 7) Delegate a
  Task with no `model:` parameter and a definition that has no frontmatter
  model pin. 8) With no enabled delegation models, delegate a Task once with
  no `model:` and once with `model:` repeating the current session's
  `provider/modelId`. 9) Pin an unselected model to one definition; attempt to
  use it as another definition's explicit override, then invoke its owner with
  no override. 10) Remove a previously enabled override key and start another
  prompt in the same idle session.
- **Expected**:
  1. Saving and reopening the provider preserves the
     `availableForSubagents` opt-in, including after an application restart.
  2. The delegation model summary appears in the parent's system prompt listing
     every successfully resolved model marked `availableForSubagents`, with
     no definition-only pins. The Task definition catalog displays each default
     model and recommends omitting `model` to preserve it.
  3. The Task tool accepts the `model` parameter and the delegate runs on the
     specified model, not the session model; its delegation node shows the
     effective model id immediately after the subagent name.
  4. If the model is not configured or not enabled for delegation, the Task
     returns a tool error listing available models. With an empty override
     catalog, the error, system summary and Task description name the Settings
     → Models / model Advanced / "Available for AI delegation" / save path.
     A denied guessed override sends no child request; retrying with `model`
     omitted still uses the definition default or inherits the parent model.
  5. Resolution priority is Task.model parameter → definition frontmatter pin →
     session model.
  6. On-demand resolution succeeds for models enabled in provider settings via
     the `provider.resolveSubagentModel` RPC.
  7. When no delegation model is configured, omitting `model:` and explicitly
     repeating the current session `provider/modelId` both start the delegate
     on the session model; the latter is not reported as an unavailable model.
  8. A private pin remains usable by its definition when `model` is omitted
     or when `Task.model` repeats that definition's own pin key, but cannot be
     selected for another definition without opt-in. Rejection issues no child
     provider request. On-demand authorization does not retire an idle runtime;
     changed launch opt-in does, so a stale cached binding grants no selection
     rights.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f,
  `03-runtime/11-provider-model-system.md` §7,
  `03-runtime/12-provider-config-schema.md` §2,
  `08-meta/decisions-log.md` (D278)
- **Acceptance**: C (chat/stream) + B (model configuration) + E (tools)
- **Milestone**: M6+
- **Status**: Partially automated. `pnpm test:e2e:subagent-models` drives the
  built sidecar over real NDJSON and a local deterministic SSE model fixture:
  empty-catalog guidance and inheritance after a denied override,
  private cross-definition rejection, own-pin echo, normal pin use, allowed override priority,
  on-demand authorization without runtime rebuild, exact-session inheritance, and revocation across two
  prompts all pass. Runtime unit tests cover the same selection gates and the
  desktop launch test exercises independent opt-in, revocation, and accounts
  sharing a vendor alias; the wiring test checks unique on-demand matching. The settings checkbox
  UI/persistence journey and live external provider execution remain manual;
  this fixture does not claim a complete native UI journey.

- **Authorization regression coverage (#841)**: `pnpm test:e2e:subagent-models`
  grants a model on demand, reuses the runtime, then revokes it without changing
  the launch catalog. The next prompt must reauthorize and issue no child request.
  A transcript-restored resume with a colliding model id must use the session
  binding rather than another definition's private account. Runtime tests also
  cover own pins/fallbacks, opted-in bindings, visible fallback metadata, live-key
  reauthorization, and late RPC responses crossing parent turns.

#### E2E-170: Shell titlebars use borderless chrome

- **Preconditions**: PI-Desktop is open in chat, at least one destination page,
  and Settings on a supported light or dark theme. On Windows/Linux, renderer-
  drawn window controls are visible.
- **Steps**: 1) Inspect the top band on the chat, destination, and Settings
  surfaces. 2) Switch between light and dark themes and repeat. 3) On
  Windows/Linux, inspect the window-control band and its boundary with the
  adjacent surface. 4) Drag the titlebar and activate each window-control
  button.
- **Expected**: The shared 46px top band remains stable and draggable, but its
  lower edge has no visible border line in either theme or route. The
  Windows/Linux control band has no bottom line; only its existing faint side
  seam separates the controls from the adjacent surface. Focus rings, hover
  states, window actions, and content clearance remain unchanged.
- **Specs linked**: `04-ux/01-ui-ia.md`, `04-ux/07-ui-design-system.md`,
  `04-ux/08-component-spec.md`
- **Acceptance**: A (app shell), Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered (`topbar-consistency.test.mjs`,
  `settings-drag-region.test.mjs`, `window-menu.test.mjs`); rendered light/dark
  desktop journey remains pending

#### E2E-172: Mid-turn thinking pick does not collapse an unpinned session menu

- **Preconditions**: The app default is a reasoning-capable custom
  provider/model whose binding publishes a sparse set such as `low`/`high`/`max`.
  A session exists on the default create path (`provider_id`/`model_id` NULL).
- **Steps**: 1) Send a prompt so the session is running. 2) Open the Composer
  model × reasoning menu and select a different enabled thinking level. 3) Reopen
  the thinking submenu without waiting for the turn to finish. 4) Switch to
  another session and back. 5) Let the turn finish.
- **Expected**: The chip shows the selected level (not Off). The submenu still
  lists every enabled binding level. Switching sessions does not collapse the
  menu. After `agent_end`, the queued configuration is durable. Re-saving a
  provider is not required to recover the menu.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  `03-runtime/13-model-catalog-and-selection.md`,
  `04-ux/08-component-spec.md` §11
- **Acceptance**: B (model config), C (chat and stream), Quality
- **Milestone**: M6
- **Status**: Unit-covered (`session-thinking.test.mjs`, `thinking-ui.test.mjs`,
  `composer-send-state.test.mjs`); full UI scenario Draft
  (run only in a capable environment when this surface changes)

#### E2E-174: Binding default thinking level seeds drafts and new sessions

- **Preconditions**: One AI service with a reasoning model whose published
  levels omit `off` (for example `low` / `high` / `max`) and whose Advanced
  default thinking level is a non-max enabled level such as `low`.
- **Steps**: 1) Open the home composer with no active session and read the
  model × reasoning chip. 2) Create a new task without opening the reasoning
  menu, then read the chip and the session's stored `thinkingLevel`. 3) On the
  home draft, switch to that model from the model menu and read the chip before
  sending. 4) Change the binding default to another enabled level, save, and
  repeat steps 1–2 on a fresh draft.
- **Expected**: The home draft chip, a draft model switch, and the newly
  persisted session all start at the binding's stored default, not the
  strongest published or enabled level. Changing the default in Settings
  changes the next draft and new session and does not rewrite existing
  sessions.
- **Specs linked**: `03-runtime/11-provider-model-system.md` §6.2,
  `03-runtime/13-model-catalog-and-selection.md` §4,
  `04-ux/08-component-spec.md` §11.4 / §11.5, `08-meta/decisions-log.md` (D303)
- **Acceptance**: B (model config), C (chat/stream), Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered (`thinking-levels.test.ts`,
  `thinking-ui.test.mjs`); rendered desktop journey remains pending

#### E2E-175: A paged Read is not shown as truncated

- **Preconditions**: A project-bound Agent session; the workspace contains a
  text file of at least 3000 lines whose lines are shorter than 16,384
  characters, plus a fixture whose first line exceeds that cap.
- **Steps**:
  1. `Read` the long file with no `offset`/`limit`.
  2. `Read` the same file with `offset` equal to the reported next offset and
     a modest `limit`.
  3. `Read` the over-long-line fixture.
  4. Grep a token that matches more than the default `headLimit`.
- **Expected**:
  - Step 1 returns the default 2000-line window, `truncated: false`, no
    truncated chip, `totalLines` of the whole file, and a `notice` naming the
    next offset. It does not tell the model to Grep.
  - Step 2 continues without overlap and stays `truncated: false`.
  - Step 3 sets `truncated: true`, counts the clipped line in `notice`, and
    shows the truncated chip.
  - Step 4 sets `truncated: true` because remaining matches exist, and shows
    the chip.
- **Specs linked**: `03-runtime/16-tool-result-limits.md` §2 / §5,
  `04-ux/08-component-spec.md` §9.2, `08-meta/decisions-log.md` (D306)
- **Acceptance**: C (chat & stream), E (tools & permissions)
- **Milestone**: M5
- **Status**: Unit-covered (host-core `tools` tests)

#### E2E-176: Settings Info opens a prefilled GitHub bug form

- **Preconditions**: Settings can be opened; the machine can launch a system
  browser.
- **Steps**: 1) Open Settings → Info. 2) Confirm the Application row shows the
  current app version. 3) Search settings for the Report a problem label.
  4) Activate Open GitHub.
- **Expected**: The row is indexed by Settings search and stays on Info. The
  action calls `pi-desktop/app/openFeedback` with no URL from the renderer.
  Main opens `https://github.com/vastsa/PI-Desktop/issues/new` with
  `template=bug_report.yml` and prefills `app-version`, `os`, and
  `environment`. The GitHub bug form still requires description, reproduction
  steps, expected, actual, version, and OS; blank issues remain disabled.
- **Specs linked**: `04-ux/06-settings-ia.md`, `03-runtime/01-ipc-protocol.md`,
  `06-delivery/03-ai-development-workflow.md`, `08-meta/decisions-log.md`
  (D313), ADR 0157
- **Acceptance**: H (diagnostics), Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered (`github-feedback.test.ts`,
  `feedback.test.mjs`); rendered desktop journey remains pending
  (run only in a capable environment when this surface changes)

#### E2E-177: Switching a long running session keeps the newest prompt in view

- **Preconditions**: A session has stayed open long enough that the renderer
  holds more than the newest-100 durable page (hundreds of user/assistant/tool
  rows); a second session exists so a switch is possible.
- **Steps**: 1) Interrupt an in-flight reply if needed, then send a new
  prompt. 2) While that turn is still running, switch to the other session and
  back. 3) Confirm the newest user row (and any streaming tail) is at the
  bottom of the transcript and the session still shows as running. 4) Optional:
  Stop, switch away and back; the same newest rows remain in chronological
  order. 5) With an older identical prompt already durable, send that same
  text again and immediately switch away and back before its persistence
  acknowledgement is applied.
- **Expected**: Revalidation does not append older live history after the
  bounded durable page. The mounted trailing window still shows the just-sent
  prompt and the live tail. The turn continues in the background across the
  switch. The older same-text row remains distinct and cannot suppress the new
  optimistic prompt; the durable echo replaces that prompt in place. Stop is
  not required to make the prompt visible again.
- **Specs linked**: `04-ux/08-component-spec.md` §1.6 / §3.5,
  `04-ux/09-interaction-patterns.md` (session isolation), ADR 0120, ADR 0137,
  `08-meta/decisions-log.md` (D261, D317)
- **Acceptance**: C (conversation & stream), F (persistence), Quality
- **Milestone**: M5
- **Status**: Unit-covered (`session-transcript.test.mjs` D317 and missed-ack
  same-text cases); full
  desktop journey Draft (run only in a capable environment when this surface changes)

#### E2E-183: Switching an idle session keeps a completed reply that is not on disk yet

- **Preconditions**: Two conversations exist. The source has a completed
  user prompt and an assistant reply still on screen. The durable
  `session.get` page for that session still has only the user row (the
  persistence outbox has not flushed the assistant line).
- **Steps**: 1) Wait until the turn is no longer running. 2) Switch to the
  other session and back. 3) Confirm the assistant reply is still visible.
  4) Optional: wait until the outbox drains, switch away and back again;
  the reply remains and now also exists in the JSONL.
- **Expected**: Idle revalidation stitches the live snapshot onto the
  durable page. A completed live-only assistant/tool row is not replaced by
  the user-only durable page. Live provenance is not cleared until that
  page contains every live id.
- **Specs linked**: `04-ux/08-component-spec.md` §1.6 / §3.5,
  `04-ux/09-interaction-patterns.md` (session isolation), ADR 0137,
  `08-meta/decisions-log.md` (D317, D324)
- **Acceptance**: C (conversation & stream), F (persistence), Quality
- **Milestone**: M5
- **Status**: Unit-covered (`session-transcript.test.mjs` D324 case,
  `session-switch-performance.test.mjs`); full desktop journey Draft (do
  not run E2E locally unless explicitly requested)

#### E2E-184: Completed AI replies survive closing and reopening the app

- **Preconditions**: A session with at least one finished user prompt and
  assistant reply. The reply may still be in the persistence outbox or only
  in `sessions/<id>.inflight.json` when the process exits.
- **Steps**: 1) Send a prompt and wait until the assistant reply is complete
  and the session is idle. 2) Quit the app (window close / tray Quit) and
  relaunch. 3) Open the same session. 4) Repeat with a hard kill of the
  process immediately after the reply appears on screen. 5) Repeat with
  several completed turns, then quit and reopen.
- **Expected**: Every user prompt and every completed assistant reply is
  visible after relaunch. No session shows user rows with empty gaps where
  the answers were. A reply recovered from a leftover checkpoint of a
  `completed` turn is `complete`, not `aborted`. Tool rows that had reached
  `tool_end` are also present. Earlier turns already on disk are unchanged.
- **Specs linked**: `03-runtime/04-data-storage.md`,
  `03-runtime/07-process-model.md`, `03-runtime/10-session-state-machine.md`,
  ADR 0041, ADR 0153, `08-meta/decisions-log.md` (D327)
- **Acceptance**: C (conversation & stream), F (persistence)
- **Milestone**: M5
- **Status**: Unit-covered (`sessions.rs` D327 inflight tests,
  `persistence-outbox.test.mjs`, `inflight-checkpoint.test.mjs`); protocol
  reproduction in the issue-42 host+outbox harness; full desktop journey
  Draft (run only in a capable environment when this surface changes)

#### E2E-178: A missing sessions row is restored so the outbox can drain

- **Preconditions**: A session has a live `sessions/<id>.jsonl` and queued
  appends in `session-message-outbox.json`, but its row is gone from
  `pi.sqlite` `sessions` (WAL/index loss). The queued head may carry a turn
  id whose row is missing or belongs to another session. For legacy replay,
  the JSONL may already contain repeated copies of that message id.
- **Steps**: 1) Confirm the sidebar no longer lists the session and
  `session.appendMessage` would fail `session not found`. 2) Restart the
  app (or otherwise complete a host handshake that flushes the outbox).
  3) Replay an unindexed message with a stale turn id after writing its
  transcript line more than once, with a later indexed message behind it.
  4) Optional: delete the session and confirm its outbox entries are
  dropped rather than resurrected.
- **Expected**: Host boot reinserts the sessions row from JSONL and rebuilds
  its index. The stale turn link is omitted without losing the message; the
  outbox drains and later messages keep transcript order. Replayed copies are
  updated in place and do not add another line; `last_seq` and search index
  match the deduplicated transcript. A user-deleted session is not recreated.
- **Specs linked**: `03-runtime/04-data-storage.md`,
  `03-runtime/06-host-rpc-protocol.md`, `03-runtime/07-process-model.md`,
  ADR 0041, `08-meta/decisions-log.md` (D318)
- **Acceptance**: C (conversation & stream), F (persistence)
- **Milestone**: M5
- **Status**: Unit-covered (`sessions.rs` stale-turn/replay tests,
  `persistence-outbox.test.mjs` full-cap rejection and drain tests); full
  desktop journey Draft (run only in a capable environment when this surface changes).

#### E2E-179: Parent tools after a Task fan-out stay outside the delegation card

- **Preconditions**: A project-bound Agent session whose provider stream can
  emit two `Task` calls in one assistant message and then keep working — think,
  `Read`, `Grep` — before a `TaskWait`.
- **Steps**: 1) Prompt a turn that fans out two delegates, then continues with
  parent thinking and workspace reads while at least one delegate is still
  running. 2) Inspect the expanded delegation card and the rows below it.
  3) Let the delegates settle and inspect elapsed time on the card versus the
  parent processing group. 4) Reload the session and re-expand the card.
- **Expected**: The delegation card contains only the main-agent root and the
  two `Task` nodes. Parent thinking, `Read`, `Grep`, and `TaskWait` render in a
  separate processing group, not flush against the subagent tile and not under
  a “Subagent working” header. The card keeps inset from its tile edge. While a
  delegate is still running the card stays labelled working, remains open, and
  ticks elapsed from that fan-out's own timestamps even after the parent has
  moved on. Reload preserves the same split.
- **Specs linked**: `04-ux/08-component-spec.md` §9.9, ADR 0062,
  decisions-log D265, D319
- **Acceptance**: C (conversation), Quality
- **Milestone**: M6+
- **Status**: Unit-covered (`assistant-turns.test.mjs`,
  `subagent-topology.test.mjs`, `subagent-transcript.test.mjs`); desktop
  journey pending (run only in a capable environment when this surface changes)
#### E2E-180: Sent file references stay chips and open on click

- **Preconditions**: An Agent session in a workspace that contains a nested
  source file, an HTML file, and a file whose name contains whitespace, and a
  project group whose second folder holds a source file of its own. The
  composer can also paste an OS file into session scratch. The bundled File
  Manager plugin is loaded.
- **Steps**: 1) Attach a workspace source file, a workspace HTML file, a
  whitespace-named file, and a pasted scratch file via composer chips, then
  send. 2) Inspect the user bubble. 3) Click the HTML chip, then the workspace
  source chip, then the scratch chip. 4) Attach the file that lives in the
  project's second folder and click its chip.
- **Expected**:
  - Each sent reference renders as a compact leaf-name chip (icon + name),
    not as a full `@path`. The tooltip and accessible name keep the
    canonical path. Quoted and scratch-absolute paths are included.
  - A chip plus a short prompt keeps the user plate content-sized; it does
    not stretch to the `min(82%, 600px)` ceiling.
  - Clicking an unpositioned project or scratch HTML chip opens the work-panel
    browser on that file.
  - Clicking the workspace source chip opens it in the File Manager work-panel
    view on that file; the host `file:` tab and the OS default application are
    no longer what a chip click opens.
  - Clicking the scratch chip opens the host `file:` tab on that file's
    absolute path, because it lives outside the File Manager's project root.
  - Clicking the chip of the file in the project's second folder opens it in
    the File Manager view on that file: completion searches the whole project
    group, primary folder first, and a sibling-folder file is addressed by
    absolute path because a relative path always means the primary folder
    (ADR 0263).
  - The persisted user message still contains the canonical `@path` text for
    the agent.
- **Specs linked**: `04-ux/08-component-spec.md` §8.3 / §11.8,
  `04-ux/09-interaction-patterns.md` §8a.2, `03-runtime/01-ipc-protocol.md`,
  ADR 0163, ADR 0241, ADR 0262, ADR 0263, `08-meta/decisions-log.md` (D320)
- **Acceptance**: C (conversation & stream), Quality
- **Milestone**: M5
- **Status**: Unit-covered (`chat-links.test.mjs`, `transcript-file-chips.test.mjs`,
  `fs-panel-guard.test.mjs`, `transcript-style.test.mjs`); full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-CHAT-shorthand-file-ref-opens-the-matching-file

- **Preconditions**: A project group whose primary folder holds
  `img/openimage.js`, `src/dir/a.ts`, and a deeper second `dir/a.ts` such as
  `packages/app/dir/a.ts`, and whose second folder holds `lib/only-here.ts`.
  The open session's scratch store holds a file with the same leaf name
  `openimage.js` and one file no project folder has; the attachment store holds
  an `attachments/<sha256>` blob. The transcript renders assistant markdown.
- **Steps**: 1) Prompt a turn whose reply names `openimage.js` as inline code
  and click it. 2) Prompt a turn that names `dir/a.ts` and click it. 3) Prompt
  a turn that names the scratch-only file, click it, then do the same for the
  `attachments/<sha256>` ref. 4) Prompt a turn that names an absolute path to a
  project file whose leaf name also exists in scratch, and click it. 5) Prompt
  a turn that names `missing-helper.js` and click it. 6) Prompt a turn that
  names `only-here.ts` and click it.
- **Expected**:
  - Clicking `openimage.js` opens the project's `img/openimage.js`, although the
    scratch store holds a file with that same leaf name: the project is
    searched to exhaustion before the scratch store is considered at all.
  - `dir/a.ts` matches both `src/dir/a.ts` and
    `packages/app/dir/a.ts`, so the shorthand is ambiguous and opens nothing.
    The exact reference `src/dir/a.ts` opens that path.
  - A reference the project cannot answer resolves in the session scratch
    store; one that neither answers resolves in the attachment store, and an
    `attachments/<sha256>` ref opens that stored blob.
  - An absolute reference that names a real file inside a known root wins
    outright, whichever shorthand would otherwise have matched.
  - `only-here.ts` opens the second folder's `lib/only-here.ts`: the primary
    folder is searched first and to exhaustion, then the project group's other
    folders in the group's own order, and the match names the folder that
    answered (ADR 0263).
  - A file that answered from a sibling folder is addressed to the work panel by
    its absolute path, while a primary-folder file stays project-relative
    (ADR 0263).
  - A reference that matches nothing raises an error toast reading
    `No file matches missing-helper.js` and opens nothing: no new work-panel
    tab, no empty panel, no blank side-browser page, and the work panel and
    transcript keep the content they already had.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` § fs,
  `04-ux/09-interaction-patterns.md` §8a.2, ADR 0124, ADR 0163, ADR 0249,
  ADR 0262, ADR 0263
- **Acceptance**: C (conversation & stream), D (workspace), Quality
- **Milestone**: M5
- **Status**: Unit-covered
  (`apps/desktop/test/chat-ref-resolve.test.mjs`); full UI journey Draft (run
  only in a capable environment when this surface changes)

#### E2E-CHAT-spaced-absolute-file-paths

- **Preconditions**: On Windows, open a project rooted at a directory whose
  name contains a space. Create `readme.md` there through a chat Write tool
  call; keep a same-name file in another project directory and one file outside
  every allowed root. Repeat the path-recognition checks with a POSIX project
  path containing a space on macOS or Linux.
- **Steps**: 1) Click the full path in the Write row. 2) Click the same full
  path as inline code and as ordinary text in the assistant reply. On Windows,
  also click it as a Markdown link with an angle-bracketed destination, for
  example `[readme.md](<C:\workspace with spaces\readme.md>)`. 3) Click a
  relative path whose middle directory contains a space, then a first-segment
  spaced path using an explicit `@"..."` reference. 4) Click the outside
  absolute path.
- **Expected**: Every allowed reference opens the exact file in the existing
  side file view; no path is truncated to its suffix or redirected to the
  same-name file. The Windows Markdown link keeps a valid sanitized address
  and reaches the existing file opener with the original drive path. The outside
  path opens that exact file in the host file view (ADR 0339), dotfile folders
  such as `.ssh` included, while a missing file reports that no file matches.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` § fs,
  `04-ux/08-component-spec.md` §8.3.
- **Acceptance**: C (conversation & stream), D (workspace), Quality
- **Milestone**: M5
- **Status**: Unit/component-covered (`chat-links.test.mjs`,
  `chat-ref-resolve.test.mjs`, `tool-row-file-refs.test.mjs`); full UI journey Draft.

#### E2E-CHAT-file-ref-opens-the-surface-that-owns-it

- **Preconditions**: The bundled File Manager plugin is loaded and enabled and
  the work panel is closed. The open session's scratch store holds one HTML
  file and one other file, and the attachment store holds one blob. The project
  is a group whose primary folder
  contains an `.html` page and a text file, and whose second folder holds a text
  file of its own. The same session's transcript carries a `Read` row whose
  summary names a project file, a `Glob` result listing project paths, and a
  `Grep` result grouping its hits by file.
- **Steps**: 1) Click a project file reference in an assistant reply. 2) Type an
  unsaved edit into that view and click the same reference again. 3) Click a
  reference that resolves into the session scratch store, then the
  `attachments/<sha256>` reference. 4) Click a workspace `.html` reference in an
  assistant reply and the same reference as a sent user chip; click the scratch
  HTML reference too. 5) Click the file
  path in the tool row's summary, then a path in the `Glob` result's file list
  and a path heading of the `Grep` result. 6) Disable the File Manager plugin,
  then click a project file reference and the tool row summary. 7) Click a
  reference that resolves in the project's second folder, then one that resolves
  in its primary folder. 8) Right-click the sent `@path` chip, the inline-code
  reference, the markdown link, the local image, a tool row's file path, a tool
  result's file list, and an attachment image chip; then right-click a reference
  that matches nothing. On an HTML reference, open the Open with submenu and
  choose File Manager, built-in browser, and default browser; repeat for the
  scratch HTML file. 9) Use Copy full path and Copy relative path, then do the
  same on a reference that resolves in the session scratch store. 10) Choose
  Show in folder on a project file and on a scratch file.
- **Expected**:
  - Right-clicking a file reference offers Copy full path and Copy relative
    path on each transcript surface that names it, plus Show in folder in a
    local session. An unpositioned HTML reference also has a second-level
    Open with submenu for File Manager, built-in browser, and default browser.
    Show in folder reveals the resolved file in the system file manager and a
    missing reference reports itself instead. Each open choice resolves
    the reference first, and a missing reference reports itself without opening
    a same-named file elsewhere.
  - A copy writes exactly what it names: the absolute address for the full copy
    and the project-relative spelling for the relative one; a scratch or
    attachment file reports that it has no relative path instead of copying an
    absolute one under that name.
  - A project file opens in the File Manager work-panel view on that file, with
    its ancestor folders expanded and the file selected; no host `file:` tab is
    added for it.
  - Clicking the same reference again does not reload the view: the unsaved edit
    is still in the editor and no second tab appears.
  - A scratch or attachment file opens in the host `file:` tab under Open
    resources, addressed by its absolute path, never in the File Manager view.
  - A plain click on an unpositioned `.html` / `.htm` reference from any
    project folder or session scratch opens it in the work-panel side browser.
    In the Open with submenu, File Manager opens the resolved file in that
    plugin view, built-in browser opens the same absolute path in the side
    browser, and default browser uses the host's validated OS file-open path.
    A positioned HTML reference keeps its line-aware host file tab behavior.
  - A tool surface reaches the destination of the file it names, not one of its
    own: the tool row's summary path and the paths of the `Glob` file list and
    the `Grep` path headings open the same project file in the File Manager view.
    A summary path that is a link opens the file without expanding the row, and
    only a summary without a resolvable target falls through to the row's own
    disclosure.
  - A reference that resolved in the project's second folder opens in the File
    Manager view on that file, reached by its absolute path, with no host
    `file:` tab; the reference from the primary folder opens in that same view
    addressed project-relative (ADR 0263).
  - With the plugin disabled, a direct project-file click from the reply, tool
    row, or result list starts the bundled File Manager within its existing
    scope and permission grant, then opens the requested file there. If the
    scope or grant excludes the current project, or the view still cannot
    start, the host `file:` tab opens with an unavailable notice.
- **Specs linked**: `04-ux/08-component-spec.md` §8.3, §9.6,
  `04-ux/09-interaction-patterns.md` §8a.2, ADR 0104, ADR 0163, ADR 0241,
  ADR 0249, ADR 0262, ADR 0263
- **Acceptance**: C (conversation & stream), G (plugins), Quality
- **Milestone**: M5
- **Status**: Unit-covered
  (`apps/desktop/test/chat-file-open-with-menu.test.mjs` for menu destinations
  and resolved-path routing, `apps/desktop/test/transcript-file-chips.test.mjs`
  for the wiring, and `apps/desktop/test/tool-row-file-refs.test.mjs` for the
  work-panel entry each shape of resolution produces). The isolated Electron renderer journey in
  `scripts/e2e-file-ref-line-scroll.mjs` verifies a Markdown link enables the
  File Manager on demand and a positioned reference still opens in the host
  viewer. `pnpm test:e2e:transcript` also exercises the rendered second-level
  menu, destination selection, and keyboard focus return; the full
  file-reference journey through all three destinations remains Draft.

#### E2E-CHAT-mp4-attachment-opens-in-system-player

- **Preconditions**: A conversation has one pasted MP4 in session scratch and
  two stored MP4 attachments whose content-addressed refs have no extension:
  one larger than 512 KiB and one smaller binary file. All retain `video/mp4`
  metadata.
- **Steps**: Click each attachment in the transcript, then choose **Open with
  default application** in the host file tab. Repeat with a workspace `.mp4`.
- **Expected**: The large attachment reports that inline preview is unavailable
  because of size and the small attachment reports binary content; both offer
  the OS-open action. The host validates realpath containment and hands the OS
  an `.mp4` alias of the same stored bytes. A file outside allowed roots or a
  symlink escape is refused. Failed OS handoff is visible to the user.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` § fs,
  `04-ux/09-interaction-patterns.md` §8a.2.
- **Acceptance**: C (conversation & stream), Quality, Security
- **Milestone**: M5
- **Status**: Electron fixture covered for pasted scratch MP4 and both blob sizes
  (`test:e2e:composer-paste`); full installed-app/player journey Draft.

#### E2E-181: An imported skill is listed in the next session catalog

- **Preconditions**: Settings > Agent > Skills is open. A conventional
  `<skill>/SKILL.md` document has a non-ASCII frontmatter name and a folded
  YAML description. An empty Agent session is available on the same project
  the skill will be imported into.
- **Steps**:
  1. Import the `SKILL.md` into Global, then into the selected project.
  2. Confirm the Skills page shows the display name, the ASCII id (directory
     name, not `skill`), and the flattened description.
  3. Start a new Agent session on that project and ask the agent to use the
     skill by display name.
  4. Repeat with a second directory skill that also lacks an ASCII name, and
     with a skill whose description is a `|` block.
- **Expected**:
  - Import succeeds. The catalog lists both skills with distinct ids.
  - The next session's system prompt includes each skill's id, name, and
    flattened description. The `Skill` tool loads the body by that id.
  - A misspelled `Skill` id lists user skill ids among the available skills,
    not only plugin ids.
  - Neither document is dropped because its title is non-ASCII or because both
    files are named `SKILL.md`.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` §12b,
  `07-plugins/01-plugin-system.md` §12.3, `08-meta/decisions-log.md` (D174,
  D194)
- **Acceptance**: E (tools & permissions), Quality
- **Milestone**: M5
- **Status**: Unit-covered (host-core `user_skills` / `agent_capabilities`
  tests, `apps/desktop/test/plugin-skills.test.mjs`); full UI journey Draft
  (run only in a capable environment when this surface changes)

#### E2E-182: Relative file paths in chat and markdown preview open

- **Preconditions**: An Agent session in a workspace that contains
  `apps/desktop/src/App.tsx`, `docs/adr/0163-transcript-file-reference-chips.md`,
  `docs/spec/00-baseline.md`, `核查报告.md`, and a Unicode-named file such as
  `报告.pdf`.
- **Steps**: 1) Open an existing session whose transcript already contains
  assistant markdown. 2) Prompt a turn whose assistant reply mentions
  `apps/desktop/src/App.tsx` as a bare path, as inline code, a Unicode path such
  as `报告.pdf`, and as a markdown link; also include
  `[核查报告.md](核查报告.md)`. 3) Click each. 4) Open the ADR markdown file
  in the work-panel files viewer and click a `../spec/00-baseline.md` link.
  5) Include an absolute path under the workspace, an outside absolute path,
  and a `~/` path in chat; confirm only the under-root path becomes a target.
  6) Send a user message `使用llama.cpp，给我迁移步骤，只读。`, then a user
  message that names the real `apps/desktop/src/App.tsx` as a bare path and as
  `@apps/desktop/src/App.tsx`. 7) Add a workspace directory link to an
  outside `page.md`, a second in-root `page.md`, and a link to an in-root file;
  check the exact linked path and a shorthand `page.md`. Repeat with a session
  scratch directory link, and check a dangling link.
- **Expected**:
  - Opening the session paints the transcript without throwing.
  - Each chat path opens `apps/desktop/src/App.tsx` in the File Manager
    work-panel view — the file view a chat click prefers — not a host `file:`
    tab.
  - Clicking `[核查报告.md](核查报告.md)` in the assistant reply opens that
    project Markdown file in the File Manager work-panel view.
  - Unicode filenames and multi-segment paths inside the workspace become
    targets, while an outside absolute path and a `~/` path stay plain text.
  - An absolute path under the workspace resolves to its workspace-relative
    target.
  - The markdown-file `../` link opens `docs/spec/00-baseline.md`, not a
    workspace-root `spec/00-baseline.md`.
  - A `../../../outside.ts` link from `docs/adr` stays inert.
  - The user sentence containing `使用llama.cpp` stays exact original text, not
    a file chip, when that path does not exist.
  - A user-message bare path becomes a chip only after `fs/resolveRef` confirms
    a real file; an explicit `@path` chips immediately.
  - Escaping and dangling exact links do not become file targets or redirect to
    the same-name in-root file. A shorthand selects the first currently valid
    in-root file, while an in-root link still opens its target. Scratch links
    follow the same containment rule.
- **Specs linked**: `04-ux/08-component-spec.md` §8.3,
  `08-meta/decisions-log.md` (D322)
- **Acceptance**: C (conversation & stream), D (workspace), Quality
- **Milestone**: M5
- **Status**: Unit-covered (`chat-links.test.mjs`,
  `verified-chat-files.test.mjs`, `transcript-file-chips.test.mjs`,
  `markdown-prose-style.test.mjs`); full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-185: External URL opens stay on http(s) and mailto

- **Preconditions**: A chat transcript can render markdown links. A plugin
  is granted `shell.openExternal`. The work-panel preview can load an
  http page and a workspace HTML file.
- **Steps**: 1) Modified-click https, mailto, `file:`, `javascript:`,
  `ms-msdt:`, and a custom-scheme markdown link (`target="_blank"`).
  2) From the plugin, call `pi.shell.openExternal` with https, mailto, and
  `file:`. 3) In the embedded preview, `window.open` an https URL and a
  `file:` URL; use Open in browser on the http page and on the workspace
  HTML file.
- **Expected**:
  - https and mailto open in the OS handler. `file:`, `javascript:`,
    `data:`, `ms-msdt:`, and custom schemes do not.
  - Plugin `file:` fails with `INVALID_ARGUMENT`; mailto succeeds.
  - Preview `window.open` of a non-allowlisted scheme is denied in-app and
    does not call `openExternal`.
  - Open in browser for http(s) uses `openExternal`; for an in-root file
    preview it uses `openPath`, not a `file:` URL through `openExternal`.
- **Specs linked**: `05-security/01-security.md`,
  `07-plugins/04-plugin-security.md` §8, `07-plugins/03-plugin-api.md`,
  ADR 0109, ADR 0168, `08-meta/decisions-log.md` (D330)
- **Acceptance**: Security
- **Milestone**: M5
- **Status**: Unit-covered (`safe-open-external.test.mjs`,
  `feedback.test.mjs`); full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-186: Token usage dashboard is plugin-owned; host still stores turn totals

- **Preconditions**: A profile with at least one completed Agent turn that
  reported provider usage after this build. Settings is reachable. Plugin
  `pi.token-insights` may be installed.
- **Steps**: 1) Complete a turn that also settled a subagent. 2) Open
  Settings. 3) Search settings for "tokens" / "用量". 4) Open Token Insights
  from the command palette (`usage` / `用量`). 5) Confirm the transcript
  assistant chip.
- **Expected**:
  - The rail has no Usage / 用量 destination. Preferences is General, AI,
    Shortcuts.
  - Settings search does not surface a usage tab.
  - `stats.getTokenUsageHistory` still returns completed-turn totals that
    include subagent spend.
  - The assistant chip under the transcript still shows parent-only provider
    usage.
  - Token Insights is the heatmap / KPI dashboard. When the plugin is
    installed, PI-Desktop remainders from the host turns table appear there
    without rewriting `message.usage`.
- **Specs linked**: `04-ux/06-settings-ia.md`,
  `03-runtime/01-ipc-protocol.md`, `03-runtime/06-host-rpc-protocol.md`,
  ADR 0171, ADR 0173, `08-meta/decisions-log.md` (D331, D335)
- **Acceptance**: F (persistence), Quality
- **Milestone**: M5
- **Status**: Unit-covered (agent-runtime usage split, host-core history
  aggregation, settings-search / i18n catalogs); plugin remainder merge
  covered in `pi-desktop-plugins`; full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-187: History attachments and local markdown images render inline

- **Preconditions**: An Agent session in a workspace that contains
  `docs/pixel.png`. The user has previously pasted an image so the session
  JSONL stores an `attachments/<sha256>` image ref with a stored mimeType.
- **Steps**:
  1. Reopen the session. Confirm the pasted image renders as a chip like any
     other attachment, continuing the body text instead of heading it, and that
     hovering or focusing it reveals its preview card.
  2. Click the chip. Confirm the host files viewer opens on that
     attachment ref and shows the image.
  3. Send a turn whose assistant markdown includes `![](docs/pixel.png)` and
     `![](/etc/passwd)`. Confirm the workspace image renders inline and the
     outside-root path does not load file bytes.
  4. Confirm `fs/readImageDataUrl` with `ref: "/etc/passwd"` and
     `mimeType: "image/png"` returns `missing`, not a data URL.
- **Expected**:
  - Contained image refs display inline within the 5MB cap.
  - Outside-root paths and mime spoofing of non-image extensions stay closed.
  - Clicking a resolved image chip opens the host `file:` tab, not the OS
    handler.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  `04-ux/08-component-spec.md` §8.3, ADR 0172, `08-meta/decisions-log.md` (D334)
- **Acceptance**: C (conversation & stream), D (workspace), Security, Quality
- **Milestone**: M5
- **Status**: Unit-covered (`fs-panel-guard.test.mjs`,
  `message-image-display.test.mjs`); full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-188: Plugin host APIs list models, read in-flight context, and complete

- **Preconditions**: At least one authenticated provider; a development plugin
  granted `models.list`, `session.read`, and `agent.complete`; an Agent
  session with a prior user turn.
- **Steps**:
  1. From the plugin process call `pi.models.list()`. Confirm only ready
     models are returned and no secret fields appear.
  2. Call `pi.session.getLlmContext()` outside a tool execution. Confirm
     `INVALID_ARGUMENT`.
  3. Ask the Agent to call the plugin tool. Inside `execute`, call
     `getLlmContext()` then `agent.complete({ modelKey, includeSessionContext:
     true })`. Confirm the tool result contains reviewer text and usage, not
     a secret.
  4. Repeat `agent.complete` until the eighth call in 60s succeeds and the
     ninth returns `RATE_LIMITED`.
  5. Make the completion fail at the provider (for example a model whose
     credential the user has revoked). Confirm the plugin reads the classified
     code — `PROVIDER_UNAUTHORIZED` — rather than a generic failure.
  6. Stop host-core and call `pi.models.list()`. Confirm `[]` and no warn line.
  5. Stop host-core and call `pi.models.list()`. Confirm `[]` and no warn line.
- **Expected**: Credentials never leave Electron main. Audit lines record
  plugin id, model key, sizes, and usage — not transcript or completion text.
  Plan still returns `PLUGIN_DISABLED_IN_PLAN` for the plugin tool. A dead
  host transport returns an empty model list without a warning (D080).
- **Specs linked**: `07-plugins/03-plugin-api.md`,
  `07-plugins/13-plugin-permissions-matrix.md`, ADR 0174, D336
- **Acceptance**: G (plugin agent tool), Security
- **Milestone**: M5
- **Status**: Unit-covered (`plugin-complete.test.mjs`,
  `plugin-session-context.test.ts`, `subagent-wiring.test.mjs`); full UI
  journey Draft (run only in a capable environment when this surface changes)

#### E2E-189: Bundled Advisor plugin is temporarily unavailable

- **Preconditions**: A packaged or development build of PI-Desktop.
- **Steps**:
  1. Inspect the bundled plugin resources and confirm `pi.advisor` is absent.
  2. Open the command palette and plugin settings. Confirm `/advisor`, the
     Advisor plugin, and its `advisor` tool are absent.
- **Expected**: The temporary removal does not expose an Advisor command,
  plugin, panel, skill, or agent tool. The general host-owned plugin completion
  APIs remain available to explicitly installed plugins.
- **Specs linked**: `07-plugins/03-plugin-api.md`, ADR 0174, D336
- **Acceptance**: G (plugin agent tool), C (conversation)
- **Milestone**: M5
- **Status**: Unit-covered (`bundled-plugins.test.mjs`); full UI journey Draft
  (run only in a capable environment when this surface changes)

#### E2E-190: Settings Network proxy applies to app-owned HTTP

- **Preconditions**: A reachable local HTTP or SOCKS5 proxy, or a known-bad
  port for the failure path. A configured provider/model whose endpoint is
  reachable through the proxy is available for the model-request step. For
  System mode, the OS has a local system proxy or PAC fixture with a capture
  endpoint and a direct fallback route.
- **Steps**:
  1. Open Settings → System. Confirm a Network card with Proxy modes
     System, Direct, and Custom. System is selected on a profile that never
     set a proxy.
  2. Choose Custom. Confirm a Proxy URL field, Bypass defaulting to
     localhost / 127.0.0.1 / ::1 / `<local>`, and Test. Enter
     `not-a-proxy` and blur. Confirm an inline invalid-URL error and that
     settings are not saved.
  3. Enter `socks5://127.0.0.1:1080` or `http://127.0.0.1:7890`, then select
     System immediately without clicking elsewhere. Confirm `settings.get`
     retains the URL and Bypass while `mode` is `system`. Select Custom again
     and confirm both values return to the fields and `mode` is `custom`.
     With the valid URL saved, enter `not-a-proxy` and blur so the invalid
     draft remains visible. Switch to System and back to Custom; confirm the
     field returns to the remembered valid URL and `settings.get` still holds
     that URL instead of the built-in default.
  4. Click Test against a listening proxy. Confirm a Connected status. Click
     Test against a closed port. Confirm a failure status without changing
     the saved URL. Enter `http://user:pass@127.0.0.1:<auth-port>` and
     `socks5://user:pass@127.0.0.1:<auth-port>` against proxies that require
     those credentials. Confirm Test reports Connected rather than
     `net::ERR_NO_SUPPORTED_PROXIES` (issue #490).
  5. With Custom saved, send a short prompt through the configured provider.
     Confirm the provider request and response pass through the proxy,
     including when a SOCKS5 proxy returns the complete bind response in one
     TCP chunk. Confirm a subsequent marketplace refresh and a models.dev
     catalog refresh use the proxy (host-core curl `--proxy`, Electron
     `net.fetch`), and confirm a loopback URL in Bypass is not proxied.
  6. Switch to Direct. Confirm Chromium returns to `mode: "direct"`, provider
     and marketplace traffic bypass the System relay, and workspace Bash does
     not inherit proxy variables from the setting.
  7. Switch to System. Confirm Chromium returns to `mode: "system"` and send a
     provider request and marketplace refresh. Confirm both follow the OS/PAC
     route selected for each destination, including ordered proxy-to-direct
     fallback, without restarting the app. Select Custom again. Confirm the URL
     and Bypass entered in step 3 come back from `AppSettings.networkProxy`,
     which kept them while System was selected.
- **Expected**: Custom covers model calls, marketplace, updates, plugin
  `net.fetch`, and the in-app browser. System covers provider and marketplace
  requests through Electron's OS/PAC resolver. Workspace Bash `env` does not
  show `HTTP_PROXY` / `ALL_PROXY` from the setting. TLS verification remains
  enabled on all routes. OAuth still opens the system
  browser. Invalid schemes (`file:`, `ftp:`, and SOCKS4) and malformed
  percent-encoded credentials are rejected. Authenticated HTTP and SOCKS5
  URLs Test and apply without `net::ERR_NO_SUPPORTED_PROXIES` (issue #490).
  No protocol or schema version bump.
- **Specs linked**: `04-ux/06-settings-ia.md`,
  `03-runtime/07-process-model.md`, ADR 0177, D340
- **Acceptance**: B (settings), F (providers), Security
- **Milestone**: M5
- **Status**: Custom-path unit coverage exists (`network-proxy.test.ts`,
  `node-proxy.test.ts`, `authenticated-proxy-relay.test.ts`,
  `settings-general.test.mjs`, host-core `network_proxy` tests); malformed
  credentials and unsupported SOCKS4 schemes are covered by shared parser
  tests. `system-proxy-relay.test.ts` covers authenticated provider traffic,
  PAC proxy fallback, HTTP proxy forwarding, and scheme detection on
  non-default ports. The stale-invalid-draft Custom → System → Custom
  restoration path is covered by `pnpm test:e2e:settings-scroll`. The full UI
  journey remains Draft (run only in a capable environment when this surface
  changes).

#### E2E-191: Newly emitted AppError codes stay registered

- **Preconditions**: The shared package test suite is available.
- **Steps**:
  1. Run the shared error helper tests.
  2. Inspect the newly emitted runtime and Edit code list used by the test.
- **Expected**: Every code introduced by this update, including
  context-compaction, empty-response, and Edit recovery failures, exists in
  `packages/shared/src/errors.ts` with an identical key and value. Reserved
  codes remain excluded until they are emitted.
- **Specs linked**: `03-runtime/08-error-codes.md`
- **Acceptance**: Quality
- **Milestone**: M5
- **Status**: Unit-covered (`packages/shared/src/errors.test.ts`); full UI
  journey not applicable

#### E2E-209: Import copies model configuration from local agent stores

- **Preconditions**: At least one supported local config exists among
  `~/.claude/settings.json`, `~/.codex/config.toml` `[model_providers.*]`,
  `~/.config/opencode/opencode.json`, `~/.pi/agent/models.json`,
  `~/.pi/agent/auth.json` plus `~/.pi/agent/models-store.json`, or
  `~/.cc-switch/cc-switch.db`, including two API-key profiles with the same
  endpoint and different keys, one auth-only Pi API-key provider, and
  optionally one OAuth-only vendor. PI-Desktop may already have an equivalent
  provider.
- **Steps**:
  1. Open Settings → Models and expand **Import from other tools**. Confirm
     its scan explanation appears as inline text without a help icon, and the
     workbench remains idle until Scan is activated.
  2. Scan model configuration. Confirm source groups start expanded, rows
     show name, model count, host, and an API key / No API key badge, and no
     secret value appears in the UI or scan IPC payload. Confirm the
     auth-only Pi provider appears in the Pi group with its cached model
     count and an API key badge.
  3. Import the selected providers. Confirm both same-endpoint profiles appear
     as separate rows under Settings → Models and remain selectable in the
     Composer model menu. Re-import the same selection and confirm those
     unchanged credentials are skipped.
  4. If the app had no default model, confirm the first imported provider
     becomes the default. If a default already existed, confirm it is
     unchanged.
  5. Confirm an OAuth-only source account is absent from the candidate
     list.
- **Expected**: Explicit scan only (D007). Stored API keys land in the host
  secret store. Pi providers connected through `auth.json` are paired with
  the cached `models-store.json` catalog; OAuth grants and `!command` keys
  are not imported. Only equivalent providers (normalized URL + API style +
  same credential) skip; different credentials at one endpoint remain
  separate. The expanded importer shows its scan explanation directly
  without a question-mark control. No protocol or schema version bump.
- **Specs linked**: `04-ux/06-settings-ia.md`,
  `04-ux/08-component-spec.md` §18.5, `03-runtime/01-ipc-protocol.md`,
  `03-runtime/11-provider-model-system.md`, ADR 0179, D342
- **Acceptance**: B (model configuration)
- **Milestone**: M4
- **Status**: Unit-covered (`packages/shared/src/model-config-import.test.ts`,
  `apps/desktop/test/model-config-import.test.mjs`); full UI journey Draft
  (run only in a capable environment when this surface changes)

#### E2E-SETTINGS-inline-capability-imports: Import skills and MCP in their owning pages

- **Preconditions**: A supported external skill and MCP configuration are
  available. At least two projects exist. One MCP source is disabled and its URL
  includes userinfo and query credentials.
- **Steps**:
  1. Open Settings → Skills, select Project and a project, then expand Scan
     other tools. Confirm its scan explanation is visible without a help icon
     and that opening the panel does not scan. Scan, select a skill, choose its
     copy or link mode, and import it.
  2. Confirm the new skill belongs to the selected project. Change the project
     and confirm the prior candidates and selection are cleared.
  3. Open Settings → MCP, select Project and the same project, expand Scan
     other tools. Confirm its scan explanation is visible without a help icon
     and that opening the panel does not scan. Scan, select the disabled MCP
     candidate, and import it.
  4. Confirm the server belongs to that project, remains disabled, and the
     candidate row shows only the URL host without userinfo, path, or query.
  5. Change project scope and confirm the prior MCP candidates and selection
     are cleared.
- **Expected**: Skills and MCP scans start only after an explicit Scan action.
  Project scans and writes carry the selected project path; scope changes clear
  stale candidates. MCP disabled state is preserved and URL credentials never
  render in candidate metadata. Scan explanations render inline; the skill
  mode explanation remains on its existing help control.
- **Specs linked**: `04-ux/06-settings-ia.md`,
  `04-ux/08-component-spec.md` §18.3 / §18.6 / §18.7, ADR 0319 / D645
- **Acceptance**: F (persistence), Security, Quality
- **Milestone**: M6+
- **Status**: Source-contract and scoped IPC tests covered
  (`settings-import-page.test.mjs`, `agent-capability-settings.test.mjs`,
  `agent-import-ipc.test.mjs`, `import-format.test.mjs`). The project MCP scan,
  selection, import, visible result, and scoped payload are exercised by
  `pnpm test:e2e:settings-inline-import` in an isolated Electron fixture.

#### E2E-210: Documentation screenshots resolve from GitHub and VitePress

- **Preconditions**: The repository contains the gallery assets under
  `docs/public/screenshots/app/`; documentation dependencies are installed.
- **Steps**:
  1. Open `docs/guide/screenshots.md` and
     `docs/zh-CN/guide/screenshots.md` from the GitHub file view. Confirm the
     gallery images resolve to files under `docs/public/screenshots/`.
  2. Open the English and Chinese screenshot pages in the VitePress preview.
     Confirm representative images from the home, panel, and settings sections
     render.
  3. Confirm the navigation logo loads `docs/public/app-icon.png` on both
     locale pages.
  4. Confirm each locale footer includes an `AIUO.NET` link to
     `https://aiuo.net`.
  5. Run `pnpm docs:build` and inspect the generated pages for image load
     failures.
- **Expected**: GitHub renders every gallery image instead of requesting a
  repository-root `/screenshots/` path; both VitePress locale pages continue to
  render the gallery from the same checked-in assets. The navigation uses the
  app icon, both footers expose the `https://aiuo.net` link, and the docs build
  succeeds.
- **Specs linked**: ADR 0079, `docs/README.md`,
  `docs/guide/screenshots.md`, `docs/zh-CN/guide/screenshots.md`
- **Acceptance**: Quality
- **Milestone**: M5
- **Status**: Static/documentation check covered (`pnpm docs:build` and path
  audit); remote GitHub and browser journey pending

#### E2E-196: Chat links honor destination settings and context menu actions

- **Preconditions**: A chat transcript can render an HTTP(S) Markdown link. The
  work-panel Browser view and the system browser opener are available. The
  clipboard can be observed or stubbed for the copy action.
- **Steps**:
  1. In Settings → Conversation → Input & links, select **Work panel browser** and click the
     link from a chat reply.
  2. Select **Default OS browser** and click the same link again.
  3. Right-click the link and activate each context-menu item with the pointer:
     Open in default browser, Open in work panel, and Copy link address. Repeat
     the menu actions with keyboard focus and Arrow/Home/End navigation.
  4. Repeat a link click with Ctrl/Cmd, Shift, and Alt held.
  5. Render and use links whose HTTP(S) destination is wrapped as a nested
     linked-host Markdown destination, such as
     `[#1106](([github.com](https://github.com/vastsa/PI-Desktop/issues/1106)))`.
- **Expected**:
  - Wrapped linked-host destinations resolve to their inner HTTP(S) URL before
    sanitization, so the link is clickable and its right-click menu offers both
    browser destinations and Copy link address.
  - The Work panel browser is the default plain-click destination.
  - The Default OS browser setting routes chat, transcript, and plugin HTTP(S)
    clicks through the main-owned external opener, including markdown links,
    autolinked URLs, and inline-code URLs in assistant replies; changing the
    setting persists after reload.
  - The body-level context menu remains interactive when clicked. Its external
    and work-panel actions open the requested destination, and Copy link address
    updates the clipboard before showing the success toast. A rejected clipboard
    write shows an error toast instead of a success toast.
  - Modifier clicks continue to open links externally regardless of the setting.
  - Plugin/settings clicks that want the work panel return to chat so the
    dock is visible, without recording a navigation hop. A missing session
    falls back to the OS browser.
  - Workspace HTML preview, BrowserPreview, OAuth, and Feedback keep their
    existing destinations.
- **Specs linked**: `04-ux/06-settings-ia.md`,
  `04-ux/08-component-spec.md` §8.3, `03-runtime/01-ipc-protocol.md`,
  `08-meta/decisions-log.md` (D330)
- **Acceptance**: B (settings), C (conversation & stream), Security, Quality
- **Milestone**: M5
- **Status**: Wrapped destinations, plain-click routing, and pointer context-menu
  presence are covered in `pnpm test:e2e:transcript`; settings persistence,
  browser-action activation, and keyboard menu navigation remain Draft. Unit
  coverage: `apps/desktop/test/markdown-link-menu.test.mjs`,
  `apps/desktop/test/markdown-link-destinations.test.mjs`,
  `apps/desktop/test/markdown-math-rendering.test.mjs`, locale catalog tests,
  and `apps/desktop/test/open-http-url.test.mjs`.

#### E2E-201: Alias a configured model and copy a model id

- **Preconditions**: One provider saved with at least two model bindings, at
  least one of which the catalog publishes with a display name.
- **Steps**: 1) Open Settings → Model configuration and reopen the provider.
  2) Drag-select a model id in the live model list and copy it; confirm the
  clipboard holds the id and the row's checkbox did not toggle. 3) Click the
  same row's checkbox without selecting text; confirm it still toggles.
  4) Expand Advanced on a chosen row and type a short alias. 5) Save and open
  the Composer model picker; confirm the alias names that model while the other
  row keeps its published name. 6) Search the picker by the alias and by the
  real id; both reach the row. 7) Clear the alias, save, and confirm the
  published display name returns. 8) Re-enter the alias, save, reopen the
  provider, restart the app, and confirm the alias is still there. 9) Type more
  than 60 characters into the alias input; confirm the field keeps only the
  first 60, then send a direct `providers.update` RPC with a 61-character alias
  and confirm it fails with `MODEL_ALIAS_TOO_LONG`.
- **Expected**: The alias is a display label only — the provider request still
  carries `models[].id`, and the configuration row keeps showing the real id
  beside the alias chip. Model ids and names are selectable inside the
  non-selectable shell, and a click that carries a selection never toggles the
  row checkbox. A blank or cleared alias falls back to the catalog display
  name.
- **Specs linked**: `03-runtime/12-provider-config-schema.md`,
  `04-ux/08-component-spec.md`, ADR 0192
- **Acceptance**: B (model configuration), Quality
- **Milestone**: M2
- **Status**: Unit-covered (`composer-models.test.mjs`,
  `provider-model-config.test.mjs`); rendered UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-MODEL-selected-order-persists: Selected model order survives saving

- **Preconditions**: An AI service and an OAuth vendor account each have at
  least three selected models. Include a model with an alias and non-default
  Advanced settings. Record their binding values, the app-level default
  provider/model, and an explicitly bound session's model choice. A controllable
  save response is available to hold either editor busy.
- **Steps**:
  1. Open Settings → Model configuration and edit the AI service. Drag the
     last selected model by its handle before the first row, then drag it
     after the last row. Confirm the insertion location and resulting order.
  2. Configure the selected IDs in this order: `shown-a`, `hidden-a`,
     `shown-b`, `hidden-b`, `shown-c`. Filter by `shown-`, then drag `shown-c`
     before `shown-a`. Clear the filter and inspect all five bindings.
  3. Apply the filter again. Focus `shown-c`'s reorder handle and press Down,
     then Up. Confirm it moves past the neighboring visible row each time
     and focus remains on the moved model's handle. Try Up on the first
     visible model and Down on the last; neither changes the order.
  4. Start a drag and cancel it, then start another and drop outside the
     selected rows. Neither action changes the draft order.
  5. Drag-select and copy a model ID in the discovery list and in the selected
     pane. Confirm no reorder or checkbox toggle occurs. Click a discovery
     checkbox, toggle Advanced, edit an alias, and remove a selected model;
     each action retains its existing behavior without starting a drag.
  6. Save the reordered bindings, reopen the editor, then restart the app and
     reopen it again. Check order, aliases, model IDs, and Advanced settings.
     Check the provider default and existing session. Repeat with the service
     set as the app's default provider and with a different default provider.
  7. Change the order again, cancel the editor, and reopen it. The last saved
     order remains.
  8. Repeat the drag, keyboard, save/reopen, and cancel checks in the vendor
     account editor, including a filtered list with hidden selected bindings.
  9. Hold a save in flight and try drag and keyboard reordering. Release the
     save, then filter down to one visible selected row and try again.
- **Expected**: Both editors persist the complete ordered binding array. In
  step 2 the full order becomes `shown-c`, `shown-a`, `hidden-a`, `shown-b`,
  `hidden-b`; the hidden bindings remain present and retain their relative
  order. Moving a binding never resets its ID, alias, or Advanced overrides.
  Saving keeps the provider's compatibility default at the head binding. When
  that service or account is the app's default provider, saving also updates
  the app's default model to the head, preserving E2E-005A's existing behavior.
  Editing another provider leaves the app default unchanged. An explicitly
  bound session keeps its stored model choice.
  Canceled/outside drags leave the draft unchanged, editor cancellation
  discards unsaved moves, and busy or single-visible-row forms disable the
  reorder handles. Text copying and existing row actions remain independent.
- **Specs linked**: `03-runtime/13-model-catalog-and-selection.md` §2,
  `03-runtime/12-provider-config-schema.md`; ADR 0114, ADR 0192
- **Acceptance**: B (model configuration), F (persistence), Quality
- **Milestone**: M6+
- **Status**: Documented; full desktop journey has not been run.

#### E2E-202: Subagent thinking follows its exact model binding

- **Preconditions**: A configured provider has a model binding marked
  `availableForSubagents`. The catalog either reports that model as
  non-reasoning or omits one of the levels the binding explicitly enables. A
  user subagent definition and the builtin `Task` catalog are available.
- **Steps**: 1) In Settings → Model configuration, enable `medium` and `high`
  for the delegation model and mark it available for subagents. 2) Set the
  subagent definition's thinking level to `high`, save, and restart the app.
  3) Run the definition with its frontmatter model pin. 4) Run a builtin with
  `Task.model` selecting the same binding, including the on-demand resolution
  path. 5) Run a definition with no model pin while the parent session is set
  to `medium`.
- **Expected**: The pinned and explicitly selected delegates retain the
  binding's enabled thinking levels and send the selected non-`off` level even
  when models.dev says reasoning is unavailable or publishes a sparse set. The
  unpinned delegate inherits the parent's effective level. A binding with no
  non-`off` level still resolves to `off`.
- **Specs linked**: `03-runtime/02-agent-runtime.md`,
  `03-runtime/11-provider-model-system.md`, ADR 0144 / D283
- **Acceptance**: B (model configuration) + C (chat/stream) + Quality
- **Milestone**: M6+
- **Status**: Unit/wiring-covered (`model-capabilities.test.ts`,
  `apps/desktop/test/subagent-wiring.test.mjs`); full UI journey Draft (do not
  run E2E locally unless explicitly requested)

#### E2E-203: Omit subagent thinking override and read selected levels in dark mode

- **Preconditions**: A configured subagent model supports reasoning, and the
  application has both light and dark themes available.
- **Steps**: 1) Open Settings → Agent → Subagents and inspect the thinking
  selector. 2) Confirm it contains inherit-session, do-not-send, `off`, and
  the canonical levels. 3) Choose do-not-send, save, and confirm the document
  contains `thinkingLevel: omit`. 4) Run the subagent through a provider with a
  meaningful adapter default and inspect the outbound request. 5) Switch to
  dark mode, open Settings → Model configuration, expand a model's Advanced
  section, and select multiple thinking-level chips.
- **Expected**: Inherit continues to use the parent level; do-not-send
  persists and sends no provider thinking override; explicit `off` remains an
  explicit disable. Selected thinking chips have a solid high-contrast fill
  and readable text in both themes, and each selected level is visually
  distinguishable from the track.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  `03-runtime/02-agent-runtime.md`, `03-runtime/13-model-catalog-and-selection.md`,
  `04-ux/06-settings-ia.md`, ADR 0194 / D356
- **Acceptance**: B (model configuration) + C (chat/stream) + Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract-covered; full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-203a: Session thinking omit sends no provider override

- **Preconditions**: A configured reasoning model is selected in Composer.
- **Steps**: 1) Open the model × reasoning menu and confirm `omit` is the first
  reasoning option, followed by the binding's enabled canonical levels.
  2) Choose `omit` and confirm the chip shows `omit` and the session stores
  `thinkingLevel: omit`. 3) Send a turn and inspect the outbound request.
  4) Choose explicit `off` and send again. 5) In Settings → Model configuration,
  expand the same model's Advanced row and confirm the default picker lists
  `omit` first; save `omit` as the default and start a new session.
- **Expected**: `omit` persists and the request has no thinking/reasoning field.
  Explicit `off` still serializes a disable. A non-reasoning model keeps an
  `off`-only menu. A new session whose binding default is `omit` starts at
  `omit`.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  `03-runtime/02-agent-runtime.md`, `03-runtime/13-model-catalog-and-selection.md`,
  ADR 0295 / D456
- **Acceptance**: C (chat/stream) + Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract-covered; full UI journey Draft

#### E2E-211: Windows portable ZIP launches after extraction (D603)

- **Preconditions**: A Windows x64 tag or `dist:win` package has produced both
  `PI-Desktop-Setup-<version>.exe` and `PI-Desktop-Portable-<version>.zip` from
  the shared electron-builder config; a clean user profile is available; the
  account is a standard user without administrator elevation.
- **Steps**: 1) Inspect the release directory and `latest.yml`. 2) Extract the
  portable ZIP to a user-writable directory without running the NSIS installer.
  3) Launch the extracted `PI-Desktop.exe`. 4) Confirm there is no
  administrator prompt and that the running app has the PI-Desktop icon and
  taskbar entry. 5) Open Settings → Info and confirm Manual is selected by
  default; briefly select Automatic to inspect its replacement warning, then
  restore Manual. 6) Invoke Check for Updates. 7) Confirm Settings → Info offers
  the releases page rather than Restart to update. 8) Quit and relaunch the
  extracted executable.
- **Expected**: Both Windows artifacts are space-free and uploaded. `latest.yml`
  points at the NSIS installer only. The extracted ZIP app starts without a
  setup wizard or administrator prompt, keeps the normal PI-Desktop taskbar
  identity/icon, uses the existing application data directory, and reports
  update preference `manual` by default and effective update mode `manual`.
  Its `resources/app-update.yml` points to the same GitHub feed, so the manual
  check settles as up-to-date or available instead of failing with `ENOENT`.
  When an update is available, Settings offers the Releases page; it does not
  download or run `PI-Desktop-Setup-<version>.exe`. Relaunch restores sessions
  from that same profile.
- **Specs linked**: `01-product/01-product-scope.md`,
  `06-delivery/06-release-runbook.md`, `03-runtime/07-process-model.md`,
  ADR 0197 / D603
- **Acceptance**: Quality (release packaging)
- **Milestone**: M6+
- **Status**: Unit/source-contract covered (`auto-update.test.mjs`); native
  Windows launch remains runner validation (run only in a capable environment when this surface changes)

#### E2E-UPDATE-preference-and-once-only-reminder

- **Preconditions**: A disposable packaged profile on a supported automatic
  installer lane and a Windows portable ZIP profile. The update discovery path
  can provide the same stable available version across repeated checks without
  running a production installer.
- **Steps**: 1) Open Settings → Info on the installed package and confirm
  Automatic is selected by default. 2) Choose Manual, close/reopen Settings,
  then restart the app and confirm Manual persists. 3) Surface one available
  stable version; verify no download/install starts and one notice appears.
  Dismiss it, navigate away and back, repeat the check, then restart and check
  again. 4) Confirm the same version does not raise another notice, while the
  Settings row still shows it and opens Releases. 5) Select Automatic and
  surface an available version. Dismiss the in-app banner while downloading;
  verify the transfer is cancelled and the update will not install on quit.
  Restart, check the same version again, and verify it remains dismissed and
  does not download. Then surface a newer version and verify automatic
  downloading resumes. 6) Launch the portable ZIP profile and confirm Manual
  is the default; inspect the warning before explicitly selecting Automatic.
- **Expected**: The preference persists per installation. Manual performs
  discovery only and stores the last reminded version so repeated checks and
  app restarts do not repeat the notice; the Info row remains actionable. A
  dismissed version stays ignored across restarts in either mode. In-app
  dismissal cancels an active transfer and prevents install-on-quit for that
  version; a newer release clears the dismissal and resumes automatic delivery.
  ZIP and legacy portable builds default to Manual, and Automatic is an
  explicit, warned opt-in that can replace the extracted copy with NSIS.
- **Specs linked**: `03-runtime/07-process-model.md`,
  `04-ux/09-interaction-patterns.md`, ADR 0022 / D628
- **Acceptance**: Quality (settings interaction and release safety)
- **Milestone**: M6+
- **Status**: Setting selection/persistence covered by
  `pnpm test:e2e:settings-scroll`; dismissal and download cancellation covered
  by `updater-controller.test.mjs`. Packaged Windows installer journey remains
  runner validation.

#### E2E-213: The first Composer model menu paint keeps configured aliases

- **Preconditions**: A runnable provider has at least one configured model with
  a non-empty alias and a cached or discoverable model record for that ID. The
  app has restarted, or the provider model cache has been invalidated.
- **Steps**: 1) Open the Composer model × reasoning chip. 2) Enter the Model
  submenu immediately and observe the first visible frame. 3) Keep the menu open
  until the cached/live model refresh completes. 4) Close and reopen the menu.
- **Expected**: The first visible row already uses the configured alias (or the
  configured ID when no alias exists), and the list never flashes empty or
  replaces the alias with a catalog name/wire ID during hydration. The same
  single display name remains after refresh and on the next open; selecting the
  row still sends the configured model ID.
- **Specs linked**: `03-runtime/13-model-catalog-and-selection.md`,
  `04-ux/08-component-spec.md`
- **Acceptance**: Quality (stable first paint), B (model selection)
- **Milestone**: M6+
- **Status**: Unit/source-contract covered (`composer-models.test.mjs`);
  full UI journey remains runner validation (run only in a capable environment when this surface changes)

#### E2E-214: Plugin session import and ownership boundary

- **Preconditions**: A test plugin declares two `contributes.sessionSources`
  entries and receives only the P0/P1 session permissions. A second plugin has
  no access to the first plugin's sessions.
- **Steps**: 1) Import a session with external project/provider/model history,
  user, assistant, and tool messages. 2) Repeat the same import and verify
  idempotent skip with the same host-generated id. 3) List, get, and page
  messages, including descending order and content truncation. 4) Attempt an
  undeclared source, a system/running message role, invalid timestamps, an
  oversized/deep tool value, and each missing permission. 5) Repeat list/get/
  messages/rename/delete from the second plugin.
- **Expected**: Source declarations and permissions are enforced in Electron
  before host dispatch; ids are generated by host-core; original bindings are
  history-only; returned messages are marked external; reserved tool metadata is
  removed; invalid inputs fail with stable error codes; the second plugin sees
  neither the row nor its transcript.
- **Specs linked**: `07-plugins/02-plugin-manifest-schema.md`,
  `07-plugins/03-plugin-api.md`, `07-plugins/13-plugin-permissions-matrix.md`,
  ADR 0200, D367
- **Acceptance**: Security, Quality
- **Milestone**: M6+
- **Status**: Unit/RPC/wiring-covered; full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-215: Plugin batch and delete lifecycle

- **Preconditions**: The test plugin can call `session.importBatch`, rename,
  and delete. Host-core starts with an empty v14 database.
- **Steps**: 1) Run a `skip` batch containing valid, duplicate, and invalid
  items. 2) Run a `fail` batch containing one invalid or conflicting item and
  verify no item from that batch lands. 3) Rename an owned session and verify
  list ordering/metadata. 4) Trash it, verify normal core/plugin reads omit it,
  then purge it and import the same external id again. 5) Exercise page-size,
  payload, batch-size, and rolling import/delete limits. 6) Restart on a
  migrated v13 database and verify existing core sessions remain active.
- **Expected**: Skip is partial and fail is atomic; list/get/message operations
  stay ownership-scoped; trash is recoverable only through the owner purge;
  purge removes transcript files and permits re-import; bounds return
  `LIMIT_EXCEEDED` and rolling limits return `RATE_LIMITED`; migration produces
  schema v14 without project rows for plugin history.
- **Specs linked**: `03-runtime/04-data-storage.md`,
  `03-runtime/06-host-rpc-protocol.md`, ADR 0200, D367
- **Acceptance**: Security, Quality, Recovery
- **Milestone**: M6+
- **Status**: Host/RPC/unit-covered; full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-PLUGIN-usage-listTurns: Plugin usage fact listing

- **Preconditions**: A test plugin is granted `usage.read`. The host database
  has completed turns across live and soft-deleted sessions.
- **Steps**: 1) Call `pi.usage.listTurns` without the permission. 2) Call it
  with the permission, page by cursor, and filter by session/project/window.
  3) Pass inverted bounds, a window longer than 365 days, and a malformed
  cursor. 4) Confirm rows include token counters and titles but no message
  bodies, and that trashed sessions are absent.
- **Expected**: Missing permission returns `PERMISSION_DENIED` and does not
  hit the host. Valid calls return keyset pages of completed-turn facts.
  Invalid params return `INVALID_PARAMS`. Empty titles are `null`.
- **Specs linked**: `07-plugins/03-plugin-api.md`,
  `07-plugins/13-plugin-permissions-matrix.md`,
  `03-runtime/06-host-rpc-protocol.md`, ADR 0173, D335
- **Acceptance**: Security, Quality
- **Milestone**: M6+
- **Status**: Unit/RPC/wiring-covered (`plugin-session-api.test.mjs`,
  host-core `plugin_usage`); full UI journey Draft

#### E2E-216: Explicit plugin project binding and host-owned sidebar refresh

- **Preconditions**: A test plugin has `project.create` and `session.import`
  permissions, declares a session source, and the renderer is showing the
  existing sidebar. A project path is available without changing the active
  workspace.
- **Steps**: 1) Call `pi.project.create({ path })` and record the returned
  `projectId`. 2) Import one session with that id and one session without it.
  3) Observe the renderer while the plugin call completes. 4) Repeat the
  import with the same external id and then rename/delete an owned session.
- **Expected**: Project creation returns a durable id without activating or
  replacing the current workspace. Only the import with an explicit id has an
  active project binding; an omitted id stays unbound and its `projectPath` is
  history only. Each successful write causes one host-owned
  `pi-desktop/session/event/changed`, the renderer refreshes through
  `refreshSessions()`, and the sidebar does not require a plugin-emitted event.
  Skipped imports do not trigger a redundant refresh, and closed project tabs
  are not reopened merely because their session list was refreshed.
- **Specs linked**: `07-plugins/03-plugin-api.md`,
  `07-plugins/13-plugin-permissions-matrix.md`, `03-runtime/01-ipc-protocol.md`,
  `03-runtime/06-host-rpc-protocol.md`, ADR 0201, D368
- **Acceptance**: C (sessions), Security, Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract-covered; full UI journey Draft (run only in a capable environment when this surface changes)

#### E2E-217: Windows host starts on a clean x64-emulated ARM64 install

- **Preconditions**: A clean Windows 11 x64 or ARM64 machine/profile without a
  separately installed Visual C++ Redistributable, Node.js, or another local
  agent runtime; the x64 NSIS installer is available.
- **Steps**: 1) Install PI-Desktop. 2) Launch it for the first time. 3) Wait
  for the startup splash to yield to the main shell. 4) Inspect the runtime
  logs, then open Settings → Info.
- **Expected**: The bundled x64 `pi-desktop-host-core.exe` starts and completes
  `app.handshake` without `0xC0000135` (`STATUS_DLL_NOT_FOUND`), the shell does
  not remain on “Can't reach the local service”, host status is healthy, and
  Settings → Info reports the host version instead of `host unknown`. The
  package uses the statically linked MSVC CRT; no separate runtime installer
  is required. Native Windows ARM64 artifacts remain out of scope.
- **Specs linked**: `03-runtime/07-process-model.md`,
  `06-delivery/06-release-runbook.md`
- **Acceptance**: A (app startup), Quality (clean-install packaging)
- **Milestone**: M6+
- **Status**: Source-contract-covered; clean-machine Windows x64 and ARM64
  qualification remains runner validation (run only in a capable environment when this surface changes)

#### E2E-218: An installed Composer transform preserves inline attachment chips

- **Preconditions**: A plugin that contributes a Composer transform is
  installed, enabled, and granted `composer.transform`. An Agent session has a
  draft with ordinary prompt text and inline file and image chips.
- **Steps**: 1) Add file and image chips to the draft. 2) Invoke the plugin's
  Composer action. 3) Observe the plugin request and updated draft. 4) Undo the
  transform and confirm the draft and chips return.
- **Expected**: The plugin action is visible only while its plugin is loaded and
  its permission is granted. The transform callback receives the visible draft
  text and optional model key, but no image bytes, attachment metadata, file
  reference token, session id, or conversation history. The file and image
  chips remain in place and removable through the transform and its one-step
  undo. The transform does not create a transcript row. Without the plugin, no
  prompt-enhancement action appears.
- **Specs linked**: `04-ux/12-prompt-enhancement.md`,
  `07-plugins/02-plugin-manifest-schema.md`,
  `07-plugins/03-plugin-api.md`,
  `07-plugins/13-plugin-permissions-matrix.md`
- **Acceptance**: C (conversation & stream), Quality
- **Milestone**: M6+
- **Status**: Covered by `test:e2e:plugin-ui-slots` for plugin-process dispatch,
  draft-only update, inline file/image chip preservation, one-step undo, and no
  transcript row. Attachment sending is covered by the separate Composer send
  E2E.

#### E2E-259: Installing the prompt-enhancement plugin migrates preferences once

- **Preconditions**: The profile contains legacy host prompt-enhancement
  settings and has no `pi.prompt-enhancement` plugin data. The standalone plugin
  is available from a configured catalog or repository; a Composer session is
  ready.
- **Steps**: 1) With the plugin absent, inspect the Composer and Settings and
  confirm there is no prompt-enhancement action or settings card. 2) Install the
  plugin explicitly and grant its requested permissions. 3) Inspect the
  plugin-owned settings and confirm valid legacy model, thinking, and enabled
  custom-template values were copied before the plugin loaded. 4) Transform a
  draft, undo it, and send it; confirm the action does not create a transcript
  row. 5) Clear a migrated plugin value, reload the plugin, and confirm the
  migration does not restore it. 6) Uninstall the plugin and confirm legacy host
  values remain.
- **Expected**: Installing the plugin is the only path that exposes the action.
  Existing plugin settings win over legacy values; invalid or inactive custom
  templates are skipped. A private marker makes migration one-time. Clearing a
  plugin setting does not cause a later import, and uninstalling the plugin does
  not delete legacy host values. Plugin transforms preserve draft/session race
  safety and attachment chip positions.
- **Specs linked**: `04-ux/12-prompt-enhancement.md`,
  `04-ux/06-settings-ia.md`, `03-runtime/04-data-storage.md`,
  `07-plugins/03-plugin-api.md`, ADR 0324
- **Acceptance**: C (conversation & stream), Quality, compatibility
- **Milestone**: M6+
- **Status**: Migration and plugin-runtime integration tests cover the copy,
  precedence, one-time marker, permission gate, and callback; full UI journey
  Draft (run only in a capable environment when this surface changes)

#### E2E-220: Local MCP control drives a running desktop

- **Preconditions**: Start PI-Desktop with
  `PI_DESKTOP_MCP_CONTROL=1` and a clean profile. A local project directory is
  available, the Electron user-data directory is writable, and the desktop
  has completed backend boot.
- **Steps**: 1) Read `mcp-control.json` and use its URL and bearer token. 2)
  Call `initialize`, `tools/list`, and `pi_control_describe`. 3) Call
  `pi_project_open` with the fixture project. 4) Call `pi_session_create`,
  `pi_session_get`, and `pi_agent_status`. 5) Call `pi_agent_prompt` and
  observe the existing desktop session-change event select the target session.
  6) Call `pi_desktop_invoke` for a reviewed read operation. 7) Attempt
  `pi_session_delete` and `pi_session_configure` without confirmation, then
  repeat with `confirm: true`. 8) Stop the app and inspect the manifest.
- **Expected**: An unauthenticated request receives 401; `initialize` with an
  unsupported protocol version negotiates `2025-06-18`; the authenticated MCP
  handshake and tool catalog succeed; project/session/Agent operations use the
  same IPC validation and host permission boundaries as the renderer; mutating
  calls refresh/select the visible project and session while `pi_session_get`
  does not; destructive operations and `pi_session_configure` fail with a
  confirmation error until acknowledged; secret writes, `plugin/loadDev`, and
  native-picker channels are absent from `pi_control_describe`; secret-shaped
  fields are stripped; the endpoint binds loopback only; disallowed Origins and
  unsupported protocol version headers are rejected; and the manifest changes
  to `active: false` on shutdown.
- **Specs linked**: `02-architecture/01-architecture.md`,
  `03-runtime/01-ipc-protocol.md`, `05-security/01-security.md`, ADR 0203,
  D370, D372
- **Acceptance**: A (app control), C (sessions), Security, Quality
- **Milestone**: M6+
- **Status**: MCP protocol/unit-covered by `apps/desktop/test/mcp-control.test.mjs`;
  full Electron journey documented and remains deferred by the no-local-E2E
  policy

#### E2E-MCP-session-get-projects-large-compaction

- **Preconditions**: Start PI-Desktop with `PI_DESKTOP_MCP_CONTROL=1`. A durable
  session exists whose `session.compaction` record (`summary` / `retainedTail` /
  `details.modifiedFiles`) alone serializes to more than the 512 KiB MCP result
  limit. A second durable session exists whose `session.compactions` history
  alone does — the newest `compaction` is already compact, but several history
  entries each carry their own `summary` / `retainedTail` /
  `details.modifiedFiles` (mocode #506).
- **Steps**: 1) Read `mcp-control.json`, use its URL and bearer token, and
  complete the MCP handshake. 2) Call `pi_session_get` for that session with any
  `messageLimit` / `contentLimit` / `messageBefore`. 3) Inspect
  `structuredContent`. 4) Repeat for the history-heavy session with the smallest
  page (`messageLimit: 1`, `contentLimit: 1`). 5) Repeat for a small session.
- **Expected**: The answer is not the `{truncated: true, reason:
  "MCP_RESULT_LIMIT", preview}` envelope; `session.messages` carries the
  requested transcript page; `session.compaction` keeps `createdAt` and
  `details.generation` while `summary`, `retainedTail`, and
  `details.modifiedFiles` are absent. Every `session.compactions` entry keeps its
  scalar identity and drops those same unbounded fields, so the history-heavy
  session returns a real page even at `messageLimit: 1` / `contentLimit: 1`. The
  small session's answer is unchanged.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` §13d
- **Acceptance**: C (sessions), Quality
- **Milestone**: M6+
- **Status**: The local MCP server contract test in
  `apps/desktop/test/mcp-control.test.mjs` exercises authenticated JSON-RPC
  `tools/call` for oversized (current record, compaction history, and
  history-only) and under-limit `pi_session_get` results. The separate full
  Electron-to-Host journey remains release qualification.

#### E2E-234: Workspace security denylist and ignore layers

- **Preconditions**: A project containing `.env`, `.env.example`,
  `server.pem`, `keys/id_rsa`, `notes.txt`, `node_modules/pkg/index.js`,
  `generated/out.txt`, `debug.log`, and a root `.pi-desktopignore` with
  `generated/`. Every file contains the word `needle`. The session is Agent
  in `auto` permission mode.
- **Steps**: 1) Ask for `Read` of `.env`, then of `.env.example`. 2) Ask for
  `Write` to `keys/id_rsa`. 3) Run an unscoped `Grep` and `Glob` for `needle`.
  4) Run `Grep` with `path: node_modules/pkg` and with `path: generated`.
  5) Repeat step 1 with a system `rg` installed and with
  `PI_DESKTOP_DISABLE_RG=1`.
- **Expected**: Steps 1 and 2 fail with `WORKSPACE_PATH_DENIED`, the
  `.env.example` read succeeds, and no `keys/id_rsa` file is created. The
  unscoped search lists `notes.txt` and `.env.example` only: `.env`,
  `server.pem`, `node_modules`, `generated`, and `debug.log` are absent. The
  explicit-path searches return one hit each. The in-process walker and the
  `rg` fast path produce the same file set.
- **Specs linked**: `03-runtime/15-workspace-ignore-rules.md`,
  `03-runtime/08-error-codes.md` §3.3, D032
- **Acceptance**: B (workspace tools), Security
- **Milestone**: M3+
- **Status**: unit-covered by `crates/host-core/src/tools/mod.rs`
  (`security_denylist_blocks_read_write_edit_and_hides_search_results`,
  `default_ignores_and_workspace_ignore_file_hide_unscoped_walks_only`) and
  `tools/ignore_rules.rs`; the Electron journey is documented and deferred by
  the no-local-E2E policy

#### E2E-235: Dangling symlinks cannot write outside the workspace

- **Preconditions**: A project containing `dangling -> /tmp/outside/planted.txt`
  where the target does not exist, and `inner -> ./not-yet.txt`. Agent mode,
  `auto` permission.
- **Steps**: 1) Ask for `Write` to `dangling`. 2) Ask for `Write` to
  `dangling-dir/new.txt` where `dangling-dir -> /tmp/outside/dir`. 3) Ask for
  `Write` to `inner`.
- **Expected**: Steps 1 and 2 fail with `PATH_OUTSIDE_WORKSPACE` and nothing
  appears under `/tmp/outside`. Step 3 creates `not-yet.txt` inside the
  project. A symlink loop fails with a canonicalize error rather than hanging.
- **Specs linked**: `03-runtime/03-tools-and-permissions.md`,
  `03-runtime/15-workspace-ignore-rules.md` §3
- **Acceptance**: B, Security
- **Milestone**: M3+
- **Status**: unit-covered by `crates/host-core/src/workspace.rs`
  (`blocks_dangling_symlink_escape`,
  `dangling_symlink_inside_workspace_resolves_to_its_target`,
  `dangling_symlink_loop_is_rejected`)

#### E2E-236: Plugin desktop control needs the user's native consent

- **Preconditions**: A dev plugin granted `desktop.control` whose panel calls
  `pi.desktop.invoke({ operation: "session/delete", args: [id], confirm })`.
  One disposable session exists.
- **Steps**: 1) Invoke with `confirm: false`. 2) Invoke with `confirm: true`
  and press Escape on the dialog. 3) Invoke with `confirm: true` and click
  Deny. 4) Invoke with `confirm: true` and click Allow once. 5) Invoke a
  `read` operation.
- **Expected**: Step 1 fails with `CONFIRMATION_REQUIRED` and no dialog
  appears. Steps 2 and 3 fail with `PERMISSION_DENIED`; the session still
  exists. The dialog names `session/delete` and the catalog description, never
  panel-authored text. Step 4 deletes the session and the sidebar refreshes.
  Step 5 shows no dialog. Every invocation is audited with plugin id,
  operation, and risk.
- **Specs linked**: `07-plugins/03-plugin-api.md` (desktop control),
  `07-plugins/04-plugin-security.md` §8.2,
  `07-plugins/13-plugin-permissions-matrix.md`, ADR 0203, ADR 0208, D370,
  D372, D377
- **Acceptance**: D (plugins), Security
- **Milestone**: M6+
- **Status**: runtime-covered by
  `apps/desktop/test/plugin-desktop-control.test.mjs`; the native dialog
  journey is documented and deferred by the no-local-E2E policy

#### E2E-PLUGIN-session-orchestrator-real-workers: Session Orchestrator creates and coordinates durable sessions

- **Preconditions**: The marketplace `pi.session-orchestrator` plugin is installed and enabled;
  the parent Agent session has a configured authenticated provider/model and a
  project path. The parent is in Agent mode.
- **Steps**: 1) Ask the parent to review Frontend, Electron, and Rust in
  parallel. 2) Confirm that `SessionTask.spawn` returns three distinct real
  durable `sessionId` values and one host `messageId` per delivery; each
  worker is visible in the normal session list. 3) Confirm all three workers
  receive prompts without using `session/fork` and can run concurrently. 4)
  While a worker is busy, send a follow-up to that exact Session ID and verify
  it is queued against the target inbox rather than starting a second turn. 5)
  Inspect status from the Agents panel and a sidebar hover card; confirm both
  use bounded host projections, the hover card marks currently running
  created-session links, and neither surface fetches a complete worker
  transcript.
  6) Wait for one worker, query `result` by its exact `messageId` and `turnId`,
  and inspect the parent transcript for one host-generated completion message.
  7) Re-read the result and repeat the settlement notification path; confirm
  the callback and transcript row are not duplicated. 8) Send a parent-to-worker
  and worker-to-parent message in separate active plugin Agent tool turns;
  verify source/target provenance and real target turn binding in both
  transcripts. 9) Open one worker from the Agents panel, send it a follow-up
  using the exact returned `sessionId`, and stop another worker. 10) Restart
  the host/plugin with a queued delivery and confirm it remains held, while an
  interrupted turn is not replayed. Repeat the parallel creation step with a
  large existing session list while keeping the parent visible. 11) With one
  model's «Available for AI delegation» left off, ask the parent to spawn a
  worker on it by `modelKey`, then spawn again with no `modelKey`.
- **Expected**: Each worker is a real durable session with the parent's
  project/model/thinking/permission ceiling and an independent empty
  transcript at creation. The host ledger binds every delivery to the actual
  target durable turn; result text and error status derive from that turn's
  terminal state, not from polling assistant text. The parent receives only
  bounded, at-most-once completion messages; full worker transcripts remain
  inspectable in their own sessions. `sessionId` is the only canonical worker
  identity and follow-up `send` reuses that same session and context without
  creating a replacement. A session-message row is visibly distinct from
  human input and its provenance survives reload. `wait` returns `timedOut`
  within its bound instead of occupying the host tool deadline. Cancel
  interrupts only the selected delivery/turn without deleting the session.
  Sends without an active plugin tool invocation, forged source ids, targets
  above the source permission ceiling, worker fan-out overflow, inbox overflow,
  and autonomous callback loops fail closed. A `spawn` naming a model the user
  has not enabled for AI delegation is refused with `PERMISSION_DENIED` before
  a worker exists, while omitting `modelKey` — or naming the default model's
  own key — still inherits. Unrelated sessions and the
  existing Task family are unchanged, and no localhost MCP call or token
  access occurs. Bursts of worker notifications serialize and coalesce
  session-list refreshes while preserving the final worker list and the
  foreground session.
- **Specs linked**: `07-plugins/03-plugin-api.md`,
  `07-plugins/04-plugin-security.md`, `07-plugins/11-plugin-storage-isolation.md`,
  `03-runtime/01-ipc-protocol.md`, `03-runtime/06-host-rpc-protocol.md`,
  `03-runtime/04-data-storage.md`, `03-runtime/11-provider-model-system.md`,
  ADR 0237, ADR 0239, ADR subagent-model-opt-in
- **Acceptance**: C (parallel durable sessions), D (plugin security), Quality
- **Milestone**: M6+
- **Status**: host ledger coverage is automated by
  `pnpm test:e2e:collaboration`; marketplace plugin tests cover the plugin
  runtime, and host-core/desktop unit tests cover the additive host primitives.
  The full live provider/Electron journey remains runner validation under the
  no-local-E2E policy

#### E2E-SESSION-independent-top-level-communication: SessionTask discovers and communicates with existing sessions

- **Preconditions**: The marketplace `pi.session-orchestrator` plugin is
  installed and enabled. Two existing Agent sessions were created from the
  normal New Task flow and are not linked as Session Orchestrator workers. The
  caller is an active Agent session with a configured authenticated provider.
- **Steps**: 1) Call `SessionTask` with `action: "list"` and identify both
  existing sessions by their durable `sessionId`. 2) Send a message to one
  independent session and verify it is admitted against that session's inbox.
  3) From the target session, send a reply to the original session. 4) Call
  `status` and `result` with the returned IDs and inspect the two transcripts.
- **Expected**: `list` includes bounded references to existing communicable
  Agent sessions without requiring plugin-owned history or treating them as
  workers. `send` works in either direction using the real target Session ID,
  preserves each target's existing model/project/context/permissions, and
  never creates a replacement session. The host records source and target
  provenance, results remain bound to the actual durable turns, and the list
  response contains no transcript, project path, credentials, or message
  previews. Non-Agent sessions remain rejected by the existing host policy.
- **Specs linked**: `07-plugins/03-plugin-api.md`,
  `07-plugins/04-plugin-security.md`, `03-runtime/01-ipc-protocol.md`,
  `03-runtime/04-data-storage.md`, ADR 0239, ADR 0240
- **Acceptance**: C (conversation & stream), D (plugin security),
  G (plugins), Quality
- **Milestone**: M6+
- **Status**: host discovery and bidirectional delivery are automated by
  `pnpm test:e2e:collaboration`; plugin and host-core regression coverage is
  automated. The live multi-session provider/Electron journey remains runner
  validation under the no-local-E2E policy

#### E2E-SESSION-completion-notice-allows-silence: A trusted completion notice may finish without an acknowledgement

- **Preconditions**: A candidate commit has its own built host-core and runtime
  sidecar. The local SSE provider deterministically returns visible text or a
  successful empty response; no live credentials are required.
- **Steps**: 1) Deliver a task through the real Host collaboration ledger and
  sidecar, read its successful result, and complete the coordinator summary.
  2) Resolve the queued completion callback through the production Main input
  resolver and run the recipient against an empty SSE response. 3) Run another
  human request, copied completion framing, a ledger task, and a ledger message
  against empty responses on the same recipient runtime.
- **Expected**: The original result remains unchanged. The completion has one
  provider request, no error, one terminal lifecycle, completed ledger status,
  and no acknowledgement callback. Each ordinary input still retries once and
  ends with `EMPTY_MODEL_RESPONSE`, and no request the recipient sends after
  the silent notice carries an empty assistant message. Unit coverage
  additionally rejects missing reply-to IDs/wrong targets, spends the exception
  on a tool batch, keeps it across a provider retry, revokes it once accepted
  user steering enters the context, and keeps the accepted silence out of the
  runtime entries and pi transcript state.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5e,
  `03-runtime/08-error-codes.md`, ADR 0239 (D446 amendment)
- **Acceptance**: C (conversation & stream), D (provenance), Quality
- **Milestone**: M6+
- **Status**: Automated by `pnpm test:e2e:session-completion` on the committed,
  rebased candidate in its dedicated worktree. The harness drives real Host
  RPCs, the production provenance resolver, sidecar, and local SSE, and persists
  runtime messages before Host settlement. It does not exercise Electron's
  queue/outbox UI or a live provider. Candidate/base SHAs and results belong in
  the validation report; existing ledger coverage runs separately through
  `pnpm test:e2e:collaboration`.

#### E2E-SESSION-hover-card-model-and-links: Session hover cards expose readable model and creation navigation

- **Preconditions**: The app has one collaboration-created session, one
  independent session, and a configured provider/model with readable catalog
  names. The sidebar contains both sessions.
- **Steps**: 1) Hover or keyboard-focus the collaboration-created session.
  2) Inspect the model metadata, creator reference, and created-session list.
  3) Activate the creator and one created-session reference with the keyboard.
  4) Delete (or otherwise remove) one referenced session, or use a session whose
  reference is already stale, then revisit the card. 5) Inspect an independent
  session's card as well.
- **Expected**: The card shows the model's display name, falling back to
  the provider's readable name, instead of the provider ID. A collaboration-created session shows its
  creator, and a creator shows its bounded created-session list. Each live
  reference is a native keyboard-focusable button with an accessible
  open-session name; activating it opens that durable session and focuses the
  Composer. A reference whose session no longer exists is presented as text
  with an "unavailable" indication and is not a keyboard-focusable navigation
  control; activating a session that no longer exists (for example a session
  deleted between the snapshot and the click) surfaces a visible error instead
  of switching to an empty transcript. An independent session remains a valid
  local session without a fabricated creator link. Hover polling remains
  bounded and does not load a transcript: a read that exceeds its deadline is
  abandoned, and an unfocused window keeps a slower idle poll instead of
  stopping or overrunning.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` §5.7,
  `03-runtime/04-data-storage.md`, `04-ux/08-component-spec.md`,
  `04-ux/09-interaction-patterns.md`, ADR 0240
- **Acceptance**: C (conversation & stream), Quality
- **Milestone**: M6+
- **Status**: source-contract and projection tests are automated; rendered
  pointer/keyboard validation remains runner validation

#### E2E-237: Plugin fetch re-checks egress on every redirect

- **Preconditions**: A dev plugin with `net.domains: ["allowed.test"]` and
  `net.fetch`. A local server on `allowed.test` answers `/hop` with a 302 to
  `http://undeclared.test/leak`, `/ok` with 200, and `/limited` with 429 and
  `Retry-After: 2`.
- **Steps**: 1) Call `pi.net.fetch({ url: "https://allowed.test/ok" })`. 2)
  Call `pi.net.fetch({ url: "https://allowed.test/hop" })`. 3) Call
  `pi.net.fetch({ url: "https://allowed.test/limited" })`.
- **Expected**: Step 1 returns 200. Step 2 fails with `PERMISSION_DENIED`
  naming `undeclared.test`, and the undeclared server records no request. The
  audit log shows the denied hop. Step 3 returns 429 with its `Retry-After`
  header intact, the server records exactly one request for it, and the audit
  log shows `ok: false` with the advertised `retryAfter` — the host retries
  nothing.
- **Specs linked**: `07-plugins/04-plugin-security.md` §8.0,
  `07-plugins/03-plugin-api.md` §7
- **Acceptance**: D, Security
- **Milestone**: M4+
- **Status**: runtime-covered by `apps/desktop/test/plugin-egress.test.mjs`
  (per-hop egress and failed-call audit)

#### E2E-238: Tool requests for an unknown session do not fall back

- **Preconditions**: host-core running; a JSON-RPC probe attached to its
  stdio.
- **Steps**: 1) Send `tools.execute` with `sessionId: "missing"` and a `Read`
  of `README.md`. 2) Send `plans.enter` with the same id.
- **Expected**: Both fail with `SESSION_NOT_FOUND` (numeric `1007` and
  `PLAN_SESSION_NOT_FOUND` respectively); no file under the last-opened
  workspace is read.
- **Specs linked**: `03-runtime/06-host-rpc-protocol.md` §7,
  `03-runtime/08-error-codes.md` §3.1
- **Acceptance**: B, Security
- **Milestone**: M3+
- **Status**: unit-covered by `crates/host-core/src/rpc/mod.rs`
  (`temporary_session_uses_its_own_scratch_workspace`)

#### E2E-239: An older build names the newer data schema instead of looping

- **Preconditions**: a data directory last opened by a newer PI-Desktop whose
  host-core migrated it past the schema this build supports.
- **Steps**: 1) Launch the older packaged app on that data directory.
  2) Observe the banner and `logs/app/runtime.log`.
- **Expected**: host-core exits once; no further restart attempts are logged.
  The fatal banner says this PI-Desktop is older than the local data, shows
  both schema numbers, and tells the user to install the newer version. The
  data directory is not modified.
- **Specs linked**: `03-runtime/07-process-model.md` (boot outcomes)
- **Acceptance**: B
- **Milestone**: M3+
- **Status**: source-contract covered by
  `apps/desktop/test/host-boot-diagnostics.test.mjs`

#### E2E-240: An Intel macOS build on Apple Silicon points at the native download

- **Preconditions**: Apple Silicon Mac; the x64 macOS package installed and
  running under Rosetta 2.
- **Steps**: 1) Launch the app. 2) Read the banner under the title bar.
  3) Click its dismiss action.
- **Expected**: The app boots normally. A dismissible hint says this is the
  Intel build on an Apple Silicon machine and asks the user to install the
  Apple Silicon build. Dismissing hides it for the session; the native arm64
  package shows no hint.
- **Specs linked**: `03-runtime/07-process-model.md` (boot outcomes)
- **Acceptance**: B
- **Milestone**: M3+
- **Status**: source-contract covered by
  `apps/desktop/test/host-boot-diagnostics.test.mjs`

## Remote Agent Control target scenarios (post-MVP)

The following scenarios require the approved remote harness. They are
documented now so the protocol and security work has an explicit acceptance
target. Do not run them against a local desktop or a production Gateway unless
the request explicitly authorizes that environment. D374 amended every
scenario in this section to the revised contract: `{ epoch, sequence }`
cursors, ephemeral deltas, the Host-owned turn queue, the full local approval
vocabulary, the remote permission ceiling, the Host link relay, and the
browser cookie profile. D375 re-sequenced the milestones: E2E-231 and
E2E-232 are the acceptance targets of the scheduled SSH-tunnel and
integration milestones, while E2E-227 and E2E-228 run when the Gateway and
browser milestones are scheduled.

#### E2E-221: RACP initialization negotiates capabilities and policy

- **Preconditions**: A test Agent Host and an authenticated client support
  `RACP-WS` v1. The Host has one visible idle Session and a configured
  `remoteMaxPermissionMode` and `approvalLifetimeMs`.
- **Steps**: 1) Connect without initialization and send a request. 2) Send
  `connection/initialize` with supported bindings and the `turnQueue`,
  `hostEvents`, and `history` capabilities. 3) Send
  `notifications/initialized`. 4) Repeat with an unsupported major version.
  5) Call `host/list` on the direct Host connection.
- **Expected**: Pre-initialization requests are rejected; the valid handshake
  returns the negotiated protocol, connection id, principal roles, limits
  including `maxQueuedTurnsPerSession` and `replayWindowEvents`, the
  advertised capabilities, and the informational `policy` block; the
  unsupported major version returns `PROTOCOL_MISMATCH`; `host/list` returns
  `METHOD_NOT_FOUND` because no Gateway is present.
- **Specs linked**: `03-runtime/19-remote-agent-control-protocol.md` §3 and
  §7.7, `05-security/02-remote-control-security.md` §3
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-222: Remote turn streams ordered durable events and live deltas

- **Preconditions**: An authenticated controller is attached to an idle
  Session with a deterministic fixture Agent whose turn has two model rounds,
  one tool call, and one compaction.
- **Steps**: 1) Attach and subscribe from the current cursor. 2) Call
  `turn/start`. 3) Collect every event envelope until the terminal event,
  separating durable events (with `sequence`) from ephemeral events (with
  `afterSequence`). 4) Compare the final snapshot with the state rebuilt from
  durable events alone. 5) Compare each `payload.event` with the local
  `AgentEvent` recorded by the desktop for the same turn.
- **Expected**: `turn/start` returns quickly with a `turnId`; durable
  sequences are strictly increasing inside one epoch; `item.delta`,
  `tool.progress`, and `turn.activity` carry `afterSequence` and never a
  `sequence`; exactly one `turn.completed` is emitted, at the local
  `agent_end`, and none at the intermediate `turn_end`; the compaction appears
  as an `item` with `itemType: "compaction"`; the terminal state is immutable;
  and the final snapshot equals the state reconstructed from durable events
  plus the content of `item.completed` payloads.
- **Specs linked**: `03-runtime/19-remote-agent-control-protocol.md` §§5–8,
  `03-runtime/10-session-state-machine.md`,
  `02-architecture/05-remote-agent-control.md` §8
- **Acceptance**: C (conversation & stream), Quality
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-223: Reconnect replays durable events or resynchronizes by epoch

- **Preconditions**: A turn is producing at least five durable events and a
  long streaming assistant message; the harness can close and reopen the
  client connection and restart the Host.
- **Steps**: 1) Record the last applied cursor. 2) Disconnect in the middle
  of a streaming message. 3) Reconnect and subscribe with `after`. 4) Repeat
  after evicting the cursor from the bounded replay window. 5) Restart the
  Host during an idle period and reconnect with the old cursor. 6) Repeat
  step 3 over `RACP-HTTP` using `Last-Event-ID` in the `epoch:sequence` form.
- **Expected**: A retained cursor replays every later durable event exactly
  once and no delta; the snapshot's `activeItems` carry the text streamed
  before the disconnect; an evicted cursor returns `resync.required` with a
  complete snapshot; a cursor from the previous epoch returns
  `CURSOR_EXPIRED` and a snapshot with a new epoch; a durable gap never causes
  the client to guess or apply out-of-order state; and the SSE path behaves
  identically.
- **Specs linked**: `03-runtime/19-remote-agent-control-protocol.md` §§5.3,
  5.4, 7.2, and 8, `02-architecture/05-remote-agent-control.md` §8
- **Acceptance**: Recovery, Quality
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-224: Remote approvals carry the local vocabulary and stay host-owned

- **Preconditions**: A Session policy requires a tool approval; the fixture
  Agent submits a Plan and asks one multi-select asktool question in the
  same run; Host policy allows remote session grants; a second Session is
  configured with `permissionMode: "auto"` and the Host ceiling is `ask`.
- **Steps**: 1) Start the turn from a controller. 2) Observe the tool
  approval request. 3) Attempt a decision from a viewer, then with a stale
  revision. 4) Resolve from an authorized approver with `allow-session`.
  5) Attach a third client after the Plan approval is raised and read its
  snapshot. 6) Resolve the Plan with `approve` and no `permissionMode`, then
  with `permissionMode: "accept-edits"`. 7) Answer the input request with one
  multi-select answer and one `null`. 8) Repeat step 4 after expiry.
  9) Start a turn on the `auto` Session from a controller without `approver`.
- **Expected**: The viewer and stale responses fail closed with `FORBIDDEN`
  and `APPROVAL_STALE`; `allow-session` resumes the turn and a later call of
  the same tool in that Session needs no approval; the late client's snapshot
  lists the pending Plan approval; the mode-less approve is rejected and the
  explicit one queues execution in Agent mode with `accept-edits`; the
  desktop's own approval card closes when the remote decision lands; the
  asktool answers reach the Agent as the local `AskToolResolution`; expiry
  returns `APPROVAL_EXPIRED` and never executes the tool; and the `auto`
  Session turn reports `effectivePermissionMode: "ask"` and raises an approval
  while the durable session mode stays `auto`.
- **Specs linked**: `03-runtime/19-remote-agent-control-protocol.md` §§5.5,
  7.3, 7.5, and 9, `05-security/02-remote-control-security.md` §§4 and 7,
  `03-runtime/10-session-state-machine.md`
- **Acceptance**: E (tools & permissions), Security, Recovery
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-225: A turn continues when its client disconnects and the queue is host-owned

- **Preconditions**: Two authenticated controllers can access the same
  Session; the fixture Agent has a delayed deterministic turn; the local
  desktop renderer is open on the same Session.
- **Steps**: 1) Client A starts the turn. 2) Disconnect A while it is
  running. 3) Observe the Session from client B. 4) Reconnect A as a viewer.
  5) From B, call `turn/start` with `admission: "reject_if_busy"`, then with
  `admission: "queue"` twice. 6) Cancel the second queued turn from B.
  7) Call `turn/stop` from B. 8) Fill the queue to `maxQueuedTurnsPerSession`
  and start once more.
- **Expected**: The turn continues after A disconnects; B observes the same
  turn and durable sequence; A catches up by cursor; the first start returns
  `AGENT_BUSY`; the queued starts return `turn.queued` with positions and the
  desktop renderer shows the same queued prompts; the cancel emits
  `turn.canceled`; `turn/stop` ends the active turn as `completed` at the
  next boundary and the remaining queued turn starts; the overflowing start
  returns `AGENT_BUSY` with `details.queueFull`.
- **Specs linked**: `02-architecture/05-remote-agent-control.md` §§6, 9,
  and 10, `03-runtime/19-remote-agent-control-protocol.md` §§7.3–7.4 and 8
- **Acceptance**: C (conversation & stream), Recovery
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-226: Roles, scopes, and revocation are enforced

- **Preconditions**: One tenant, two Hosts, two Sessions, and principals with
  viewer, controller, approver, and owner roles exist. A multi-tenant harness
  profile, when available, adds a second tenant.
- **Steps**: 1) Try every catalog operation, including `session/history`,
  `turn/cancel`, and host-scope `events/subscribe`, with each role.
  2) Substitute a Session, Host, and approval id from the other Host, and
  from the other tenant when the multi-tenant profile is active. 3) Queue a
  turn as a controller, then revoke that principal and retry its existing
  connection.
- **Expected**: The role matrix is enforced, including the `allow-session`
  policy row; foreign identifiers return `FORBIDDEN` or `NOT_FOUND` without
  existence leakage; revocation closes the connection, blocks new mutations,
  and cancels the revoked principal's queued turn; and audit records identify
  the denied principal without recording prompt or secret content. The
  cross-tenant cases are required only under the multi-tenant profile.
- **Specs linked**: `05-security/02-remote-control-security.md` §§3–9 and
  §11, `03-runtime/19-remote-agent-control-protocol.md` §§6 and 13
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-227: The Host link relays clients behind inbound firewall/NAT

- **Preconditions**: The Agent Host runs behind a test firewall that rejects
  inbound connections. The Gateway is publicly reachable by two test clients.
- **Steps**: 1) Enroll the Host with a one-time credential. 2) Establish the
  outbound mTLS Host link. 3) Attach both clients and run a turn that raises
  a tool approval. 4) Answer the relayed server request from the client that
  received it, then attempt to answer it again from the other client.
  5) Upload an attachment through the Gateway upload target and reference it
  from a turn. 6) Drop the link and allow it to reconnect. 7) Revoke the Host
  and attempt re-enrollment with the old credential.
- **Expected**: No inbound desktop port is opened; the Gateway routes only to
  the authenticated Host; the approval request is delivered on exactly one
  logical connection and the second answer returns the stored result with
  `alreadyResolved`; attachment bytes cross the link in bounded chunks, the
  Host verifies the hash, and the Gateway's copy is gone after
  `attachment/complete`; local execution continues across the link
  interruption and both clients resume from resumable cursors; reconnect does
  not duplicate the turn; and the revoked credential cannot re-enroll.
- **Specs linked**: `02-architecture/05-remote-agent-control.md` §5.3,
  `03-runtime/19-remote-agent-control-protocol.md` §§10 and 11.4,
  `05-security/02-remote-control-security.md` §§3.2 and 6,
  `06-delivery/07-remote-control-rollout.md` §2
- **Acceptance**: Security, Recovery, Quality
- **Milestone**: Post-MVP
- **Status**: Draft; unscheduled until the Gateway milestone is scheduled (D375)

#### E2E-228: Shipped bindings and browser profiles preserve semantic behavior

- **Preconditions**: The same deterministic command/event fixture is
  available through `RACP-WS` and `RACP-HTTP`, and through `RACP-GRPC` only
  if that reserved binding has shipped. A browser harness can hold a Gateway
  session cookie.
- **Steps**: 1) Run the fixture through each shipped binding on the header
  profile. 2) Disconnect during the event stream. 3) Retry a mutation with
  the same idempotency key. 4) Compare normalized responses, errors, durable
  sequences, and final snapshots. 5) From the browser harness, open the
  WebSocket and the SSE stream on the cookie profile with an allowed Origin,
  then with a disallowed Origin, then with a token in the URL, then send a
  mutation without a CSRF token.
- **Expected**: All shipped bindings accept and reject the same operations,
  preserve durable event order and terminal state, return the same semantic
  error codes, and produce one mutation result despite retries; the cookie
  profile succeeds only with an allowed Origin; the disallowed Origin, the
  URL token, and the CSRF-less mutation are rejected.
- **Specs linked**: `03-runtime/19-remote-agent-control-protocol.md` §§11
  and 14, `05-security/02-remote-control-security.md` §§3.1 and 5,
  `06-delivery/07-remote-control-rollout.md` §§3–4
- **Acceptance**: Quality, Recovery, Security
- **Milestone**: Post-MVP
- **Status**: Draft; the browser-profile steps are unscheduled until the browser milestone is scheduled (D375); the parity steps run when a second binding ships

#### E2E-229: Attachment and workspace boundaries are enforced remotely

- **Preconditions**: A Session has a project root and private scratch root. A
  controller can upload one valid fixture and one invalid fixture, directly
  and through a Gateway relay.
- **Steps**: 1) Upload bytes with a correct hash and reference the attachment
  from a turn. 2) Repeat with a wrong hash, oversized body, local absolute
  path, `file://` URL, and an expired upload target. 3) Repeat step 2 through
  the Gateway relay. 4) Attempt a tool path outside the Session root.
  5) Call `project/list` and `session/create` without a path.
- **Expected**: Only the verified attachment is accepted; invalid uploads
  fail before turn admission on both paths; no local client path reaches the
  Host; `project/list` returns labels and ids without absolute paths;
  `session/create` binds the project by id; and the existing
  `PATH_OUTSIDE_WORKSPACE` boundary remains authoritative.
- **Specs linked**: `03-runtime/19-remote-agent-control-protocol.md` §§5.7,
  7.7, and 10, `05-security/02-remote-control-security.md` §6,
  `03-runtime/03-tools-and-permissions.md`
- **Acceptance**: E (tools & permissions), Security
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-230: Failure recovery does not replay admitted work

- **Preconditions**: A deterministic Host, Gateway, and client can inject
  process, link, and response-loss failures; one turn is running and two are
  queued.
- **Steps**: 1) Drop the response after `turn/start` is admitted. 2) Retry
  with the same idempotency key. 3) Crash the Host during the running turn.
  4) Restart the Host and reconnect from the last cursor. 5) Drop an approval
  response after it is accepted and retry it.
- **Expected**: The first retry returns the original turn; execution occurs
  once; Host recovery marks the interrupted turn according to the local
  recovery policy; the reconnect receives a new epoch and a snapshot whose
  queue is empty, and neither queued turn is started or replayed; no
  completed item is replayed as a new turn; and the retried approval returns
  the stored decision with `alreadyResolved` without executing twice.
- **Specs linked**: `02-architecture/05-remote-agent-control.md` §10,
  `03-runtime/19-remote-agent-control-protocol.md` §§7–8 and 9.3,
  `06-delivery/07-remote-control-rollout.md` §4
- **Acceptance**: Recovery, Security, Quality
- **Milestone**: Post-MVP
- **Status**: Draft; remote harness required

#### E2E-REMOTE-MVP: Legacy remote Agent compatibility

- **Preconditions**: Current Desktop and complete same-platform Host bundle,
  isolated data/profile, and a loopback mock model. No production credentials.
- **Steps**: Copy an explicitly selected eligible provider and repeat the copy;
  pair, register a project, create/open an Agent/Ask session and send text. Drop
  the client connection while a real Bash approval is pending, reconnect and
  approve once. Read the resulting transcript/file/diff, reject a path outside
  the project, remove the host and attempt another prompt.
- **Expected**: Import preserves the default and is idempotent. The command and
  turn execute once, in the Host project only; stale routing never falls back
  locally. Snapshot recovery restores pending requests and clears peer-resolved
  cards. Local workspace/model state is unchanged.
- **Compatibility coverage**: Existing remote Agent session routing remains
  covered by `remote-mvp-renderer.test.mjs`; the Settings inventory exposes no
  session-list or new-session controls. New projects follow E2E-REMOTE-HOME.
- **Automation**: `scripts/e2e-remote-mvp.mjs` (packaged Host, real Rust/Agent
  runtime and Desktop main routing, mocked model); `scripts/e2e-remote-mvp-ui.mjs`
  (real components, mocked IPC). Neither is a full SSH/Desktop acceptance result.
- **Status**: Automated narrow-MVP scenario. Linux `sshd`, release download,
  password authentication and full R2 remain separately gated by E2E-231.

#### E2E-REMOTE-HOME: Create and continue a remote workspace as a local project

- **Preconditions**: Isolated Desktop profile, connected Host directory fixtures,
  a local provider fixture, and local/remote directories with the same basename.
  No user profile, production host, credentials or paid model calls.
- **Steps**: Open Settings → Remote Hosts and click **New project** on the
  intended host. Confirm the shared Create project dialog has Remote selected
  and that host preselected. Browse through a separate folder dialog,
  cancel/reopen, navigate parent/child and confirm a directory. Enter a custom
  name, create, rename and reopen the project. Start a normal local chat, choose
  a local model and send a request that invokes Read and Bash remotely. Approve
  locally, cancel a command, disconnect/reconnect and retry explicitly.
- **Expected**: Focus and drafts survive picker cancellation. Late host responses
  cannot replace the current host selection. Project metadata and sessions are
  local and stable after reload, including name/memory/instructions and ordinary
  sidebar/archive operations. Model requests and provider secrets never appear
  in remote transport. Only locally admitted workspace tools execute on Host.
  Equal paths on two hosts or on Desktop never collide. Failed calls never
  execute locally or replay automatically. Existing remote histories remain readable.
- **Specs**: `02-architecture/05-remote-agent-control.md`, `04-ux/01-ui-ia.md`,
  ADR `local-agent-remote-workspace-tools`.
- **Acceptance / milestone**: Local Agent remote-workspace execution; additive
  project KV metadata and authenticated workspace-tool endpoints.
- **Automation**: `remote-project-dialog-user-path.test.mjs`,
  `remote-workspace-tools.test.mjs`, host-core remote project/relay tests,
  pi-host workspace-tool tests and Agent runtime remote-workspace tests;
  `PI_HOST_CORE_BINARY=<candidate binary> node scripts/e2e-local-agent-remote-tools.mjs`
  runs a local model fixture through production Desktop relay, WebSocket RACP
  and real Rust Read/Bash execution, asserting zero remote providers, projects
  and sessions. Both local and remote Rust Hosts are real; the model service
  and the fixture's user approval action are controlled test boundaries.
- **Status**: Candidate implementation; real SSH release validation remains the
  separately provisioned E2E-231 scenario.

#### E2E-231: The desktop drives a remote Host over an SSH tunnel

- **Preconditions**: A Linux test machine runs `sshd` and holds a project
  the desktop can reach with the user's SSH key. A GitHub Releases fixture
  serves the `pi-host` bundle for that platform at the desktop's version, a
  bundle at another version, and a tampered bundle with a wrong checksum.
  The desktop has one local session open, one user MCP server configured,
  and one installed plugin whose tool requires workspace access.
- **Steps**: 1) Add the remote machine from the desktop and let the uploaded
  bootstrap script download, verify, and start `pi-host` over SSH.
  2) Observe the pairing exchange and the resulting device token. 3) Create a
  session under a remote project through `project/list` and
  `session/create`. 4) Start a turn whose fixture reads, edits, and runs a
  command in the remote project, and approve the command from the desktop
  card. 5) Switch the session to Plan mode and back with `session/configure`
  while idle, then attempt it while a turn runs. 6) Open the files tab and the
  diff tab for the remote session. 7) Advertise relay from the desktop, run a
  turn that calls the desktop MCP tool, then close the desktop during a
  second call. 8) Kill the SSH session mid-turn, restore it, and let the desktop
  reconnect. 9) Inspect the remote tool catalog. 10) Attempt to connect from a
  non-loopback address on the remote machine, then with a reused pairing token.
  11) Point the bootstrap at the tampered bundle, then at the other version,
  and reconnect.
- **Expected**: Files change only on the remote machine and the command runs
  there; the approval card appears in the desktop with the local vocabulary;
  the remote host-core binds loopback only; `session/configure` succeeds while
  idle and returns `CONFLICT` while running; files and diff come from the
  remote session root and a path outside it returns
  `PATH_OUTSIDE_WORKSPACE`; the desktop MCP tool executes on the desktop and
  its result reaches the remote transcript, while the second call fails with
  `TOOL_FAILED` and the turn continues; reconnect resumes by cursor without a
  duplicate. The remote catalog lists the relayed MCP tool but not the
  workspace-requiring plugin tool. Non-loopback peers and reused pairing tokens
  are rejected. Tampered bundles are refused before start; SSH login failures
  are surfaced safely; version mismatch offers a matching-release recovery.
  The local session is untouched throughout.
- **Specs linked**: `02-architecture/05-remote-agent-control.md` §§5.2 and
  6.3, `03-runtime/19-remote-agent-control-protocol.md` §§6.2, 9.4, and
  11.1, `05-security/02-remote-control-security.md` §§3.4, 4.3, 5.1, and 7,
  `06-delivery/07-remote-control-rollout.md` §2
- **Acceptance**: E (tools & permissions), Security, Recovery, Quality
- **Milestone**: Post-MVP (rollout R2)
- **Status**: Draft; remote harness with a Linux SSH target required

#### E2E-REMOTE-SSH-OPTIMIZATION: Verified deployment, local Agent and recovery

- **Preconditions**: Isolated Desktop profile and a Linux x64/arm64 SSH target
  with `sshd`, POSIX shell, archive/hash tools and kernel `flock`; no system Node,
  systemd, public listener, production credential or paid model. A controlled
  release fixture serves a matching Host archive and digest.
- **Steps**: Install through SSH with remote download; repeat bootstrap and verify
  immutable installed files are reused. In a separate isolated account, block
  remote release access and verify one bounded Desktop-download/SSH-upload path.
  Corrupt the archive and alter an installed file; verify integrity failures do
  not fall back or replace a working install. Reboot/kill the Host and repeat
  readiness; rotate Host identity and revoke a device token. Create a local
  project bound to the remote workspace, use local model credentials and remote
  `AGENTS.md` with local global instructions, then run Read and permissioned Bash.
  Drop SSH during Write and inspect the remote file before any manual retry.
  Exercise offline project browsing and the Settings connection status labels.
  Repoint the fixture release so the paired Host no longer matches the desktop,
  then select a remote folder and verify the Host is realigned over the same
  verified install, re-paired in place and connected without removing it.
- **Expected**: Bundled Node starts the Host without a system Node or remote
  release access. Reuse validates the external release receipt and installed
  manifest; failed staging leaves the previous `current` intact. Daily readiness
  starts/reuses the same Host without re-pairing, resetting credentials, killing
  another client’s Host or replaying tools. Identity/authentication failures stop
  automatic retry. Local model requests, API keys, sessions and permissions stay
  local; workspace tools/files and root-only repository instructions come from
  the remote canonical root. A lost mutation reply reports
  `REMOTE_MUTATION_OUTCOME_UNKNOWN` and is not replayed or executed locally. A
  Host that falls behind the desktop release is realigned over the same verified
  install and re-paired in place — once per release per host, and again on an
  explicit user reconnect — while a Host that still cannot serve this desktop
  keeps the upgrade message instead of looping or dropping the pairing.
- **Automation**: `remote-host-realign.test.mjs`,
  `remote-host-supervisor.test.mjs`, SSH bootstrap shell,
  packaging, artifact transfer, concurrent readiness/auth lifecycle and UI
  contract suites; `PI_HOST_CORE_BINARY=<candidate binary> node
  scripts/e2e-local-agent-remote-tools.mjs` covers local model/instructions
  through real loopback RACP and Rust Read/Bash, but is not SSH qualification.
- **Acceptance**: Security, Recovery, Quality; release remains gated on the
  real Linux SSH run and a new matching Desktop/Host release. This scenario does
  not claim reverse-relay, interactive-terminal or complete R2 acceptance.
- **Status**: Candidate implementation; Linux SSH and release qualification
  pending.

#### E2E-REMOTE-HOST-ssh-password-authentication

- **Preconditions**: Settings → Remote Hosts is available with its Experimental
  badge, independently of developer mode. A Linux test machine runs `sshd` with
  `PasswordAuthentication yes` and `PubkeyAuthentication no`, so the login is
  only reachable with a password; the user's local SSH agent holds no usable key
  for it. A GitHub Releases fixture serves the `pi-host` bundle for that platform
  at the desktop's version. A second machine accepts the user's key only.
- **Steps**: 1) In Settings → Remote Hosts, open the Add form's SSH tab, choose
  a local private-key file in key mode, and confirm its path is displayed. Cancel
  a second file selection and confirm the existing choice remains; select the
  same file again and confirm it can be reselected. Clear the selection once to
  confirm the SSH agent/config fallback is available, then choose the key again.
  2) Switch the authentication mode to password, confirm the identity-file
  picker is replaced by a masked password field, and reveal it once.
  3) Try to submit an empty password. 4) Point the form at the
  password-only machine, enter the password, and bootstrap it.
  5) Quit the desktop, relaunch it, and let the host reconnect.
  6) Change the saved password to a wrong value through a re-pair, then force a
  reconnect. 7) Bootstrap the key-only machine with a password supplied.
  8) Inspect the desktop's process arguments and `remote-hosts.json` while a
  password-authenticated host is connected. 9) Attempt to submit a password
  containing a newline through the IPC channel directly.
- **Expected**: Key mode lets the user choose a local identity file; its path
  is read-only in the form and is passed to the existing `ssh -i` flow. The app
  never reads or uploads the key contents. Cancel preserves the prior choice, the
  same file can be selected again, and Clear returns to SSH agent/config lookup.
  The key-authenticated SSH behavior remains unchanged: `BatchMode=yes` and no
  credential file anywhere. In password mode the picker is replaced by a masked
  password field, the reveal toggle shows and re-hides the value, and an
  empty password keeps the submit disabled. The password-only machine installs
  and pairs. After the relaunch the host reconnects with no prompt, proving the
  saved credential is used. The wrong password yields exactly one failed attempt
  per connect (no helper-driven retry storm) and the host shows as offline rather
  than crashing the app or showing a rejected-login dialog. The Settings toast
  carries ssh's last stderr line (for example `Permission denied`), not a bare
  exit code 255. The key-only machine fails under password mode because that
  mode sets `PubkeyAuthentication=no`; a user with a key picks key mode. No
  `ssh` argument contains the password, no askpass file or directory remains
  after the connect completes, and the on-disk record stores the password only
  as keychain ciphertext — never in cleartext. A password containing a newline
  is refused with `INVALID_ARGUMENT` before any remote command runs.
- **Specs linked**: `05-security/02-remote-control-security.md` §§3.4 and 13
  (gate 21), `02-architecture/05-remote-agent-control.md` §5.2,
  `06-delivery/07-remote-control-rollout.md` §2
- **Acceptance**: Security, D (surfaces), Quality
- **Milestone**: Post-MVP (rollout R2b)
- **Status**: Draft; remote harness with a password-only Linux SSH target
  required. The chooser control is covered by
  `apps/desktop/test/settings-remote-hosts.test.mjs`; the SSH credential seam is
  covered offline by `apps/desktop/test/remote-host-ssh-password.test.mjs`.


#### E2E-REMOTE-HOST-settings-compact-inventory

- **Preconditions**: The desktop Settings window can open. No paired remote
  host is required. Developer mode is off in persisted settings. The isolated
  renderer harness can return a successful pair result without network access.
- **Steps**: 1) Open Settings with developer mode off and confirm Remote Hosts
  and its search hits are available. 2) Open the page and confirm the rail and
  title carry the Experimental badge. 3) Confirm the SSH and Pair action row is
  above the inventory and neither dialog is open. Open SSH; verify the dialog is
  named, modal, and focuses its first field. Cancel and confirm focus returns to
  SSH. Open Pair, submit the fixture pairing form, and confirm success closes
  the dialog and clears the draft. Change language and confirm action labels
  update. Reopen Pair, enter a draft, cancel, and confirm the dialog closes and
  the draft clears. Open SSH password mode, enter a fixture password, cancel,
  reopen, and confirm the password is empty. Press Escape and verify the dialog
  closes and focus returns to SSH. 4) Toggle developer mode and confirm the
  destination stays selected and available. 5) On a paired SSH host, open the
  historical sessions browser and verify model-copy and remote-create controls
  are absent. New workspace creation stays on Home.
- **Expected**: Experimental availability is consistent across packaged and
  development builds. Add actions precede inventory; the forms open in the
  shared modal surface, one at a time. Cancel, Escape, backdrop dismissal, and
  successful submission close the dialog and clear drafts; focus returns to the
  initiating action. Existing pairing toasts remain. The inline browser
  preserves existing remote histories; new SSH workspace projects use the
  local model and project controls from Home.
- **Specs linked**: `04-ux/06-settings-ia.md` §1, §3,
  `06-delivery/07-remote-control-rollout.md` §2 R2,
  `02-architecture/05-remote-agent-control.md` §5.2
- **Acceptance**: D (surfaces), Quality
- **Milestone**: Post-MVP (rollout R2b)
- **Status**: Offline coverage in `settings-remote-hosts.test.mjs` and
  `remote-mvp-renderer.test.mjs`; isolated Electron/Chromium interaction coverage
  in `scripts/e2e-remote-mvp-ui.mjs`, including disclosure, success and cancel
  paths. Real SSH acceptance is separate.

#### E2E-232: The outbound messaging integration relays events and commands

- **Preconditions**: A Host runs with the integration adapter configured
  against a webhook sink and a long-polling bot fixture, with one linked chat
  and one unlinked chat. No inbound port is open on the Host machine.
- **Steps**: 1) Run a turn to completion. 2) Start a turn that raises a tool
  approval and leave it pending. 3) Send the stop command from the linked
  chat during a running turn. 4) Send the same command from the unlinked
  chat. 5) Make the webhook sink return errors for one minute, then recover.
  6) Inspect every payload delivered.
- **Expected**: The sink and the bot receive redacted summaries of
  `turn.completed` and `approval.requested` with ids and bounded summary
  text only; the linked chat's stop maps to `turn/stop` under the linked
  principal's roles and the turn ends at the next boundary; the unlinked
  chat's command has no effect and is audited; delivery failures are retried
  within the bound and never delay or block the turn; and the Host opens no
  listener.
- **Specs linked**: `02-architecture/05-remote-agent-control.md` §4,
  `06-delivery/07-remote-control-rollout.md` §2 (R3),
  `05-security/02-remote-control-security.md` §10
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP (rollout R3)
- **Status**: Draft; integration fixture required

## Trusted extension scenarios (R7 v1)

The following scenarios are the acceptance targets of D387 / ADR 0214 and
`07-plugins/16-trusted-extensions.md`. The headless runner generates its six
plugin-form fixtures in an isolated temporary directory at runtime.

#### E2E-241: Discovery lists trusted extensions and enablement is explicit

- **Preconditions** (D388): a pi extension directory `hello/` with
  `index.ts`, and a plugin package declaring `contributes.agentExtensions`
  with `agent.extension` whose activation scope is limited to the fixture
  project; a second project outside that scope.
- **Steps**: 1) Plugins → Import pi extension, accept the confirm, pick
  `hello/`. 2) Send a prompt in the fixture project. 3) Open the imported
  plugin's row details. 4) Disable the plugin and send a prompt. 5) Switch
  to the second project and send a prompt. 6) Load a plugin whose manifest
  lists `agentExtensions` without the permission.
- **Expected**: The import creates `plugins/imported/hello` with a manifest
  holding `agent.extension` and lists the plugin with the `agentExtension`
  capability and the permission chip; the next turn lists its tools and the
  row shows `loaded` with the registered names; disabling the plugin retires
  the runtime and the next turn has no extension tools; the project-scoped
  plugin contributes nothing outside its projects; the manifest without the
  permission is rejected as `PLUGIN_INVALID`; `~/.pi/agent/settings.json`
  is never written.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §2, §3, §11; D007; D387
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Partially automated (`pnpm test:e2e:trusted-extensions`); the headless journey covers plugin discovery/projection, project scope, load state, and diagnostics, while native picker import and explicit enablement remain renderer/platform validation.

#### E2E-PLUGIN-imported-pi-package-wrapper: Imported package module types preserve plugin initialization

- **Preconditions**: Isolated local Pi packages declare `type: module`,
  `type: commonjs`, or no `type`; each has an extension and skill contributions.
  A fourth fixture represents an older imported ESM package with the generated
  CommonJS `main.js` and matching manifest.
- **Steps**: Run `node --test apps/desktop/test/imported-package-skills-runtime.test.mjs`.
  Generate each plugin through the production importer, load it through
  `PluginRuntime` and the real child-process plugin host, read its skill catalog
  and bodies, and inspect its declared extension. Re-import the older fixture
  without loading it, then load the older fixture itself.
- **Expected**: Each new manifest points to an existing `main.cjs`; initialization
  succeeds for all three package types. Source and both copied `package.json`
  files retain the same bytes. The repeated import has a distinct path/id and
  loads successfully; generating it leaves the older manifest, wrapper, and
  package files unchanged. Loading the older fixture rewrites its generated
  `main.js` in place to `main.cjs`, keeps the copied `package.json` bytes, and
  initializes. A customized `main.js` is not rewritten.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §3.2; ADR 0215.
- **Acceptance**: Quality
- **Status**: Automated import-to-plugin-host fixture. Run against the committed
  task candidate after incorporating the latest `origin/main`; record the tested
  candidate, base, result, and environment in delivery evidence. Native picker,
  npm dependency installation, Windows execution, and third-party extension
  execution during a provider turn are not covered by this fixture.

#### E2E-PLUGIN-imported-pi-package-skills: Explicit package import exposes skills through plugin grants

- **Preconditions**: A local fixture package under an npm-style
  `node_modules/@fixture/package-skills` path declares `pi.extensions` and
  `pi.skills`. Its skills include a direct Markdown file, a directory with
  `SKILL.md`, and a collection containing two different `SKILL.md` files.
  Reference files, assets, a `node_modules-note.txt` resource, and an internal
  `node_modules` dependency are present. A second fixture declares only
  `pi.skills`. No downloaded third-party code or dependency installation is
  needed.
- **Steps**:
  1. Choose the mixed package through Plugins → Import pi extension and
     inspect the generated manifest and copied resources. For headless
     validation, pass the explicit selected path to the same importer.
  2. Load the generated directory in the real `PluginRuntime`; inspect
     `getSkills()` and read every document with `loadSkillBody(id)`.
  3. Reload with only `agent.extension` granted, then reload with only
     `agent.prompt.inject` granted. Unload the plugin and try the old skill IDs.
  4. Import the skill-only package; ensure a helper `index.js` is not treated
     as an extension. Install a generated two-skill fixture through the real
     Host `plugins.installFromPath`, list it, read its installed manifest and
     skill files, then uninstall it.
  5. Attempt declarations with absolute paths, `..`, missing or unsupported
     files, an internal dependency path, or descendant symbolic links. Exceed
     the 32-skill or 256-directory scan limit and inspect failure cleanup.
- **Expected**: All four declared skills appear with independent stable IDs,
  including the repeated `SKILL.md` basenames, and loading them returns the
  correct body with frontmatter removed. The imported extension remains a
  separate contribution. Resources and their relative paths survive copying;
  npm installation ancestors do not suppress the package, and only dependency
  directory segments within the selection are excluded. Missing skill grants
  leave no skill catalog entries and produce the existing permission audit;
  grants can be restored without changing IDs. Unload removes both catalogs,
  and old skill IDs return `NOT_FOUND`. Skill-only imports declare only
  `agent.prompt.inject`, and Host reports the `skills` capability while
  retaining both skill documents. Invalid declarations fail without importing
  outside data or retaining a partial copied plugin. Nothing automatically
  imports `~/.pi` or runs npm lifecycle scripts; the explicit dependency path
  may run the bounded npm installer described in E2E-PLUGIN-import-extension-installs-dependencies.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §3.2;
  `07-plugins/02-plugin-manifest-schema.md`; D007
- **Acceptance**: E (tools & permissions), G (plugins), Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Partially automated. `imported-package-skills.test.mjs` covers
  import discovery, resource copying, grants, and invalid-path handling.
  `imported-package-skills-runtime.test.mjs` drives the generated no-op plugin
  through the real plugin host subprocess and verifies catalog/body loading,
  grant removal/restoration, and unload. On 2026-09-13, a separate temporary
  two-skill fixture passed real Host `plugins.installFromPath` → `plugins.list`
  → installed manifest/body reads → `plugins.uninstall`; it reported only
  `agent.prompt.inject` and the `skills` capability. The native picker,
  rendered plugin row, and a provider turn invoking the imported Skill have
  not been executed for this scenario; no full desktop journey is claimed.

#### E2E-242: Extension tools and hooks take effect in a turn

- **Preconditions**: An enabled fixture extension that registers tool `fx_add`,
  handles `before_agent_start` by appending a marker to the system prompt,
  `tool_call` by blocking `bash` with a reason, and `tool_result` by
  replacing `fx_add` output.
- **Steps**: 1) Start a turn in Agent mode whose fixture model calls `fx_add`
  then `bash`. 2) Inspect the provider request. 3) Inspect the tool results.
  4) Switch to Plan mode and repeat. 5) Register a second extension declaring
  a tool named `read`.
- **Expected**: The system prompt carries the marker; `fx_add` executes in the
  sidecar with no permission prompt and its result is the replaced value;
  `bash` is blocked with the extension's reason and the block is visible in
  the transcript; an audit line records extension id, tool name, and duration
  and no parameters; in Plan mode `fx_add` follows the non-core mode gate;
  the `read` collision is rejected with a diagnostic and the core tool is
  unchanged.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §6, §7; ADR 0214
- **Acceptance**: B (agent), Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Partially automated (`pnpm test:e2e:trusted-extensions`); Agent-mode tool dispatch, ToolSearch deferral, hooks, blocking, and result replacement pass, while Plan-mode gating and core-tool collision remain additional validation.

#### E2E-HOOKS-prompt-chain: Multiple extensions preserve prompt additions

- **Preconditions**: Two or three enabled fixture extensions append different markers
  using `event.systemPrompt` in `before_agent_start`; the provider is a local
  deterministic HTTP/SSE service.
- **Steps**: Run two turns through the real runtime and inspect both provider
  requests. Exercise multiple handlers, explicit replacements (including an
  empty string), missing/malformed returns, exceptions, timeout/late input
  mutation, and Stop/disposal while a handler waits.
- **Expected**: All markers reach the provider in extension/registration order,
  once per turn. Identical inputs produce identical prompt bytes. Full string
  replacements remain supported. Only timely returned strings enter the chain;
  failed handlers do not discard earlier additions, cancelled turns send no
  request, and the next turn can proceed. Other events retain existing folds.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §6; ADR 0214; #1023.

#### E2E-HOOKS-context-every-request: Context handlers shape every provider request

- **Preconditions**: An enabled fixture extension appends a marker message in
  `context`; the provider is a local deterministic HTTP/SSE service whose first
  reply is a tool call.
- **Steps**: Run two turns through the real runtime: the first turn makes a
  tool call and a follow-up request, the second answers directly. Inspect every
  provider request and the persisted transcript rows.
- **Expected**: `context` fires once per provider request, including the first
  request of each run, and every request carries the marker exactly once. The
  marker never reaches the persisted transcript.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §6; ADR 0214; #1838.
- **Acceptance**: B (agent), Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Automated by `extensions/prompt-chain.test.ts`,
  `extensions/runner.test.ts`, and `extensions/runtime-lifecycle.test.ts`.
  `pnpm test:e2e:trusted-extensions` additionally checks that two plugin-form
  extensions reach the provider in the desktop's extension ID order.

#### E2E-TRUSTED-EXTENSION-custom-agent-stream-and-binding: Plugin-owned agent streams and session binding

- **Preconditions**: An enabled trusted extension calls `registerAgent` with one
  model and a fixture `stream`/`complete` implementation. The fixture provider
  has no Host provider row or Host secret.
- **Steps**: 1) Load the extension and inspect `ctx.modelRegistry` for the
  redacted model. 2) Call `pi.setModel(model)` while idle. 3) Run a turn and
  inspect the callback's model/context/options. 4) Restart or create the next
  turn. 5) Attempt to read Host provider keys/secret refs through the registry.
- **Expected**: `registerAgent` appears in the loaded contract and the model is
  selectable; `setModel` persists only the current session binding under an
  `extension-agent:` provider id; the plugin callback streams the assistant
  response and receives cancellation; the next turn reloads the extension and
  restores the same agent implementation; the registry exposes model metadata
  and auth availability but no Host key, secret ref, OAuth token or arbitrary
  Host headers. `registerProvider` with the same plugin-owned stream shape has
  equivalent behavior.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §5, §10; ADR 0258;
  D426
- **Acceptance**: B (agent), C (conversation & stream), Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Partially automated (`pnpm test:e2e:trusted-extensions`): the loaded
  contract, both registration forms (`registerAgent` and the `registerProvider`
  alias, in each call form), the custom-agent names on the plugin row, the
  redacted registry, idle `setModel` persistence under the `extension-agent:` id,
  and the next turn restored through the plugin's own transport pass.
  Cancellation through `options.signal`, the `stream`-form callback's
  model/context/options inspection, and cross-session module sharing remain
  additional validation.

#### E2E-243: Extension commands and UI prompts round-trip through the renderer

- **Preconditions**: An enabled fixture extension registering command `greet`
  that calls `ui.input`, then `ui.select`, then `ui.confirm`, then
  `ui.notify`, and renames the session.
- **Steps**: 1) Open global search and inspect the Commands section. 2) Run
  `/greet` from the composer. 3) Answer each prompt. 4) Run `/greet` again and
  abort the turn while the input prompt is open. 5) Run `/greet` with no
  active session. 6) Attach a remote controller (fixture) and run `/greet`.
- **Expected**: `greet` is listed after built-in and plugin commands with the
  extension label; each prompt shows the extension label and path; answers
  reach the extension in order; the toast appears; the session is renamed
  and `session_info_changed` fires; the aborted prompt resolves `undefined`
  and the command ends; with no session the entry is disabled with a tooltip;
  under remote control the prompt fails with `UNSUPPORTED` and the command
  reports it.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §8, §9, §10;
  `07-plugins/09-plugin-command-palette.md`
- **Acceptance**: A (app control), Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Partially automated (`pnpm test:e2e:trusted-extensions`); global/composer command discovery, prompt broker round-trip, abort, session rename, exec, and Host-owned queue pass, while no-session and remote-control cases remain additional validation.

#### E2E-TRUSTED-EXTENSION-temporary-session-cwd-is-scratch: Extensions in a temporary session work in its scratch

- **Preconditions**: An enabled fixture extension registering command `where`
  that reports `ctx.cwd`, `ctx.sessionManager.getCwd()`, and the working
  directory of a child started with `pi.exec` without a `cwd` option.
- **Steps**: 1) Start a temporary session (no project) and run `/where`
  before any tool call. 2) Run `/where` in a project session.
- **Expected**: In the temporary session all three values are the session's
  `scratch/<sessionId>` directory, which exists and the child starts in; none
  is the sidecar's process directory. In the project session all three are
  the project root, and no scratch directory is created for the extension.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §7; D114
- **Acceptance**: A (app control), Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Unit-covered (`packages/agent-runtime/src/extensions/runtime-lifecycle.test.ts`); Electron journey Documented

#### E2E-244: Unsupported APIs, load errors, and handler timeouts degrade to diagnostics

- **Preconditions**: Four enabled fixture extensions: one importing
  `@earendil-works/pi-tui` at top level and calling `ui.setWidget`; one importing
  an unsupported named export from `@earendil-works/pi-coding-agent`; one whose
  module throws at load; one whose `context` handler never resolves.
- **Steps**: 1) Start a turn. 2) Open the diagnostics drawer for each entry.
  3) Confirm the unsupported export stays undefined. 4) Wait past the 30 s
  handler limit. 5) Disable the throwing extension and start another turn.
- **Expected**: The pi-tui import succeeds, `setWidget` returns an inert
  `dispose`, and one diagnostic per member is recorded; the throwing
  coding-agent export stays unavailable and reports `unsupported_api`; the
  throwing extension shows `error` with message and stack, the composer shows a
  one-line notice, and the other extensions still load; the stalled handler
  is abandoned after 30 s with a diagnostic and the turn completes with the
  unmodified context; after disabling, the notice disappears at the next turn
  boundary and no running turn was interrupted.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §4.2, §4.4, §5, §6
- **Acceptance**: Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Partially automated (`pnpm test:e2e:trusted-extensions`); missing static named exports are covered through the real Jiti loader by `runner.test.ts`, while diagnostics-drawer rendering for that import, the stalled-handler timeout, and disable-at-boundary journey remain additional validation.

#### E2E-245: The packaged sidecar loads a TypeScript extension through jiti

- **Preconditions**: A packaged build of the desktop app; a fixture
  `~/.pi/agent/extensions/typed.ts` that uses TypeScript syntax, imports
  `@earendil-works/pi-coding-agent` and `typebox`, and registers a tool.
- **Steps**: 1) Launch the packaged app. 2) Enable `typed.ts`. 3) Start a
  turn whose fixture model calls the tool. 4) Inspect the sidecar bundle
  manifest for the three pi package versions.
- **Expected**: The extension loads without a transpile or resolution error;
  the aliased imports resolve to the sidecar's copies; the tool executes;
  the three pi package versions are identical and the CI version-lock check
  passes.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §4.2, §13; ADR 0214
- **Acceptance**: Quality, Release
- **Milestone**: Post-MVP (R7 v1, delivered first as the bundling spike)
- **Status**: Unit-covered by `packages/agent-runtime/src/extensions/bundle.test.ts`: an esbuild bundle run from a temp directory, plus a kernel-loader case that loads a `typebox`-importing extension through `@earendil-works/pi-coding-agent`'s own loader from a bundle with no `node_modules` above it; the packaged-app jiti journey remains Draft and is not faked by the headless runner.
#### E2E-PLUGIN-import-extension-installs-dependencies: Importing an extension with npm dependencies installs them before first load

- **Preconditions**: A local pi extension package with `package.json`, `pi.extensions`,
  a pinned pure-JavaScript `is-number@7.0.0` dependency, a `workspaces` field, and
  no `node_modules`; the built workspace packages and npm are available.
- **Steps**: 1) Generate the imported plugin from the local directory. 2) Run the
  real bounded installer. 3) Inspect the copied package, lockfile, installed module,
  lifecycle marker, and trusted-extension load report.
- **Expected**: The plugin root holds the copied `package.json` with `workspaces`
  stripped. The installer runs the two registry-only, `--ignore-scripts` npm steps;
  every lockfile `resolved` URL is registry-only, `node_modules/is-number` exists,
  no lifecycle marker is written, and the trusted-extension runner reports `loaded`
  with the dependency-backed command registered.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §3.2, §10.2; ADR 0244
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Automated by `pnpm test:e2e:plugin-import-deps` for the deterministic
  installer boundary; the full picker/renderer/turn journey remains a separate
  validation surface.

#### E2E-PLUGIN-import-extension-reports-missing-dependency: A failed dependency install or unloadable dependency is surfaced, never silent

- **Preconditions**: Three local pi extension packages whose `package.json`
  dependencies use unsupported `file:`, git, and HTTP tarball sources; none has
  `node_modules` or a lockfile.
- **Steps**: 1) Generate each imported plugin. 2) Invoke the real dependency
  installer. 3) Inspect the returned error and the generated plugin directory.
- **Expected**: Each failure is explicit and occurs before npm starts; the imported
  plugin and manifest remain registered, while no loadable `node_modules` or generated
  lockfile remains. The renderer toast/load-error journey is covered separately.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §3.2, §4.4, §10.2; ADR 0244
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Automated by `pnpm test:e2e:plugin-import-deps` for the deterministic
  registry-source rejection boundary; renderer warning-toast and `load_error`
  behavior remains a separate validation surface.

#### E2E-PLUGIN-langfuse-opt-in-export: The Langfuse example plugin exports only after the user configures a sink

- **Preconditions**: The committed `examples/plugins/pi-langfuse/agent/langfuse.mjs`
  artifact with no `node_modules` beside it; an isolated `PI_CODING_AGENT_DIR`
  and an isolated `PI_DESKTOP_DATA_DIR`; a local stub OTLP sink. No real
  Langfuse instance is contacted.
- **Steps**: 1) Load the artifact through the real trusted-extension runner and
  jiti loader with no credentials. 2) Drive a full turn (`session_start`,
  `before_agent_start`, `message_end`, `agent_settled`). 3) Write the user's own
  `langfuse.json` pointing at the stub sink and repeat the turn. 4) Set
  `LANGFUSE_TRACING_ENABLED=false` with keys present and repeat. 5) Set
  `LANGFUSE_*` credentials that disagree with the file and repeat.
- **Expected**: The artifact loads with zero diagnostics in every case, proving
  `getAgentDir` resolves and no bare specifier is left unresolved. Unconfigured,
  it subscribes only to `session_start`, reports `langfuse: off (no keys)`, and
  the sink receives nothing. Configured, one settled turn produces at least one
  `POST /api/public/otel/v1/traces` whose Basic credential is exactly the user's
  own key pair, the trace is named `Pi Turn` and typed as a span, and the status
  line reaches `langfuse ✓ (trace sent)`. The kill switch returns it to zero
  export. Environment credentials win over the file.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §4.2;
  `03-runtime/09-logging-and-observability.md` §8; ADR 0334
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Automated by
  `packages/agent-runtime/src/extensions/langfuse-extension.test.ts` (user path)
  and `apps/desktop/test/example-langfuse-plugin.test.mjs` (opt-in shape, absence
  of shipped credentials, import allowlist, artifact reproduction). The
  reproduction check runs when `PI_LANGFUSE_BUNDLE_FROM` names a directory with
  the pinned package installed and is skipped otherwise, so the suite stays
  offline. The Plugin Center enable/grant journey remains a separate validation
  surface.

#### E2E-PLUGIN-langfuse-settings-sheet: A saved plugin setting reaches the trace, at the documented moment

- **Preconditions**: The same artifact, runner, loader, isolated
  `PI_CODING_AGENT_DIR`, and local stub sink as
  E2E-PLUGIN-langfuse-opt-in-export. The settings file is written at the path
  the host's `pluginDataDir()` formula produces
  (`<data>/plugins/data/<plugin-id>/settings.json`), because the sheet is only
  the editor of that file.
- **Steps**: 1) Save a full row set with panel credentials and load the
  extension; drive a turn. 2) Rewrite the file with a second key pair and build
  a new Runner for the same spec id — the reload a disable/enable performs — and
  drive another turn. 3) Save empty text fields over a populated
  `langfuse.json`. 4) Export a `LANGFUSE_PUBLIC_KEY`, save a panel key, then
  clear the panel row. 5) Keep `LANGFUSE_TRACING_ENABLED=false` in the
  environment with the panel row on. 6) Save a small `PI_LANGFUSE_MAX_CHARS`,
  drive a turn with a 400-character prompt, then change the row and reload.
- **Expected**: The saved credentials carry the export (the decoded Basic header
  is the panel pair), and the reload picks up the changed file, so the last
  export uses the second pair. An empty field sets nothing: the trace falls back
  to `langfuse.json`. A field the panel filled and the user then cleared gives
  back the value the process inherited, so no stale sink survives a reload. An
  inherited kill switch is never raised: the extension still registers only
  `session_start` and the sink stays empty. A saved max length truncates the
  prompt on the module's first evaluation (`truncated`, `orig_len`, `kept_len`
  in the exported metadata) and a reload does not change it — the row applies on
  app restart, which is what ADR 0335 and the plugin README promise. The sheet's
  rows and the variables they set are the same set, and neither the manifest,
  the bridge, nor the artifact carries an endpoint, a credential, or a log
  statement that could echo one.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §4.2;
  `07-plugins/11-plugin-storage-isolation.md` §4;
  `03-runtime/09-logging-and-observability.md` §8; ADR 0334, ADR 0335
- **Acceptance**: Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Automated by
  `packages/agent-runtime/src/extensions/langfuse-extension.test.ts` (panel
  values, reload, precedence),
  `packages/agent-runtime/src/extensions/langfuse-settings-layers.test.ts` (the
  import-time layer; a file of its own because it must observe the module's
  first evaluation), and `apps/desktop/test/example-langfuse-plugin.test.mjs`
  (row/variable agreement, the path formula against `pluginDataDir()`, the
  ordering guard in the artifact, no secret rows, no logged values). The sheet
  rendering and the Plugin Center reload journey remain a separate validation
  surface.

#### E2E-PLUGIN-import-extension-recovers-missing-npm: Choose a trusted npm installation and resume the same import

- **Preconditions**: A desktop build with an isolated data directory; npm/Node.js
  unavailable on its inherited `PATH`; a local extension declaring a pinned
  registry dependency and an install-script marker; a trusted Node.js/npm
  installation outside `PATH` (on macOS, include a hidden `~/.nvm` directory).
- **Steps**: 1) Import the package through Plugins and accept the trust confirm.
  2) In the native missing-npm message choose "Choose npm". Select an invalid
  executable, then an npm without usable Node.js; choose again after each warning.
  3) Select working npm alongside `node`. Inspect the resulting plugin and saved
  path. 4) Restart the app and import another package; then remove or move the
  saved executable and repeat. 5) Repeat with Cancel in the message box, picker,
  and invalid-selection warning. 6) Make saving the path fail while keeping the
  plugin destination writable and retry with a valid selection. 7) With working
  npm, force an ordinary registry/network failure. Repeat dialog checks in all
  eight shipped locales.
- **Expected**: Only structured npm/Node unavailability prompts for a path.
  Native copy explains trusted Node.js, installing Node.js if absent, and remembering
  the selection; hidden directories are visible. Invalid selections are rejected
  by bounded version checks and never saved; choose-again/cancel stays available.
  A valid choice resumes installation in the original generated directory with
  the original plugin id and writes `<dataDir>/npm-path.json` atomically. Restart
  reuses the validated path without prompting; a stale saved path prompts again.
  Save failure warns but the current install still uses the valid choice. Every
  completion, cancellation, and dependency error loads/registers that generated
  plugin exactly once without recopying it; dependency failures remain visible.
  Network/registry failures never open the npm picker. Only the install child
  gains the selected directory in `PATH`; shell probing, global environment
  changes, credential inheritance, and lifecycle marker execution do not occur.
  The registry-only proxy and two-step dependency validation remain enforced.
  Dialogs use localized standalone bodies and existing localized Cancel, with
  dynamic diagnostics appended on a new line.
- **Specs linked**: `07-plugins/16-trusted-extensions.md` §3.2; ADR 0244
- **Acceptance**: F, G, Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Automated at the native-dialog I/O boundary by
  `pnpm test:e2e:plugin-import-deps`: the real import handler and npm installer
  recover from an empty PATH, keep registry-only resolution and disabled scripts,
  persist the selected path, and register the same plugin once. The desktop
  `npm-install-recovery.test.mjs` suite covers cancellation, invalid/stale paths,
  preference reload, save failure, localization, and ordinary network errors.
  Physical native-picker interaction (including macOS symlink selection), full
  desktop restart, and visual checks in every locale remain manual/not run.


---

#### E2E-233: Icon-only actions explain their purpose in the active language

- **Preconditions**: The desktop app is running with a project, a chat error,
  toast, update notice, dialog, sidebar row, pull request, and work-panel file
  available as applicable; the UI language can be changed between English and
  Simplified Chinese.
- **Steps**: 1) Hover each icon-only action in the error, toast/update,
  dialog, capability search, sidebar, pull-request, and file-viewer surfaces.
  2) Focus the same controls with the keyboard. 3) Repeat after switching the
  UI language to Simplified Chinese.
- **Expected**: Each control exposes a localized action purpose on hover and
  focus, has the same localized accessible name, and does not expose a raw icon
  name or URL as its action label. Decorative icons remain silent to assistive
  technology. English and Simplified Chinese show different catalog values.
- **Specs linked**: `04-ux/08-component-spec.md`,
  `04-ux/09-interaction-patterns.md`
- **Acceptance**: Accessibility, Quality
- **Milestone**: M6+
- **Status**: Source-contract covered; desktop hover/focus automation pending

#### E2E-PLAN-005: Plan-mode plugin tools with `planSafeActions` are read-only (D384)

- **Preconditions**: PI-Desktop is built with the bundled Browser
  plugin (`pi.browser`) enabled and a workspace that exposes one
  http(s) URL the planner can reach. The catalog list is the default
  bundled one; no third-party plugin needs to be installed for this
  scenario.
- **Steps**: 1) Create a new session and switch it to Plan mode from
  the mode selector. 2) Send the prompt "Use the browser plugin to
  read `https://example.com`, summarize the page, and tell me what
  to change." 3) Wait for the planner to call
  `plugin_pi_browser_Browser` with `action="navigate"` followed by
  `action="snapshot"`, and to submit a plan with the requested
  summary. 4) Approve the plan and confirm the Agent run completes.
  5) Reject the plan, re-send the same prompt in Plan mode, and
  confirm the planner can still call `navigate` + `snapshot`.
  6) Ask the planner to "click the sign-in button" through the
  browser plugin and confirm the call is rejected with
  `PERMISSION_DENIED` (a Plan call can never click). 7) Inspect the
  active session tool list and confirm it shows the Browser plugin
  with the description suffix `Plan mode: only navigate, snapshot,
  screenshot, console actions`. 8) Switch back to Agent mode and
  confirm the same prompt lets the model call `click` and `fill`
  without the suffix.
- **Expected**: Plan mode can drive the Browser plugin for the four
  declared read-only actions, the description tells the model which
  actions are allowed, and any mutating action is denied with a
  structured `PERMISSION_DENIED` error before the plugin sees the
  call. Agent mode keeps the full plugin surface.
- **Specs linked**: `03-runtime/02-agent-runtime.md`,
  `03-runtime/03-tools-and-permissions.md`, `07-plugins/README.md`,
  ADR 0211
- **Acceptance**: Functional, Quality
- **Milestone**: M6
- **Status**: Partially automated: `test:e2e:plan` covers Plan-mode host
  admission, durable-mode/action-list forwarding, and fixture-boundary
  mutation denial; the full Electron Browser journey remains Draft (run only
  in a capable environment when this surface changes)

#### E2E-250: Context usage display preference switches the inspector's leading figure

- **Preconditions**: An Agent session has completed at least one turn that
  reported token usage. Settings → Conversation → Display is reachable.
- **Steps**:
  1. Confirm the composer toolbar context ring shows remaining capacity
     (ring nearly full, percentage ≈ remaining %, tooltip and aria-label
     use remaining vocabulary).
  2. Open Settings → Conversation → Display and switch the Context usage display
     segmented control from Remaining to Used.
  3. Return to the chat and inspect the context ring: the ring arc now
     fills by `usedRatio` (nearly empty at low occupancy), the percentage
     shows ≈ used %, the popover heading shows used tokens + percentage,
     and the tooltip/aria-label use used-capacity vocabulary.
  4. Confirm warning/critical ring colors still follow remaining capacity:
     at remaining > 25 % the ring stays neutral even when used % is high.
  5. Switch back to Remaining and confirm the original display returns.
- **Expected**: The display mode flips the ring arc, percentage, token
  count, heading, tooltip, and aria-label consistently. Color thresholds
  remain based on remaining capacity in both modes. The default for a
  fresh profile is Remaining.
- **Specs linked**: `04-ux/06-settings-ia.md`, `04-ux/08-component-spec.md`,
  ADR 0223, `08-meta/decisions-log.md` (D398)
- **Acceptance**: C (conversation & stream), Quality (preference)
- **Milestone**: M5
- **Status**: Unit-covered (`context-usage.test.mjs`,
  `settings-general.test.mjs`); full scenario Draft

#### E2E-251: Custom dropdowns float without changing page layout

- **Preconditions**: A desktop build with a configured provider, at least one
  project/session, and the default dark theme. The Settings, Plugins, Projects,
  chat composer, work panel, and sidebar surfaces are reachable.
- **Steps**: 1) Open each available custom dropdown/menu from Settings,
  Projects, Plugins, the sidebar, the composer, Plan approval, and Scope. 2) Repeat
  with the trigger near the bottom and right
  edges of the window, and while the surrounding page/card has scrollable
  content. 3) Scroll the owning pane and resize the window while a menu remains
  open. 4) Close each menu with Escape and by pressing outside it.
- **Expected**: Every custom dropdown is a body-level fixed layer that overlays
  content without increasing row/card height or changing page/sidebar/work-panel
  allocation. It stays within the viewport, flips or clamps when space is tight,
  follows its trigger after scroll/resize, is not clipped by settings cards or page
  overflow, and restores focus to its trigger on close. Native `<select>`
  popups are excluded because they are rendered by the operating system.
- **Specs linked**: `04-ux/07-ui-design-system.md`,
  `04-ux/09-interaction-patterns.md`
- **Acceptance**: Quality, responsive layout, Accessibility
- **Milestone**: M5+
- **Status**: Source-contract covered (`fixed-dropdown-surfaces.test.mjs`);
  desktop journey Draft (run only in a capable environment when this surface changes)

#### E2E-253: Project groups support manual drag and keyboard reordering

- **Preconditions**: The sidebar contains at least three project groups,
  including one pinned or archived project, and each project has a stable
  host workspace/path/directory.
- **Steps**:
  1. Press a project title, move it above or below another project group,
     inspect the insertion line, and release.
  2. Click a project title and confirm it still selects the project and
     toggles collapse without changing order.
  3. Focus the same title and press `ArrowUp` or `ArrowDown`; repeat once in
     each direction.
  4. Restart the app and inspect the project order.
  5. Open a session from a reordered project and confirm its host workspace,
     path, and directory are unchanged.
- **Expected**: The project groups render in the released order and the
  manual order survives restart. There is no reorder grip and no 400ms
  delay. An insertion line shows drop placement. The title exposes a
  keyboard-accessible reorder action, a short click does not reorder,
  `Escape` cancels an active drag, and the existing pinned / archived
  priority rules remain intact. Reordering never changes a project's host
  workspace, path, directory, or session sort.
- **Specs linked**: `04-ux/08-component-spec.md`,
  `04-ux/09-interaction-patterns.md`, `03-runtime/04-data-storage.md`,
  `08-meta/decisions-log.md` (D399, D402, D403)
- **Acceptance**: D (workspace), F (persistence), Quality
- **Milestone**: M5
- **Status**: Source-contract covered (`app-store-sidebar.test.mjs`,
  `sidebar-preferences.test.mjs`, `sidebar-project-reorder.test.mjs`);
  rendered desktop journey Draft

#### E2E-254: A skill loads on the first Agent turn

- **Preconditions**: At least one Skill is active for the current project, a
  provider is configured, and the session runs in Agent mode with another
  on-demand capability present (for example `BrowserPreview` or a plugin tool).
- **Steps**:
  1. Open a new Agent conversation and send a prompt that matches the active
     Skill's description.
  2. Inspect the first provider request and its tool list.
  3. Confirm the model calls `Skill` with the exact id without calling
     `ToolSearch` first, and that the returned document is the skill body.
  4. Select a Skill and send `/skill:<skill-id>` from the composer; inspect the
     following turn and confirm the original Skill id reaches the tool.
  4a. Add a second active Skill with `/` after the first token, submit the
      prompt, switch away from the session, and reopen it.
  5. Switch the session to Plan mode and inspect the tool list again.
  6. Disable or remove every Skill and start another Agent turn.
- **Expected**: Whenever the skill catalog is non-empty, `Skill` ships with the
  first request and never appears under `# On-demand tools`, so both a matching
  task and a `/skill:<skill-id>` invocation load the body without a discovery round
  trip. Both explicit Skills load in their selected order; after reopening,
  each remains a separate transcript chip beside the user's prompt text.
  An unprefixed name that matches a Skill remains an ordinary command or
  template, not a Skill alias.
  `ToolSearch` still exists for the other on-demand capabilities and
  never returns `Skill`. Plan mode omits the tool and the `# Skills` section,
  and an empty catalog registers no `Skill` tool at all.
- **Specs linked**: `03-runtime/02-agent-runtime.md` (§7.1),
  `03-runtime/03-tools-and-permissions.md` (§2.1),
  `04-ux/04-builtin-commands.md` (§8), `08-meta/decisions-log.md` (D404),
  ADR 0048, ADR 0219, ADR 0230
- **Acceptance**: C (conversation & stream), E (tools & permissions), Quality
- **Milestone**: M5
- **Status**: Unit-covered (`packages/agent-runtime/src/runtime.test.ts`);
  rendered desktop journey Draft
  (run only in a capable environment when this surface changes)

#### E2E-SKILL-builtin-activation: Manage bundled skills from Settings

- **Preconditions**: An isolated Desktop profile and an ordinary project
  workspace. Keep a separate active user or plugin Skill so the `Skill` tool
  remains available after imagegen is disabled.
- **Steps**:
  1. Open Settings > Agent > Skills and inspect the Built-in skills group.
     Confirm `pi-desktop/imagegen` and `pi-desktop/plugin-development` are
     listed and enabled by default.
  2. Turn off `pi-desktop/imagegen` and open a new session in the ordinary
     workspace. Inspect its skill catalog and Composer's `/` menu.
  3. Invoke the local `Skill` tool with the stale imagegen id.
  4. Turn imagegen back on and open another session. Restart the app and
     inspect the setting and a new session catalog again.
- **Expected**: The disabled imagegen skill is absent from the prompt catalog
  and the `skill:pi-desktop/imagegen` slash entry. A stale direct `Skill` load
  reports that the built-in skill is disabled. Re-enabling restores both
  entries on a new session, and the setting survives restart. The
  plugin-development row stays visible in Settings but its session entry
  remains limited to plugin workspaces. Associated agent tools remain
  independently available.
- **Specs linked**: `07-plugins/01-plugin-system.md` (§12.3),
  `03-runtime/01-ipc-protocol.md` (§12b), `03-runtime/02-agent-runtime.md`
  (§7.0.0), `04-ux/04-builtin-commands.md` (§8)
- **Acceptance**: C (conversation & stream), E (tools & permissions),
  F (persistence), Quality
- **Coverage**: `settings-inline-import-user-path.test.mjs` exercises the
  Settings switch in isolated Electron and asserts the persisted IPC request
  and visible off state. `image-generation.test.mjs`,
  `composer-mcp.test.mjs`, host-core user-skill/RPC tests cover catalog
  filtering, stale loads, persistence, and the activation wire contract. The
  restart and full new-session journey remain part of desktop acceptance.
- **Milestone**: M6+
- **Status**: Rendered desktop journey Draft

#### E2E-255: An ideographic comma opens the slash menu

- **Preconditions**: A Chinese IME is available, the composer draft is empty,
  and at least one slash entry exists (builtin alias, template, plugin command,
  or Skill).
- **Steps**:
  1. With the draft empty, compose `、`, inspect the pre-edit text, then commit.
  2. Continue typing a command name and accept the highlighted row.
  3. Type a draft that contains `、` between other characters.
  4. Send a draft whose first character was typed as `、` without accepting any
     row.
  5. Cancel a composition, then type `/` again. Also delete text after a
     dropped `compositionend` and confirm the slash menu still reopens.
- **Expected**: The committed `、` is rewritten to `/` in place, the ordinary
  slash menu opens with the same filtering and keyboard behavior as a typed
  `/`, and the caret stays after the substituted character. A `、` anywhere
  later in the draft stays untouched text, and the `@` file menu never reacts
  to the mark. Pre-edit `、` remains unchanged until commit; the result is `/`,
  never `/、`. Ordinary Chinese composition and punctuation in existing drafts
  remain unchanged. Cancelling leaves a blank draft, and replacing the draft
  releases the old composition's empty-draft origin.
- **Specs linked**: `04-ux/04-builtin-commands.md` (§9),
  `04-ux/08-component-spec.md` (§11), `08-meta/decisions-log.md` (D405),
  ADR 0024, ADR 0231
- **Acceptance**: C (conversation & stream), Localization, Quality
- **Milestone**: M2
- **Status**: Partially automated. Unit coverage:
  `packages/shared/src/composer-trigger.test.ts`,
  `apps/desktop/test/composer-ime.test.mjs`. Rendered Electron coverage:
  `node scripts/e2e-composer-ime-stack.mjs` mounts the production input, draft,
  and completion components, drives Chromium composition through CDP, and
  covers alias commit, ordinary Chinese text, cancellation, draft replacement,
  completion acceptance, and lost-end recovery. Sending and a physical OS IME
  candidate window remain manual checks.

#### E2E-256: Empty-home project name switches among sidebar projects

- **Preconditions**: At least two local projects are open in the sidebar; the
  visible chat is an empty project-bound session, and one open project has no
  session at all.
- **Steps**:
  1. Confirm the hero title underlines the current project name.
  2. Click the underlined name and inspect the menu.
  3. Search for a sidebar project, select a different one, and inspect the
     hero and sidebar.
  4. Reopen the menu and choose Open project, then pick a folder or cancel.
  5. Reopen the menu, choose Clone git project, paste a repository URL, then
     pick a parent folder or cancel.
  6. Open a temporary empty session and confirm the underline is absent.
  7. Click the session-less project in the sidebar and inspect the hero.
- **Expected**: The click opens a searchable, fixed switcher of the sidebar's
  open projects instead of the folder picker. Choosing another project
  activates it and lands on that project's empty home (reusing an empty
  session when one exists). Open project still uses the folder picker. Clone
  git project asks for a URL, then a folder, runs `git clone`, and opens the
  cloned project. Temporary heroes and the no-project home (no workspace) stay
  without the switcher, while a project the user opens without any session
  still names that project and keeps the switcher, because a task sent from
  that empty home joins the project. Escape and outside click dismiss the menu.
- **Specs linked**: `04-ux/01-ui-ia.md`, `04-ux/08-component-spec.md`
- **Acceptance**: Quality (navigation and accessibility)
- **Milestone**: M5
- **Status**: Unit-covered (`home-project-switcher.test.mjs`,
  `home-project-name.test.mjs`, `git-clone.test.mjs`,
  `sidebar-preferences.test.mjs`); full UI scenario Draft
  (run only in a capable environment when this surface changes)

#### E2E-CLONE-accepts-a-lan-remote-and-rejects-metadata

- **Preconditions**: The home project switcher Clone git project action is available.
- **Steps**: 1) Enter `https://192.168.1.5/org/repo.git`, `http://10.0.0.7/org/repo.git`, and `git@192.168.1.5:org/repo.git`. 2) Enter `https://169.254.169.254/org/repo.git` and `https://metadata.google.internal/org/repo.git`. 3) Enter `https://github.com/org/repo.git` and `git@github.com:org/repo.git`.
- **Expected**: A LAN or loopback remote the user typed is accepted and parses to a folder name, because the remote is the user's own address. Cloud metadata hosts stay rejected, as do `file:` and password-bearing URLs, before `git clone` runs. Public GitHub HTTPS and SSH remotes still parse.
- **Specs linked**: `04-ux/01-ui-ia.md`, ADR 0247, ADR 0304, D416
- **Acceptance**: Security, D (workspace)
- **Milestone**: M5
- **Status**: Unit-covered (`apps/desktop/test/git-clone.test.mjs`)


#### E2E-258: Create project dialog can start from a git repository

- **Preconditions**: The Create project dialog opens from the Projects heading
  (no existing project is required); `git` is installed.
- **Steps**:
  1. Open the Create project dialog and click Add folder twice quickly; confirm
     that only one native folder picker opens, then cancel it.
  2. Switch the source selector to Git repository.
  3. Paste `https://github.com/octocat/Hello-World.git` and confirm the project
     name field is seeded with `Hello-World`, then type a custom name.
  4. Choose a clone destination folder and confirm the destination row shows it.
  5. Confirm Create and inspect the workspace, sidebar, and project archive.
  6. Reopen the dialog, switch to Git repository, and paste a private or
     malformed remote.
- **Expected**: Repeated folder-picker clicks are ignored while the native
  picker is open. The dialog swaps the folder list for a repository URL field plus
  a clone destination row and keeps one project name field. Source options and
  fields are filled tiles without strokes; keyboard focus uses the shared
  accent-tinted ring. Create stays
  disabled until the URL parses and a folder is chosen; a name left empty falls
  back to the parsed repository name. Confirming runs
  `git clone` into the chosen folder with the renderer still owning project
  creation: the checkout becomes the primary root and the entered name names the
  group. Private, loopback, link-local, credential-bearing, and malformed
  remotes leave Create disabled (ADR 0247) and no folder is written.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` §9, `04-ux/08-component-spec.md`,
  ADR 0273, ADR 0233, ADR 0247
- **Acceptance**: Quality (project entry), D (workspace)
- **Milestone**: M5
- **Status**: Unit-covered (`apps/desktop/test/project-create-dialog.test.mjs`,
  `apps/desktop/test/git-clone.test.mjs`); full UI scenario Draft (run only in a
  capable environment when this surface changes)

#### E2E-261: Creating from a closed project folder reopens its group

- **Preconditions**: A durable project group exists for a local folder and is
  closed from the sidebar; its directory remains available.
- **Steps**: Open Create project, select only that folder, and click Create.
- **Expected**: The existing group reopens at its primary root, appears in the
  sidebar, and the dialog closes. Its existing name, roots, chats, instructions,
  and memory remain intact; no duplicate project group is created.
- **Specs linked**: `04-ux/08-component-spec.md`, ADR 0249.
- **Acceptance**: The production creation action resolves the host group before
  attempting creation and activates the existing primary path.
- **Milestone**: M5 (project organization maintenance).
- **Status**: Unit/source-contract covered (`apps/desktop/test/project-create-dialog.test.mjs`);
  full UI scenario remains Draft.
#### E2E-257: Plugin session import into an archived project restores its visibility

- **Preconditions**: A durable project has been archived in the renderer
  sidebar preferences and is hidden from the default sidebar. A test plugin
  can import a new session with an explicit host project id.
- **Steps**:
  1. Open Settings → Project archive and confirm the archived project remains
     available there while the default sidebar omits it.
-  2. Use the plugin's `session.importBatch` with the existing project's id
     and wait for the host session refresh event.
-  3. Confirm the project and its newly imported session appear in the default
     sidebar, then archive the project again.
-  4. Refresh sessions without importing anything, then use
     `session.importBatch` for a pathless session and for a duplicate or
     skipped session.
- **Expected**: A successful plugin import that adds a project-bound session
  clears the archived presentation state for that exact normalized project
  path and makes the project/session discoverable. Ordinary refreshes,
  pathless sessions, skipped imports, and repeated imports leave archive state
  unchanged; no host project row or transcript is deleted or recreated.
- **Specs linked**: `04-ux/06-settings-ia.md`, `04-ux/08-component-spec.md`,
  `03-runtime/04-data-storage.md`, ADR 0236, D407
- **Acceptance**: C (conversation & stream), F (persistence), G (plugins),
  Quality
- **Milestone**: M6+
- **Status**: Unit/source-contract covered (`sidebar-session-groups.test.mjs`,
  `project-import-archive.test.mjs`, `plugin-session-refresh.test.mjs`);
  rendered desktop journey Draft (run only in a capable environment when this
  surface changes)

#### E2E-IMPORT-codex-scan-filters-synthetic-titles

- **Preconditions**: A Codex archive whose sessions open with synthetic
  injections (`# Context from my IDE setup:`, `# In app browser:`,
  `# Browser comments:`, `# Files mentioned by the user:`,
  `# Diff comments:`, `# Selected text:`, `# Review findings:`,
  `# AGENTS.md`, `You are Codex`, `<environment>`) and at least one session
  whose stored timestamps are corrupt or out of range.
- **Steps**:
  1. Run `node --test test/importer-codex-scan.test.mjs` from `apps/desktop`.
  2. Confirm test coverage for synthetic title filtering and timestamp fallback.
  3. Confirm an archive above the file cap reports truncation metadata and
     includes only the newest 250 files.
- **Expected**: Candidate titles come from the first real user message —
  synthetic injections never surface as titles, while genuinely pasted
  markdown that starts with `#` (for example `# Role: …`) is kept. Sessions
  whose user messages are all synthetic do not appear as candidates. A
  corrupt or out-of-range stored timestamp falls back to the source file's
  mtime, never to the import moment. An archive above 250 session files returns
  the newest 250 by folder date plus truncated-count metadata; Settings no
  longer renders the retired session-import cap note.
- **Specs linked**: `03-runtime/01-ipc-protocol.md`,
  D320
- **Acceptance**: C (conversation & stream), F (persistence), Quality
- **Milestone**: M6+
- **Status**: Unit-covered (`importer-codex-scan.test.mjs`); no Settings UI journey

#### E2E-LAYOUT-three-column-width-priority

- **Preconditions**: A desktop session is open in a non-Settings route with a
  persisted preferred work-panel width, on a window wide enough for the three
  columns.
- **Steps**:
  1. Open the work panel and request the user's preferred width.
  2. Drag the inner divider toward MainChat's left edge, including during
     pointer preview, then release.
  3. Manually reopen the sidebar after the layout collapsed it. Repeat in an
     866px viewport, where the reopen narrows the panel below 244px, then
     collapse the sidebar again and drag the divider toward the panel.
  4. Close the work panel and confirm the sidebar returns; repeat after
     manually collapsing the sidebar.
  5. Repeat divider changes with `ArrowLeft`, `ArrowRight`, `Home`, and `End`.
  6. Navigate to the real Plugins and Scheduled routes with the
     work panel closed, then collapse the sidebar. In light and dark themes,
     measure both titlebar actions and compare their rest/hover styling with the
     shared work-panel toggle. Reopen the sidebar, collapse it again, and use
     New Task to return to an editable chat composer on each route.
- **Expected**: The ordinary `.main-titlebar` actions (without a preview chrome
  ancestor) render as centered 28px square targets, with the shared transparent
  rest surface, secondary ink, radius, and semantic hover wash/primary ink.
  Hover does not change geometry; sidebar and New Task actions remain usable.
  The native window width never changes. MainChat never measures
  below 450px — including mid-drag and while `sidebar-out` still occupies flex
  space. The effective panel maximum is the client width minus the 450px
  MainChat floor and the expanded sidebar width, with no fixed pixel cap. When that
  budget is exhausted the expanded sidebar collapses immediately, and the panel
  may keep growing afterwards. A manual reopen spends panel width first;
  MainChat is preserved where possible and otherwise lands on the 460px reopen
  target. That width is lent, not stored: the stored preferred width is
  unchanged, collapsing the sidebar again restores it, and divider drags still
  stop at 244px. Closing the panel restores only a sidebar the layout collapsed. The
  separator's ARIA minimum/maximum follow the same dynamic budget. The panel
  header's `+`, maximize, and viewport-fixed collapse toggle resolve to a single
  control gap (`--ds-work-panel-control-gap`) with no divider, inset, or margin
  of the action group's own, and all three are the shared chrome icon control:
  28px square on a transparent seat with only a semantic hover wash, so the
  header shows quiet icons rather than filled or raised squares. The collapse
  toggle's open state changes its glyph and ink only.
- **Overlay coverage measured in the running app**: on the Plugins route a plugin
  modal opens; the modal veil is the topmost hit at the work-panel toggle inside
  the titlebar band; the titlebar band is not the topmost hit there, so it does
  not paint over the modal veil; and closing the modal leaves the route clean.
  `pnpm test:e2e:layout` asserts those four hits as renderer DOM/CDP evidence,
  not as native hit-test proof.
- **Specs linked**: `04-ux/01-ui-ia.md`, `04-ux/07-ui-design-system.md` §10,
  `04-ux/08-component-spec.md` §1 and §5, `04-ux/09-interaction-patterns.md` §8,
  ADR 0238
- **Acceptance**: F (persistence), Quality
- **Milestone**: Post-M6 desktop shell maintenance
- **Status**: Automated (`scripts/e2e-three-column-layout.mjs` via
  `pnpm test:e2e:layout` — fixed-window width invariance, the 450px floor across
  a pointer drag, one non-wrapping composer toolbar at that floor with the
  model chip collapsed to its 32px icon, sidebar
  yield/restore, the 460px reopen target, the panel action group's shared
  control gap, preview mode, and ordinary Plugins/Scheduled titlebar
  Source contracts in `chrome-control-geometry.test.mjs` also cover the shared
  disabled state and panel controls' transparent seat; the panel surface still
  needs the eyes-on pass above. DOM/CDP checks establish renderer behavior, not
  native Windows/Linux hit testing; native platform checks remain separate.
  Unit coverage in
  `work-panel-resize.test.mjs`

#### E2E-LAYOUT-work-panel-maximize

- **Preconditions**: A desktop session is open with the work panel visible and
  the bundled Browser plugin active on a loaded page.
  1. Note the current panel width. If the sidebar is expanded, collapse it;
     then click the panel header's `+` action to open a real work-panel tab.
  2. Click the panel header's preview toggle.
  3. While preview remains active, collapse and reopen the sidebar. Compare the
     Browser/plugin placeholder's viewport-relative rectangle with the latest
     native bounds report after each layout settles.
  4. Inspect the header border box and tab alignment with the sidebar collapsed
     and expanded on macOS windowed/fullscreen and Windows/Linux. Confirm the
     overlay row and spacer declare neither drag nor no-drag and do not cover
     the panel controls with opaque paint.
  5. Using native pointer input, click the centers and edges of sidebar and
     New Task controls; confirm sidebar toggles and New Task exits preview to
     an editable composer. Reenter preview, operate tabs, close, add, restore,
     panel toggle and native controls, then drag empty header space and confirm
     the native window moves. Repeat in light/dark themes and both sidebar states.
- **Expected**: Entering preview mode stops rendering MainChat and hands its
  width to the panel, so the panel spans the client area minus the expanded
  sidebar (the whole client area when the sidebar is collapsed). The native
  window never changes size. The divider is inert while preview mode is on
  (`aria-disabled`). The native Browser/plugin surface matches the complete
  renderer placeholder rect after both sidebar transitions, including when
  only its absolute position changes; no stale page edge or uncovered strip
  remains beside it. Leaving preview mode restores the previous panel width and
  keeps whatever sidebar state the user chose last. The mode is transient: it is
  not persisted and ends when the panel closes. Preview mode keeps the shell's
  new-task, sidebar, and system-window actions reachable while MainChat is
  absent. The panel header is the sole drag owner in the preview pane. Its
  actual border box and first tab start at least 8px after the shell actions,
  including expanded-sidebar New Task, on every platform. Left inset is 8px
  except collapsed-sidebar windowed macOS (88px). The preview row renders the
  shared `--ds-window-lead-inset` (76px native cluster edge plus a 12px gap)
  as its own left padding; the check reads the resolved padding rather than
  restating the number. Fullscreen retains the action lane with an 8px inset.
  The right native-control border exclusion remains intact. Controls receive
  native clicks without moving the window; empty header space still drags it.
  Header-height background paint fills the excluded lane without hiding controls.
- **Specs linked**: `04-ux/01-ui-ia.md`, `04-ux/07-ui-design-system.md` §10,
  `04-ux/08-component-spec.md` §5, `04-ux/09-interaction-patterns.md` §8,
  ADR 0238 §6, issue #289
- **Acceptance**: F (persistence), Quality
- **Milestone**: Post-M6 desktop shell maintenance
- **Status**: Partially automated (`scripts/e2e-three-column-layout.mjs` —
  preview entry/exit, DOM action behavior, header border-box exclusion, row/spacer
  drag ownership, and all-platform/fullscreen CSS fixtures in both sidebar
  states). `plugin-view-bounds-sync.test.mjs` mounts the production
  `PluginViewTab` in Electron and covers a position-only layout commit with
  unchanged surface dimensions. DOM clicks and CDP input are not native hit-test
  proof; native pointer, window-drag, and visual checks remain required on each
  platform. Branch runs are exploratory and do not satisfy the integrated-main
  gate.

### E2E-WORK-PANEL-overflow-tab-drag-exclusion

- **Preconditions**: On Windows, open a desktop session and create enough work-panel
  tabs to overflow the horizontal tab strip.
- **Steps**: Scroll the strip toward both ends, switch to another conversation and
  back, reorder a tab with the keyboard, then close tabs until one and none remain.
  Query native `WM_NCHITTEST` over the adjacent sidebar and conversation titlebars,
  visible tabs, header actions, and spare header space.
- **Expected**: Offscreen tabs do not block native dragging outside the visible
  scroll viewport. Adjacent titlebars and unused header space return `HTCAPTION`;
  visible tabs and actions return `HTCLIENT`. Switching, reordering, and closing
  tabs preserve those hit regions.
- **Specs linked**: `04-ux/07-ui-design-system.md` §10
- **Acceptance**: Quality
- **Status**: Windows native regression covered by
  `scripts/e2e-work-panel-drag.mjs` (`pnpm test:e2e:work-panel-drag`). macOS/Linux
  native dragging remains unqualified.

### E2E-WORK-PANEL-active-tab-close-visibility

- **Preconditions**: Render the work panel with enough long-named tabs to
  overflow the horizontal strip.
- **Steps**: Activate an overflowing tab in the narrow layout and inspect its
  close-button rectangle and `elementFromPoint` hit target. Resize the layout
  while keeping the same tab active and repeat. Then partially scroll the strip
  to an inactive tab, hover it, and inspect its close button the same way.
- **Expected**: The active close button stays fully inside the strip after
  activation and resize. Hovering a partially visible inactive tab scrolls its
  close button into the viewport too. In all three states the button is visible
  and hit testable without requiring a middle click, keyboard shortcut, or
  widening the panel.
- **Specs linked**: `04-ux/07-ui-design-system.md` §10, issue #1762
- **Acceptance**: Quality
- **Milestone**: Post-M6 desktop shell maintenance
- **Status**: Electron geometry and hit-target coverage runs in
  `scripts/e2e-work-panel-tab-close.mjs`; `apps/desktop/test/work-panel.test.mjs`
  also covers the reveal contract. The Windows probe in
  `scripts/e2e-work-panel-drag.mjs` checks native hit testing separately.

#### E2E-LAYOUT-sidebar-project-group-fold

- **Preconditions**: Five retained sidebar project groups, seeded through the
  host: one holding five sessions with recent and old reply dates, one holding
  a single session, one holding none, and one holding ten pinned sessions.
  A fifth group has twelve unpinned sessions for the project history pager.
  `prefers-reduced-motion` is unset.
- **Steps**:
  1. Inspect the groups: body layering, row and per-row date counts, no time
     headings, the empty state, the tail each expanded group contributes to
     the next one, and the non-project lists' budgets.
  2. Collapse the multi-row group with a real pointer click on its directory row —
     scrolled into view and confirmed to hit that button — and read the group
     body's height, opacity, resolved `grid-template-rows`, and the distance to
     the next group on every frame for about half a second, while recording the
     fold's own `transitionrun` / `transitionend`.
  3. Expand it again and confirm the open geometry returns.
  4. Collapse and re-expand it within the same motion.
  5. Repeat the collapse with `prefers-reduced-motion: reduce` emulated.
  6. Scroll the pinned list to its last row.
- **Expected**: A project group is one grid row (`grid-template-rows: 1fr`) that
  animates to `0fr` over the 200ms normal duration — no `max-height` clamp, no
  opacity transition — so the fold is a single continuous height ramp with no
  plateau followed by a snap, and `opacity` stays 1 on every frame: the rows are
  clipped, never faded. The fold fires one transition and its own event reports
  the 200ms normal duration. The rows are clipped by an inner `min-height: 0`
  box, and the 1px row gap plus the group's 2px / 7px inset sit on the list inside
  that clip, so the inset travels with the rows. An expanded group's 7px inset
  plus the 1px scroller gap read as an 8px tail to the group below it; the last
  group in the list has no neighbour, so it is checked against its own inset and
  clip instead. A folded group's tail leaves with its rows, its section is its
  header plus the 1px scroller gap, and its rows stay mounted past the clipped
  edge while the group is `aria-hidden` and `inert`. A reversal mid-flight turns
  on the frame it reached and settles back on the open height without
  overshooting, and the empty group folds its empty state the same way. Under
  reduced motion both endpoints are kept and the travel is dropped. The pinned
  list holds eight rows inside `min(233px, 30vh)` and scrolls to its remaining
  rows, and the standalone list keeps its flex column and 146px budget. The group
  indent, ordering, and workspace state are unchanged. The five seeded project
  sessions remain in one flat list with no time headings and each has its own
  date label.
- **Specs linked**: `04-ux/01-ui-ia.md`, `04-ux/07-ui-design-system.md` §6.1 and
  §13, `04-ux/08-component-spec.md` §6.2, `08-meta/decisions-log.md`
  (2026-09-16, sidebar list rhythm and project-group fold)
- **Acceptance**: Quality
- **Milestone**: Post-M6 desktop shell maintenance
- **Status**: Automated (`scripts/e2e-three-column-layout.mjs` via
  `pnpm test:e2e:layout` — host-seeded groups and pins, a hit-tested CDP pointer
  click, per-frame height and opacity sampling across the real fold, the
  transition's own reported duration, mid-flight reversal, and reduced-motion
  emulation). Unit coverage in
  `apps/desktop/test/sidebar-collapse-animation.test.mjs` and
  `apps/desktop/test/sidebar-pinned-rendering.test.mjs`. The sampled values are
  renderer geometry, not an eyes-on visual pass.

#### E2E-LAYOUT-sidebar-row-states

- **Preconditions**: Host-seeded project, pinned and standalone conversations;
  the sidebar Session time preference enabled; a current workspace; built
  desktop with isolated data and profile directories.
- **Steps**: In dark and light themes, select a project conversation, hover its
  project title and an unselected conversation, then hover the selected row.
  Check that a project session date is visible at rest and replaced by its
  action in the same trailing slot on hover and focus; verify no divider appears
  before the date, dates through seven calendar days are relative, and older
  dates show month and day without a year. Exercise the window-blur handler,
  drop-target styling, project action hover and keyboard Tab/Shift+Tab focus. Fold and
  reopen its group. Select pinned and
  standalone conversations. Open Settings and return. Enable reduced motion and
  inspect both row transition durations. In a separate twelve-session project,
  load the remaining two sessions, fold and reopen the group, and verify only
  the initial ten sessions remain visible.
- **Expected**: Project and conversation hover backgrounds, radii and transitions
  match. The title button stays transparent. Only a conversation uses selected
  fill, which wins over hover; workspace identity remains a separate dot with
  no persistent header fill. Folding never promotes the project to selected.
  Pinned and standalone rows use the same selected surface. Keyboard focus
  retains an outline, action buttons retain local feedback, drop-target paint
  wins over hover, and blur releases hover without clearing selection. Settings
  replaces sidebar navigation, and returning restores conversation and workspace
  context without a second selected row. Project session rows show dates at rest
  in the same trailing slot used for session actions, with no divider. Hover and
  focus replace the date with the action in that slot. Dates through seven
  calendar days are relative and older dates show month and day without a year.
  Loading more sessions
  reveals all twelve; folding and reopening restores the initial ten and the
  two-session remainder control. Rendered component tests additionally cover no
  selected session, a pending destination and non-chat page state.
- **Specs linked**: `04-ux/01-ui-ia.md`, `04-ux/08-component-spec.md`,
  `04-ux/09-interaction-patterns.md` §9.1c
- **Acceptance**: C, D, Quality
- **Milestone**: Post-M6 desktop shell maintenance
- **Status**: Automated via `pnpm test:e2e:layout` and
  `scripts/e2e/sidebar-row-states.mjs`: real CDP pointer/keyboard input and
  computed-style assertions, plus the load-more / fold / reopen session-history
  flow. Window blur/focus events and the drop-target class are injected for those
  styling checks; this is not a native focus/drag test. Unit coverage:
  `sidebar-navigation.test.mjs`, `sidebar-pinned-rendering.test.mjs`, and
  `sidebar-project-sessions.test.mjs`.

#### E2E-LAYOUT-sidebar-settings

- **Preconditions**: Built desktop, isolated host/profile, visible chat sidebar.
- **Steps**:
  1. In dark/light palettes and darwin/win32/linux CSS branches, compare the
     home sidebar and Settings rail color, image layers, size and position.
     Inspect transparent ancestors and opaque settings content/titlebar.
  2. Before entering Settings, retain the current .chat-surface DOM node. While
     Settings is open, verify the chat shell is hidden, inert, and still
     contains that connected node. Return through Back to app and verify the
     same node is revealed while tracing sidebar insertion, width and
     animationstart events. Repeat quick round trips, a previously collapsed
     sidebar, and settings navigation interrupting an entrance.
  3. Explicitly reopen a collapsed sidebar, then repeat settings return with
     reduced motion. Repeat material comparisons with legacy and canonical
     theme color overrides and a sidebar background image.
- **Expected**: Both navigation surfaces share one material. Settings navigation
  and shell have no entrance animation; only a nested content-enter wrapper
  inside its opaque pane animates, and that motion is opacity-only so it cannot
  trap `position: fixed` overlays. Settings dialogs cover the full window, including the rail. On macOS
  all ancestors behind the rail are transparent, while right
  content and titlebar stay opaque. Returning to an expanded sidebar starts and
  stays at 275px without sidebar-in events; a collapsed sidebar stays absent.
  A real reopen still produces sidebar-in and a width ramp. Legacy theme color
  input remains supported for both rails, and a canonical override wins.
  Portaled layers owned by the hidden chat surface stay hidden while Settings is
  open; the shared app-level search, toast, and extension-prompt layers remain
  available.
- **Specs linked**: `04-ux/06-settings-ia.md`, `04-ux/07-ui-design-system.md`,
  `04-ux/08-component-spec.md` §1.4 and §1.7
- **Acceptance**: A, C, Quality
- **Milestone**: Post-M6 desktop shell maintenance
- **Status**: Automated via `pnpm test:e2e:layout` and
  `scripts/e2e/sidebar-settings.mjs`, with trusted CDP pointer/keyboard input,
  mutation-time and subsequent geometry samples, animation events and computed
  styles. CDP focus emulation keeps the isolated page painting while its native
  window is occluded; otherwise Chromium can freeze CSS motion and hover input.
  Platform branches and palettes are renderer emulation, not native
  Windows/Linux or OS material/theme validation. Optional
  `PI_DESKTOP_LAYOUT_ARTIFACT_DIR` captures renderer screenshots. State tests in
  `sidebar-settings-return.test.mjs` cover initial presentation, both interrupted
  phases, hidden-state changes and reversals. The CDP layout journey verifies
  that Settings preserves the same chat surface node across round trips.
  `settings-dialog-overlay.test.mjs`
  covers the full-window overlay contract. `pnpm test:e2e:theme-surfaces`
  verifies the opaque fallback and legacy theme override in real Chromium.

#### E2E-RUNTIME-renderer-crash-recovery

- **Preconditions**: Built desktop with an isolated profile, the main window
  ready on chat, and CDP enabled by the E2E harness.
- **Steps**: Set a renderer-only sentinel, trigger `Page.crash`, then reconnect
  to the existing page target if the renderer's CDP connection closes. Wait for
  the chat surface to return and inspect the isolated diagnostics log.
- **Expected**: The renderer document is recreated in the same app window, the
  chat surface becomes usable, and `renderer.process.gone` records the exit
  reason, exit code, and reload decision. The app does not open a second window.
- **Specs linked**: `03-runtime/07-process-model.md`,
  `03-runtime/09-logging-and-observability.md`
- **Acceptance**: A, H, Quality
- **Milestone**: Post-M6 desktop shell maintenance
- **Status**: Automated by `pnpm test:e2e:layout` with CDP `Page.crash`; the
  deterministic `renderer-recovery.test.mjs` covers clean exit, accepted close,
  app shutdown, stale windows, destroyed contents, and future Electron reasons.

#### E2E-AGENT-alt-enter-steers-active-turn: Enter follows up and Alt+Enter steers the active turn

Steer a long-running local foreground command. Verify cancellation, partial
output and the waiting status, and require confirmed settlement before the next
model request. Repeat with delayed settlement beyond the Stop grace period, an
unconfirmed shell failure, a remote tool, parallel and queued calls, a background
command, a delegate, and an explicit Stop. Accepted input is delivered once.

- **Preconditions**: A session with a configured model and a controllable
  streaming response/tool; an image-capable model for the attachment case.
- **Steps**:
  1. Start a prompt, then type a follow-up and press Enter. Confirm a FIFO row.
  2. During the same turn, type a correction and press Alt+Enter. Repeat with
     an image chip and with two corrections before the current request ends.
  3. Finish the current response/tool batch and inspect the next model input,
     transcript and durable turn id. Let the turn finish and observe follow-up.
  4. Repeat with Enter-to-send off, an open autocomplete menu, Shift+Enter,
     Alt+Shift+Enter and a Chinese IME candidate confirmation. Inspect the Send
     tooltip on macOS (`⌥+Enter`) and Windows/Linux (`Alt+Enter`).
  5. Race steering against turn completion, Stop, and a pending plan approval;
     switch sessions while a rejected request is pending.
  6. Change the next-turn model while running, then steer. Verify the active
     model and permission configuration remain unchanged.
  7. Steer while the parent waits for background delegates; leave them running
     and verify the parent receives the correction before their reports finish.
  8. Reload after completion and simulate a crash after a streaming reply was
     reserved by steering. Inspect row order, recovered text and owning turn.
  9. Reload the renderer after steering is accepted but before its reply starts,
     then press Stop and inspect the persisted transcript.
- **Expected**: Enter queues an ordinary follow-up. Alt+Enter creates a user
  row in the current turn with no queue row or new public `agent_start`.
  Started tools finish, then the next request contains the corrections/images.
  The ordinary FIFO starts only after durable turn finalization. IME and
  newline actions never submit; idle Alt+Enter sends normally. A stale/closed
  target keeps the draft in its own session and never fails the active turn.
  Accepted input is not replayed independently after Stop. Completed replies
  and accepted steering input remain in history after renderer reload and Stop.
  Terminal assistant snapshots replace provisional snapshots in place; crash
  recovery preserves the latest
  checkpoint and adjacent steering rows without duplicates.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` (§5.1a),
  `03-runtime/02-agent-runtime.md` (§4.0), `03-runtime/04-data-storage.md`,
  `04-ux/09-interaction-patterns.md` (§3.5), ADR active-turn-steering
- **Acceptance**: C (conversation & stream), E (tools & permissions), Quality
- **Milestone**: M5
- **Status**: Draft. Existing regression suites cover surrounding behavior;
  the rendered steering journey has not been run
  (do not run E2E locally unless explicitly requested).

#### E2E-SESSION-content-search-and-message-navigation

- **Scope**: Desktop global search, host search projections, and original
  conversation navigation (issue #270, ADR session-content-search).
- **Preconditions**: At least 65 visible sessions with a shared body keyword;
  one session has 125 matching user/assistant messages. Include a body-only
  keyword, a metadata-only match, an archived session, a soft-deleted session,
  one/two-character CJK terms, literal `%`, `_`, quotes, and a path. Include a
  long session with a match beyond the latest 100 messages and a message whose
  matching text follows 100,000 characters. Include an actively streaming
  conversation and a fixture with repeated physical message lines.
  Include a nested assistant answer whose Task is outside its 60-line page, a
  later terminal copy of that Task, collapsed activity, hidden Markdown link
  destinations, emphasis delimiters, and file-chip directories.
  Add short matching sentences surrounded by unrelated Chinese/English
  sentences, multiple short lines before a match, a quoted sentence, a file
  path containing periods, and a matching sentence longer than 180 characters.
- **Steps**: Search body-only user and assistant terms, then rename the owning
  session and repeat. Check aggregated counts and sender/time/snippet labels.
  Load every result page. Open a session heading and each of its two snippets;
  verify that each snippet closes search, opens the same original conversation,
  and scrolls to its own matching text. The heading selects its first snippet.
  Check normal Markdown, message actions, and composer. Repeat with two assistant
  fragments in one turn, an old target outside the latest page, and a match after
  100,000 characters. Verify a visible highlight and that layout settling does
  not pull the target away. Read upward and load later messages without gaps.
  Use the latest-message control to resume the live transcript. Scroll within
  the active conversation, reopen search, and select its own result; locate the
  target inside the same pane. Edit, retry, branch, and delete an old message. Reopen search and check the retained query.
  Repeat with CJK and symbols. Verify that a contiguous Chinese phrase matches,
  while inserting a space between its words only matches text with that space.
  Change queries rapidly while delayed first-page
  and later-page requests resolve out of order. Close/reopen during loading.
  Retry after a transient search error.
  Open the nested answer and verify that the owning Task is revealed and its
  existing dock scrolls to the answer. Search the hidden URL, delimiters, and
  chip directory after a long prefix; verify the corresponding visible element
  is highlighted. Interrupt layout correction with a wheel/key gesture.
  Page ordinary history while output streams, then interrupt a pending page with
  search, another result, a new turn, and return to latest. Change a revision
  without changing its message ID. Edit/retry a visible but display-capped
  message and verify that the canonical full text becomes the action input.
  Search a running conversation and return to its live stream, then switch
  conversations. Use arrows, Enter, Escape, Tab, and CJK IME confirmation, and
  exercise page/settings/plugin-command results.
  Search a word in the middle sentence and verify that the
  result shows that sentence with a background highlight on the literal match.
  Repeat after multiple line breaks and at narrow window widths in light and
  dark themes. Long-sentence truncation must keep the whole matching query
  visible; short previews must omit unrelated adjacent sentences.
- **Expected**: Every matching visible session is reachable; counts cover all
  125 messages, with no duplicate session rows. Archived visibility follows
  the existing explicit-search rule and deleted sessions never appear. Each
  snippet opens its owning conversation directly without an intermediate
  context reader, plain-text replacement, or Back to conversation action.
  Each selected snippet lands at its exact message and matching rendered text,
  including old history and individual assistant fragments. Reading-window
  loads do not overwrite live output. New turns return to the live transcript.
  Actions on historical messages work normally and do not leave obsolete rows.
  Nested answers land in the original Task dock; source-only matches land on
  their rendered owner. Ordinary paging retains current streamed content.
  Interrupted reads cannot reopen a dock or restore stale/loading views, and
  same-ID edits replace obsolete displayed content. Message actions never use
  clipped text as input.
  Rapidly selecting another result rejects stale target/page completions.
  Deleting a result before selection reports failure instead of landing at the tail.
  Later query ownership wins over stale results/errors. IME Enter does not
  execute an action. Search transport failures are explicit.
  Existing commands, pages, settings, and keyboard navigation still work.
- **Status**: Draft; Rust and renderer unit regressions cover the data/query
  boundaries. Full rendered E2E requires an explicitly authorized run.

### MCP market scenarios (`pnpm test:e2e:mcp-market`, headless protocol-level)

| ID | Scenario | Verification |
|---|---|---|
| E2E-MCP-MARKET-NET-BOUNDARY | The URL guard rejects credentials, cloud metadata, unspecified, multicast and reserved forms (trailing dot included) even when the user typed them, and rejects loopback, private, special-use IPv4, v4-mapped, ULA, site-local and link-local forms for *third-party* hops — a redirect target or a catalog body; the same forms typed by the user into a source field are accepted, with plain `http` behind `networkPolicy.allowInsecureUserEndpoints`; direct/unknown routes pin the checked address by default, while a fully proxied route uses the session transport and an explicit `allowFakeIp` opt-in can cover transparent-router fake-IP sources without allowing real private answers | deterministic guard assertions; source-contract coverage for DNS pin, proxy route selection, explicit fake-IP scope and bounded responses |
| E2E-MCP-MARKET-SEMANTICS | Registry records map to install templates preserving package versions, named/positional runtime/package arguments and required/optional env variables; a remote header variable is recognized in both the registry's `{name}` and the catalog's `${NAME}` spelling, prompts for declared editable values, preserves unbound brace literals, and resolves header-local defaults, fixed values, and optional flags without merging same-named inputs across headers (ADR registry-header-variable-spelling) | deterministic mapping assertions |
| E2E-MCP-MARKET-INSTALL | Builtin catalog entry resolves through `resolveCatalogEntry` and installs via the host `mcp.upsert` RPC; record lands in `~/.agents/servers/` | real host binary, isolated temp HOME |
| E2E-MCP-MARKET-explicit-project-owner | Select Project on the MCP page, open Market, and install a builtin entry; the upsert carries the selected project and the saved row appears in that project. All and Global retain global installation, and an entry in another level does not block installation | real React page and market in isolated Electron; IPC boundary fixture (`apps/desktop/test/mcp-market-owner-user-path.test.mjs`) |
| E2E-MCP-MARKET-HEADER-SCOPE | Registry header-local `{token}` resolves only in its header; same-named URL path/query tokens remain literal through mapping, resolution, host upsert/list and persistence. URL templates retain only legacy `${NAME}` substitution. When `headerBindings` exists (even empty or partial), unbound tokens in every header stay literal and never consume another header's input or default | shared regressions plus real host binary with isolated temporary storage; remote entry disabled, no network call |
| E2E-MCP-MARKET-partial-header-bindings-stay-literal | Resolve a catalog with only Authorization bound and another header using the same `{token}` / `${token}`; an undeclared `${UNBOUND}` in a third header also remains literal through host upsert/list and disk persistence | real host binary, disabled remote entry, synthetic input and isolated temporary storage; no network call |
| E2E-MARKET-CATALOG-RETRY | In Skill Market and MCP Market, a failed query and then a partial source failure expose Retry; clicking it announces loading, refreshes the same query, and clears the failure when the source recovers | real React components in Electron with deterministic mocked market API responses; no live network |


#### E2E-MCP-MARKET-explicit-project-owner: Market installation respects an explicit Project filter

- **Preconditions**: MCP settings with a selected project; isolated Electron
  profile and deterministic IPC responses, without live market or MCP calls.
- **Steps**: Select Project, open Market, install a builtin entry, and reopen
  Market. Repeat with All and Global, with no project under All, and with the
  same entry already present in the other level. Select Project with no
  project, then try an install directly through the panel's public interface.
- **Expected**: Project sends `level: "project"` and the selected `projectPath`;
  All and Global send `level: "global"` without a project owner. The installed
  row appears on return, and reopening Market marks it installed only for the
  target level. A record in another level never blocks installation. With no
  project selected, the Project market action is disabled and the panel guard
  reports the missing selection without writing.
- **Specs linked**: `04-ux/06-settings-ia.md`, ADR 0112.
- **Acceptance**: Quality.
- **Milestone**: M6+.
- **Status**: Automated (`node --test apps/desktop/test/mcp-market-owner-user-path.test.mjs`).

#### E2E-SKILL-MARKET-NET-BOUNDARY: A user-supplied source reaches the LAN, third-party content does not

- **Preconditions**: Shared public-network helpers and the main-process
  public-HTTPS client with injectable fetch/DNS/route.
- **Steps**: 1) Classify trailing-dot localhost, IPv4 loopback, IPv4-mapped
  IPv6, ULA, link-local, RFC1918, and `http://` URLs twice: once as a source URL
  the user typed, once as a document URL that arrived inside a catalog. 2)
  Resolve a public hostname to a private A record. 3) Follow a 302 whose Location
  is `https://127.0.0.1/`. 4) Report a proxied route and a TUN fake-IP answer
  (`198.18.0.1`), the same answer on a `DIRECT` route, on an unreadable route,
  and on a route list that offers `DIRECT`. 5) Let a first hop be proxied and
  its redirect target direct. 6) On a direct route, return both a public address
  and a ULA address, then return a TUN `benchmark` fake-IP with a ULA address
  under the existing fake-IP opt-in. 7) Return a ULA address without any
  acceptable companion address.
- **Expected**: A source URL the user typed may be a loopback or LAN catalog —
  `https` always, `http` only under
  `networkPolicy.allowInsecureUserEndpoints` — while the same address as a
  *document* URL inside a catalog, or as a redirect target, is rejected. Cloud
  metadata, `unspecified`, multicast, and reserved addresses are rejected on
  every input. A user-supplied source resolving to a private address is fetched;
  a third-party hop resolving only to a private address throws a policy error
  without fetching that target. A local resolver with no answer is retried and
  reported as `NETWORK_RESOLVE_FAILED` (`kind` `unresolved`), not as an
  address-check refusal. A direct request with an acceptable address beside a
  rejected ULA pins the acceptable address; a ULA-only answer stays refused. An
  address in a proxy's fake-IP range (`198.18.0.0/15`, Clash's default) is
  accepted on a proxied route. On a direct route it is refused unless the
  existing fake-IP opt-in allows Main to pin that benchmark address; unreadable
  routes remain strict. A refusal for a benchmark address is reported as `kind`
  `fake-ip`, `addressKind` `benchmark`, and `reason` `non-public-address`;
  refusals for real private targets remain `kind` `policy`, `addressKind`
  `private`. Every refusal carries the host, reason, address class, and route so
  the install sheet and market list can distinguish policy blocks from network
  failures. Every redirect hop is judged on its own route (ADR 0272, ADR 0321).
- **Specs linked**: `05-security/01-security.md`, ADR 0243, ADR 0272, ADR 0321,
  `03-runtime/01-ipc-protocol.md` §12b
- **Acceptance**: Security, Quality
- **Milestone**: M6+
- **Status**: Automated (`pnpm test:e2e:skill-market`,
  `apps/desktop/test/public-https-fetch.test.mjs`,
  `apps/desktop/test/public-https-fetch-route.test.mjs`,
  `apps/desktop/test/skill-market-scan.test.mjs`,
  `apps/desktop/test/skill-market-failure.test.mjs`,
  `apps/desktop/test/skill-market-policy-refusal.test.mjs`,
  `packages/shared/src/public-network.test.ts`)

#### E2E-MARKET-CATALOG-RETRY: Retry a failed or partially available market query

- **Preconditions**: Rendered Skill Market and MCP Market panels with the
  market APIs stubbed at the IPC boundary. Each API returns a total failure,
  then a result with one failed source, then a complete result. A second run
  loads a result first, fails afterwards, and recovers on retry; a third run
  changes the query after a success so the failure carries a snapshot taken
  for another query; a fourth run fails with nothing loaded.
- **Steps**: Open each market; click Retry after the total failure; confirm the
  loading announcement and recovered entry; click Retry again after the
  partial failure. Then load a list, fail the next query, retry, and change
  the query before failing once more.
- **Expected**: Both markets repeat the current search, show loading while the
  request runs, retain a Retry action for partial failures, and clear the failed
  source after recovery. After a successful load, a later failure keeps that
  list on screen, says when it was taken, retains each remote source badge,
  and still offers Retry; the retained list disappears once a retry succeeds,
  and it never stands in for a different query or for a failure with nothing
  loaded. The test makes no live network request and does not change the
  main-process network policy.
- **Specs linked**: `04-ux/06-settings-ia.md`, ADR 0177, ADR 0272
- **Acceptance**: Quality
- **Milestone**: M6+
- **Status**: Automated (`pnpm test:e2e:market-retry`,
  `apps/desktop/test/skill-market-panel.test.mjs`,
  `apps/desktop/test/mcp-market-panel.test.mjs`)

#### E2E-SKILL-MARKET-EXPANSION: Adjacent markdown resources inline before install

- **Preconditions**: A jsDelivr skill document whose directory lists FORMS.md
  and REFERENCE.md (mocked listing in unit tests; expansion helper in E2E).
- **Steps**: Split SKILL.md, expand listed sibling markdown files as fenced
  appendices, and confirm a document over 128 KiB is flagged too large.
- **Expected**: The preview/install body contains the skill text plus
  `# Attached resource:` appendices. Non-markdown siblings are omitted. A
  body that would exceed host `MAX_SKILL_BYTES` is not written.
- **Specs linked**: `04-ux/06-settings-ia.md`, ADR 0243
- **Acceptance**: Quality
- **Milestone**: M6+
- **Status**: Automated (`pnpm test:e2e:skill-market`,
  `apps/desktop/test/skill-market-scan.test.mjs`)

#### E2E-SKILL-MARKET-INSTALL: Market install writes a user skill through skills.create

- **Preconditions**: Host binary; isolated HOME. A builtin catalog entry with
  an assembled markdown body.
- **Steps**: Handshake; `skills.create` with the assembled name/description/body;
  read `~/.agents/skills/pdf.md`; `skills.list`.
- **Expected**: The file has rendered frontmatter and the instruction body.
  The skill appears in `skills.list`. No path besides `skills.create` is used.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` §12b, ADR 0243
- **Acceptance**: Quality
- **Milestone**: M6+
- **Status**: Automated (`pnpm test:e2e:skill-market`)

#### E2E-SKILL-MARKET-ID-ALIGN: Scanned skill ids match host valid_capability_id

- **Preconditions**: Shared `sanitizeSkillCatalogId`.
- **Steps**: Sanitize `Frontend_Design`, `1-pdf`, and an empty remainder.
- **Expected**: Host-legal slugs (`frontend-design`, `1-pdf`, `skill-7`) so
  `installedIds` matches the created record.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` §12b
- **Acceptance**: Quality
- **Milestone**: M6+
- **Status**: Automated (`pnpm test:e2e:skill-market`)

#### E2E-TRAY-bounded-session-navigation

- **Scope**: Native tray groups, hidden/recreated window activation, and unread
  semantics (issue #293, ADR tray-session-shortcuts).
- **Preconditions**: At least four running, four unread, and four pinned
  sessions across two projects; include overlaps, read-latest/older-unread
  notifications, archived/deleted sessions, an archived project, empty titles,
  multiline titles, long CJK/emoji titles, and literal ampersands. Also cover
  a single populated group of seven and one of more than nine, with the other
  two groups empty, to exercise reclaimed share. Use an
  isolated profile. Repeat native activation on macOS and Windows/Linux.
- **Steps**: Hide the main window and open the tray menu. Inspect group order,
  counts, duplicates, titles, and unchanged unread records. Choose the third
  row from another project, then View more from Settings with a collapsed
  sidebar and a retained search query. Finish/abort tasks while hidden;
  read a result, pin/unpin, rename, archive/restore, and delete a session.
  Close the macOS window while a task runs and let it finish, then activate
  its tray row while the new renderer bootstraps a pending plan. Delay a Host
  read while a newer preference update, delete, or Host restart arrives.
  Retry a transient read failure by hovering/right-clicking the tray on Windows/Linux; macOS retries from the next session or inbox event instead of mouse-enter.
  Repeat after clearing all group memberships and changing shipped locales.
  Choose Quit then Cancel, then Quit and confirm.
- **Expected**: Running → Unread → Pinned; at most nine rows in total. Each
  non-empty group keeps up to three rows and overflowing groups reclaim the
  share smaller groups leave unused, in priority order: seven running sessions
  with no unread or pinned show all seven, and a single group holding more than
  nine shows nine behind View more. Deduplicate before limits, so hidden
  Running overflow cannot
  appear as Unread/Pinned. Empty groups and stale shortcuts disappear. Unread
  uses the latest terminal result per session, newest first. Titles remain
  one line within the 32-column cap, half as many characters for CJK/emoji,
  including literal ampersands. Opening the macOS
  menu leaves the window hidden and records unread. A row opens exactly that
  session/project, acknowledges it normally, and wins over startup navigation.
  View more returns from Settings, closes search, and expands session navigation. Hidden/closed windows receive fresh groups;
  stale reads, archived/deleted targets, and a failed backend cannot restore
  stale shortcuts. Open, localization, quit cancellation, and shutdown work.
- **Specs linked**: `03-runtime/01-ipc-protocol.md` §13b,
  `03-runtime/07-process-model.md`, `04-ux/08-component-spec.md`,
  `04-ux/09-interaction-patterns.md`, ADR tray-session-shortcuts.
- **Acceptance**: A (app/window lifecycle), C (conversation navigation),
  F (unread persistence), Quality (bounded localized menu).
- **Milestone**: Post-M6 desktop shell maintenance.
- **Status**: Draft; native E2E requires an explicitly authorized run.

#### E2E-PLUGIN-turn-ended-once-per-host-turn: A plugin observes exactly one turn-end event per host turn

- **Preconditions**: A plugin with a tool and an event listener for
  `session:turnEnded` is loaded and enabled; its panel records each received
  payload and the `turnId` its tool receives through the tool context.
- **Steps**:
  1. Submit a prompt whose reply issues three tool calls in one turn.
  2. Record the number of `session:turnEnded` payloads the plugin receives and
     compare the `turnId` with the one the plugin's tool saw.
  3. Submit another prompt, then stop it with `Cmd/Ctrl + .`.
  4. Submit a third prompt that fails, so the turn ends with an error.
  5. Inspect the Plugins settings page for a new permission review.
- **Expected**: Step 2 receives exactly one `session:turnEnded` whose `reason`
  is `completed`, and its `turnId` equals the tool context's `turnId`. Step 3
  receives exactly one event with `reason` `aborted` — never a second
  `completed` after the abort. Step 4 receives exactly one event with `reason`
  `error`. A turn that never started emits nothing, and no plugin receives two
  events for one turn even when the terminal event arrives more than once.
  Step 5 shows no new permission review, and subscribing to an unknown event
  name does not surface an error.
- **Specs linked**: `07-plugins/03-plugin-api.md`, `07-plugins/13-plugin-permissions-matrix.md`,
  ADR 0252
- **Acceptance**: Quality (protocol and plugin contract)
- **Milestone**: M6+
- **Status**: Module-covered (`apps/desktop/test/session-turn-ended.test.mjs`,
  `apps/desktop/test/queued-turn-finalization.test.mjs`); desktop journey Draft
  (run only in a capable environment when this surface changes)

### E2E-SESSION-native-pi-continue-appends-original-jsonl

- **Preconditions:** A synthetic Pi v3 session contains branches, compaction
  metadata (including `retainedTail`), model/thinking changes, custom and
  context-bearing custom-message entries, and a valid project cwd. A faux local
  model/auth binding is configured in the fixture Pi agent directory; Desktop
  provider secrets are absent. A fixture extension restores custom state in
  `session_start`, contributes a skill through `resources_discover`, and uses
  the 0.87 `turn_end` boundary to propose a `context_edit` for the settled
  assistant entry.
- **Steps:** Start PI-Desktop with fixture-only agent/session directories;
  refresh sessions; open the native row beside a Desktop row; submit one text
  prompt; stop or let the faux response settle; send the same text again with
  a retryable response before success; reselect/refresh repeatedly; reopen through
  a fresh Pi `SessionManager`; invoke native compact and queue push/list.
- **Expected:** The original fixture JSONL receives native SDK entries whose
  parent starts at the previous current leaf; all prior bytes/unknown entries
  remain unchanged; the new leaf is visible after refresh; no Desktop SQLite
  session or Desktop transcript copy is created; the Desktop-owned row still
  follows its existing runtime and storage path. Native requests expose zero
  built-in or extension model tools; startup and discovered skill are effective.
  Exactly two durable SDK-ID user rows remain, including after abort; smart-stop
  never rewrites native history. Retries/compaction remain running and stoppable
  until one terminal completion; the owned idle lease accepts the second send.
  The `context_edit` is appended under the same lease, affects the next model
  request, and leaves the original assistant row visible in native detail.
  Compact and queue push/list reject before host access. Opaque host-turn queue
  remove/prioritize remain Desktop-only because native paths create no entries.
- **Specs:** runtime §12; storage §12; security §12; ADR 0254.
- **Status:** Documented; run after integration into main.

### E2E-SESSION-native-pi-external-change-fails-closed

- **Preconditions:** A writable synthetic native v3 fixture is listed.
- **Steps:** Acquire Desktop continuation ownership, then simulate a foreign
  append/replacement before the extension's `appendContextEdit`; also attempt a
  second Desktop lease and stale leases whose owners are live, remote,
  malformed, or uncertain.
  Refresh list/detail with a dead same-host owner and unchanged or complete
  append-only extended bytes, then prompt through normal UI capabilities.
- **Expected:** The second writer is refused; external divergence tears down
  continuation with a visible read-only/error reason; no requested entry is
  appended and no bytes are truncated or rewritten; a lease releases on normal
  dispose and is reclaimed after crash only with a dead same-host owner and an
  unchanged target or same-file prefix-preserving complete parent-chain extension.
  The context-edit append is refused by the same byte and parent check as other
  SDK writes. Uncooperative Pi clients can still race the OS append; no
  shared-lock guarantee is claimed.
- **Specs:** runtime §12; storage §12; security §12; ADR 0254.
- **Status:** Documented; run after integration into main.

### E2E-SESSION-native-pi-incompatible-session-is-read-only

- **Preconditions:** Fixtures cover missing cwd, missing trailing newline,
  v1/v2 header, unavailable saved provider/auth, and untrusted project resources.
- **Steps:** Refresh and open each fixture.
- **Expected:** Each remains browseable with a specific reason, the composer is
  disabled, no migration/repair/fallback occurs, and source bytes and mtimes are
  unchanged.
- **Specs:** IPC native routing; runtime §12; storage §12; security §12.
- **Status:** Documented; run after integration into main.

### E2E-SESSION-native-pi-duplicate-id-collapses

- **Preconditions:** An isolated Pi agent directory contains a valid native v3
  session and a copied JSONL file under a nested directory with the same
  `header.id`.
- **Steps:** Start PI-Desktop with the fixture-only agent directory, refresh the
  session list, open the listed native session, and search its transcript.
- **Expected:** The list contains one row for that native id. Detail and search
  resolve through the selected file; duplicate files remain byte-identical and
  are not rewritten or deleted.
- **Specs:** runtime §12; storage §12; ADR 0254.
- **Status:** Source-regression covered; full Desktop journey Draft.

### E2E-SESSION-native-pi-project-session-dir

- **Preconditions:** A local project has `.pi/settings.json` with
  `"sessionDir": ".pi/sessions"` and a valid native v3 JSONL in that directory.
  The default Pi agent session root also contains a valid session. A nested
  JSONL and a symlink that leaves `.pi/sessions` are present. A second fixture
  sets an absolute global `sessionDir` and no project path. A third sets a
  relative global `sessionDir`.
- **Steps:** Refresh the session list, open the project-local session, and fork
  it. Repeat list and open for the absolute global directory. Refresh the
  relative global fixture once with no known project and once after that
  project is known, including a remote project id in the known set.
- **Expected:** The project-local session and the default-root session both
  appear. The nested file and the escaping symlink do not. Opening the
  project-local session returns its transcript. Fork publishes one new JSONL
  beside the parent and does not rewrite the parent. The absolute global
  directory is listed without a project path. The relative global directory is
  listed only for the known local project. Remote project ids are ignored.
  Untrusted project resources stay browseable and read-only.
- **Specs:** runtime §12; storage §12; security §12; ADR 0254.
- **Status:** Source-regression covered by
  `packages/agent-runtime/src/native-pi-session.test.ts` (the project fixture
  asserts `readOnlyReason: project-untrusted` and `canPrompt: false`) and
  `apps/desktop/test/native-pi-sessions.test.mjs`; full Desktop journey Draft.

### E2E-SUBAGENT-ordered-model-fallback-preserves-work

- **Preconditions**: A configured primary and at least three alternatives use
  deterministic local transports; one definition declares the ordered
  alternatives. A second definition has no alternatives, and none are opted
  in for Task overrides.
- **Steps**: Add two alternatives in Settings, reorder them, save and reopen;
  change another field without changing the list. Run the child, complete one
  tool call, then fail the primary request. Fail the first alternative and
  complete the second. Run a matrix with zero, one, two, and three unavailable
  models before a successful model, leaving an unused model after success.
  Repeat with all four models unavailable, mixed 401/403/404 failures,
  exhausted transient/429 retries on two consecutive models,
  unavailable/duplicate pins, an explicit authorized Task primary,
  and Stop during recovery. Remove all alternatives, save, and reopen.
- **Expected**: List order and clear/preserve semantics round-trip. Provider
  retry budgets precede fallback; each distinct configured binding is used
  once. The original task and completed tool results reach the next model;
  completed tools are not replayed. Adapter/auth/headers and thinking match
  each selected model. Failure diagnostics and total usage survive settlement;
  effective model/thinking survive reload. Stop cancels the chain; host/tool
  errors do not switch models. Exhaustion fails explicitly. Alternatives never
  authorize a Task override for the second definition. No alternatives retains
  the existing single-model behavior.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5f,
  `03-runtime/13-model-catalog-and-selection.md` §Subagent editor,
  ADR subagent-model-fallback.
- **Acceptance criterion**: C — Conversation & stream; Quality (compatibility
  and permission isolation).
- **Milestone**: M6+.
- **Status**: Automated registry and runtime coverage through shared/runtime
  regression tests and `test:e2e:subagents` / `test:e2e:subagent-models`. The
  sidecar suite checks the zero-to-three failure matrix and four-model
  exhaustion against actual HTTP request order, live/settled Task metadata,
  ordered failure diagnostics, and the successful child report. Completed-tool
  preservation and independent retry budgets use real-transport runtime tests.
  The configuration-editor journey passed under WSL; task-transcript reload
  acceptance remains outstanding. Required post-integration suites: `test:e2e`,
  `test:e2e:subagents`, `test:e2e:subagent-models`.

#### E2E-PLUGIN-provider-catalog-add-service: Select a plugin provider from its custom Add Service category

- **Preconditions**: A loaded plugin has `provider.register` and declares two
  API-key providers with a `baseUrl`, a localized `category`, and a short
  localized `description`; one provider has static models and the other has an
  empty model list. Both Host-owned rows have no saved key. Include another row
  whose key is already configured and a provider contribution from a plugin
  without `provider.register`.
- **Steps**: 1) Open Settings → Models → Add provider. 2) Find the declared
  category and hover or keyboard-focus a provider tile. 3) Select the provider,
  enter a fixture key, and save. 4) Reopen Add provider and search the remaining
  entry by category, provider name, introduction, endpoint, and model ID. 5)
  Change the app language between English and Simplified Chinese and reopen the
  chooser. 6) Load a manifest with malformed localized category/description
  fields, an empty category/description, and values over their length limits.
- **Expected**: Step 1 groups unconfigured API-key contributions under the
  category for the active locale. Tiles show only provider names; hover/focus
  shows the one-sentence introduction, and the tile's accessible description
  remains available to assistive technology. The chooser has no provider-count
  cap and omits configured providers, OAuth / no-auth rows, and contributions
  whose plugin lacks the grant. Step 2 opens the existing Host-owned provider
  key form; the endpoint and plugin remain visible there for a destination
  check. Step 3 saves through the Host provider secret API; only an empty-model
  declaration triggers Host model discovery after save. Discovered models are
  cached for that plugin-owned row. The key is never returned to plugin code or
  included in catalog metadata. The provider row and key remain in the service
  list, and that entry disappears from Add Service while the other unconfigured
  entry remains. Step 4 finds the remaining tile by the listed search fields
  and never offers the saved row. Step 5 switches the declared localized text
  correctly. Step 6 rejects malformed metadata without partially loading the
  plugin. Existing plugin row ids, ownership, reconciliation, and key retention
  remain unchanged.
- **Specs linked**: `07-plugins/02-plugin-manifest-schema.md` §5.4,
  `07-plugins/03-plugin-api.md`, `07-plugins/04-plugin-security.md`,
  `07-plugins/13-plugin-permissions-matrix.md`, `04-ux/06-settings-ia.md`,
  `04-ux/08-component-spec.md`, ADR 0322; D650.
- **Acceptance**: B (model config), E (tools & permissions), F (persistence),
  G (plugins), Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: The representative Add Service → category → key save path runs
  in `apps/desktop/test/plugin-provider-catalog-user-path.test.mjs` under an
  isolated Electron renderer with a fake Host IPC boundary. Catalog filtering,
  locale resolution, description tooltip, category validation, filtering, and
  search have focused tests. The user-path test also confirms that model
  discovery follows key save and saving one entry hides only that configured
  row while another entry remains available.

#### E2E-PLUGIN-declared-provider-appears-in-the-native-provider-list: Plugin providers use Host-owned rows, permissions, and OAuth sign-in

- **Preconditions**: An installed local plugin declares one API-key provider
  with `provider.register` and one OAuth provider with both `provider.register`
  and `provider.oauth`. Both use a fixture `baseUrl` and one model; the API-key
  model has `thinkingLevels: ["off", "low", "high"]` and
  `defaultThinkingLevel: "high"`. Its `onProviderOAuth` callback uses only a
  local OAuth fixture and host-rendered `pi.providers.oauth` interactions.
- **Steps**: 1) Enable the plugin and open Settings → Providers. 2) Inspect
  the model binding and Composer thinking selector, then select the row as the
  session model and run a turn. 3) Change the session thinking level and run a
  second turn. 4) Try to edit the provider, then delete it, through the user
  path. 5) Open Vendor accounts, sign in to the plugin OAuth provider using its
  host-rendered prompt/device-code step, then select that provider and run a
  turn. 6) Expire the fixture access token and run another turn to exercise the
  plugin refresh callback. 7) Cancel a second login and confirm the callback's
  abort signal fires; sign out and then disable/re-enable the plugin. 8)
  Uninstall the plugin; reinstall and enable it, then remove the declaration
  from its manifest and reload. 9) Load manifests that omit `provider.register`
  or `provider.oauth`, have OAuth metadata without `authKind: "oauth"`, or
  lack the `onProviderOAuth` module export. 10) Load manifests whose model uses a
  non-array `thinkingLevels`, a non-string entry, or a non-string
  `defaultThinkingLevel`.
- **Expected**: Step 1 shows one row in the native provider list with
  `ownerPluginId` set to the plugin and the row id
  `plugin:<pluginId>:<declaredId>`. Its model binding contains the normalized
  levels `off`, `low`, and `high` in declaration order, with `high` as the
  default. Step 2 shows those declared levels in the thinking selector and
  starts the session at `high`; the turn uses that choice. Step 3 persists and
  uses the changed session level without changing the provider declaration.
  Step 4 refuses both actions with an error whose message begins
  `PROVIDER_OWNED_BY_PLUGIN` and leaves the row unchanged. Step 5 completes
  login through the native OAuth dialog and stores one encrypted credential
  under `secret:provider:<plugin-row-id>:oauth`; the renderer sees only status
  and the non-secret account label. Step 6 invokes the refresh callback with
  the plugin's own credential, but only the new access token reaches the Agent
  Runtime; refresh tokens stay in Electron main and the Host secret store. Step
  7 stops the callback on cancellation, clears the OAuth secret on sign-out,
  keeps both manifest-owned rows across disable/enable, and restores sign-in
  status only for credentials that remain stored. Step 8 removes both rows and
  their credential refs when uninstalled or undeclared. Step 9 fails closed:
  missing permissions fail manifest validation, and a missing callback fails
  plugin load without exposing a sign-in action. Step 10 rejects malformed
  thinking-level fields with `PLUGIN_INVALID` and leaves enablement unchanged.
- **Specs linked**: `07-plugins/02-plugin-manifest-schema.md` §4, §5.4, §7;
  `07-plugins/03-plugin-api.md` (provider OAuth); `07-plugins/04-plugin-security.md`;
  `07-plugins/13-plugin-permissions-matrix.md`; `03-runtime/04-data-storage.md`
  §4.3, §7; `03-runtime/11-provider-model-system.md` §6.2;
  `03-runtime/12-provider-config-schema.md` §2, §9;
  `03-runtime/06-host-rpc-protocol.md`; ADR 0259; D427
- **Acceptance**: B (model config), E (tools & permissions), F (persistence),
  G (plugins), Security, Quality
- **Milestone**: Post-MVP (R7 v1)
- **Status**: Runs in the Linux CI integration candidate through
  `pnpm test:e2e:trusted-extensions` under Xvfb, using local
  synthetic OAuth credentials: the API-key and OAuth declared rows, permission
  projection, Settings sign-in picker, Host-rendered device-code and secret
  prompt, encrypted-credential handoff, refresh, model request auth,
  cancellation, and sign-out are exercised through the real Electron renderer
  and plugin process. Ownership refusal, disable/enable, cleanup, and malformed
  manifest cases remain covered by host-core checks. No live identity provider
  is used.

#### E2E-CHAT-disclosure-toggle-keeps-reading-position

- **Scope**: Manual disclosure of a tool, thinking or activity title in a
  transcript or a delegate run dock while the scroller is pinned to the bottom
  (issue #324).
- **Preconditions**: A session longer than one screen, sitting at the bottom with
  follow mode on, holding a tool row, a thinking row and an activity group whose
  expanded detail is taller than its header, plus one expanded delegate run that
  owns a nested scroller. Repeat with a finished turn (`isRunning` false) and
  while the turn streams.
- **Steps**: Click the title of a tool row, a thinking row and an activity group
  while pinned at the bottom, and again after the turn has finished. Repeat with
  the viewport parked in the middle of the transcript, with a keyboard activation
  (Enter, then Space, on a focused title), and from the collapse rail. Expand a
  tool row inside an expanded delegate dock. Then scroll with the wheel, press
  ArrowUp with a title focused, click the jump-to-latest control, and send a new
  prompt.
- **Expected**: The clicked title keeps its on-screen position while the detail
  animates open and closed, and the transcript never re-bottoms underneath it;
  follow mode is left and the newest-message control appears. The held position
  survives every frame of an animated activity group and also covers a
  simultaneous height change above the title. A nested dock holds its own
  position and the transcript behind it does not re-bottom either. Real scroll
  input, the jump control, a new turn and every navigation release the hold and
  follow the live tail again, while a reader who scrolled up keeps their place.
  Space still activates a focused title and arrow keys still scroll.
- **Specs linked**: `04-ux/09-interaction-patterns.md` §9.1;
  ADR transcript-reading-ownership; D287, D302, D430
- **Acceptance**: C (conversation & stream), E (tools & permissions), Quality
- **Milestone**: M6+
- **Status**: Partially automated. `pnpm test:e2e:transcript-disclosure` mounts
  the real transcript scroll hook and a real tool row in a real 600 CSS px
  Electron viewport and clicks the title with a real DOM click, asserting the
  title's offset from the scroller top and the scroll offset for the transcript
  and for a nested follow scroller; without the fix the same fixture reports the
  title moving by the full height of the opened detail. The app stylesheet is not
  linked, so the heights come from inline filler and the components' own
  intrinsic size. `disclosure-anchor.test.mjs` covers the pure anchor and input
  math, and `transcript-disclosure-reading.test.mjs` covers the wiring. Keyboard,
  wheel and animated-activity-group paths remain additional validation.
#### E2E-PLUGIN-fs-root-follows-the-calling-session: A plugin tool's fs root follows its own session, not the visible workspace

- **Preconditions**: Two projects, A and B, each holding a text file the other
  does not, and one enabled plugin that registers an agent tool whose execute
  calls `pi.fs.readText` and `pi.fs.glob` on a root-relative path and declares
  `fs.read` with the `workspace` root. Both projects have a live session with the
  plugin tool available, and the window shows project A.
- **Steps**:
  1. Invoke the tool from session A on the file only project A holds, then from
     session B (project B) on the file only project B holds, without switching
     the window's visible workspace.
  2. Switch the visible workspace to project B and repeat both calls.
  3. With the visible workspace on project B, ask session A's tool for a path
     that exists only under project A, and session B's tool for the same path.
  4. Open the plugin's panel and call the same read over the panel bridge with
     project A visible, then with project B visible.
  5. Move one session to a temporary chat so no workspace is visible, invoke the
     tool from that session, then call the panel bridge in the same state.
- **Expected**: Steps 1 and 2 answer from the invoking session's own project every
  time: session A reads and globs project A's file, session B project B's file,
  and neither answer changes when the visible workspace moves between the two
  projects. Step 3 returns project A's file for session A and `NOT_FOUND` for
  session B, so a session can never reach the other project's root. Step 4 is
  unchanged from before: each panel call resolves the visible workspace, so its
  answer follows the project on screen rather than either session. Step 5 keeps
  working per session -- the session's plugin tool resolves its own project -- and
  the panel call still fails with `NOT_FOUND` ("No workspace is open"). No gate
  is relaxed anywhere: a denied name, a `..` or absolute path, a symlink out of
  the root, and a path outside the declared scope behave as they do for a single
  visible workspace.
- **Specs linked**: `07-plugins/03-plugin-api.md` §3,
  `07-plugins/13-plugin-permissions-matrix.md` §6, ADR 0016, ADR 0249, ADR 0266,
  D093
- **Acceptance**: G (plugins), Security, Quality
- **Milestone**: M6+
- **Status**: Partially automated
  (`apps/desktop/test/plugin-fs-session-root.test.mjs`): a tool call writes and
  reads under the project of the invoking session, a panel call and an untracked
  session fall back to the visible workspace, a `userSelected` mode keeps the
  picked directory, and a session root stands in when the window shows no
  project. The two-live-sessions desktop journey and the panel step are Draft
  (run only in a capable environment when this surface changes)

##### Workspace discovery consistency and project-isolated queues

- Run `node --experimental-strip-types --test
  apps/desktop/test/plugin-workspace-session.test.mjs` on Node 22, together with
  the existing session-root, invocation, filesystem-scope and workspace-root
  suites. The real plugin child process checks concurrent A/B workspace
  discovery against actual marker reads, foreground switching, no visible
  workspace, legacy provider mismatch, remote identity, and absolute reveal
  limited to the caller's registered roots. Only the OS reveal boundary is stubbed.
- A companion knowledge-plugin process test runs the real PluginRuntime, actual
  plugin entry point, project queues and temporary files. Hold A's read at an
  explicit RPC gate; B must save before A is released. A second caller in A
  queues behind A and must retain its own invocation after the first finishes.
  Switch or clear the visible project, reject an A invocation targeting B,
  cancel A while B searches, and verify both original bodies and B's saved
  revision. No live provider, installed user instance or `verify:ui:*` is used.
- The full two-live-session shell journey remains separate; the child-process
  tests establish the actual host/plugin/filesystem boundary without requiring
  a foreground Electron app or changing permission semantics.

#### E2E-MODEL-catalog-window-correction-reaches-saved-bindings

- **Goal**: a models.dev limit correction — the context window or the output cap —
  reaches an already saved binding without deleting and re-adding the model, while
  a number the user entered in Settings is never overwritten.
- **Steps**:
  1. Configure a provider, select a model models.dev publishes a context window
     for, and save. Open the row's Advanced body and read the context-window field
     and its hint.
  2. Serve a corrected models.dev record for that model (a different published
     window), reopen Settings, and read the row, the context inspector, and the
     window a new session launches with.
  3. Type a window in the Advanced field — the preset ladder once and a
     hand-typed `128000` once — save, then serve another catalog correction and
     reopen Settings and the inspector.
  4. Save and reopen a provider row whose binding carries no
     `contextWindowSource`: once with the generic `128000` seed, once with any
     other stored value.
  5. Repeat step 4 with a row whose stored output cap is the generic `8192`, and
     one whose cap the user typed, and read the cap in the settings row and in the
     request a new session launches with.
- **Expected**: Step 1 shows the published number with the "follows the catalog"
  hint. Step 2 shows the corrected number everywhere the effective window is used
  (settings row, context inspector, session launch) with no delete and re-add.
  Step 3 keeps the entered number in the settings row, in the inspector, and in
  the launched request, including a hand-typed `128000` for a model whose
  published window is larger, and the hint is gone. Step 4 resolves
  deterministically: the `128000` seed follows the catalog, every other value
  stays as stored. Step 5 applies the same provenance rule to the output cap: an
  `8192` seed follows the published `limit.output`, and a cap the user entered is
  kept. Every step keeps the marker across the save/read round trip of the
  provider row, and a config written before the marker stays readable.
- **Specs linked**: `03-runtime/13-model-catalog-and-selection.md` §9.1,
  `03-runtime/12-provider-config-schema.md` §2,
  `03-runtime/11-provider-model-system.md` §2, `04-ux/06-settings-ia.md` §2
- **Acceptance**: B (model config), F (persistence), Quality
- **Milestone**: M6+
- **Status**: Partially automated:
  `apps/desktop/test/model-binding-catalog-source.test.mjs` drives the main-process
  resolver (catalog-sourced correction reaches the exposed row, a user value
  survives it, the generic seed still follows the catalog, an inherited value stays
  marked); `packages/shared/src/model-catalog.test.ts` covers the four source rules;
  `crates/host-core/src/providers/catalog.rs` covers the config round trip, the
  unmarked record, and the dropped unknown marker. The end-to-end settings journey
#### E2E-PLUGIN-official-channel-resolves-through-the-platform: An official-channel install uses platform mirrors when resolve answers promptly

- **Preconditions**: A clean profile on the official channel, a plugin present in `plugins.aiuo.net/catalog.json`, and a request log for the platform and both mirror hosts (a local stub may stand in for each).
- **Steps**: 1) Open Extensions → Marketplace and confirm the catalog loads. 2) Capture the catalog request and verify it used `plugins.aiuo.net`. 3) Install the plugin. 4) Capture the request the platform received. 5) Inspect which mirror served the package. 6) Install a second plugin, then install the same version of the first one again.
- **Expected**: The marketplace UI has no source selector; exactly one `POST /api/v1/download/resolve` is sent per install or update, with a JSON body carrying `deviceId`, `pluginId`, and the version when one was picked; when resolve answers within three seconds, the package comes from the first entry in `downloads` that answers, and its bytes match the returned `sha256` and `sizeBytes` before anything is extracted; a mirror that is unreachable or fails is abandoned and the next one is used without user interaction; if resolve exceeds its deadline, the install switches to the catalog URL and verifies its catalog digest; reinstalling the same version issues a fresh resolve call rather than reusing the earlier answer, because the response is never cached; the installed plugin passes the ordinary permission review and its record names the official channel as its provider.
- **Specs linked**: `07-plugins/07-plugin-marketplace.md` §2, `07-plugins/15-plugin-center.md` §10
- **Acceptance**: G (remote marketplace source)
- **Milestone**: M6+
- **Status**: Draft

#### E2E-PLUGIN-mirror-digest-mismatch-falls-through-to-the-next-mirror: A mirror whose bytes fail the digest is rejected before extraction

- **Preconditions**: An official-channel install whose `downloads` list has at least two entries, with the first mirror serving bytes that do not match the returned `sha256` (a stale distribution, or a stub that serves the CNB-era bytes for `pi.todo-0.6.5`), plus a view of the install cache and the plugin directory.
- **Steps**: 1) Start the install. 2) Watch the first mirror's download and the digest check. 3) Inspect the install cache and the plugin directory before the install finishes. 4) Let the install continue. 5) Repeat with a stub whose first mirror fails only the announced `sizeBytes`.
- **Expected**: The mismatching bytes are discarded without being extracted or handed to the installer, nothing lands in the plugin directory, and the rejection is reported in the install progress instead of being swallowed; the next mirror's bytes are verified against the same digest and the install completes from there; the size-mismatch case behaves identically; when every returned mirror fails digest or size validation, the install ends as a reported failure rather than falling back to different bytes or leaving a partial plugin.
- **Specs linked**: `07-plugins/07-plugin-marketplace.md` §2
- **Acceptance**: G (remote marketplace source) + Security
- **Milestone**: M6+
- **Status**: Draft

#### E2E-PLUGIN-platform-unreachable-install-falls-back-to-the-catalog-url: A slow or unavailable platform resolve falls back quickly to the catalog URL

- **Preconditions**: The official catalog has been refreshed. A local stub can delay `POST /api/v1/download/resolve` beyond three seconds or return `429`, `503 NO_DOWNLOAD_SOURCE`, and the publication refusals.
- **Steps**: 1) Install a plugin while the resolve stub delays its response beyond three seconds. 2) Confirm the UI leaves Resolve and begins downloading from the catalog URL. 3) Repeat with a `429` and `503 NO_DOWNLOAD_SOURCE`. 4) Return `403 NOT_PUBLISHED`, `403 PLUGIN_ARCHIVED`, and `404` for a selected version.
- **Expected**: A slow resolve call is abandoned after three seconds; timeout, `429`, and `503 NO_DOWNLOAD_SOURCE` proceed through the catalog's `artifactBaseUrl` plus relative `url`, and bytes still pass the catalog digest check before installation; rate limiting is not retried or waited out; `403 NOT_PUBLISHED`, `403 PLUGIN_ARCHIVED`, and `404` remain explicit failures and never install the fallback package; archived plugins remain hidden from install and update selection; the selected channel does not change.
- **Specs linked**: `07-plugins/07-plugin-marketplace.md` §2
- **Acceptance**: G (remote marketplace source)
- **Milestone**: M6+
- **Status**: Draft

#### E2E-PLUGIN-device-identifier-is-stable-and-never-the-machine-code: The device identifier is stable across launches and is not the raw machine code

- **Preconditions**: A host whose machine identifier is readable (Windows `MachineGuid`, the macOS platform UUID, or `/etc/machine-id`), a second environment where it is not readable, and a request-logging stub for `POST /api/v1/download/resolve`.
- **Steps**: 1) Trigger two installs in one session and compare the recorded `deviceId` values. 2) Restart the app and trigger a third install. 3) Compare the value with the raw machine identifier of the host. 4) Search the settings, the Marketplace surface, and the installed-plugin detail view for the value. 5) Repeat steps 1 and 2 where no machine identifier is readable, then inspect the application data directory.
- **Expected**: Every resolve request from one installation carries the same 64-character lowercase hex value, including after a restart and after an app reinstall while the machine identifier is unchanged; the value is neither the machine code nor a prefix of it, and it equals `sha256("pi-desktop.device.v1:" + <machine identifier>)`; the identifier never appears in the UI and no setting can reveal or reset it; in the unreadable case the value is a different 64-hex string that is generated once and persisted under `plugins/market/device.json`, then repeated across restarts.
- **Specs linked**: `07-plugins/07-plugin-marketplace.md` §2, ADR 0276
- **Acceptance**: G (remote marketplace source) + Security
- **Milestone**: M6+
- **Status**: Draft

#### E2E-PLUGIN-install-progress-shows-phases-and-mirror: An official-channel install reports its phases and the mirror it is using, then completes

- **Preconditions**: A clean profile on the official channel, a plugin whose resolve answer lists at least two entries, a first mirror that fails or is slow so a second attempt is observable, and a renderer subscribed to `plugin.installProgress`.
- **Steps**: 1) Start a manual install from the marketplace detail sheet. 2) Record the reports that arrive while it runs. 3) Hover the dialog after the install succeeds. 4) Look at the installed plugin once the install ends. 5) Install again with a large package and count the reports over a window of at least one second.
- **Expected**: The dialog shows the phases in order — `resolve`, `download`, `verify`, `install`, `enable` — with `mirror n/N · name` and a determinate bar from `receivedBytes` / `totalBytes`; it is mounted on the viewport overlay host and remains fully above the expanded sidebar, including its cancel/close controls; every report carries `pluginId` and `version`, only the report that names a mirror carries `source`, and `attempt` counts 1-based within `attempts` while a mirror switch increments `attempt` without changing `attempts`; byte reports arrive at most once per 200 ms, with one extra report per phase change and one terminal report; the install ends with no `error` and the plugin is installed and enabled after the ordinary permission review; the dialog closes about two seconds after success, that countdown pauses while it is hovered, and a background auto-update installs the same way without opening the dialog at all.
- **Specs linked**: `07-plugins/07-plugin-marketplace.md` §2, `07-plugins/15-plugin-center.md` §10, ADR 0276 §7
- **Acceptance**: G (remote marketplace source)
- **Milestone**: M6+
- **Status**: Draft

- **Local fallback regression**: Set the process default data directory to a
  different temporary root, then create a plugin manager with its own root.
  All bundled fallback package URLs must stay beneath the manager's root;
  installing the bundled package must still report byte progress, validate its
  size and checksum, and preserve cancellation behavior.

#### E2E-PLUGIN-cancel-during-download-installs-nothing: Cancelling during the download stops the install, leaves nothing installed, and closes the dialog without an error

- **Preconditions**: An official-channel install of a package large enough or a mirror slow enough that the download phase lasts, a way to answer `market.cancelInstall`, and a view of the plugin directory, the install cache, and the Installed list.
- **Steps**: 1) Start the install and wait for the download phase. 2) Press the cancel action in the dialog. 3) Watch the dialog and capture the RPC answer. 4) Inspect the plugin directory, the install cache, and the Installed list after the install ends. 5) Send `market.cancelInstall` again for the same id, for an install that is not running, and once after the download has finished.
- **Expected**: The cancel call answers `{ cancelled: true, id }` for the running install, and the install fails with `PLUGIN_CANCELLED` (JSON-RPC code 1019); the dialog closes without reporting an error; nothing is installed — no plugin directory, no installed row, no enabled plugin — and no partial package survives in the cache; the second call for the same id, the call for an install that is not running, and a call after the download finished answer `{ cancelled: false, id }` and change nothing, so a cancel can never interrupt the write of the plugin directory.
- **Specs linked**: `07-plugins/07-plugin-marketplace.md` §2, ADR 0276 §7
- **Acceptance**: G (remote marketplace source) + Security
- **Milestone**: M6+
- **Status**: Draft

#### E2E-PLUGIN-failed-install-lists-tried-mirrors: A failed install keeps the dialog open and lists the mirrors it tried with a copy action

- **Preconditions**: An official-channel install whose every mirror fails — for example a digest mismatch on the first and a network error on the second — with a renderer subscribed to `plugin.installProgress` and a clipboard readback.
- **Steps**: 1) Start the install. 2) Let every mirror fail. 3) Read the terminal report and the dialog. 4) Use the copy action, then the retry action once the mirrors serve valid bytes again.
- **Expected**: The terminal report carries `error` and a `tried[]` entry per mirror in the order they were tried, each naming its `source`, `url`, and the error that mirror answered; the dialog stays open and shows the readable error plus that list; the copy action puts the tried mirrors on the clipboard; the retry action starts a new install of the same version and completes it when the mirrors answer, without reusing the failed attempt's partial state; nothing was installed by the failed attempt.
- **Specs linked**: `07-plugins/07-plugin-marketplace.md` §2, ADR 0276 §7
- **Acceptance**: G (remote marketplace source)
- **Milestone**: M6+
- **Status**: Draft

### E2E-CHAT-turn-process-and-thinking-display

- **Preconditions:** A turn with progress paragraph A, multiple searches plus
  thinking, progress paragraph B, multiple commands plus thinking, and a final
  answer; the `Show thinking` preference on and off; the `Transcript display`
  preference at Flat, Commands first, and Fully folded; a restart with saved
  settings; legacy message-level transcript search targets.
- **Steps:** Confirm a live active group starts open, let that same turn finish
  without interacting, and confirm the process closes so only the final answer
  (and any error or pending-action surface) remains. Reopen it and confirm a
  every settled group folded and every finished reasoning row folded, and that
  each group header names the actions it contains plus the call count
  (`搜索并读取文件 · 12 次操作`). Confirm tool and search payloads stay closed.
  Turn `Auto-fold finished groups` off and confirm every settled group opens
  whatever its size, then turn it back on; turn `Auto-fold finished thinking`
  off and confirm every reasoning row opens, then turn it back on. On a second
  turn, explicitly
  open a completed group and confirm the choice survives subsequent updates; then
  close the turn's disclosure and confirm the group closes with it, and reopen to
  confirm the group choice is restored. In Fully folded, confirm run rows stay
  inside their activity groups and that only ordinary assistant progress text
  splits a group. In Commands first, confirm `Bash`/run rows render as standalone
  rows beside the groups, that a normal assistant progress message or a command
  ends the current group, adjacent calls stay separate, and only the reasoning
  row the turn is still streaming is expanded. In Flat, confirm no nested
  activity group renders, that `Auto-fold finished groups` is absent from AI
  settings, and the outer
  disclosure lists tools, commands, thinking and progress in transcript order,
  and tool details stay collapsed. In every mode confirm the turn renders exactly
  one outer disclosure and that closing it hides, then reopening restores, the
  rows under it. Turn `Show thinking` off and confirm no completed reasoning row
  remains and only a live whole-run TextShimmer `Thinking` indicator appears
  while reasoning streams, with no spinner, pulsing dot or per-character
  animation and a static presentation under reduced motion; turn it back on and
  confirm the completed rows return. Select each `Transcript display` value,
  restart, and confirm it persists; remove the saved value and confirm it
  defaults to Fully folded. Confirm the header reads running, finished, stopped,
  or failed for each case, names compaction and recovery while those stages are
  live, omits the duration when none was recorded, and never repeats the current
  command. Confirm the top-level header shows exactly status, recorded duration
  and direct tool/search count; its caret sits immediately after the tool count;
  a hairline underlines the row; hovering changes only the text colour with no
  background fill; and a failed turn does not add an issue count. Review the
  nested path, including independent group/item toggles, a
  singleton segment, literal-final-item leaf selection, failure/denial/recovery,
  retained-pane remounts, run rows keeping their details closed until opened, and
  a legacy search reveal.
  In AI settings, check the display selector in English and Simplified Chinese
  at 800px, 1000px, and 1440px window widths with 100% and 150% font scales.
  Select all three values and verify each remains visibly selected and saved.
- **Expected:** A turn renders exactly one process disclosure containing every
  pre-answer row, leaving the final answer, assistant errors, stopped trailing
  text and pending actions outside it; when no final answer text exists, the
  process header and those error or pending-action surfaces remain. An untouched
  process closes at completion. In Flat there are no nested activity groups, and
  active tools, commands, thinking and progress rows follow transcript order with
  tool details collapsed. In Commands first, `Bash`/run rows are standalone
  beside the groups, adjacent calls stay separate, and a normal assistant
  progress message or a command ends a group, so the middle progress paragraph
  and each command start a new group. In Fully folded (the default), run rows
  stay inside their groups and only ordinary assistant progress text splits a
  group, so the middle progress paragraph ends the preceding group and the
  following activity starts a new one. A group appears only with at least two
  visible items; a singleton has no group. Every group stays open while its turn
  runs; after completion both nested levels fold, so every settled group and
  every reasoning row that is no longer streaming starts closed, whatever the
  group's size. Only the reasoning a live turn is still streaming starts
  expanded when `Show thinking` is on, and a group does not inherit open state
  from the reasoning inside it, so folding a group hides expanded reasoning.
  Turning off `Auto-fold finished groups` opens every settled group; turning off
  `Auto-fold finished thinking` opens every rendered reasoning row. A settled
  group's header names the actions it contains, capped at three with "and more",
  and appends the operation count as its own non-truncating token; reasoning is
  named but not counted, and the header carries no issue counter.
  Explicit user choices persist and are restored when the enclosing disclosure is
  reopened, and never pin an ancestor; an automatic close is deferred only while
  focus or a selection remains inside. Group defaults do not depend on
  `Show thinking` or on the reasoning a group contains. The header
  reports running, finished, stopped, or failed with failure and stop outranking
  a normal finish, reads `Thinking` while the live step is reasoning, names
  compaction and recovery while those stages are live, omits a duration the
  transcript did not record, and never repeats the current command. It carries
  only status, duration and direct tool/search count, with the caret immediately
  after the tool count, a hairline under the row, text-colour-only hover, and no
  issue count. Nested group headers and run rows share the turn header's left
  edge. When `Show thinking` is off, no completed reasoning row renders, and only
  the live whole-run TextShimmer `Thinking` indicator remains while reasoning
  streams; turning it back on restores the rows. No item payload opens itself
  except the display mode's Thinking default: a tool/search row stays closed until
  the user opens it.
  Parent/child/sibling states remain independent, pane-owned user choices survive
  updates, preference changes and remounts, and renderer restart reapplies
  defaults. Search reveals the turn process and, where one exists, the activity
  group that own the named message once per request; item-level targeting is not
  part of this change, and reasoning hidden by the preference stays hidden until
  the user turns `Show thinking` on. A saved `transcriptDisplayMode` survives
  restart and an absent or unknown value resolves to Fully folded; saved
  `showThinking` survives restart, and an absent value falls back to the legacy
  `thinkingDisplayMode` (`compact` hides, `detailed`/unknown/absent shows).
  The Settings selector grows to its labels beyond the standard 240px field
  cap. Option labels remain single-line and unclipped; the control and whole
  options wrap only as needed, preserving the title/help space and preventing
  horizontal row overflow. Wide windows keep the title and control inline.
- **Validation scope for the 2026-09-20 change:** Nested disclosure and activity
  group presentation only; precise item-level transcript search targeting is out
  of scope and keeps the existing message-level search behavior.
- **Automation:** `pnpm test:e2e:transcript` covers the command-first and
  fully-folded layouts, active-to-completed process disclosure behavior, the
  automatic folding and reading-hold transitions, and the activity issue
  counter's inline layout at 320/800px and 100%/150% zoom in English and
  Simplified Chinese; `pnpm test:e2e:transcript-disclosure` verifies manual-open
  retention and viewport anchoring; `apps/desktop/test/turn-process.test.mjs`
  covers mode segmentation, `apps/desktop/test/activity-group-folding.test.mjs`
  covers the settled group defaults and the issue-counter contract,
  `apps/desktop/test/transcript-display-modes-ui.test.mjs` covers
  the renderer's mode wiring, Thinking defaults and TextShimmer,
  `apps/desktop/test/turn-process-header.test.mjs` covers the top-level header's
  status/duration/tool-count composition and the absence of issue counts,
  `apps/desktop/test/turn-process-header-style.test.mjs` covers its hairline and
  text-only hover,
  `apps/desktop/test/transcript-display-mode-settings.test.mjs` covers the
  Settings row and search indexing, and
  `apps/desktop/test/settings-roundtrip.test.mjs` covers normalization, write
  validation and the fully-folded default.
  `node scripts/e2e-settings-scroll.mjs` additionally exercises the mounted
  Settings page's selector layout and settings-save path across both locales,
  three window widths, and both font scales with isolated Electron state.
- **Specs:** 04-ux/06-settings-ia, 04-ux/08-component-spec,
  04-ux/09-interaction-patterns; ADR turn-process-and-thinking-display.

### E2E-RPC-unicode-separators

- **Preconditions:** Built host-core, shared package and agent runtime; isolated
  temporary data directory; loopback-only fixture provider. No live credentials.
- **Steps:** Append a user message containing U+2028/U+2029, CJK text, emoji and
  escaped CR/LF; read it, restart the host, and read it again. Send a Unicode
  prompt through AgentSidecar; restore history through the parent host proxy;
  stream and persist a Unicode answer. Send an unknown method containing the
  same characters, then a health request.
- **Expected:** Text survives unchanged across persistence and all stdio
  directions. Requests settle without RPC timeouts; error replies and subsequent
  requests remain usable. No migration of existing sessions is needed.
- **Automation:** `pnpm test:e2e:rpc-unicode`; `packages/shared/src/ndjson.test.ts`
  additionally checks every UTF-8 split boundary, consecutive frames, CRLF, EOF and disposal.
- **Specs:** 03-runtime/06-host-rpc-protocol §2.
- **Acceptance:** A (runtime), C (sessions).
- **Milestone:** M6+.
- **Status:** Automated; run against the task/PR integration candidate.


### E2E-PROVIDER-ORDER: Reorder configured AI services

- Open Model configuration with three providers and drag the last before the
  first, then after the last; verify pointer-following cards, live slot preview,
  and saved order. Check movement threshold, action-button exclusion, edge
  scrolling, Escape cancellation, and automatic-scroll cleanup.
- Cancel a drag and use Up/Down on a focused provider card. Verify no configuration or
  default-model changes. Failed saves report an error and retain accepted order;
  overlapping moves are blocked and late catalog reads cannot undo a move.
- Reopen the Composer model menu: groups follow the provider order. Restart the
  host and renderer and verify persistence. Check English and Chinese labels.
- Automated: `pnpm test:e2e:provider-order` runs the real settings component,
  sandboxed preload, provider IPC registrar, and an isolated Rust host. It uses
  synthetic Chromium pointer/key events and test providers without credentials;
  model-catalog/OAuth discovery is stubbed and no provider requests are sent.
- Host unit tests cover no metadata, disabled/plugin rows, new/deleted IDs,
  stale moves, no-op moves, preserved configuration, and reopening the database.

The provider-order suite also runs a 200-card fixture under a controlled animation
clock. A burst of 200 pointer events may arm React state once, but stationary
frames must produce no further renders or pending callbacks. Card geometry is
read at press time, and move/release/cancel/unmount paths must clear transient
transforms and queued frames. Release before the scheduled frame must still save
the latest destination. These assertions measure work counts, not device FPS.

### E2E-CHROME-window-controls-survive-work-panel

- **Preconditions:** A built desktop and matching host-core binary; isolated
  profile and data directory with one local session; no real provider calls.
- **Steps:** Open the work panel from the titlebar, toggle the sidebar, maximize
  and restore the panel, maximize and restore the native window, close the panel,
  visit Settings and return, reopen the panel, minimize/restore the window, then
  click Close with close-to-tray configured in the disposable profile. Also
  enter and leave native fullscreen with the panel open. Check the three controls
  with Chromium hit testing throughout, including light/dark Windows/Linux CSS.
- **Expected:** Windows/Linux minimize, maximize/restore, and close stay visible
  and hit-testable at the window edge. Native actions work with the panel open.
  Preview sidebar navigation remains clickable. On macOS no duplicate renderer
  window controls appear; the native traffic-light and fullscreen contracts stay
  unchanged. CSS emulation does not qualify another operating system's native UI.
- **Specs:** `04-ux/01-ui-ia.md` titlebar; ADR 0021 and ADR 0025.
- **Acceptance:** Window actions remain accessible independently of pane state.
- **Milestone:** Post-MVP regression coverage.
- **Automation:** `pnpm test:e2e:window-controls`; macOS traffic-light geometry
  also has `apps/desktop/test/traffic-light-reserve.test.mjs` contract coverage.
- **Status:** Automated for the executing native platform; run on macOS/Linux
  runners for native qualification. Optional screenshots are written only to
  `PI_DESKTOP_CHROME_ARTIFACT_DIR`.

### E2E-PLUGIN-slow-tool-is-not-cut-off-by-host-dispatch

- **Preconditions:** A loaded plugin that registers an agent tool; the tool
  awaits work longer than 60s but shorter than the 110s plugin tool budget (for
  example an `agent.complete` call that takes ~70s).
- **Steps:** Ask the agent to use the tool, approve it if prompted, and wait for
  the call to finish. Repeat with the permission card left open for a while
  before approving.
- **Expected:** The call returns the plugin's result. host-core does not answer
  `TOOL_TIMEOUT` before Electron's budget expires, and no transport layer reports
  `host RPC timeout`, `sidecar RPC timeout`, or `parent host proxy timeout` for
  the call. Budgets nest from the inside out: plugin `agent.complete` 90s < MCP
  call 100s < plugin tool 110s < host-core dispatch 150s, while the widest MCP leg
  (a lazy handshake, then a `tools/list` traversal, then the call) is 140s. The
  transport deadline covers the permission wait, the admission queue wait, and
  that dispatch, so a call that waited for a saturated plugin class before it was
  dispatched is still inside it.
- **Specs:** `07-plugins/12-plugin-ipc-and-host-services.md` agent-tool
  dispatch; ADR 0038; ADR 0174.
- **Acceptance:** G (plugin agent tool).
- **Milestone:** Post-MVP regression coverage.
- **Automation:** `apps/desktop/test/plugin-timeout-budgets.test.mjs` checks the
  budget order and the dispatch call site across the TypeScript and Rust sources;
  `packages/shared/src/protocol.test.ts` covers the transport deadline; host-core
  `desktop_dispatch_outlasts_every_electron_budget_it_wraps` covers the dispatch
  default.
- **Status:** Contract-covered; no end-to-end driver waits out a real 70s call.

### E2E-PLUGIN-crash-report-names-the-exit-code

- **Preconditions:** A loaded plugin whose host process dies on its own —
  `process.exit(7)` after writing one line to stderr is the fixture — with a
  resident service so the supervisor path is exercised too. Isolated desktop
  profile; no marketplace or network access.
- **Steps:** Load the plugin and let the host process die. Read the load error,
  the `failed` service state, the `plugin.crash` audit record and the `plugin`
  log channel. Repeat with a hard fault (a Windows `0xC0000005`-class exit) if
  one is available, and then quit the app while a plugin host is alive.
- **Expected:** Every one of those surfaces names the exit code (`exit code 7`,
  and `exit code 3221225477 (0xC0000005)` for the fault), while the fixture's
  stderr line is absent from the load error and crash audit record. A clean quit
  reports no crash at all: quitting is a shutdown, not a crash.
- **Specs:** `07-plugins/05-plugin-lifecycle.md` §3.1 / §8,
  `08-meta/decisions-log.md` D607.
- **Acceptance:** G (plugin host lifecycle), Quality (diagnosability).
- **Milestone:** Post-MVP regression coverage.
- **Automation:** `apps/desktop/test/plugin-services.test.mjs` forks a real host
  process, kills it with a fixture exit code and asserts the code plus the
  absence of raw stderr in the crash audit record; `plugin-isolation.test.mjs`
  and the shutdown cases cover the "quit is not a crash" half.
- **Status:** Automated at the runtime level; no UI driver reads the plugin
  page's error text.

### E2E-DIALOG-native-selection-across-boundaries

- **Preconditions:** Built renderer, isolated Electron profile, real production
  React dialogs/hover card and stylesheet; only preload IPC is stubbed. Reveal
  and dismissal delays use a controlled clock, not arbitrary sleeps.
- **Steps:** Drag from release-note/table text onto the backdrop and copy the
  selected text with Chromium's native Copy command; repeat content-to-backdrop
  and reverse drags in project instructions and provider setup. Open provider
  Advanced, drag across its boundary, then deliberately click its backdrop.
  Cancel a backdrop press or blur the window before release, then try a fresh
  outside click. Save project
  instructions while trying outside click/Escape, then use the close button.
  Hover a session row, drag card text outside, advance past the grace period
  while held and after release, Copy, revisit/leave the row, clear selection,
  and repeat ordinary leave, cancellation, Escape and outside press.
- **Expected:** Cross-boundary drags preserve the modal and native selection;
  deliberate backdrop clicks still dismiss. Cancelled/blurred presses never
  dismiss; the next fresh click works. Nested clicks close only Advanced and
  saving protections remain effective. The hover card survives dragging and
  remains copyable while its text selection exists; row timers cannot override
  retention. Clearing selection or ending an unselected/cancelled drag resumes
  ordinary 160ms dismissal. Escape/outside press still dismiss selected cards.
- **Specs:** `04-ux/09-interaction-patterns.md` sections 1.10 and 9.1b;
  `04-ux/07-ui-design-system.md` section 11.4.
- **Automation:** `pnpm test:e2e:overlay-selection`; production Chromium mouse
  and keyboard input with deterministic host replies. On macOS the fixture uses
  Chromium's native copy command because Electron's synthetic Command+C input
  does not invoke the system clipboard. No running user app or real provider is
  used.
- **Status:** Automated on Windows and macOS; Linux native evidence pending.

### E2E-DIALOG-long-text-boundaries

- **Preconditions:** Built renderer assets and an isolated Electron component
  fixture; production components, store, translations and stylesheet are used.
  Only the preload IPC boundary is replaced with deterministic host replies.
- **Steps:** Open an extension input prompt with a long Windows source path;
  type, submit, reopen and dismiss. Repeat long title/message/option prompts in
  light/dark themes and Chinese at 520×480. Inspect long project/plugin names in
  rename, instructions, memory, delete, install, settings, permission-review and
  OAuth dialogs; exercise dismissal controls.
- **Expected:** Full source paths and other long text wrap without clipping; horizontal
  overflow is absent, and the 420px prompt width is unchanged. Tall prompts
  scroll inside the viewport. Close, Escape, typing and radio submission work.
- **Specs:** `04-ux/08-component-spec.md`, Dialog long-text containment.
- **Acceptance:** Bounded text and reachable modal controls.
- **Milestone:** Post-MVP maintenance.
- **Automation:** `pnpm test:e2e:dialog-overflow`; source/contract dialog suites
  supplement, but do not replace, real Chromium geometry and pointer checks.
- **Status:** Implemented. Native Windows evidence; macOS/Linux not qualified.

### E2E-OUTPUT-CAP-716: Keep model requests inside the published context window

- **Preconditions:** A deterministic provider fixture exposes a published context
  window, supports parent and subagent requests, and records request payloads.
- **Steps:** Configure a user context override larger than the published window;
  send a CJK-heavy parent prompt, invoke a subagent, and run a one-shot
  completion. Repeat the parent request with `thinkingLevel: "omit"`. Restore a
  session whose transcript holds many large instruction updates on a Responses
  gateway without mid-conversation system support, then continue it and run a
  subagent whose updates follow its last usage report.
- **Expected:** Each request carries a concrete output budget no larger than the
  remaining published window after input estimation and safety reserve. The
  runtime compacts against the published safety ceiling, and no request is sent
  with `input + output` beyond that ceiling. Small ASCII requests retain the
  configured budget when it fits. The restored session and the subagent send one
  folded instruction message and keep the configured output budget instead of
  the provider's minimum.
- **Specs linked:** `03-runtime/02-agent-runtime.md`,
  `03-runtime/13-model-catalog-and-selection.md`
- **Acceptance:** F (runtime provider requests), C (chat and stream)
- **Automation:** `packages/agent-runtime/src/output-cap-request.test.ts` drives
  the restored-session and subagent steps through a loopback Responses gateway.
- **Status:** Unit-covered; folded-instruction steps covered by a loopback
  gateway; remaining deterministic provider fixture pending

### E2E-PROVIDER-certificate-trust-and-terminal-errors

- **Preconditions:** Built request candidate incorporating current `origin/main`,
  Electron installed, isolated test process/profile and loopback HTTPS fixture.
  No real provider, credentials, user profile, or OS certificate-store writes.
- **Steps:** Run `node scripts/e2e-provider-certificates.mjs`. Launch the actual
  desktop sidecar and submit a chat prompt against an untrusted localhost
  certificate. Relaunch with its CA in `NODE_EXTRA_CA_CERTS`, then request the
  same certificate through a hostname absent from its SAN.
- **Expected:** The child's default CA set includes every non-expired system
  root and extra CAs, while expired system-store entries are omitted. Bundled
  roots and inherited extra CAs remain available.
  The first request fails once with a non-retriable certificate error and no
  retry status; the trusted request returns text; the hostname mismatch still
  fails once. TLS and hostname verification remain enabled.
- **UI:** Run `node scripts/e2e-provider-certificate-ui.mjs` for the real error
  component in isolated Chromium. Certificate errors get localized guidance;
  DNS and protocol errors retain the generic summary. Errno/raw details remain
  visible, and details can be closed and reopened. Optional
  `PI_CERTIFICATE_EVIDENCE_DIR` records a screenshot; `--baseline` uses the
  upstream error component with the same fixture and stylesheet.
- **Lower-level coverage:** `provider-certificate-flow.test.ts` enters main
  session `prompt()` and delegate `run()` through real Agent/pi-ai wiring,
  with only the external fetch mocked. Both stop after one request and retain
  the certificate cause. Error classification and recovery suites cover direct,
  nested, flattened, non-certificate and wrapped certificate failures.
- **Limits:** OS-root inclusion is checked without installing a root. The TLS
  success fixture uses a child-only extra CA; it does not reproduce a specific
  antivirus installation or claim native macOS/Linux verification.


### E2E-PROVIDER-stored-binding-array-reads-entry-by-entry

- **Preconditions:** A throwaway data directory and the host-core binary; a
  provider created through `providers.create` with at least three complete
  bindings; no real provider or credentials.
- **Steps:** Call `providers.list` and confirm every binding returns. Edit the
  stored `config_json` to delete one binding's `maxTokens` and list again.
  Restore the field and list again. Then set one binding's `contextWindow` to a
  string and list once more. Attempt `providers.update` with the readable
  subset and an unrelated provider change.
- **Expected:** All three bindings return in every case except the malformed
  entry, where the readable bindings return in their stored order. The binding
  that lost `maxTokens` reads with the generic default output cap, and restoring
  the field restores the value. The host log names the provider id, the entry's
  index and the reason for the entry that could not be decoded. The explicit
  model-array update is rejected with `MODEL_BINDINGS_DEGRADED`, while the
  stored `config_json` remains unchanged.
- **Specs linked:** `03-runtime/12-provider-config-schema.md` §2,
  `08-meta/decisions-log.md` D610
- **Acceptance:** F (persistence), Quality
- **Status:** Unit-covered (`providers::catalog::tests`,
  `providers::tests::a_stored_array_survives_an_entry_that_lost_a_field`); the
  host RPC path is exercised by `scripts/e2e-smoke.mjs` for provider create and
  list, but no suite drives a hand-edited `config_json`.
### E2E-CONTEXT-estimate-calibration-stays-safe

- **Preconditions:** Deterministic provider fixture whose reported usage can be
  scripted; a session whose occupancy is close to the hard boundary; no real
  provider credentials.
- **Steps:** Report usage below the prediction repeatedly and confirm the
  displayed occupancy never falls below the floor and compaction still fires;
  report usage far outside the plausible band and confirm the value does not
  move; run a CJK-heavy session and compare the displayed occupancy with the
  reported usage.
- **Expected:** The calibrated occupancy stays within 0.85×–6× of the raw
  estimate, moves up as soon as there is evidence, moves down only after
  agreeing samples, and a projection at 1.18× the hard limit still compacts.
  Misreports move it in neither direction. CJK text no longer reads at a
  quarter of its measured cost.
- **Specs linked:** `03-runtime/02-agent-runtime.md` §5.1,
  `08-meta/decisions-log.md` D606
- **Acceptance:** C (chat and stream), F (persistence), Quality
- **Status:** Unit-covered (`context-calibration.test.ts`, including the CJK and
  boundary cases); desktop E2E pending

### E2E-CONTEXT-reported-occupancy-drives-compaction

- **Preconditions:** A production sidecar, isolated Host fixture and localhost
  Responses gateway. The gateway reports cached input separately from a total
  that omits it; no real provider credentials are used.
- **Steps:** Send a turn whose input, output and cache buckets exceed the
  automatic threshold, then send another prompt. Repeat with ordinary
  under-budget usage and with an incomplete bucket breakdown whose reported
  total exceeds the threshold.
- **Expected:** The first session summarizes and persists one checkpoint before
  the next provider request, which includes the summary and new prompt. The
  under-budget session continues without a checkpoint. A larger reported total
  still triggers the guard when bucket details are missing; billing totals
  remain unchanged.
- **Automation:** `node scripts/e2e-context-usage-compaction.mjs` after building
  shared and the production sidecar bundle. The real Agent-loop tests in
  `context-usage-compaction.test.ts` also cover restored sessions and compaction
  between a tool result and the next request.
- **Specs:** `03-runtime/02-agent-runtime.md` §5.1.

### E2E-RUNTIME-unique-tool-call-ids-per-request

- **Preconditions:** A session transcript that carries the same tool call twice
  (a retried append leaves the call under a second row id), loaded into a
  recreated runtime against a deterministic provider fixture. No real provider
  credentials.
- **Steps:** Send one prompt so the runtime assembles and issues a request. Read
  the outgoing request the fixture received, and the `agent` log channel. Repeat
  with a transcript whose calls are already unique.
- **Expected:** The outgoing request carries exactly one `toolCall` for that id
  and exactly one matching result, so no provider can answer
  `tool_use ids must be unique`. The log channel gets one line naming the
  session and the ids. The unique transcript's request is unchanged, byte for
  byte, and logs nothing.
- **Specs:** `03-runtime/02-agent-runtime.md` §5,
  `08-meta/decisions-log.md` D608.
- **Acceptance:** C (conversation and stream), Quality.
- **Milestone:** Post-MVP regression coverage.
- **Automation:** `packages/agent-runtime/src/runtime.test.ts` covers both halves
  against a real runtime built from a duplicated history (drop + one log line)
  and a unique one (identity, no log line).

- **Status:** Unit-covered; no end-to-end driver issues a real provider request
  against a duplicated transcript.

- **Reused-id regression (#1815):** Run two actual tool executions whose
  provider responses reuse the same id, then inspect the next request. Both
  results must remain, with distinct paired ids and no synthetic placeholder.
  Repeat after context trimming and restored history, and verify cancellation,
  metadata and replayed pending snapshots retain their semantics.
  `runtime.test.ts` covers the parent prompt path; `subagent-fallback.test.ts`
  drives the real Pi adapter over local HTTP with two executions and three
  requests; `tool-call-identity.test.ts` covers retained identities after trim.

### E2E-RUNTIME-system-update-during-tool-call-restore

- **Preconditions:** A session transcript with a model system record saved
  while a tool call ran: it sits after the assistant row that made the call and
  before that call's tool row (`beforeMessageId` is the tool row id). Loaded
  into a recreated runtime against a deterministic Anthropic Messages fixture
  with mid-conversation system messages enabled. No real provider credentials.
- **Steps:** Send one prompt so the runtime assembles and issues a request. Read
  the outgoing request body the fixture received.
- **Expected:** The tool call stays on the assistant message that made it,
  next to that message's text, and no call-only assistant is synthesized. Every
  mid-conversation `system` message follows a `user` message, so the provider
  does not answer `role 'system' must follow a 'user' message or an 'assistant'
  message ending in a server tool result`.
- **Specs:** `03-runtime/02-agent-runtime.md` §5c and §7.0.0,
  `08-meta/decisions-log.md` D127.
- **Acceptance:** C (conversation and stream), Quality.
- **Milestone:** Post-MVP regression coverage.
- **Automation:** `packages/agent-runtime/src/system-transcript-runtime.test.ts`
  restores the rows into a real runtime and passes the captured request through
  Pi's Anthropic adapter.

- **Status:** Unit-covered; no end-to-end driver restores such a transcript
  against an Anthropic provider fixture.

### E2E-RUNTIME-loop-context-ownership

- **Preconditions:** A deterministic provider fixture that answers the first two
  rounds with one tool call each and stops the turn after the second round the
  way a user Stop does. No real provider credentials.
- **Steps:** Send one prompt so the runtime runs both tool rounds and ends the
  turn on a tool round. Send a second prompt. Read the state the runtime kept and
  the outgoing request the fixture received.
- **Expected:** The kept state holds each streamed assistant message and each tool
  result exactly once; no result is separated from the call it answers; the
  fixture's request carries exactly one result per call. No duplicate-drop line is
  logged, because the request guard had nothing to drop.
- **Specs:** `03-runtime/02-agent-runtime.md` §5c,
  `08-meta/decisions-log.md` D620.
- **Acceptance:** C (conversation and stream), Quality.
- **Milestone:** Post-MVP regression coverage.
- **Automation:** `packages/agent-runtime/src/runtime.test.ts` (loop context
  ownership) drives the real pi loop through `runtime.prompt()` and reads the
  view `convertToLlm` handed the provider; `subagent-loop-context.test.ts` covers
  the delegate's turn boundary. The adapter's own output is out of reach of both,
  so `tool-call-dedupe.test.ts` (request wire contract) drives pi-ai's message
  transform directly to pin the two outputs one call id receives when a request
  separates a call from its result.
- **Status:** Unit-covered; no end-to-end driver issues a real provider request
  from a context the loop appended to.

### E2E-MCP-HTTP-ACK — HTTP acknowledgement and authorization status

- **Preconditions**: A local mock Streamable HTTP server returns JSON for
  initialize, `202` with plain-text `Accepted` for notifications/initialized,
  SSE for tools/list, and JSON for tools/call. No provider credentials needed.
- **Steps**: Connect, discover a tool, and call it. Render the MCP settings row
  with idle, connecting, ready, non-authentication failure, and authentication
  failure statuses, including an expired stored OAuth credential.
- **Expected**: The acknowledgement does not enter the JSON parser; discovery,
  calls, and session headers remain functional. Only explicit authRequired
  status shows the authorization-required badge. Non-authentication failures
  retain their original error. Authentication failures remain actionable.
- **Specs**: 07-plugins/01-plugin-system §12.2; ADR 0038; ADR 0283.
- **Acceptance**: HTTP client integration and settings component rendering.
- **Milestone**: Maintenance.
- **Status**: Covered by the existing HTTP client integration fixture and a
  focused component-render validation; no live IDA process required.

### E2E-MCP-HTTP-SSE-held-open — A streamable HTTP reply lands before the server ends the stream (issue #1188)

- **Preconditions**: A local mock Streamable HTTP server writes its JSON-RPC
  reply immediately and keeps the `text/event-stream` body open well past the
  client's handshake budget — the shape `https://gitmcp.io/docs` shows, where
  initialize is answered in about two seconds and the stream only ends about
  twelve seconds later. No provider credentials needed.
- **Steps**: Configure that server with the `http` transport and a handshake
  budget shorter than the stream lifetime; connect, discover the tools, and call
  one. Repeat with a server that keeps the stream open and never answers.
- **Expected**: Handshake, discovery, and the call complete as soon as their
  reply event arrives, so the connection reports `ready` with the discovered
  tools instead of `mcp initialize timed out after <budget>ms`. A server that
  never replies still fails with `TIMEOUT` inside the same budget, and a stream
  left open past its request is aborted rather than kept open.
- **Specs**: 07-plugins/01-plugin-system §12.2; ADR 0038.
- **Acceptance**: HTTP transport integration and the main-process MCP handshake.
- **Milestone**: Maintenance.
- **Status**: Automated by `apps/desktop/test/plugin-mcp.test.mjs` (held-open
  reply case); no live app process required.

### E2E-IMAGE-generation-and-editing

- **Preconditions:** Built task candidate containing latest origin/main; isolated
  host data directory, local image HTTP fixture, no production credentials.
- **Steps:** Choose a model in Advanced, cancel and verify no change; save and
  replace it through another provider's Advanced settings. Clear the binding via
  the test settings API to verify recovery. Generate same-prompt variants and
  distinct images; confirm each result appears once in the conversation gallery
  while the assistant confirms completion in text. Edit a generated image,
  inspect partial failures, then restart the host/session. Return a
  multi-megabyte `b64_json` image (well above 5.5M base64 characters, below
  the image size cap). Attempt the tool in a durable Plan session and verify no
  HTTP request occurs.
- **Expected:** One image binding persists without changing the chat default;
  generated files, edit sources and transcript references survive restart.
  The large image is saved byte-for-byte instead of failing with
  `IMAGE_REQUEST_FAILED` (#2128).
  Each successful image appears once in its result card instead of being
  repeated as a Markdown embed; unconfigured errors navigate to Models settings.
- **Specs:** 03-runtime/21-image-generation; 03-runtime/13-model-catalog-and-selection.
- **Acceptance:** Configured image generation/editing, safe cancellation and persistence.
- **Milestone:** Post-MVP.
- **Status:** Automated by `scripts/e2e-image-generation.mjs` and
  `scripts/e2e-image-generation-ui.mjs`; backend test uses real Rust/stdio/HTTP/files,
  UI test uses real Chromium and production components with API-boundary fixtures.

| Scenario | Acceptance | Specification | Automation |
| --- | --- | --- | --- |
| E2E-IMAGE-generation-and-editing | Image capability and recovery | 03-runtime/21-image-generation | Host and UI suites above |
| E2E-IMAGES-result-download | Download and locate a generated result | 03-runtime/21-image-generation | `scripts/e2e-image-chat.mjs` |

### E2E-IMAGES-result-download

- **Preconditions:** Agent conversation with two successful generated PNGs and a local image fixture.
- **Steps:** Verify one selected card and two adjacent thumbnails, download the first result, select and download the second, inspect the narrow chat layout, open the selected image in the full-window viewer, navigate both directions, zoom in, close with Escape, and inspect Show in folder.
- **Expected:** The selected card and download target follow thumbnail selection. The selected thumbnail has a light gray ring, and switching loaded images keeps the card and viewer image present with stable fit dimensions throughout. Rapid reverse navigation cancels a pending decode. Both downloaded PNGs match their saved bytes and have safe filenames. Chat and viewer thumbnails remain reachable at narrow widths; viewer selection, zoom and focus restoration work, and the selected image remains selected in chat. The originals remain available. The folder action uses the contained file reveal path.
- **Specs:** 03-runtime/21-image-generation.
- **Acceptance:** Result actions and image browsing work without changing image storage or preview access.
- **Milestone:** Post-MVP.
- **Status:** Download and viewer interactions automated by `scripts/e2e-image-chat.mjs`; folder reveal uses the existing contained IPC path.

#### E2E-CHAT-parenthesized-url: Complete URLs in user messages

- **Steps**: Send `https://en.wikipedia.org/wiki/React_(software)` in a user message and click its link. Repeat with the URL wrapped in prose parentheses, followed by a sentence-ending period, and followed immediately by another link or file reference.
- **Expected**: The complete URL, including `(software)`, opens the React software article. The outer prose closing parenthesis and sentence-ending punctuation after the URL parenthesis are not part of the link. Adjacent references remain independently clickable. Nested parentheses, query/fragment parentheses and percent-encoded parentheses remain intact.
- **Coverage**: `chat-links.test.mjs`; native desktop click-through with the normal browser destination.
- **Specs linked**: `04-ux/08-component-spec.md` §8.3.

#### E2E-CHAT-user-link-selection: URLs in user messages are selectable text

- **Steps**: Send `介绍一下这个项目：https://github.com/vastsa/PI-Desktop` in a user message. Drag from the start of the message past the end of the URL, then copy. Click the URL once afterwards.
- **Expected**: The selection highlights the prose and the URL together, and the copied text is the whole message including the URL. A plain click on the URL still opens it through the Link open destination.
- **Coverage**: `transcript-style.test.mjs` asserts `.chat-text-link` opts back into text selection over the unselectable `button` baseline; drag-and-copy checked in Chromium against the full renderer stylesheet (issue #1243).
- **Specs linked**: `04-ux/08-component-spec.md` §8.3.

#### E2E-IME-escape: Composition cancellation preserves drafts

- **Steps**: Edit a user message; type a draft; dispatch composing Escape and Cmd/Ctrl+Enter. Open global search and dispatch composing Escape from its input. Repeat with legacy keyCode 229, then ordinary Escape and retry shortcuts.
- **Expected**: Composition events neither discard the edit nor close search nor submit a retry. Ordinary Escape still cancels/closes, including search focus outside its input; ordinary Cmd/Ctrl+Enter still retries.
- **Coverage**: `node scripts/e2e-ime-escape.mjs` exercises production components with bubbling DOM keyboard events and host-boundary fixtures. This does not verify an operating system IME candidate window.

### E2E-SCHEDULED-manual-to-hourly

- **Preconditions:** Built host candidate, isolated data directory, no provider.
- **Steps:** Through `tools.execute`, create a paused Manual task, update only
  its id and cadence to Hourly, rename it, restart, and list tasks again.
- **Expected:** Update succeeds without calendar fields; the next occurrence is
  one hour away. Prompt, paused state and saved configuration survive. Rename
  does not reset the interval. RPC tests also cover required Daily/Weekly times
  and retention of an existing custom schedule.
- **Specs:** 04-ux/01-ui-ia §3.3.
- **Acceptance:** C / F — task configuration and persistence.
- **Milestone:** Maintenance.
- **Status:** `node scripts/e2e-scheduled-hourly-update.mjs` exercises the real
  Rust host, permission path, stdio and SQLite; no model inference or desktop UI.

### E2E-SCHEDULED-manual-workspace-binding

- **Preconditions:** Built request candidate; isolated host data and two project
  directories. No provider credentials or paid API.
- **Steps:** Create Manual and Hourly tasks in project A and without a project;
  restart the host, switch to B, Run now, rename through the editor payload,
  and Run now again.
- **Expected:** Each result session and edited task retain the original binding,
  including no-project tasks. Legacy cadence-only tasks keep their previous
  fallback until explicitly configured (covered by host RPC tests).
- **Specs:** 04-ux/01-ui-ia §3.3.
- **Acceptance:** Saved workspace binding across run, edit and restart.
- **Milestone:** Maintenance.
- **Status:** Automated by `node --experimental-strip-types
  scripts/e2e-scheduled-workspace.mjs`, using production Electron dispatch and
  real Rust/stdio/SQLite. Only external inference is replaced with an observer.

### E2E-SESSION-temporary-attachment-fork: Preview and independent branch inputs

- **Steps**: In a task without a project, paste text above the long-paste
  threshold, send it, and click its transcript attachment. Return from the
  preview, create a branch, and open the same attachment in the child. Delete
  the source task and reopen the child attachment; branch the child again.
- **Expected**: Every preview shows the original saved bytes. Each branch path
  belongs to that branch's scratch input directory. No project is required, and
  no access to another task's scratch directory is granted. A bounded fork
  excludes later-only and unreferenced inputs.
- **Automation**: `scripts/e2e-composer-paste.mjs` covers long-text save, real
  Electron file read, temporary-task preview, and back navigation. Host tests
  `fork_preserves_referenced_pasted_files_independently` and `sessions::fork_files`
  cover ownership, deletion, repeated/bounded forks, retained checkpoint paths,
  expired inputs, rollback, and symlink rejection.

### E2E-SETTINGS-destination-scroll-reset

- Open Settings → Conversation and scroll midway down. Select Shortcuts: its title and
  first settings appear at the top. Scroll and return to Conversation: it starts at top.
- Re-select the active destination and update settings without navigating:
  the content keeps its scroll position.
- Repeat for built-in → plugin, plugin → plugin, and plugin → the previously
  selected built-in destination. Re-selecting a plugin keeps its position.
- Follow a global search setting anchor into Conversation from another
  destination, from an open plugin destination, and within Conversation: the
  plugin page is gone and the target row is visible before the next paint. Consuming the anchor keeps
  that position. An external tab change with no anchor also leaves the plugin
  and starts at the top.
- Run in light and dark themes.
- Automated coverage: `pnpm test:e2e:settings-scroll` mounts the production
  SettingsPage, store, translations, and built CSS in isolated Electron. Only
  preload data is stubbed; search navigation uses SearchDialog's public store
  entry points. The development UI path checks both destinations and their
  Experimental badge surfaces; `settings-developer-only-destinations.test.mjs`
  separately verifies packaged visibility/search and developer-only fallback.
  This covers
  renderer interaction, not host persistence or the
  full global-search dialog.

### E2E-SETTINGS-one-destination-one-subject

- **Scenario:** The D684 directory split. Every setting is reachable from the
  destination that owns its subject, and nothing is reachable from two.
- **Steps:**
  1. Open Settings. The rail lists Appearance, Conversation, Shortcuts, Voice,
     Behavior, Models, Instructions, Skills, MCP, Subagents, Projects, System,
     Cloud sync, Remote Hosts, Info, in four titled clusters.
  2. Visit Appearance: Interface (theme, language, font, font size, and on
     macOS translucency), Sidebar with its two indented sub-switches, Radial
     context menu, Startup. No network, storage, power or close-behavior card.
  3. Visit Conversation: Display (show thinking + sub-row, transcript display +
     sub-row, context usage, smooth streaming, inline visualizations) under one
     visible caption saying presentation only, then Input & links (enter to
     send, paste threshold, link open destination).
  4. Visit Behavior: Session defaults (default mode, permission mode, command
     shell), Execution (infinite retry, scheduled tasks), Computer use last.
  5. Visit System: Network, Storage, Power, and on Windows/Linux Close
     behavior.
  6. Search the rail for `theme`, `主题`, `proxy`, `scheduled`, `paste`, and
     `permission`. Each query surfaces exactly the destination that renders the
     row, and following a hit scrolls to and flashes that row.
  7. Change one setting on each of the four pages, close Settings, reopen it,
     and read the value back.
- **Expected:** No setting appears on two destinations and none is orphaned.
  Each page opens with its rail glyph at page scale, its title, and one
  subtitle line; the capability, model and project workbenches show their own
  description instead and no subtitle. A row's explanation is still only behind
  its help mark; the only always-visible explanatory line is a card caption.
  Persisted values are unchanged by the move — a profile written before the
  split reads back identically.
- **Automation:** `settings-general.test.mjs` pins the destination index, the
  per-page ownership, and the locale keys; `pnpm test:e2e:settings-scroll`
  exercises the rail, search anchors and per-destination scroll in Electron.
  `node scripts/e2e-storage-settings.mjs` opens System with a failed settings
  read, verifies its visible error and retry action, then restores the settings
  snapshot through retry before exercising storage controls and confirmations.

### E2E-SETTINGS-retired-destination-ids-resolve

- **Scenario:** A destination id written before the split still opens a page.
- **Steps:** With a profile or deep link selecting `general`, open Settings;
  repeat with `ai`. Trigger the native Settings menu item and the command
  palette's Settings entry.
- **Expected:** `general` opens Appearance and `ai` opens Behavior; neither id
  appears in the rail or in settings search. An unknown id opens Appearance.
  The content pane is never blank.
- **Automation:** `settings-general.test.mjs` asserts the resolution table, and
  `settings-developer-only-destinations.test.mjs` asserts the hidden-destination
  fallback uses the index's default rather than a literal id.

### E2E-SCHEDULED-dispatch

- **Scenario:** Independent task dispatch.
- **Expected:** The Electron runner admits independent due tasks without awaiting another task's prompt setup. Local in-flight ownership is keyed by task ID and Host instance until setup settles; Host remains authoritative for enabled, due and overlap checks. A replaced Host's completion cannot clear its successor's local ownership. Stop prevents new polls; admitted work keeps the existing execution/failure lifecycle. Failures remain observable and the 90-second late policy is unchanged.
- **Automation:** `node --experimental-strip-types scripts/e2e-scheduled-dispatch.mjs` uses an isolated real Host and SQLite profile. Inference is not sent to a live provider.
### E2E-SCHEDULED-project-removal

- **Scenario:** Project removal and automations.
- **Expected:** Removing a project pauses its bound scheduled tasks without deleting their definitions, schedule, workspace binding or run history. Session references in history may become null when the project's conversations are removed. Already admitted task runs block removal even before a conversation turn starts. Tasks belonging to other projects and unbound legacy tasks are unaffected. Explicit resume or Run now may recreate a project from the preserved path; automatic polling cannot do so while paused.
- **Automation:** `node --experimental-strip-types scripts/e2e-scheduled-project-removal.mjs` uses an isolated real Host and SQLite profile. Inference is not sent to a live provider.
### E2E-SCHEDULED-legacy-pause

- **Scenario:** Legacy task maintenance.
- **Expected:** Agent tools allow title, prompt and pause updates on legacy automatic tasks without a schedule, including an echoed unchanged cadence. These edits do not arm the task or capture the foreground workspace. Explicit enabling, a cadence change or a supplied schedule still follows schedule validation. Resume requires an explicit valid schedule; Manual-to-Hourly retains its existing default interval behavior.
- **Automation:** `node --experimental-strip-types scripts/e2e-scheduled-legacy-maintenance.mjs` uses an isolated real Host and SQLite profile. Inference is not sent to a live provider.
### E2E-SCHEDULED-calendar-intent

- **Scenario:** Calendar intent.
- **Expected:** The optional config_json.calendarConfigured boolean distinguishes an explicitly configured Daily/Weekly calendar from Hourly's internal schedule placeholder. Without the key, legacy Daily/Weekly schedules are treated as configured; legacy Hourly schedules retain their values but require an explicit schedule when converting to Daily/Weekly. Known calendar intent survives Hourly and restart, including midnight. Clearing or replacing the calendar with a different non-calendar placeholder clears intent. This additive extension needs no table/schema migration; older versions ignore it and cannot enforce the new conversion guard. Metadata-only edits and Manual-to-Hourly remain unchanged.
- **Automation:** `node --experimental-strip-types scripts/e2e-scheduled-calendar-intent.mjs` uses an isolated real Host and SQLite profile. Inference is not sent to a live provider.
### E2E-SCHEDULED-paths

- **Scenario:** Workspace identity.
- **Expected:** Stored workspace bindings use the existing project canonicalization contract on both write and read. On Windows, slash direction, case, trailing separators and extended path prefixes do not hide a task from its own project's conversation. The distinction between missing legacy bindings and explicit null remains unchanged. Foreign-project tools cannot list or mutate bound tasks.
- **Automation:** `node --experimental-strip-types scripts/e2e-scheduled-paths.mjs` uses an isolated real Host and SQLite profile. Inference is not sent to a live provider.
### E2E-SCHEDULED-cancelled-quit-keeps-runner

- **Scenario:** Cancelled quit and automatic runs (issue #2048, D363).
- **Expected:** An explicit quit that the user cancels in the quit confirmation leaves the app running with no `app shutdown` lifecycle entry and no scheduled-runner stop. A task that becomes due afterwards still runs automatically, and its `nextRunAt` advances. A later quit prompts again; Confirm runs the ordered shutdown, the process exits with code 0, and the runtime log records `scheduled runner stopped` exactly once. Only the shutdown handler listens to `before-quit`; services that must survive a cancelled quit stop through `onConfirmedQuit`.
- **Automation:** `pnpm test:e2e:scheduled-quit-cancel` (`scripts/e2e-scheduled-quit-cancel.mjs`) drives the built desktop, preload, real Host SQLite and agent sidecar over CDP in an isolated profile, clicking the in-app confirmation with real pointer input. Only the model is a local SSE fixture; the due instant is set through `configJson.nextRunAt` instead of waiting for the wall clock. Requires `apps/desktop/out` and a host-core debug binary.

### E2E-MARKDOWN-table-actions

- **Setup**: Render a conversation containing two Markdown tables, including
  aligned columns, formatted text, Chinese text, commas, quotes, and `<br>` cells.
- **Steps**: Copy the first table; download its CSV; expand it; use copy inside
  the modal; close with Escape and with Close. Append a streamed row while the
  preview is open. Repeat the preview at a narrow width in light/dark themes
  and English/Chinese. Deny clipboard writes at the browser boundary.
- **Expected**: Actions operate only on their own table. Markdown retains inline
  syntax and alignment. CSV decodes as UTF-8 and preserves fields and line breaks.
  The modal fits the viewport, traps focus, updates streamed rows, blocks native
  work-panel surfaces, and returns focus on dismissal. Narrow previews keep short
  headers on one line and scroll horizontally with visible scrollbars on
  overflowing axes; sticky headers fully cover the
  rows behind them. Failed copies report an
  error, not success. Existing table wrapping remains intact.
- **Automated coverage**: `node --test apps/desktop/test/markdown-table.test.mjs`
  and `node scripts/test-markdown-table.mjs` after building the desktop. The
  latter mounts the production Markdown component in an isolated Electron
  window and exercises real clipboard/download boundaries. It does not call a
  model or use the user's app profile.

## Hosted-search continuation contract (offline sidecar)

**Scope:** ADR 0297; provider-hosted search content, estimation, local tools,
Task delegation, and saved-history recovery. No real model or search service.

**Entry:** `pnpm test:e2e:hosted-search`, which rebuilds the shared
package and `@pi-desktop/agent-runtime` sidecar bundle. The test starts that
bundle over its ordinary stdio RPC interface, with an isolated data root,
a synthetic Host and a loopback-only Responses endpoint. Source-only mocks
or an already installed desktop application do not satisfy this test.

| Case | Required observation |
| --- | --- |
| Search then new user prompt | Valid search item is replayed and the second turn completes. |
| Search then ordinary local tool | A real tool round completes and the next provider request is prepared without type/estimation failure. |
| Search then Task | Actual delegation orchestration runs against a synthetic provider; parent continuation finishes without repeated local errors. |
| Saved search history restored | A fresh runtime preserves search replay without adding fake tool fields or rewriting the original record. |
| Usage invalidated by a real prefix change | The isolated sidecar changes instructions during a real Read round; the prior nonzero usage no longer covers that prefix, and continuation succeeds. |
| Invalid saved replay container | Restore returns safe INTERNAL/context-validation, sends no provider request or persistence Host RPC, and keeps the process healthy. In-memory immutability is checked by the replay unit tests. |
| Unknown saved search phase | The same explicit rejection is observed without silently discarding the search record. |

**Companion gates:** Responses/Azure/Anthropic/Codex adapter contracts; typed
search phases; zero/valid/stale usage; changed/unchanged system prefix and tool
ledger; search content growth and CJK output budgets; structured local
preparation failures without retry/fetch, ordinary transport retry and
cancellation. The Codex contract uses a synthetic JWT payload, captures the
request before fetch, proves opt-out omits the tool, and never contacts a
provider. Dependency upgrades must run these gates against the locked version
and record the tested bundle.

**Evidence:** record build and test exit codes, baseline SHA, dependency versions,
artifact identity and independent review in
`docs/project/hosted-search-contract-verification.md`. Never record private
conversation content or credentials. A skipped test remains NOT RUN, not PASS.

### E2E-HOOKS-cancel-and-dispose

- **Issue #816 extension:** Cancel a command while its prompt is visible and
  verify the real renderer removes the dialog, no later prompts or exec occur,
  and the next command/turn succeeds. The trusted-extension Electron driver
  checks the DOM via CDP. Runner tests cover long commands, stopped context waits,
  tool cancellation and late updates, detached header payloads and recovery;
  process tests use a real parent/child tree with readiness synchronization.

- **Preconditions:** An isolated Desktop profile, deterministic local provider,
  and a trusted plugin with a waiting preflight handler.
- **Steps:** Start a prompt; stop while the handler waits; release the old
  handler; send another prompt. Repeat with runtime disposal. Load another
  fixture with stalled startup/shutdown handlers and a deferred event.
- **Expected:** No provider request starts for the stopped/disposed prompt;
  the next prompt completes. Late results cannot restart work. Shutdown runs
  once, waits time out per handler, and deferred registrations are diagnosed
  without disabling supported handlers.
- **Specs:** 07-plugins/16 §6.
- **Acceptance:** Responsive cancellation and bounded extension lifecycle waits.
- **Milestone:** Hooks P0.
- **Status:** Runner and real Runtime/local-HTTP integration automated in
  `extensions/runner.test.ts` and `extensions/runtime-lifecycle.test.ts`.
  The trusted-extension Electron driver exercises the Stop path through the
  real renderer via CDP and records the visible and retired dialog states.
## Composer command source, manual compaction, and empty transcript reads (#795)

**Scope:** the composer's slash dispatch, the manual compaction RPC, and the
renderer's durable transcript reads. No real model or provider is contacted.

| Scenario | Expected |
| --- | --- |
| `/compact` typed while `composer/commands` fails | The submission is refused with `chat.slashCommandSourceUnavailable`, the draft survives, and no prompt reaches the session. The failed read is not cached, so the next submit retries it. |
| A warm command source | A builtin still dispatches locally, while a template and an unknown alias still travel as prompt text. |
| A manual compaction that outlives its transport deadline | The host re-reads the durable compaction record and reports success when a new checkpoint landed, logs the mismatch, and rethrows the timeout when none did. A verdict the sidecar reported itself is never reconciled. |
| A transcript window that reads empty for a session with history | The selection re-reads once, keeps the snapshot the user already has, and otherwise reports `chat.sessionTranscriptEmpty`; the empty page is never cached, so hover prefetch cannot re-serve it. |

**Automation:** `node --test apps/desktop/test/slash-command-source.test.mjs`,
`node --test apps/desktop/test/session-transcript-empty-read.test.mjs`,
`node --test apps/desktop/test/plugin-timeout-budgets.test.mjs`,
`pnpm --filter @pi-desktop/shared test`, and
`pnpm --filter @pi-desktop/host-runtime test`.

## E2E-PROVIDER-endpoint-guidance-and-search

- **Preconditions:** Isolated Electron/Chromium, production provider form,
  synthetic provider responses; no live keys or services.
- **Steps:** Open an existing DeepSeek, xAI and legacy OpenAI Completions entry.
  Check search directly, cancel, reopen, check and save, reopen, uncheck and save.
  Apply format advice on relay `/responses` and `/messages` operation URLs.
- **Expected:** One service entry and one checkbox; no separate search preset or
  interface-switch action. Save changes only the model opt-in, retaining URL,
  format, name, key and other model settings; Cancel writes nothing. A selected
  explicit format wins over hostname defaults. Relay advice preserves origin.
- **Specs:** 03-runtime/12 endpoint guidance; 03-runtime/11 search setup guidance;
  ADR 0297 official-route amendment.
- **Acceptance:** English/Chinese interaction flows and the previous custom and
  Codex account paths pass. Real adapter contracts verify opt-in request routes,
  credentials and search tools. A DeepSeek conversation continues off/on/off,
  retains prior text, and does not replay encrypted search blocks to Completions.
- **Milestone:** Provider configuration maintenance.
- **Status:** `pnpm test:e2e:provider-api-style` and
  `official-native-search.test.ts`; shared route tests reject lookalike hosts,
  unsafe URLs and unknown gateways. The UI fixture does not prove Host/SQLite
  persistence or live provider availability.

#### E2E-260: Windows updater cache can be relocated and reclaimed safely

- **Preconditions:** Packaged Windows x64 NSIS install, isolated user profile, and a writable cache directory on a non-system volume. Use a local updater-feed fixture; do not contact GitHub or a paid service.
- **Steps:** 1) Seed the legacy `%LOCALAPPDATA%` updater cache with `installer.exe`, `current.blockmap`, and a staged update. 2) Launch with `PI_DESKTOP_UPDATE_CACHE_DIR` set to the isolated cache base. 3) Confirm Main adopts the baselines and staged update into the configured cache and removes the legacy cache. 4) Complete the staged update and launch the new version. 5) When the fixture reports no newer version, inspect the configured cache.
- **Expected:** `app-update.yml` determines the cache subdirectory; the pending update and differential baselines survive relocation; when the running version is current only `pending/` is removed, while `installer.exe` and `current.blockmap` remain for the next delta. The default path remains unchanged when the override is unset. The app does not write the download into `Program Files`.
- **Specs:** `03-runtime/07-process-model.md`, ADR 0022.
- **Acceptance:** Cache-path, migration, and cleanup unit tests pass; Windows task-candidate validation confirms the updater feed transport, installer handoff, and filesystem behavior without a live release feed.
- **Milestone:** M6+
- **Status:** Unit and source-contract covered (`update-cache.test.mjs`, `auto-update.test.mjs`); Windows installer/E2E validation remains required.

## E2E-OAUTH-pi-installation-identity-and-standalone-load

- **Preconditions**: Pi 1.1.0; temporary Host secrets and account fixtures;
  network/browser/callback I/O mocked; no user account or paid service.
- **Steps**: Run `installation-identity.test.mjs`, `vendor-oauth-login.test.mjs`
  and `oauth-standalone-bundle.test.mjs` under `apps/desktop/test`.
- **Expected**: One lazy, persisted UUID per installation; failed persistence
  never reaches login and is retryable. Multiple same-vendor accounts retain
  separate credentials. The standalone bundle executes the actual ChatGPT and
  Meta OAuth flows from outside the repository with empty `NODE_PATH`, including
  PKCE, callback validation and token conversion. Legacy Codex credentials remain
  unchanged; account deletion leaves the installation identity and other accounts.
- **Acceptance**: Offline identity/account/module-loading contracts pass.
- **Status**: Offline integration covered. Installed Electron artifact loading,
  Anthropic/Codex/Copilot flow execution and final migration packaging NOT RUN.

## E2E-PI-0991-account-operations-and-usage

- Scope: pi-ai and pi-agent-core; coding-agent design review is reference-only.
- Offline provider/catalog flows preserve same-vendor account isolation, live
  entitlement, unavailable-account errors, relay matching and explicit overrides.
- Native Pi image operation contract tests cover generations/edits, cancellation,
  downloads, multiple artifacts, text/response IDs and physical usage provenance.
- Shared/Main/Host tests replay parent, delegate and image records, including late
  old-turn usage, and assert one ledger entry per physical operation.
- Production sidecar hosted-search E2E covers seven scenarios with offline
  providers, delegation and persisted restore. Standalone OAuth tests execute
  actual login modules outside the repository with mocked external I/O.
- Installed Electron, real account/paid API and cross-version rollback are
  separate release qualification. No MCP, Codemode or virtual-router migration
  is included. See `docs/project/pi-0991-adoption.md` for candidate evidence.

### E2E-SYSTEM-TRANSCRIPT: Ordered model state survives restart and compaction

- Fixture: isolated Host data directory, production AgentSidecar transport and
  separate Node runtime/Pi process, local SSE provider; no real provider
  credentials or user's Desktop process. The harness persists completed
  messages; it does not exercise Electron's UI or persistence outbox.
- Send a prompt, activate BrowserPreview through ToolSearch, and verify the next
  request includes the schema. Confirm the baseline and delta are acknowledged
  by Host and survive stopping/restarting both processes without duplicate rows.
- Resume the session, update a skill catalog on the same runtime, and confirm the
  next request uses the new catalog while keeping a second unchanged entry.
  Runtime/adapter tests verify the native delta contains only the modified entry,
  and fallback models receive the complete current catalog with removals applied.
  Invoke Skill through the actual sidecar
  bridge with a fixture body supplied by the embedding host. Compact, restart
  the sidecar, and verify current skills and active tools survive without
  replaying old tool results. Remove the final skill and verify its catalog and
  executable schema disappear without recreating the runtime.
- Automated: `node scripts/e2e-system-transcript.mjs` with
  `PI_DESKTOP_HOST_BIN` pointing to the candidate Host binary. Requires built
  shared/host-runtime/agent-runtime packages. Renderer projection tests ensure
  model-state records stay hidden while ordinary system notices remain visible.
- Adapter contract tests cover exact model/API/endpoint capability binding,
  partial support, unverified relay fallback, removals/redefinitions and model
  switching without canonical-history mutation. Real cache-hit improvement is
  a separately authorized provider experiment, not an offline-test claim.

- Flash regression: load the pinned Pi `deepseek-flash` model, serialize its
  Desktop projection, and pass skill updates/removals through the real adapter.
  The official binding preserves the earlier wire prefix; changed bindings
  retain the folded fallback. Covered by `flash-transcript.test.ts`.
- Authorized live Flash acceptance: use isolated development sessions with
  short and long contexts. Alternate unchanged turns and single-skill updates,
  confirm current Skill bodies execute, and compare actual outgoing prefixes
  plus reported usage. After restart, verify no duplicate system updates and
  same-model assistant reasoning remains separate from visible content. Adapter
  regressions also cover legacy identities and genuine account/model changes. Cache
  percentages are observations, not deterministic pass thresholds.

### E2E-FIXED-TOOL-DECLARATIONS: Stable Flash schemas with independent activation

- Fixture: production AgentSidecar and isolated Host, official Pi Flash binding,
  and a child-process fetch boundary redirected to local HTTP/SSE. Credentials
  are dummy values and synthetic tools have no external side effects.
- Prompt, search Alpha, execute Alpha, search Beta and execute Beta. HTTP payload
  tests assert identical ordered `tools` and unchanged prior message prefixes.
  Directly calling a declared but inactive tool must fail before the Host.
- Restart both processes, then compact and restart again: Alpha stays activated,
  Beta remains inactive despite its declaration. Activate Beta, then remove it
  from the catalog and verify it cannot execute. New schema/route epochs must
  not restore old grants. Host rejection and Plan guards remain effective.
- Runtime contracts additionally cover legacy migration, interrupted activation,
  malformed metadata, temporary prompt replacement, deterministic catalog order,
  the 128-tool boundary and insufficient-context fallback.
- Automated: `node scripts/e2e-fixed-tool-declarations.mjs` with built
  shared/host-runtime/agent-runtime and `PI_DESKTOP_HOST_BIN` set to the candidate
  Host binary; `fixed-tool-runtime.test.ts` and `fixed-tool-declarations.test.ts`
  cover HTTP payload and policy contracts. Electron UI/outbox is outside this
  fixture's scope.
- Separately authorized official Flash experiments compare several independent
  on-demand/fixed sessions with the same synthetic catalog and call sequence.
  Record cold requests, both activations, follow-up cache hits/misses and
  cumulative input cost. Report the larger first request and possible short-chat
  cost increase, alongside any longer-conversation benefit. Offline test success
  alone is not evidence of provider cache behavior.

- Overflow/system-update integration: recover a provider context overflow with
  a system delta after the failed assistant message. Keep that delta, remove the
  failed assistant before compaction, and reuse one visible assistant message
  through successful recovery. Terminal failure and Stop retain their existing
  closure behavior. Covered by the parameterized runtime overflow user-path test.


#### E2E-262: Transcript positioned file references open and scroll the host file viewer

- **Preconditions:** Isolated Electron/Chromium, an active workspace and session,
  the bundled file-manager view available, and deterministic filesystem IPC
  fixtures.
- **Steps:** Render a real transcript `path:line-range` reference followed by
  sentence punctuation; click its verified file chip and wait for the host file
  viewer to load. Unit coverage also exercises `path:line:column` and GitHub
  `path#Lline[-Lend]` references.
- **Expected:** Despite the bundled file-manager view being available, the
  positioned reference opens in the host's read-only file tab. The file request
  retains the range's starting line, and the viewer scrolls that line into the
  visible center area. The path and file contents remain the same as the
  reference target.
- **Specs:** `04-ux/08` §11.8; ADR 0262.
- **Status:** `node scripts/e2e-file-ref-line-scroll.mjs` mounts production
  `LinkifiedText` and `FilesTab` in isolated Electron with filesystem IPC
  fixtures; no real project files or provider are used.

#### E2E-263: Collapsing a project resets its loaded session history

- **Preconditions:** One retained project has at least twelve unpinned sessions,
  and its group can be expanded in the sidebar.
- **Steps:** 1. Expand the project and confirm the latest ten sessions plus a
  Load more control are visible. 2. Click Load more and confirm all twelve
  sessions appear. 3. Collapse the project, then expand it again. 4. Inspect the
  visible sessions and the Load more count.
- **Expected:** Reopening the project shows only the latest ten unpinned
  sessions, and Load more reports the two hidden sessions. The collapse clears
  only that project's loaded-more state; session selection and other project
  groups remain unchanged.
- **Specs:** `04-ux/08-component-spec.md` §3.9;
  `04-ux/09-interaction-patterns.md` §1.6.
- **Acceptance:** C / D / Quality.
- **Milestone:** Post-MVP maintenance.
- **Coverage:** `scripts/e2e/sidebar-row-states.mjs` exercises the full user path
  with a host-seeded project and real CDP pointer clicks. The unit test
  `sidebar-project-sessions.test.mjs` covers the initial page, Load more,
  collapse reset, and project isolation. `app-store-sidebar.test.mjs` checks
  that sidebar collapse and Load more use those transitions.

### Imported-extension GUI executable discovery regression (#1173)

Start dependency installation with a GUI-like PATH that cannot resolve Node/npm
and a trusted fixture installation in `~/.local/bin`. Validation and both npm
stages must use that installation, preserve the application PATH, and avoid shell
startup probing. Explicit selections keep their bin directory first. Missing
installations still return `npm-unavailable` and retain native picker recovery.
The executable integration fixture uses real isolated child processes and checks
registry-only installation and credential isolation.


#### E2E-CHAT-subagent-parent-error-resume

- **Preconditions**: Built agent runtime and a loopback provider fixture; real
  Agent, SDK transport, Task/TaskStop and delegate history. Host Read is a fixture.
- **Steps**: Spawn two delegates, let each finish a Read, then leave both provider
  streams active. Fail the parent request, send a later prompt with both resume
  ids, and inspect the resumed requests. Repeat with user Stop and TaskStop.
- **Expected**: Parent failure returns the session to idle; both delegates settle
  failed with SUBAGENT_PARENT_FAILED and resume with their own prior Read context.
  Explicit Stop/TaskStop produce aborted/stopped; both resume attempts are rejected
  without starting another delegate. No automatic restart occurs.
- **Specs linked**: 03-runtime/02-agent-runtime.md §5f; ADR 0279.
- **Acceptance**: C, E, Quality. **Milestone**: Maintenance.
- **Status**: Automated headless runtime/provider integration via
  `node scripts/e2e-subagent-parent-error.mjs`; no real accounts or Desktop data.
  Runtime tests separately cover exhausted parent 429 and Stop racing settlement.


#### E2E-PLAN-HISTORY: Immutable submissions retain current status in chat

Run `node scripts/e2e-plan-history.mjs` against the committed candidate host.
Use an isolated Electron profile/workspace and the production session IPC,
preload, API normalization, store events, ToolRow, and Markdown renderer.

1. Submit Plan and read a capped history page: expand the full Markdown and
   open its exact artifact path in the owning session's work panel.
2. Approve and deliver a stale pending tool echo: history still says approved.
   Cover approval-before-message and inactive retained-session events.
3. Complete execution, submit/reject a revision, and read both newest/older
   pages: retain both exact bodies and statuses, mark only the older Plan
   superseded, and leave unrelated sessions/Goal untouched.
4. Submit/reject Goal and check localized Chinese status.
5. Continue chat, append a compaction checkpoint, restart host and renderer:
   both versions remain readable; no historical card has approval controls.

No provider credentials or paid model calls are required. The fixture ends at
work-panel file-request routing; artifact bytes are verified from the real
host-created files. The full app's file-preview viewer is covered separately.


## Composer recent chat models

- Send accepted messages using four distinct configured chat models across providers. Open the combined
  model menu: the Recent source is selected and lists the latest available pairs
  (up to six) in recency order, with provider labels. Select an older recent row: order stays unchanged until
  a message is accepted, at which point that model moves first.
- Search immediately; results span every provider and the rail selection is
  released; choose using keyboard navigation. Choose a provider in the source
  rail and verify each of its models appears once. Move from a recent row to the
  rail, and tab out of search after arrow navigation: no stale keyboard
  highlight remains on a model row. Without history and with one provider, the
  rail is hidden and all configured models are directly visible. With a
  search typed, Escape clears it and keeps the menu open; a second Escape
  closes the menu. Verify thinking
  defaults still follow the selected binding and manual same-model levels survive.
- Create a new chat: it inherits the last actually used model. Reload local preferences
  and create another chat: the same binding is restored. An existing chat keeps
  its own binding, including when opened after a different model was used.
  Opening an old chat or changing a model or reasoning alone does not alter history.
  Send in an older chat: accepted submission updates new-chat inheritance;
  rejected submission does not. Deferred configuration alone does not count
  as usage.

- **Preconditions:** Isolated Electron profile, fake Host IPC/secret storage,
  and a `globalThis.fetch` fixture for `https://api.typesafe.ai/v1/systemone`.
  Build workspace JS packages with `pnpm build:js`, then run
  `pnpm test:e2e:jev`. Do not use a real TypeSafe key or endpoint.
- **Steps:** 1) On the service chooser's add path, confirm Jev is offered in
  its own Classifiers group and absent when an existing row changes service,
  and that no Jev card is on the model configuration page yet. 2) Open the Jev
  form, paste a sentinel key and Check and save: the fixture answers the check,
  the key reaches Host secure storage, Jev is on, and the card appears. Confirm
  AI services (with catalog status and refresh) precede Jev and image generation,
  and that the card's privacy explanation is available from its heading help
  control instead of as a persistent paragraph.
  3) Resolve a session launch with Jev enabled, then disabled and in Plan mode.
  4) Through the runtime's deferred catalog, request Jev in Agent mode and
  inspect Plan/Goal catalogs. 5) Call `JevClassify` with one choice, one score
  and one boolean question over a small JSON state. 6) Answer a check with 401
  for a second key: nothing is written and Jev stays off. 7) Start a check and
  close the dialog while it is still in flight: the key is not stored and Jev
  stays off. 8) In the Jev card, switch Jev off and remove the key; the card
  leaves with it.
- **Expected:** The check runs before any write, in the order check, store, then
  enable, so a refused key leaves no secret and no enabled setting behind, and
  the refusal is reported with TypeSafe's status. The card is on the page only
  once Jev has been added, and it leaves when the key does. The UI never returns
  the key to settings state, and removal disables Jev before deleting it. Only
  the Jev title, key status and controls occupy the card; explanatory privacy
  copy appears on demand from the heading help control. AI services stay above
  Jev, followed by image generation. An enabled Agent launch reads the key and
  passes it ephemerally to the sidecar.
  `JevClassify` appears in the Agent's deferred catalog only with a key and
  never in Plan or Goal. Closing the dialog cancels an in-flight check the same
  way a refused key does: nothing stored, nothing enabled. The fixture receives
  the TypeSafe System One payload and bearer header; the tool returns bounded
  structured answers and usage.
- **Specs:** [Tools and permissions](../03-runtime/03-tools-and-permissions.md),
  [provider/model system](../03-runtime/11-provider-model-system.md),
  [secrets storage](../03-runtime/14-secrets-storage.md),
  [settings IA](../04-ux/06-settings-ia.md).
- **Acceptance:** No paid or real-provider call. The suite verifies the UI user
  path, the ordered check-then-store gate, the refused-key path, the fixed
  secret reference, opt-in Agent launch boundary, deferred mode catalog,
  request body, bearer auth, usage, error redaction, cancellation, timeout,
  malformed and oversized input rejection, and key removal.
- Disable/remove a provider or model and mark a model for image generation:
  unavailable history entries are skipped for inheritance and recent menu rows.
- Settings contains no fixed chat-default picker or Make default service action;
  image model selection and provider configuration remain available.
- Coverage: recent-models.test.mjs, recent-model-flow.test.mjs,
  default-model-picker.test.mjs, and scripts/e2e-composer-model-selection.mjs.


#### E2E-CHAT-subagent-direct-stop

- Environment: isolated Desktop profile, real Main/sidecar/Host and a local
  streaming provider fixture; no real API account or user data.
- Start two delegates, open A's detail panel and stop A. Verify B and the parent
  remain active, A's partial output remains readable, and no model request was
  needed. Stop all from the group header; B stops and the parent remains active.
- Terminal cards remove their Stop controls and persisted Task snapshots record
  `stopped`. An empty explicit ID list is rejected rather than stopping all.
- Run `node scripts/e2e-subagent-stop.mjs`. Runtime tests additionally cover
  cross-session isolation and uncooperative cancellation remaining pending;
  `e2e-subagent-parent-error.mjs` covers explicit cancellation/resume semantics.

## BOM-marked UTF-16 text tools

- Create a UTF-16LE PowerShell build log with a BOM and CRLF, then ask the agent
  to Read it. The tool and the next model request contain readable log lines.
- Edit a displayed line. The original BOM, endian and CRLF bytes are preserved.
- Repeat with UTF-16BE Chinese text. Ordinary binary files remain rejected.
- Automated coverage: `read_powershell_utf16le_log`,
  `read_and_edit_utf16be_chinese_text`, and the existing binary/CRLF tool tests.


## Delegate mutation recovery isolation

- Start two Task delegates editing the same file. Delegate A produces text and
  fails three Edits; B fails twice and then completes. A is failed with
  `MUTATION_RETRY_BUDGET_EXHAUSTED`, B completes, and the parent has no mutation
  error. Resume A with a corrected task and verify successful completion.
- Run the same flow with failing shell patch commands. Repeat with one delegate
  to prove that text preceding exhaustion does not become a completed report.
- While a delegate continues, a new parent prompt resets only the parent's
  recovery counters. Both default and explicit delegate permissions retain the
  same isolation.
- Automated provider-boundary flow: `node scripts/e2e-subagent-edit-isolation.mjs`
  with optional `--single` and `--patch`; runtime tests cover parent restart.


## Mutation recovery file aliases

- Retry a failing Edit using relative, absolute, `.`/`..`, directory-link and
  Windows case-alias spellings of the same existing file. The third counted
  failure terminates; changing spelling does not grant another recoverable-code
  grace. Distinct files retain independent budgets.
- Successfully Edit or Write through an alias and retry: the count and grace
  reset. Removing the file through a linked path clears its pre-mutation identity.
- Repeat relative/absolute aliases in a temporary session: its scratch root is
  the relative base. Probe the directory's actual case sensitivity: distinct
  case-sensitive files remain separate, while case aliases share an identity.
- Automated filesystem/runtime boundary coverage: `runtime.test.ts` and
  `mutation-recovery.test.ts`; no UI, production profile or real provider is used.

## Regenerate archival during quit

- Regenerate a completed answer and quit as soon as the terminal event arrives.
  Restart the isolated profile: both revisions and their final messages remain
  readable, and no `host-core disposed` archival failure appears in the logs.
- Hold the archive RPC while requesting quit. Host disposal waits for successful
  archival; storage errors are logged. An unresponsive archive warns and allows
  quit after the existing two-second bounded wait.
- Automated coverage: `shutdown-regenerate-persistence.test.mjs` and
  `node scripts/e2e-regenerate-quit.mjs` (built Desktop, sidecar and host required;
  Playwright can be supplied through `PI_TEST_PLAYWRIGHT`). Only the model server
  is simulated in the Electron flow. The fixture profile and screenshots stay
  under `.artifacts/` for inspection; no user profile or paid model is used.

### E2E-COMPOSER-configured-context-window

- **Steps:** Save a 500K user context limit for a model whose catalog publishes 1M. Open the Composer model list, then send a short message and inspect context usage. Repeat with a catalog-owned limit and with discovery unavailable.
- **Expected:** The user-configured row and context inspector show 500K; a catalog-owned row follows the published limit; a configured model without discovery retains its saved context label. Model selection remains unchanged.
- **Status:** Automated unit regression in `apps/desktop/test/composer-models.test.mjs` covers user overrides, catalog inheritance, and missing discovery; the full save → picker → message → context-inspector path remains a manual validation scenario.

### E2E-PLUGIN-automatic-jsx-activation

- Preconditions: a granted renderer plugin whose compiled entry imports
  `react/jsx-runtime` or `react/jsx-dev-runtime`, with React externalized to the
  host.
- Steps: activate production and development entries through the host import
  map; render automatic JSX components that read a host context with a hook.
- Expected: both entries resolve and render the supplied context value without
  bundling a second React instance. Legacy React bindings remain unchanged.
- Automated regression: `apps/desktop/test/plugin-renderer-import-map.test.mjs`
  evaluates the generated shims and renders an automatic JSX component using
  the host hooks and context. Isolated Electron coverage uses
  `scripts/e2e-plugin-jsx-runtime.mjs`; no user profile or provider is used.

### E2E-264: Reopening an archived project restores sidebar visibility

- **Preconditions**: A durable project group exists for a local folder and can
  be archived through the renderer-owned sidebar preferences.
- **Steps**:
  1. Archive the project and confirm its row is hidden from the default
     sidebar but remains available in Settings → Project archive.
  2. Use the project's Open action in Project archive.
  3. Archive it again, open Add project, select the same folder, and create.
  4. Archive it again and open one of its sessions from Project archive.
- **Expected**: Each successful activation clears the path's archived
  presentation state, returns to chat, and makes the project visible in the
  sidebar. Selecting an inspector row without activating it and ordinary
  session refreshes leave the archive state unchanged. Reopening the same
  folder reuses the existing group without duplicating project or session data.
- **Specs linked**: `04-ux/06-settings-ia.md`,
  `04-ux/09-interaction-patterns.md`, ADR 0294, D659, issue #1653.
- **Acceptance**: Renderer project activation restores the normalized path's
  local archive metadata only after the host project activation succeeds.
- **Status**: Source-contract coverage in
  `apps/desktop/test/app-store-sidebar.test.mjs` and
  `apps/desktop/test/project-create-dialog.test.mjs`; full UI scenario remains
  Draft and is run only when explicitly requested in a capable environment.

### E2E-266: Project headers show running activity while collapsed

- **Preconditions**: At least two local project groups with sessions, one of
  them with a running turn (and optionally a session waiting for a
  permission prompt), plus a connected remote host group with a running
  session. Settings → Appearance → Sidebar switches are at their defaults.
- **Steps**:
  1. Start a turn in one project and collapse that project group.
  2. Inspect the collapsed header, then expand it again.
  3. Start a second concurrent turn in a different project and a turn in the
     remote host's project.
  4. Open Settings → Appearance → Sidebar and turn off **Show running activity
     on projects**, then re-check the sidebar.
  5. Turn the master switch back on and turn on **Activity rail**.
  6. Turn off **Count badge** only and re-check; turn it back on.
  7. Turn off **Activity rail** only and re-check; turn it back on.
  8. Enable the OS "reduce motion" setting and re-check the rail.
- **Expected**: A project with live work marks its header — the collapsed
  header shows only the count badge by default; the activity rail is off.
  Running and permission-waiting counts are separate figures and never merge
  into one number. The remote host group shows the same default. Turning on the
  activity rail displays it alongside the badge, while the counts stay in the
  badge alone; with the badge switched off the rail takes them over, so no
  group ever shows the same figure twice. The master switch removes
  both affordances at once and leaves the two sub-switches disabled while
  retaining their stored value, so
  re-enabling the master restores the previous choice. Each sub-switch hides
  only its own affordance. Under reduced motion both affordances stay visible
  with their animation removed. Settings persist across a renderer reload.
- **Specs linked**: `04-ux/01-ui-ia.md` §3.2, `04-ux/06-settings-ia.md`
  (General → Sidebar card).
- **Acceptance**: The "is anything running under here?" answer is available
  from a collapsed project group, and each affordance can be switched off
  independently through a persisted setting.
- **Status**: Draft. Existing unit coverage in
  `apps/desktop/test/sidebar-project-runs.test.mjs` covers count
  classification, master/sub-switch gating, both render call sites, and
  theme-token and reduced-motion guarantees. It does not exercise settings
  API default normalization or the full interaction; those remain manual
  validation in a capable environment.

### E2E-267: A plugin follows the selected session and opens its own view

- **Preconditions**: A development plugin that declares one
  `contributes.views` entry and holds `ui.view`, and whose command calls
  `pi.session.getActive()`, subscribes to `pi.events.on("session:activated")`,
  and then calls `pi.ui.revealView({ location: "src/App.tsx" })`. Two sessions
  exist in different projects; one of them is running a turn.
- **Steps**:
  1. Select the idle session and run the plugin's command.
  2. Switch to the other project's session and start a turn; re-check the
     payload the plugin reported.
  3. While that turn runs, run the plugin's command and inspect the work panel.
  4. Switch to the first session, then run the plugin's command again from a
     stale reference to the previous session id.
  5. Disable the plugin and re-open the same work-panel tab.
- **Expected**: `pi.session.getActive()` answers with the session on screen, its
  project path, and `activeTurn: null` while it is idle. `session:activated`
  arrives once per real change — a selection switch, a project change, and the
  turn starting or finishing — and the running session reports the durable
  `turnId` with its start time rather than an inferred one. `pi.ui.revealView`
  opens the plugin's view as a work-panel tab of the active session and focuses
  it, and the view receives `src/App.tsx` through `piViewOpen`/`view:open`
  without being reloaded when it is already open. A call naming a session the
  user left fails with `INVALID_ARGUMENT` and opens nothing. Revealing without
  `ui.view` fails with `PERMISSION_DENIED`. With the plugin disabled the tab
  reports the missing view instead of showing stale content.
- **Specs linked**: `07-plugins/03-plugin-api.md` §ui, §session follow, §5
  events, §6 panel bridge; ADR 0331.
- **Acceptance**: A plugin can follow the selected session and show its own view
  beside it without importing host internals, and a stale session can never be
  revealed onto a panel the user is no longer looking at.
- **Status**: Draft. Unit coverage in
  `apps/desktop/test/plugin-session-follow.test.mjs` (snapshot assembly,
  announcement deduplication, stale-turn and stale-session refusal,
  `ui.view` gating, panel-bridge channel) and the wiring contract in
  `apps/desktop/test/main-wiring-contract.test.mjs`; the interactive Electron
  scenario remains a manual validation run.

### E2E-268: A plugin reads and rewrites a session the user created

- **Preconditions**: A development plugin that declares
  `session.read.all`, `session.update.all`, and `session.delete.all`, and whose
  commands call `pi.session.list()`, `pi.session.get()`,
  `pi.session.listMessages()`, `pi.session.rename()`,
  `pi.session.appendMessage()`, `pi.session.replaceMessages()`,
  `pi.session.deleteMessage()`, and `pi.session.truncateFrom()`. One ordinary
  session the user created and typed two prompts into, plus the same manifest
  edited down to only the `.own` grants.
- **Steps**:
  1. Install the `.all` build and run each read command against the user's own
     session.
  2. Run `rename`, then check the session title in the sidebar and whether the
     auto-title plugin can still rename it.
  3. Run `appendMessage` while the session is idle, and again while a turn is
     running.
  4. Run `replaceMessages`, `deleteMessage`, and `truncateFrom` on the same
     session, watching the open transcript between calls.
  5. Reinstall the `.own`-only build and repeat steps 1 and 4, including a call
     that passes `scope: "all"` itself.
  6. Check the app log for one audit line per call.
- **Expected**: With `.all`, `list` returns the user's session with
  `originKind: "created"`, `source: "desktop"`, `externalId: null`, the real
  `modelId`/`providerId`/`bound.model`, and messages reporting
  `origin: "desktop"`; `get` and `listMessages` agree with it. `rename`
  succeeds and the auto-title plugin can no longer replace that title.
  `appendMessage` adds one row while idle and returns its `messageId`; a repeat
  with the same id adds nothing. While a turn runs, `appendMessage` still
  appends and the three transcript rewrites fail with `TURN_RUNNING`.
  `replaceMessages` and `truncateFrom` repaint the open transcript without
  reselecting the session, `deleteMessage` on a user prompt removes the prompt
  and its replies, and a repeated delete reports `deleted: false`. With `.own`
  the same session is `NOT_FOUND` for every call, nothing in the transcript
  changes, and the plugin's own `scope: "all"` is ignored — the call still runs
  as `own`. Every audited line names the scope that authorised it.
- **Specs linked**: `07-plugins/03-plugin-api.md` §plugin-owned and host-wide
  sessions; `07-plugins/13-plugin-permissions-matrix.md` §2;
  `07-plugins/04-plugin-security.md` §5; ADR 0340, ADR 0200 (amendment).
- **Acceptance**: A plugin that declares the `.all` grants can read and rewrite
  the user's own conversations, the user sees the result in the open transcript,
  and a plugin that declares only `.own` keeps exactly the ADR 0200 reach.
- **Status**: Draft. Host-core coverage in the `plugin_sessions` and
  `plugin_session` tests, broker policy in
  `apps/desktop/test/plugin-session-access.test.mjs`, and the plugin-process
  path in `apps/desktop/test/plugin-session-api.test.mjs`; the interactive
  Electron scenario remains a manual validation run.

### E2E-FAST-MODE: `/fast` asks for the priority tier only on an allowed model

- **Preconditions**: A ChatGPT subscription (Codex) account and a Responses
  API-key provider, each with two configured models. No real provider is
  required for the automated path; the manual path uses a capturing local
  endpoint or the user's authorized account.
- **Steps**:
  1. In Settings → Models, check **Fast mode** on one model of each provider.
     Confirm the checkbox is disabled on a Chat Completions provider.
  2. Start a new task on the allowed Codex model, type `/fast`, send a prompt.
  3. Send `/fast` again, then send another prompt.
  4. Switch the session to the model without the opt-in and send `/fast`.
  5. Fork the session while Fast is on; restart the app and reopen both.
- **Expected**: Step 1 persists `fastModeAllowed` on the binding only. Step 2
  shows the Fast mark on the model chip and the request body carries
  `service_tier: "priority"`; a Responses API-key model shows the per-token
  price toast instead. Step 3 clears the mark and the field. Step 4 refuses
  with the model-settings hint and stores nothing. Step 5 keeps the switch on
  the fork and across restart. Subagent and compaction requests never carry
  the field. Remote sessions refuse `/fast`. A trusted extension that switches
  the session to its own Responses model sends its next request without the
  field.
- **Specs linked**: `03-runtime/11-provider-model-system.md`,
  `03-runtime/04-data-storage.md` (v27), `04-ux/04-builtin-commands.md`,
  ADR 0334, issue #1657.
- **Status**: Automated coverage: `apps/desktop/test/fast-mode-command.test.mjs`
  (draft → created session, toggle, refusals, remote, chip),
  `apps/desktop/test/fast-mode-session-launch.test.mjs` (launch resolution),
  `packages/agent-runtime/src/fast-mode.test.ts` (request body through the real
  pi-ai Responses and Completions adapters),
  `packages/agent-runtime/src/fast-mode-reuse.test.ts` (mid-session switch on a
  reused runtime; an extension model switch drops the tier), host-core
  migration, RPC and fork
  tests. The full settings → `/fast` → captured request path is a manual
  validation scenario.

### E2E-PROVIDER-optional-client-certificate

- **Preconditions:** The locked Electron 43 runtime, built workspace packages,
  and an isolated profile. Only a local HTTPS fixture and local proxy are used;
  trust is confined to the test process/session and fixture certificate.
- **Steps:** Run `node scripts/e2e-provider-client-certificate.mjs`. Confirm one
  real `net.fetch` fails or stalls before HTTP. Replay that isolated fixture
  failure for subsequent probes to avoid a second Chromium TLS handshake, then
  exercise model discovery and connection through the real metadata fallback;
  repeat with an invalid fixture key and an authenticated custom HTTP proxy.
  Return a cross-origin redirect, then cancel a pending response.
- **Expected:** Valid credentials return the fixture model; invalid credentials
  reach HTTP 401. The retry follows the proxy route, sends no client identity,
  refuses cross-origin redirects and aborts with the original signal.
- **Security coverage:** `provider-https-metadata.test.mjs` additionally checks
  mandatory client authentication, untrusted server certificates, hostname
  mismatch, compressed responses, and late-tunnel cleanup. The metadata policy
  tests reject fallback on other TLS/network errors or HTTP failures.
- **Specs linked:** `03-runtime/07-process-model.md`,
  ADR `provider-metadata-client-certificate-retry`, issue #1676.
- **Acceptance:** Recovery without an Electron major upgrade, TLS verification
  bypass, direct proxy bypass, or change to persisted provider bindings.
- **Milestone:** Maintenance.
- **Status:** Automated fixture; record the tested head/base and execution
  result in the delivery report.

#### E2E-1175: A plugin suggestion rides in the Composer placeholder and is taken with Tab

- **Preconditions**: A plugin that declares `composer.suggest` is installed,
  enabled, and granted the permission, and it offers one line on
  `session:turnEnded` after its own completion.
- **Steps:** 1) Run an Agent turn in a session and let it complete while that
  session is on screen and its Composer is empty. 2) Observe the placeholder
  layer. 3) Press Tab. 4) Repeat, then press Esc. 5) Repeat, then type one
  character. 6) Repeat, then switch session before the offer arrives.
- **Expected**: The suggestion appears in the placeholder layer of an empty
  draft, brighter than the shell placeholder and on one line with an ellipsis,
  with a `Tab` / `Esc` hint and one polite announcement. Tab writes the exact
  text into the draft with the caret at the end and the input focused, keeping
  any staged attachment; Esc drops it; a first character drops it; a missed
  offer answers `{ shown: false, reason }` and shows nothing. No transcript row,
  toast, or overlay appears, and the plugin's call is audited.
- **Specs linked**: `07-plugins/03-plugin-api.md`,
  `07-plugins/13-plugin-permissions-matrix.md`, ADR 0333.
- **Acceptance**: A (Composer entry path), Security (permission-gated, never
  sent by the plugin).
- **Milestone**: M6+
- **Status**: Unit/source-contract-covered by
  `composer-suggestion-state.test.mjs`, `composer-suggestion-relay.test.mjs`,
  and `plugin-composer-suggestion.test.mjs`; the rendered journey remains a
  manual/Electron check when this surface changes.

### E2E-REMOTE-FILE-MANAGER: Scoped remote plugin reads

Run `node scripts/e2e-remote-file-manager.mjs` to validate the shipped copy in
`apps/desktop/resources/plugins/pi.file-manager`. This is the release acceptance
path: passing against a separate development plugin does not prove the bundled
user path is repaired. The runner records the loaded directory in its output.
An optional `<built-file-manager-directory>` argument selects the companion
plugin's rebuilt `views/` or unpacked official PluginPack artifact for development
validation only. Before accepting #1711, update the bundled release, its upstream
tag/commit and per-file checksums, then rerun the default path on the updated PR
integration candidate.

A development integration may exercise a Desktop hotfix in that actual bundled
directory, with its immutable source commit, local patch and artifact checksums
recorded honestly in `UPSTREAM.md`. A passing hotfix journey does not claim that
the companion upstream release or the maintainer's final acceptance is complete.
`PI_FILE_MANAGER_QA_DIR` may point to an existing plugin `tests/electron`
installation providing Playwright; `PI_ELECTRON_BINARY` selects an existing
compatible Electron runtime. `PI_E2E_ARTIFACTS` optionally preserves screenshots.

The isolated production plugin process and `file://` view use Desktop's actual
SDK broker, durable-binding reader, loopback RACP transport and Host filesystem
service. Only the fixture's project-record lookup and authentication bootstrap
are supplied by the harness. The remote fixture root is registered explicitly
outside the Host folder picker's browse root. Verify nested listings,
text/image bytes, hidden credentials, read-only editor/save/menu controls,
visible disconnect errors and refresh recovery, rejected late previews and
ancestor opens after a project switch, and restored local
editing/Browser/editor detection. No model, user profile or external SSH server
participates. Real SSH transport and native Windows/Linux behavior require
their separate platform acceptance.

### E2E-GENUI-inline-visualization-card: a visualization renders inline and stays sandboxed

- **Preconditions**: The app is running with a local Agent session, Settings →
  AI → Inline visualizations switched on, and the builtin
  `pi-desktop/visualize` skill enabled. A second session uses a remote
  workspace.
- **Steps**: 0) With the switch off (the default), ask for a chart and confirm
  no directory, skill, or card appears; then switch it on. 1) Ask for an
  interactive chart (for example "show a slider that
  changes a sine wave's frequency"). 2) Wait for the turn to finish, then drag
  the slider. 3) Switch the app theme between light and dark. 4) Press the
  card's expand button, then Esc. 5) Ask the model to write a non-`.html` file
  into the visualization directory, and to write a fragment that calls
  `fetch("https://example.com")`. 6) Fork the session, then delete the source
  session. 7) Repeat step 1 in the remote session. 8) Relocate the data directory,
  then fork a transcript that still names its old visualization path. 9) Try
  redirected visualization roots and a `.html` FIFO, and open two document
  URLs from callers that omit the iframe sandbox. 10) Expand a card while
  eight inline cards are live.
- **Expected**:
  - No permission card appears for the fragment write. While streaming, the
    reply shows plain text; after completion the `::visualize` line is
    replaced by a card whose height fits the content (at most 2000 px).
  - The slider works; theme changes recolor the card without a reload.
  - Expand opens a large modal copy; Esc closes it and the inline card keeps
    its state.
  - The non-`.html` write fails with a tool error; fetch requests are blocked,
    and the frame cannot open popups or navigate remotely. The ADR's WebRTC
    ICE limitation remains explicit rather than a blanket no-network claim.
  - The fork retains its own card after the source session is deleted, including
    a fork made after data relocation. The source's directory is removed.
  - Redirected roots cannot bypass Ask write confirmation or let cleanup delete
    unrelated data. FIFO requests fail without blocking other filesystem work.
  - Every document response enforces an opaque sandbox; a caller that omits
    iframe sandbox cannot read another session's DOM.
  - Expanded and inline frames share the eight-frame quota, and the expanded
    card's original inline control state remains unchanged.
  - The remote session gets no visualization directory or skill.
- **Coverage**: `pnpm test:e2e:gen-ui` runs the offline Electron card journey,
  including real protocol responses, bundled assets, the preloaded `viz`
  helpers (`viz.chart` sizing, `viz.render` charts and their date, year,
  re-render, and donut edge cases), a fragment script error shown in the
  card, the fragment inside the kit's `#widget` container with its top-level
  blocks spaced while inline controls, block styling, wrapped roots, and flex,
  grid, and column roots keep their geometry, focus/guest Escape,
  viewport release, and unsandboxed callers through a real isolated Host.
  Native directory, FIFO, and ABA regressions run in `visualizations/files`;
  `gen-ui-file-safety.test.mjs` validates the private Host-to-Main boundary.
  Rust visualization RPC/lifecycle/fork tests
  cover authorization, deletion safety, Windows path spelling, and relocation.
- **Status**: Automated without a paid provider or a user's running instance.

#### E2E-PROVIDER-reasoning-effort-override: Preserve an explicit gateway reasoning parameter

- **Setup:** A custom Chat Completions provider with a DeepSeek-family model;
  start with a legacy binding that omits `supportsReasoningEffort`.
- **Steps:** In English, Chinese and German at 850/1000/1400px widths, open model settings, confirm Auto, select
  Send, save and reopen; repeat for Do not send and Auto. Switch to Responses
  and Anthropic and confirm the Completions-only control is hidden.
- **Expected:** Each saved binding retains true, false, or null respectively.
  With High selected, the real Completions adapter sends `reasoning_effort: high`
  only when enabled; Auto keeps the existing DeepSeek compatibility default.
  Responses continues using its own reasoning contract. Provider creation,
  update/read, copying, and sync preserve the explicit override.
- **Automation:** `node scripts/e2e-provider-api-style.mjs --reasoning-effort` exercises real
  React/Chromium controls and captures the Host API payload (the IPC boundary is
  stubbed). Rust provider tests independently verify real SQLite persistence;
  `provider-reasoning-effort.test.ts` captures requests from the real pi-ai
  adapter with fixture SSE responses. No live gateway credentials are required.


#### E2E-RUNTIME-malformed-tool-call-continue-recovery: Continue after malformed tool output

- **Preconditions**: An isolated sidecar and loopback Responses fixture can
  emit an empty tool name, then a corrected Read call. Unit fixtures also
  cover missing names/IDs, empty Responses wire IDs, non-object arguments,
  retained malformed context, compaction tails and resumed delegates.
- **Steps**: Return one malformed response, then invoke the same `agent.prompt`
  entry used by Continue three times. Repeat with three consecutive malformed
  responses followed by a corrected response. Keep the runtime alive throughout.
- **Expected**: Each malformed batch settles with one local
  `context-validation` error before tool execution, with no transport retry.
  All three later prompts complete; the corrected Read executes once, and the
  runtime is reused rather than restarted. Model context retains valid history
  and system updates while excluding malformed calls and associated results.
  Optional usage estimation does not lose terminal tool events. The durable
  transcript and Host permissions are unchanged; unrelated malformed hosted
  search still fails strict validation.
- **Specs linked**: `03-runtime/02-agent-runtime.md` §5d.
- **Acceptance**: Conversation, runtime recovery and quality.
- **Milestone**: M5 hardening.
- **Automation**: `pnpm test:e2e:hosted-search` runs the production sidecar and
  real Responses adapter against synthetic SSE, including one-error and
  three-error recovery cases. `malformed-tool-recovery.test.ts`,
  `tool-call-identity.test.ts` and `subagent.test.ts` cover retained state,
  event/result agreement, batch rejection and delegate restoration.
- **Status**: Automated offline; native UI clicking and live providers are
  outside this fixture's coverage.

### E2E-PLUGIN-PROJECTS: Enumerate durable projects without switching workspace

- **Preconditions**: An isolated Host profile with a standalone project and a
  multi-folder group, plus a session with no project. A plugin with no granted
  permissions registers a command that calls `pi.projects.list()`.
- **Steps**:
  1. Run the command through the plugin process and read the same list through
     the panel bridge's `projects.list` channel.
  2. Compare the entries with the Host's durable `projects.list` rows and group
     roots, and verify that the visible workspace remains unset.
  3. Restart the Host and run the command again.
  4. Stop the Host and run the command again.
- **Expected**: Exactly one entry per durable row, including ungrouped and
  secondary-folder rows; non-empty decimal database ids; most recently opened
  first regardless of pins; every entry has its own primary path first in
  non-empty roots. A primary group row includes its additional roots in order.
  Identities survive restart. No workspace is opened or switched, no filesystem
  grant is added, and a stopped Host returns `[]`. No Host credentials appear.
- **Automation**: `pnpm test:e2e:plugin-projects` runs a real isolated Rust Host
  and plugin child process without provider calls. The companion
  `apps/desktop/test/plugin-projects.test.mjs` covers pin-independent ordering,
  group lookup failure, missing project providers, failed/malformed lookup,
  rename identity, and stale results after Host replacement.

### E2E-268: Plugin launcher grid, triggers, and local applications

- **Preconditions**: An isolated Host profile with a panel plugin that declares
  one launcher trigger (for example `^\d+\s*[\+\-\*/]\s*\d+$`, so `1+1` matches
  it) and whose panel renders the text it received through
  `window.pluginBridge.consumeLauncherPayload()`. A second panel plugin with a
  Latin name, and at least two installed applications, one of them Chinese with
  a `wx` / `weixin` / `微信` spelling chain. Run on Windows and macOS.
- **Steps**:
  1. Press `Alt+Space` (`⌥+Space` on macOS) with an empty input. Read the grid:
     group titles, rows, tiles per row, and the two header actions.
  2. Type the trigger expression `1+1` and inspect the first tile and its detail
     line; press `Enter` and read the opened panel.
  3. Reopen the launcher and type a pinyin initial such as `wx`, then `weixin`,
     then `微信`; confirm the same application is the matching tile each time.
  4. Type `pi` and confirm the plugin named `PI-Desktop` is listed with a name
     match, and that the same item is reachable by pinyin and initials.
  5. Drag the panel's edge to a larger and then a smaller size; count the tiles
     per row at each width. Quit and restart the application, then reopen the
     launcher.
  6. Type a query that matches more than 24 items. Read the header action and
     the window height.
  7. Disable one plugin that was in recents/pins, reopen the launcher, and check
     the empty-input view and a query that used to match it.
  8. Paste 500 characters of garbage into the search field.
  9. Pin an application, quit, restart, and reopen the launcher with an empty
     input.
 10. Install a plugin whose name matches an installed application (for example
     `Calculator`) and open the launcher with an empty input.
- **Expected**: Step 1 shows `Recently used` with two rows of eight tiles and
  `Pinned` with one row of eight once the user has pins; the recents header
  reports the true number of remembered items and offers `Show all {count} →`
  plus `All plugins →`. Step 2 lists the trigger plugin as the **first** tile,
  ahead of name matches and without a detail line, and the panel shows `1+1`
  exactly once (a second read returns `null`). Step 3 reaches the same
  application through all three spellings. Step 4 lists `PI-Desktop` once by
  name. Step 5 keeps eight columns per row at every width, the panel height
  always matches what it renders, and the dragged width is restored after the
  restart. Step 6 keeps the window at its height cap, reports the dropped count
  in the header, and asks the user to keep typing. Step 7 removes the disabled
  plugin from recents, pins, and matches while every other tile still opens.
  Step 8 keeps the panel responsive (no frozen input, no unhandled error) and
  reports no match, because input longer than 256 characters is never matched
  row. Step 10 lists both entries with the identical 48px rounded square and the
  same name line — the source is only in the hover title — and opening the plugin
  row still lands in the plugin panel while the application row launches the
  program.
- **Automation**: `pnpm --filter @pi-desktop/desktop test` runs the offline
  coverage for these rules: `launcher-search.test.mjs` (ranking order, section
  caps, overflow total, trigger whole-input matching, the 256-character limit
  and the all-plugins view), `launcher-store.test.mjs` (pins and the eight-pin
  cap, recents, legacy migration, retired fields read without error, and
  pruning), `plugin-launcher-height.test.mjs` (content-height arithmetic and
  clamping), `local-apps.test.mjs` (discovery, bounds, icon budget and icon
  cache, dropped targets, opaque-id launch) and `plugin-launcher-state.test.mjs`
  (clamping and re-centring). Rust `plugins` tests cover the manifest rules. The
  rendered Electron journey above — grouped grid, content height, resize,
  restart, and the panel payload round trip — is Draft until a launcher E2E
  script exists.
## Computer use (ADR 0342, ADR 0344)

Native-control scenarios remain landing gates for
[03-runtime/computer-use](../03-runtime/computer-use.md). The host half now has
device evidence on macOS through
`PI_DESKTOP_COMPUTER_USE_DEVICE=1 node scripts/e2e-computer-use-device.mjs`
(opt-in: it reads the operator's screen, and with `--act-app` types into one of
their windows). The Electron half — the automatic mint through the tool, the
indicator, Stop aborting the turn, the drawn cursor, and the loop against a real
model — is still `NOT RUN`, and so is anything needing Screen Recording. The
permission-request UI below has isolated fixture automation.

### E2E-COMPUTER-USE-request-accessibility-from-settings

- **Layout regression**: Open Settings → Behavior. Computer use is the final card,
  after Permissions and Defaults, without card/row explanations or a static
  scope note. Its switch, platform/permission status, enabled model/capture
  controls, missing-model hint, and permission error/retry path remain present.
  `apps/desktop/test/computer-use-settings-surface.test.mjs` covers order and
  compact rendering with the feature both disabled and enabled.

- **Preconditions**: Isolated Electron fixture profile; OS calls mocked at IPC
  and Electron boundaries; computer use disabled; no provider or real OS prompt.
- **Steps**: Open Settings with missing Accessibility; focus and click its status
  button twice. Complete the request while permission remains missing. Grant it
  externally and return focus. Exercise denied permission, a failed request and
  retry, a stale capabilities read, focus during a pending request, unsupported
  platform, and unmount during a request.
- **Expected**: Opening Settings or toggling the feature never requests OS
  permission. Explicit click alone requests the app's own TCC trust in main;
  while pending, the button is busy/disabled and duplicate clicks are ignored.
  Missing app trust opens only the fixed macOS Accessibility pane and explains
  that the user must enable it. Errors are visible and retryable. Focus and
  visibility refreshes never prompt. Controlled one-second polling after a
  request detects authorization without a focus event, stops on authorization
  or unmount, and expires after 60 ticks. Stale reads cannot replace newer state.
  An app-level grant updates the badge even when the Rust child still reports
  denied: show a backend-permission diagnostic instead of another request.
  Backend recovery clears the diagnostic without granting any authority from UI.
  Granted/unsupported states are labels. Non-main senders are rejected before OS
  calls; opening failure propagates; no grant, capture, or input is dispatched.
- **Automation**: `node --test apps/desktop/test/computer-use-permission-user-path.test.mjs
  apps/desktop/test/computer-use-permission-ipc.test.mjs`; shared capability
  selection tests and host-core unsupported-backend tests cover platform gating.
- **Specs**: [Computer Use](../03-runtime/computer-use.md), Settings and UX surface.
- **Status**: Fixture automation PASS; actual macOS TCC prompt/switch NOT RUN.
  Native OS approval remains a manual system decision.

### E2E-COMPUTER-USE-desktop-grant-is-automatic-and-stoppable

- **Preconditions**: Isolated desktop profile, computer use enabled with a model
  bound, OS permissions granted on the platform under test, two fixture target
  applications, one PI-Desktop window in front, no provider account needed.
- **Steps**: Ask the agent to operate an application with no grant in existence.
  Watch the indicator, run `inspect` and one `act`. Press Stop mid-task and have
  the agent immediately call `Computer` again. Wait out the cooldown and call
  again. Ask from a second session while the first grant is active. Let a grant
  idle past its expiry, and exhaust an action budget. Restart the app.
- **Expected**: No picker appears and the user is never asked which window: the
  first call mints a desktop grant bound to the frontmost window that is not
  PI-Desktop's, with no OS prompt and no capture under `a11y-only`. The
  indicator names that window, shows budget and capture mode, follows every
  rebind, and stays visible while the app is backgrounded. Stop revokes the
  grant, aborts the owning turn, and the immediate re-call fails
  `COMPUTER_STOPPED_BY_USER` without touching the screen; after the cooldown a
  new grant is minted normally. The second session is refused
  `COMPUTER_GRANT_IN_USE`. Idle expiry and budget exhaustion close the grant
  with their own codes, and no grant survives the restart.
- **Specs**: [Computer Use](../03-runtime/computer-use.md),
  [03-tools-and-permissions](../03-runtime/03-tools-and-permissions.md).
- **Automation**: `computer::tests::a_desktop_grant_binds_the_frontmost_usable_window`,
  `a_desktop_grant_refuses_when_every_window_is_refused`,
  `a_user_stop_blocks_the_agents_next_mint_but_not_the_users`,
  `only_one_grant_is_active_per_instance`,
  `another_session_cannot_use_the_active_grant`,
  `an_idle_grant_expires_and_stays_expired`, and
  `the_budget_closes_the_grant_and_refuses_the_next_action` in host-core;
  `apps/desktop/test/computer-use-service.test.mjs` covers the automatic mint,
  the Stop refusal, and the wrong-session refusal the agent would hit. Device:
  `scripts/e2e-computer-use-device.mjs`.
- **Status**: PARTIAL — the device probe confirmed the automatic desktop grant
  binding the frontmost usable window (with our own window refused in front of
  it), the settings defaults reaching the grant, the real tree, and the Stop
  cooldown on macOS 15 with Stage Manager active. The indicator, Stop aborting
  the owning turn, budget and idle closure in a running app, and the restart
  case are NOT RUN.

### E2E-COMPUTER-USE-window-switching-stays-inside-the-refusals

- **Preconditions**: Isolated desktop profile with an active desktop grant, two
  fixture applications, a PI-Desktop window, a window from the built-in
  credential denylist, and one fixture window that can be closed on demand.
- **Steps**: Have the agent read the window list, switch to the second fixture
  application, inspect it, and act. Attempt a switch to the PI-Desktop window,
  to the denylisted window, and to an id that no longer exists. Act using a
  `uid` read before the switch. Close the bound window mid-task and act.
- **Expected**: The observation lists the windows the host enumerated with
  refusals attached, and no renderer surface enumerates anything. A permitted
  switch rebinds the grant, moves the revision, re-frames the drawn cursor, and
  spends a step but no action budget. The refused switches fail
  `COMPUTER_SELF_TARGET_REFUSED`, `COMPUTER_TARGET_DENYLISTED`, and
  `COMPUTER_SCOPE_VIOLATION`, leave the bound window unchanged, and are reported
  to the model as steps rather than ending the run. A pre-switch `uid` fails
  `COMPUTER_STALE_REVISION`. The closed window rebinds to the frontmost usable
  window while the in-flight action is refused, and the audit log shows one
  `computer.grant.rebound` per move with application identity only.
- **Specs**: [Computer Use](../03-runtime/computer-use.md),
  [05-security/01-security](../05-security/01-security.md) §13.
- **Automation**: `computer::tests::binding_another_window_moves_the_revision`,
  `a_rebind_re_applies_every_refusal`, `a_window_grant_refuses_a_rebind`, and
  `a_desktop_grant_whose_window_closes_rebinds_and_refuses_the_action` in
  host-core; `packages/computer-use` loop tests cover the switch step, the
  refused-switch recovery, and the terminal-grant case;
  `apps/desktop/test/computer-use-service.test.mjs` pins the host call shape.
  Device: `scripts/e2e-computer-use-device.mjs`.
- **Status**: PARTIAL — on device, switching between six real applications
  worked, the revision moved on every bind, a pre-switch revision was refused,
  and the self-target, denylist and unknown-window binds were refused by code.
  Two defects were found and fixed there: the accessibility window could not be
  matched to the window-server window under Stage Manager (now joined by window
  id, D683), and a failed read left the grant on the unreadable window. The
  closed-window fallback, the cursor re-frame, and the audit read-back are
  NOT RUN.

### E2E-COMPUTER-USE-self-target-and-secure-input-refused

- **Preconditions**: Isolated desktop profile with an active grant, a PI-Desktop
  window with a pending approval card, and a fixture window containing a
  password field.
- **Steps**: Attempt to inspect, capture, and act on a PI-Desktop window,
  including its approval card and the Live Voice widget, under every permission
  mode including `auto` and under an `autonomous-in-scope` grant. Focus the
  password field and attempt `inspect`, `screenshot`, and `set_value`. Attempt a
  target on the built-in credential denylist and try to remove that entry.
- **Expected**: Every self-target attempt fails `COMPUTER_SELF_TARGET_REFUSED`;
  no synthetic event reaches any PI-Desktop window and no approval card is
  dismissed. Secure input refuses capture and synthesis with
  `COMPUTER_SECURE_INPUT_REFUSED`, and no field content appears in a snapshot,
  image, tool result, or log. The built-in denylist entry cannot be removed.
- **Specs**: [Computer Use](../03-runtime/computer-use.md),
  [05-security/01-security](../05-security/01-security.md) §13.
- **Automation**: `computer::tests::our_own_windows_are_never_targetable`,
  `a_renamed_self_process_is_still_refused`,
  `built_in_credential_surfaces_cannot_be_allowlisted`, and
  `secure_input_refuses_both_inspection_and_action` in host-core. Device:
  `scripts/e2e-computer-use-device.mjs`.
- **Status**: PARTIAL — on device, a PI-Desktop window sat in front of every
  other window and was refused `COMPUTER_SELF_TARGET_REFUSED` both as the
  automatic grant's choice and as an explicit bind, and a denylisted window was
  refused `COMPUTER_TARGET_DENYLISTED`. The approval card specifically, and the
  secure-input and password-field refusals, are NOT RUN.

### E2E-COMPUTER-USE-stale-basis-and-revision-fail-closed

- **Preconditions**: Isolated desktop profile, an `a11y-and-pixels` grant, and a
  fixture window that can be moved, resized, and re-stacked on demand.
- **Steps**: Capture a `screenshot`, move the target, then act on the stale
  basis. Resize the target between `inspect` and `act` on a `uid`. Act with a
  coordinate outside the measured bounds. Act with a basis minted for a
  different grant. Act under an `a11y-only` grant with coordinates.
- **Expected**: `COMPUTER_STALE_BASIS`, `COMPUTER_STALE_REVISION`,
  `COMPUTER_SCOPE_VIOLATION`, and `COMPUTER_CAPTURE_UNAVAILABLE` respectively;
  no event is dispatched in any of them, nothing is clamped silently, and the
  target application observes no input.
- **Specs**: [Computer Use](../03-runtime/computer-use.md),
  [08-error-codes](../03-runtime/08-error-codes.md) §3.10.
- **Automation**: `computer::tests::a_moved_window_bumps_the_revision_and_invalidates_a_basis`,
  `a_resized_window_with_the_same_revision_still_refuses_a_stale_basis`,
  `coordinates_outside_the_measured_window_are_refused_not_clamped`, and
  `a_coordinate_action_without_a_basis_is_refused` in host-core.
- **Status**: NOT RUN — needs a real window that moves mid-step.

### E2E-COMPUTER-USE-voice-request-adds-no-authority-of-its-own

- **Preconditions**: Isolated desktop profile, a Live Voice fixture adapter with
  a bound work session, no real provider account or microphone. One run with
  computer use disabled, one with it enabled.
- **Steps**: Deliver a spoken request that asks the agent to operate an
  application, with the feature disabled and then enabled. Repeat with the
  session in Plan and in Goal. Press Stop during a spoken run and repeat the
  spoken request immediately.
- **Expected**: With the feature disabled the request fails
  `COMPUTER_DISABLED`; voice cannot enable it, and nothing is captured or
  synthesized. With it enabled the request runs as an ordinary Agent turn under
  the session's policy and the same automatic desktop grant the typed path gets
  (ADR 0344) — voice adds no authority and skips no refusal — with progress
  spoken through the existing work-feedback channel. Plan and Goal deny the tool
  before permission evaluation. A spoken retry inside the Stop cooldown fails
  `COMPUTER_STOPPED_BY_USER`.
- **Specs**: [Computer Use](../03-runtime/computer-use.md),
  [live-voice](../03-runtime/live-voice.md),
  [live-work-session](../03-runtime/live-work-session.md).
- **Automation**: none. The spoken path is stage 3 and is deliberately not
  wired, so there is nothing to drive yet.
- **Status**: NOT RUN — stage 3.

### E2E-COMPUTER-USE-platform-support-is-explicit

- **Preconditions**: One run per supported platform plus a Wayland session and a
  platform with the OS permission denied.
- **Steps**: Enable the feature and open the doctor view on each platform. Have
  the agent call `Computer` so a grant is minted, and act. On Windows, bind a
  window owned by a higher-integrity process. On Wayland, attempt input and then
  capture. On a platform with Screen
  Recording or Accessibility denied, attempt inspection and capture.
- **Expected**: The doctor view distinguishes "not requested", "denied", and
  "unsupported on this platform". Input on Wayland fails
  `COMPUTER_PLATFORM_UNSUPPORTED` while portal capture still works; an elevated
  Windows target fails `COMPUTER_TARGET_ELEVATED` rather than dropping events; a
  denied OS permission fails `COMPUTER_OS_PERMISSION_MISSING`. No path hangs and
  none reports success without acting.
- **Specs**: [Computer Use](../03-runtime/computer-use.md).
- **Automation**: `computer::tests::an_unsupported_platform_refuses_every_operation`
  in host-core covers the fallback backend every unported platform uses.
- **Status**: NOT RUN — needs one run per platform, including Wayland.

## Round review reader

Scenario: E2E-REVIEW-ROUNDS (local desktop, implemented)

- Preconditions: candidate JavaScript and Rust Host built; isolated temporary
  profile/data/workspace; no provider or running user instance.
- Command: `node scripts/e2e-review-history.mjs` with `PI_DESKTOP_HOST_BIN` pointing
  at this candidate's Host binary. The runner writes controlled-data preview PNGs
  under `docs/public/screenshots/review-history/`.
- Actions: create modified, newer modified and no-edit rounds through real Host
  RPC; add delegated evidence; select rounds, expand a multi-operation file,
  choose Last round/History, hover the context submenu (only 1/3/5), toggle word
  wrapping, scroll and resize, copy, attempt conflicting rollback, append a
  late delegate result, restart Host and switch sessions. Choose one context line,
  reopen Review, switch conversations and reload the renderer from the same
  isolated profile; verify both the checked menu option and actual diff context
  retain that choice. Missing/invalid/blocked storage is unit-covered by
  `apps/desktop/test/review-preferences.test.mjs`.
- With two populated sessions, visit B, then click a file in A's real transcript
  turn-summary card and return to B. The retained focus request must belong to A;
  B must immediately retain its own recorded files. Cycling Last round → History
  must leave those files unchanged rather than repair an initially empty list,
  and B's selected history totals must agree with its visible file list.
- Open several files from the per-turn summary with enough Review content to
  scroll. Each target comes into view inside Review while the conversation and
  work-panel headers stay visible and the window content reaches the bottom edge.
- Expected: latest skips no-edit rounds; delegates belong to their original user
  round; all file records are accessible; old/new numbers and bounded immutable context
  agree; one gutter uses old numbers for deletions and new numbers otherwise;
  file-type glyphs match between Review and turn summaries; both ellipsis menus
  retain trigger-relative placement across click points and fit narrow windows;
  no full after-image is cached; only the outer review scrolls; headers stick without toolbar overlap in
  normal/narrow layouts; copy and conflict protection survive; history restores.
  Toggle checks trail labels, summary dots have no circle, history options contain
  date/time plus true per-round recorded totals before the check and fit an
  arrow-safe field, including colored right-aligned totals when closed.
  The summary counts visible files rather than operation records (five records
  across four paths, including one zero-counter preview-limited file, show three
  files). Only file groups with additions or deletions greater than zero remain;
  both-zero groups are hidden and excluded from the summary, while raw Host
  evidence and each retained file's complete operation chain remain available.
  Missing/unsafe totals are not invented as zero;
  Host regressions retain saved valid counters despite binary/truncated previews.
  Expanding a long diff does not move header widths or statistics because the
  outer scrollbar gutter is reserved. File icons lead; the reserved disclosure
  immediately after the visible filename appears only on hover/focus, right when closed and down
  when expanded, with a clear gap before statistics. Numbered diff rows have no
  independent add/delete sign column.
  File headers have no idle
  fill, and no execution-root row appears. File menus disable internal open when
  the plugin is absent, open its loaded view when available, and pass the resolved
  current file and session to external open. The third action, Open folder,
  invokes system reveal without requiring a plugin (OS launch/reveal boundaries
  are stubbed). Non-workspace rows hide internal open; their remaining two actions
  exercise the real reviewed-file service and Host snapshot authentication.
  A multi-operation file has exactly one action bar and no record-number heading;
  copy contains every operation, conflicting rollback changes nothing, and a
  successful grouped rollback restores the content before the first operation.
  Scope and historical round controls reuse the shared native Select with local
  customizable-picker styles. Check light/dark palettes and live sidebar color
  changes: selected fills follow the sidebar but differ from the list base, not
  system blue. Only first-row upper and last-row lower corners are rounded;
  interior edges are square, and a single row has all four corners. Verify native
  ArrowUp/ArrowDown, Enter, Escape/focus retention and close-after-selection;
  the scope trigger is 24px high, the round field stays 28px high, and both
  vertically center their text and arrow. Round labels show date/time and recorded totals with
  reserved trigger-arrow space.
  The long-file fixture has 3100 lines with local edits: unchanged head/tail do
  not consume the LCS matrix budget, while original hunk coordinates, 1/3/5-line
  context, copy and guarded rollback still work. Byte/line/middle-cell caps remain. Absolute/outside-root labels show `.../basename`, while the title
  retains the full path; normal workspace-relative labels remain unchanged.
  A real approved outside-workspace Write is included in the historical round:
  its diff remains readable after restart, its label is `.../basename`, and it
  grants no rollback writes. Rust RPC tests cover workspace/scratch/external
  Write and Edit, same-named paths, approval denial, failed Edit, and no Bash capture.
  The visualization RPC Write → Read → Edit path starts with no visualization
  directory and checks non-reversible review evidence for both mutations.
  Ordinary operations keep that root lazy; denied redirected writes leave no
  review snapshots. Run the complete visualization suite, not only review-named
  tests, to cover the pre-existing cross-platform path contract.
  `review-file-open.test.mjs` covers missing/fuzzy paths, worktree/secondary-root
  locations, plugin unload, stale session/project results, and visible failures.
- Additional acceptance: Rust RPC tests cover over 100 turns/changes, dedup,
  invalid evidence and root isolation; context tests cover legacy, binary, resource
  budgets, additions/deletions and newline-only changes. Renderer unit tests cover
  numbered ranges, grouping and cancelled pagination. Existing review/chat/history
  tests remain required regression coverage.
- Specs: ADR 0043; runtime RPC/storage specs; component spec Round review reader.
- Milestone: maintenance. Traceability: acceptance criteria 1–9 of the approved
  native round-review enhancement map to this scenario and the tests above.


### E2E-TOOLS-session-background-jobs

- Entry: build shared/agent-runtime/host-runtime and Host, then run
  `PI_DESKTOP_HOST_BIN=<candidate-host> node scripts/e2e-session-background-jobs.mjs`.
- Environment: isolated Host data and workspace, production runtime and pi tool
  loop, deterministic localhost HTTP provider. No external model account.
- Sequence: start a background test, list it, wait for failure and Unicode
  output tails; start a service, time out waiting, call default stop, then
  explicitly stop and wait for the same job.
- Expected: correct exit code and both final tails, per-stream UTF-8 limits,
  cross-session list/read/stop isolation, timeout and default stop preserve Bash,
  explicit stop reaches terminal state, repeated reads and desktop output agree.
  Plan-mode access is rejected.
- Runtime tests cover new input/parent abort during a pending Host wait, late
  Host rejection, old Host/remote capability behavior, conflicting/malformed
  delegation selectors and mixed Bash selector rejection, existing delegation
  controls and registration without a subagent catalog.
- Host tests cover pre-settled observation, repeatable output, Unicode clipping,
  ownership lookup, idempotent stop and stop acknowledgement before termination.
  Existing Windows child/grandchild cleanup tests remain required; record native
  failures separately from protocol success.
- Exercise a late stop with an already reaped child before the supervisor drains the pipes. Verify the original exit outcome, final output and stable elapsed time across reads. Stall capability discovery or the first Host observation to exercise the overall wait deadline. The Electron transcript fixture renders a pending Bash stop and a mixed job list.

#### E2E-ISSUE-1953

MCP All uses the selected project for create/import/install, falling back to Global only without a project. Explicit filters retain ownership and an opened editor pins its project. Verify create and market installation across all/project/global and missing-project cases with `mcp-market-owner-user-path.test.mjs`.

Open an editor in project A, switch the page to B and wait for B's list. A/B
same-name definitions with different IDs do not prevent saving to A. A real
duplicate name or ID in A still blocks creation; a real duplicate name blocks
editing. Cover both creating and editing before changing the page selection.

#### E2E-ISSUE-1789

Image-model marking explains chat/default-menu exclusion and distinguishes generation from image input. Collapsed model rows retain an image-model badge. Verify marking, help, collapsing, unmarking and restored chat eligibility through `image-model-disclosure-user-path.test.mjs`.

#### E2E-ISSUE-2162

Closing the connected Browser tab clears its connection. Subsequent session-only tools use that session's selected replacement page. Explicit closed targets fail; navigation never revives an invisible old tab. Verify close/reopen/snapshot/fill/click/navigate and final closure with `browser-background-session.test.mjs` and `BROWSER_CLOSE_CONNECTION_ONLY=1 node scripts/e2e-browser-background.mjs`.

#### E2E-ISSUE-2163

Bounded tail pages include compactions appended after the last message. Middle pages still read only the active checkpoint and records inside their offsets. Verify append-message/append-compaction, tail reopening and Host restart with `scripts/e2e-compaction-tail.mjs` and `layout_tail_window` tests.

#### E2E-ISSUE-2164

While a checkpoint estimate supplies context occupancy, use its recorded provider/model capacity, or the current exact session binding for legacy checkpoints. Keep historical request usage unchanged. Unknown capacity is marked approximate. Verify 20,619 / 1,000,000 = 2%, unknown routes, legacy records and usage after a newer request with `compaction-context-usage.test.mjs`.


## User-defined mode workflow acceptance

Candidate command: `PI_DESKTOP_HOST_BIN=<candidate-host> node scripts/e2e-mode-definitions.mjs`
with `PI_SCRATCH_DIR` set to an isolated test directory. No model API is called.

1. Configure a session with a two-stage definition snapshot. Start a durable
   turn and claim the first contract stage.
2. Request completion without its required artifact; observe a failed gate.
3. Supply the artifact through stage completion; verify its exact disk content
   and the waiting-for-approval state.
4. Settle the first turn, approve with the current revision and claim the next
   stage with approval provenance.
5. Submit the stage's command gate. A changed command must fail with
   `MODE_GATE_MISMATCH` before execution.
6. Execute the exact command through `tools.execute`; consume the Host-recorded
   result and observe finished, no open run, and session mode Agent.

Companion tests: `mode_runs::*` and `rpc::modes_rpc::tests::*` cover migration,
recovery, CAS, budget and permission caps; desktop `mode-definitions-user-path`,
`mode-definitions-renderer` and `mode-runs-main` cover source editing, selection,
run controls and Main dispatch. Runtime `modes/*` covers stage completion and
compaction injection.

### Goal run controls with a live model (opt-in, paid)

Command: `PI_LIVE_BASE_URL=<url> PI_LIVE_MODEL=<model> PI_LIVE_API_KEY=<key>
PI_DESKTOP_HOST_BIN=<candidate-host> node scripts/e2e-goal-live.mjs` with
`PI_SCRATCH_DIR` set (`PI_LIVE_SECRETS_DIR` + `PI_LIVE_SECRET_REF` may replace
the key; only the machine key and that one secret file are copied). It calls a
paid model API and needs the account owner's authorization. Real pieces: an
isolated Host, the production runtime loop and Electron main's run coordinator.

1. With `goalBudget { maxTurns: 6 }` set, a Goal run starts with 6 turns, does
   the work, calls `CompleteStage` with the three-heading artifact, finishes,
   and the session returns to Agent.
2. During the first turn, Edit the objective and budget, then Pause: the turn
   receives the closeout notice and ends within 3 more model requests; the run
   stays paused and no turn starts. Resume starts an approval turn with the
   edited objective, which the run meets before it finishes.
3. During a turn, Remove: the turn is not interrupted, finishes in Agent
   without `CompleteStage`, no Host-started turn follows, and no open run is
   left.
#### E2E-ISSUE-2173: Redundant delegation job selectors

- Entry: build shared/agent-runtime/host-runtime and Host, then run
  `PI_DESKTOP_HOST_BIN=<candidate-host> node scripts/e2e-task-job-selectors.mjs`.
- Preconditions: isolated Host data/workspace and a deterministic localhost
  provider; production parent and delegate loops, with no external model account.
- Steps: start a delegate; wait with both its job reference and matching
  delegationIds; re-read with empty delegationIds and single-job mode/minCompleted;
  start another delegate, hold its provider response, stop it with both selectors,
  and confirm its stopped state through TaskWait.
- Expected: reports remain readable, redundant selectors do not cause errors,
  single-job mode/minCompleted are ignored, and cancellation settles the target.
  Unit tests also reject conflicting/malformed IDs and mixed Bash selectors.
- Specs: `03-runtime/02-agent-runtime.md`, Session job controls.
- Acceptance: wait, report re-read and running-delegate cancellation complete
  through the real tool loop. Milestone: maintenance. Status: automated.

#### E2E-ISSUE-1707

Use synthetic Darwin x64/arm64 uname responses through production SSH bootstrap, serialize its code/details as IPC does, and resolve the renderer error. The platform explanation appears, no checksum or upload occurs. Linux and other bootstrap failures keep existing messages. Coverage: remote-host-ssh-bootstrap.test.mjs and remote-host-errors.test.mjs.

#### E2E-ISSUE-2184

Load the actual bundled plugin in an isolated workspace. Create a file and Unicode directory, rename and move the file; verify disk entries and response metadata. Invalid create/rename names fail before writing, and duplicate destinations are refused. Coverage: apps/desktop/test/file-manager-mutations.test.mjs. Existing Electron directory-location path also passes.

### E2E-NATIVE-workspace-file-routing

Run `node scripts/e2e-native-workspace-files.mjs`: isolated Electron Main,
production workspace IPC, synthetic sidecar session metadata and real fixture
files. Select an unrelated Desktop workspace; list, read and resolve a native
file, then reject a missing native session. The test asserts no native session
or scratch RPC reaches Desktop storage. `native-workspace-files.test.mjs`
additionally rejects replaced sidecars. No provider execution or native user
session data is used.

#### E2E-ISSUE-1926-scratch-prefix

Build two actual runtimes with identical configuration and different scratch directories. Their leading runtime system sections match; each trailing context retains its own path. Check PowerShell/POSIX guidance and custom system prompt behavior. Coverage: runtime.test.ts. No paid provider requests or cache-hit claims.
