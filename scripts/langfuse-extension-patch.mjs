/**
 * The one local change applied to the pinned Langfuse extension (ADR 0340).
 *
 * Upstream `@langfuse/pi-observability-plugin@0.1.2` builds every LLM Call input
 * from its own event stream: the user prompt for the first request, the latest
 * tool results for every later one. The system prompt is never recorded, even
 * though the `before_provider_request` payload it receives carries exactly what
 * the provider was asked. A trace without it cannot answer "what was the model
 * told", which is the question a Langfuse generation exists to answer.
 *
 * This patch is a text transformation over upstream's TypeScript source, run
 * as an esbuild `onLoad` step in `bundle-langfuse-extension.mjs`:
 *
 *  1. the generation input is prefixed with a `system` message resolved from
 *     the provider payload, then the kernel's live prompt, then the
 *     `before_agent_start` event;
 *  2. that message is redacted and truncated with the plugin's own helpers, and
 *     the truncation metadata rides along so a shortened prompt says so;
 *  3. `before_agent_start` keeps the prompt it was handed as a last-resort
 *     fallback for a provider payload this patch cannot read.
 *
 * Anchors are exact and single-occurrence: an upstream bump that reshapes this
 * code fails the bundle instead of silently exporting traces without a system
 * prompt.
 */

/** The single patch this artifact carries. Named in the artifact banner. */
export const PATCH_SUMMARY = "system-prompt capture (ADR 0340)";

/**
 * Helper block inserted next to upstream's own redaction helpers. Written as a
 * raw string so the escapes in the injected source stay escapes.
 */
const HELPERS = String.raw`
// ---------------------------------------------------------------------------
// PI-Desktop patch (ADR 0340): record the system prompt the request carried.
// ---------------------------------------------------------------------------

type SystemPromptCapture = { message: { role: "system"; content: string }; meta: TruncationMeta };

/** Join the text of a string, a block array, or one content block. */
function systemTextOf(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() ? value : undefined;
  if (Array.isArray(value)) {
    const parts = value.map((part) => {
      if (typeof part === "string") return part.trim() ? part : undefined;
      if (part && typeof part === "object") {
        const block = part as { text?: unknown; content?: unknown };
        return systemTextOf(block.text) ?? systemTextOf(block.content);
      }
      return undefined;
    });
    const joined = parts.filter((part): part is string => !!part).join("\n\n");
    return joined.trim() ? joined : undefined;
  }
  return undefined;
}

/**
 * The system text a prepared provider request carries. OpenAI-style APIs put it
 * in the messages array, Anthropic and Bedrock in a top-level system parameter,
 * the responses API in instructions; all three shapes appear behind one session.
 */
function systemTextFromPayload(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const request = payload as { system?: unknown; instructions?: unknown; messages?: unknown };
  const declared = systemTextOf(request.system) ?? systemTextOf(request.instructions);
  if (declared) return declared;
  if (!Array.isArray(request.messages)) return undefined;
  const collected: string[] = [];
  for (const message of request.messages) {
    if (!message || typeof message !== "object") continue;
    const entry = message as { role?: unknown; content?: unknown };
    if (entry.role !== "system" && entry.role !== "developer") continue;
    const text = systemTextOf(entry.content);
    if (text) collected.push(text);
  }
  return collected.length ? collected.join("\n\n") : undefined;
}

/**
 * Resolve, redact and budget the system prompt for one generation. Every step
 * is inside a guard: tracing must never break a turn, and a provider payload
 * this patch does not understand falls through to the kernel's own prompt.
 */
function captureSystemPrompt(
  event: unknown,
  ctx: { getSystemPrompt?: () => string | undefined },
  fallback: string | undefined,
): SystemPromptCapture | undefined {
  let text: string | undefined;
  try {
    text = systemTextFromPayload((event as { payload?: unknown } | undefined)?.payload);
  } catch {
    text = undefined;
  }
  if (!text) {
    try {
      const live = ctx.getSystemPrompt?.();
      text = typeof live === "string" && live.trim() ? live : undefined;
    } catch {
      text = undefined;
    }
  }
  if (!text) text = fallback;
  if (typeof text !== "string" || !text.trim()) return undefined;
  const redacted = redactLangfuseKeys(text);
  if (typeof redacted !== "string" || !redacted.trim()) return undefined;
  const { text: kept, meta } = truncateText(redacted);
  return { message: { role: "system", content: kept }, meta };
}

/** System first, then whatever upstream would have sent on its own. */
function withSystemPrompt(capture: SystemPromptCapture | undefined, base: unknown): unknown {
  if (!capture) return base;
  return base === undefined ? [capture.message] : [capture.message, base];
}
`;

/** Each entry is one anchored edit; every anchor must match exactly once. */
const EDITS = [
  {
    name: "state carries the prompt the turn was started with",
    find: `  userText: string;
  turnImages: PiImagePart[];
}`,
    replace: `  userText: string;
  turnImages: PiImagePart[];
  systemPrompt?: string;
}`,
  },
  {
    name: "capture that prompt when the turn starts",
    find: `      userText,
      turnImages: [...promptImages],
    };`,
    replace: `      userText,
      turnImages: [...promptImages],
      systemPrompt: typeof event.systemPrompt === "string" ? event.systemPrompt : undefined,
    };`,
  },
  {
    name: "helpers next to the plugin's own redaction helpers",
    find: `const redactLangfuseKeys = createSecretRedactor();
`,
    replace: `const redactLangfuseKeys = createSecretRedactor();
${HELPERS}`,
  },
  {
    name: "generation input carries the system message",
    find: `    const index = ++state.generationCount;
    const generationInput =
      index === 1
        ? { role: "user", content: lastPromptText }
        : state.pendingToolResults.length
          ? { role: "tool", tool_results: state.pendingToolResults }
          : undefined;`,
    replace: `    const index = ++state.generationCount;
    const systemCapture = captureSystemPrompt(_event, ctx, state.systemPrompt);
    const generationInput = withSystemPrompt(
      systemCapture,
      index === 1
        ? { role: "user", content: lastPromptText }
        : state.pendingToolResults.length
          ? { role: "tool", tool_results: state.pendingToolResults }
          : undefined,
    );`,
  },
  {
    name: "generation metadata records the truncation",
    find: `        metadata: {
          assistant_index: index - 1,
          ...(ctx.model ? { provider: ctx.model.provider } : {}),
        },`,
    replace: `        metadata: {
          assistant_index: index - 1,
          ...(ctx.model ? { provider: ctx.model.provider } : {}),
          ...(systemCapture ? { system_prompt_meta: systemCapture.meta } : {}),
        },`,
  },
];

/**
 * Apply every anchored edit to upstream's source. Throws when an anchor is
 * missing or ambiguous, which is the only way a bump can reach the artifact
 * with the system prompt silently dropped again.
 */
export function applyLangfuseSourcePatch(source) {
  let patched = source;
  for (const edit of EDITS) {
    const occurrences = patched.split(edit.find).length - 1;
    if (occurrences !== 1) {
      throw new Error(
        `langfuse patch anchor "${edit.name}" matched ${occurrences} times, expected 1; ` +
          "the pinned upstream source changed — review the patch in scripts/langfuse-extension-patch.mjs",
      );
    }
    patched = patched.replace(edit.find, () => edit.replace);
  }
  return patched;
}

/** Names of the edits, for the generator's log line. */
export const PATCH_EDIT_NAMES = EDITS.map((edit) => edit.name);