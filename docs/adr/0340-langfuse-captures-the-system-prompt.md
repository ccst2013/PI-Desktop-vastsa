# ADR 0340: The Langfuse plugin records the system prompt

- Status: Accepted
- Date: 2026-11-04
- Deciders: PI-Desktop maintainers
- Related: [ADR 0334](0334-langfuse-ships-as-an-opt-in-example-plugin.md) ·
  [ADR 0335](0335-langfuse-settings-editable-in-the-plugin-sheet.md) ·
  [07-plugins/16-trusted-extensions](../spec/07-plugins/16-trusted-extensions.md) ·
  [03-runtime/09-logging-and-observability](../spec/03-runtime/09-logging-and-observability.md)

## Context

ADR 0334 ships the upstream extension `@langfuse/pi-observability-plugin` as an
opt-in example plugin, bundled from the version pinned in the root
`package.json`.

That package, at the pinned `0.1.2`, builds every LLM Call input out of its own
event stream: the user prompt for the first request of a turn, and the latest
tool results for every later one. The turn's root span gets the user message
and the final assistant text. **The system prompt is never recorded**, and the
only occurrence of a `system` role in the whole artifact is the unused `Role`
enum of `@langfuse/core`.

The extension receives three carriers of that text and reads none of them:

| Carrier | What it holds | Desktop wired it |
| --- | --- | --- |
| `before_provider_request.payload` | The prepared request: OpenAI-style `messages[0].role = "system"`/`"developer"`, Anthropic-style top-level `system` blocks, responses-API `instructions` | yes — `runtime.ts` forwards pi-ai's `onPayload` |
| `ctx.getSystemPrompt()` | The kernel's live prompt for the current agent (subagents included) | yes — `extensions/runner.ts` |
| `before_agent_start.systemPrompt` | The prompt the turn was started with, after handler edits | yes — same payload |

The result is a trace that cannot answer the question a generation exists to
answer: **what was the model told**. Cost is split into cache-read and
cache-write buckets for a prefix the reader cannot see, and a support
conversation about a refused instruction has no evidence in the trace.

Upstream `main` already fixes this — `readSystemPrompt(ctx.getSystemPrompt())`,
a system message prepended to the generation input, and history captured from
the `context` event — but npm publishes `0.1.0`–`0.1.2` only, so a pin bump
cannot reach it. Adopting that revision verbatim is also not possible here: it
imports `convertToLlm` from the kernel, and the Desktop shim exports
`defineTool`, the `is*ToolResult` guards, `getAgentDir`, and `VERSION` only.
`convertToLlm` is absent, and the history builder swallows the missing function
inside a `try`, so that half would fail silently.

ADR 0334 §4 decided the artifact is built from **unmodified** upstream bytes.
That decision was made to keep the diff reviewable against a published package,
not to freeze a data-loss defect.

## Decision

1. **One patch, applied at bundle time.** `scripts/langfuse-extension-patch.mjs`
   holds anchored edits over the pinned upstream TypeScript, applied through an
   esbuild `onLoad` step in `scripts/bundle-langfuse-extension.mjs`. Every anchor
   must match exactly once; a mismatch fails the build with the anchor's name,
   so an upstream bump cannot quietly ship traces without the prompt again. The
   artifact banner names the patch, the patch script, and this record.

2. **The generation input starts with the system message.** Resolution order is
   the provider payload, then `ctx.getSystemPrompt()`, then the
   `before_agent_start` event. The payload is first because it is what the model
   actually received: pi rewrites the system content for some providers
   (transcript-derived prompts, later system messages), and only the payload
   shows that. The kernel prompt is the fallback for a provider payload this
   patch cannot read; the event value is the fallback for a kernel context that
   has none.

3. **The patch reuses upstream's payload discipline.** The text goes through
   upstream's own `redactLangfuseKeys` and `truncateText`, so the existing
   `PI_LANGFUSE_MAX_CHARS` budget and the Langfuse-key redaction apply exactly
   as they do to a prompt. The truncation metadata lands in the generation's
   `system_prompt_meta`, next to the `assistant_text_meta` upstream already
   writes, so a shortened prompt says that it is shortened.

4. **The prompt is recorded on the generation, not on the root span.** The root
   span of a turn already carries the user message; repeating a large system
   prompt on it would double the exported bytes of every trace for no new
   information.

5. **The build input is pinned to the artifact's own baseline.** A plain
   `npm install` today resolves newer minors of the OpenTelemetry stack and
   rewrites thousands of unrelated lines, so `--check` could not tell a stale
   artifact from a moved dependency. The generator installs with
   `npm install --before=<baseline>`; that date is raised together with the pin,
   and the resulting dependency change is reviewed as part of the bump.

6. **Scope ends at the system prompt.** History capture (`context`), tool
   definitions, and `modelParameters` are upstream-`main` work that this patch
   does not backport. They are separate decisions with separate evidence.

7. **ADR 0334 §4 is superseded for this one patch**, and §7's export scope now
   includes the system prompt: the README table and the manifest's `safetyNotes`
   say so, because a system prompt can carry instructions the user never typed.

## Consequences

- A Langfuse generation now shows the full message list a provider received
  (system, then the user prompt or the tool results), so cost, cache behaviour,
  and refusals can be read against the text that caused them.
- The export surface grows: a system prompt can contain host-composed
  instructions and file contents from the workspace. It is truncated by the same
  budget and masked by the same redactor, but "your conversations leave the
  machine" is now a slightly larger statement, and the docs say it explicitly.
- The repository carries one patch over a vendored artifact. It is 70 lines of
  generated diff, anchored, and named in the banner; a reviewer reads the patch
  module and the artifact delta, not a fork.
- Upgrading is now a four-step review: raise the pin, raise the baseline date,
  re-apply the patch against the new source, and review both the artifact delta
  and the patch's anchor failures if any.
- `check:langfuse-extension` becomes meaningful again: it reproduces the
  committed bytes when given the pinned build input, instead of failing on
  dependency drift.
- Not covered: a provider payload that carries neither a system message nor a
  readable top-level field **and** a context without `getSystemPrompt()` still
  records no system message. The trace is then exactly what it is today, which
  is the honest outcome rather than a fabricated one.

## Alternatives

### Wait for the upstream release

Rejected. The fix exists only on `main`, the package is marked experimental, and
the gap is user-visible today: every trace in this release is missing the text
the model was given. A release date is not something this repository controls.

### Vendor a patched copy of upstream's source

Rejected. It duplicates ~1000 lines into this repository, loses the diff against
the published package, and turns every upstream bump into a manual merge.

### Patch at runtime from the settings bridge

Rejected. The bridge only controls the `ExtensionAPI` and the environment;
upstream constructs the generation input inside its own handler and owns the
observation object. Reaching it would mean monkey-patching `@langfuse/tracing`
internals, which breaks silently on a dependency bump.

### Record only a hash and length of the system prompt

Rejected. It bounds export size, but a hash does not answer "what was the model
told", which is the entire reason to record it. The existing character budget
already bounds the cost, and the truncation metadata states when it applied.

### Backport upstream `main` wholesale, including history capture

Rejected for this change. It needs `convertToLlm`, which the Desktop kernel shim
does not export, and it changes what every generation input contains. Both are
worth doing on their own evidence, not smuggled in with this fix.

## References

- `scripts/langfuse-extension-patch.mjs` — the patch and its anchors
- `scripts/bundle-langfuse-extension.mjs` — the `onLoad` step, the banner, and
  the pinned build input
- `examples/plugins/pi-langfuse/agent/langfuse.mjs` — the regenerated artifact
- `packages/agent-runtime/src/extensions/langfuse-extension.test.ts` — the LLM
  Call input against a stub sink
- `packages/agent-runtime/src/extensions/langfuse-settings-layers.test.ts` — the
  budget applied to the system prompt
- `apps/desktop/test/example-langfuse-plugin.test.mjs` — the patch module, the
  banner, and artifact reproduction
- `packages/agent-runtime/src/runtime.ts` — `before_provider_request` from
  pi-ai's `onPayload`
- `packages/agent-runtime/src/extensions/runner.ts` — `getSystemPrompt` and the
  `before_agent_start` payload
- `packages/agent-runtime/src/extensions/loader.ts` — the kernel shim exports