/**
 * User path for the opt-in Langfuse example plugin (ADR 0334, ADR 0335).
 *
 * Loads the committed artifact through the real TrustedExtensionRunner and the
 * real jiti loader, then drives a whole turn. The sink is a local stub server:
 * these tests never reach a real Langfuse instance.
 *
 * What this proves end to end:
 *  - the artifact loads with no `node_modules` beside it (marketplace shape),
 *  - `getAgentDir` resolves, so the config file can be read,
 *  - an unconfigured install registers nothing and exports nothing,
 *  - a configured install exports one OTLP request per settled turn,
 *  - the kill switch returns it to zero export,
 *  - settings saved by the host's plugin-settings sheet reach the export, and
 *    reloading the plugin (a new Runner) picks up a changed file,
 *  - a saved value reaches a fresh module import, and the layer split ADR 0335
 *    documents is proved in `langfuse-settings-layers.test.ts`, not here.
 *
 * Isolation notes, which matter because every test here loads real extension
 * code into this one process:
 *  - each test gets its own `spec.id`, the sidecar's module-cache key, so a
 *    test never inherits another test's loaded module (and therefore its
 *    captured environment baseline);
 *  - the environment this plugin owns is cleared before every test, so a
 *    value installed by an earlier test cannot masquerade as an inherited one.
 */
import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TrustedExtensionRunner, clearTrustedExtensionCache } from "./runner.js";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "../../../../examples/plugins/pi-langfuse");
const artifact = join(pluginRoot, "agent", "langfuse.mjs");

/** The plugin id, and the directory name the host derives from it. */
const PLUGIN_ID = "pi.langfuse";
const PLUGIN_DATA_DIR = PLUGIN_ID.replace(/[^a-zA-Z0-9._-]/g, "_");

/** The variables the config bridge may own (ADR 0335). */
const BRIDGE_OWNED_ENV = [
  "LANGFUSE_TRACING_ENABLED",
  "LANGFUSE_BASE_URL",
  "LANGFUSE_PUBLIC_KEY",
  "LANGFUSE_SECRET_KEY",
  "LANGFUSE_USER_ID",
  "LANGFUSE_TRACING_ENVIRONMENT",
  "LANGFUSE_RELEASE",
  "PI_LANGFUSE_MAX_CHARS",
  "LANGFUSE_MEDIA_UPLOAD_ENABLED",
];

const ENV_KEYS = [
  "PI_CODING_AGENT_DIR",
  "PI_DESKTOP_DATA_DIR",
  ...BRIDGE_OWNED_ENV,
  "LANGFUSE_HOST",
  "PI_LANGFUSE_DEBUG",
] as const;

type SpanAttribute = { key: string; value: Record<string, unknown> };
type Request = {
  method: string;
  url: string;
  authorization?: string;
  bytes: number;
  /** The decoded body, parsed as the OTLP/JSON payload the SDK posts. */
  payload: unknown;
  attributes: SpanAttribute[];
};

let work: string;
let agentDir: string;
let dataDir: string;
let saved: Record<string, string | undefined>;
let sink: { origin: string; requests: Request[]; close: () => Promise<void> };

/** The credentials a test writes when it saves from the panel. */
const PANEL_A = { publicKey: "pk-lf-panel-a", secretKey: "sk-lf-panel-a" };
const PANEL_B = { publicKey: "pk-lf-panel-b", secretKey: "sk-lf-panel-b" };

function flattenAttributes(payload: any): SpanAttribute[] {
  const out: SpanAttribute[] = [];
  for (const resource of payload?.resourceSpans ?? []) {
    for (const scope of resource?.scopeSpans ?? []) {
      for (const span of scope?.spans ?? []) {
        out.push(...(span?.attributes ?? []));
      }
    }
  }
  return out;
}

/** A stub OTLP sink that records what the extension tried to export. */
async function startSink(): Promise<typeof sink> {
  const requests: Request[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      let payload: unknown = {};
      try {
        payload = JSON.parse(body.toString("utf8"));
      } catch {
        // A non-JSON export is still an export; the attribute assertions
        // below will fail loudly rather than silently see nothing.
      }
      requests.push({
        method: req.method ?? "",
        url: req.url ?? "",
        authorization: req.headers.authorization,
        bytes: body.length,
        payload,
        attributes: flattenAttributes(payload),
      });
      // Langfuse answers 207 with a per-item body; the exporter only needs 2xx.
      res.writeHead(207, { "content-type": "application/json" });
      res.end(JSON.stringify({ partialSuccess: {} }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub sink has no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((done) => {
        server.close(() => done());
      }),
  };
}

function bridge() {
  const statuses: Array<{ key: string; text: string }> = [];
  return {
    statuses,
    bridge: {
      sessionId: "langfuse-user-path",
      cwd: pluginRoot,
      getModel: () => ({ id: "stub-model", provider: "stub-provider" }),
      setModel: async () => true,
      getThinkingLevel: () => "off",
      setThinkingLevel: () => {},
      isIdle: () => true,
      abort: () => {},
      hasPendingMessages: () => false,
      getContextUsage: () => undefined,
      compact: () => {},
      getSystemPrompt: () => "",
      getActiveTools: () => [],
      getAllTools: () => [],
      setActiveTools: () => {},
      getSessionName: () => undefined,
      setSessionName: () => {},
      sendUserMessage: () => {},
      waitForIdle: async () => {},
      newSession: async () => ({ cancelled: false }),
      fork: async () => ({ cancelled: false }),
      requestUi: async (
        _extension: unknown,
        request: { kind: string; key?: string; text?: string },
      ) => {
        if (request.kind === "setStatus" && typeof request.key === "string") {
          statuses.push({ key: request.key, text: request.text ?? "" });
        }
        return { kind: request.kind };
      },
      publishCommands: () => {},
      publishDiagnostics: () => {},
    },
  };
}

/**
 * One Runner for one session.
 *
 * Two Runners built with the same `specId` share the loaded extension module,
 * which is what a plugin reload inside a live app does: the sidecar keeps the
 * process and its import-time constants, and re-runs the factory. A new
 * `specId` imports the module again, which is what an app restart does.
 */
function newRunner(specId: string) {
  const { bridge: hostBridge, statuses } = bridge();
  const runner = new TrustedExtensionRunner({
    specs: [
      {
        id: specId,
        entry: artifact,
        label: "Langfuse",
        source: "plugin",
        root: pluginRoot,
      },
    ],
    // The bridge is a wide host contract; this stub implements the members the
    // runner and this extension actually touch.
    bridge: hostBridge as unknown as ConstructorParameters<
      typeof TrustedExtensionRunner
    >[0]["bridge"],
  });
  return { runner, statuses };
}

let testSequence = 0;

/** A spec id no other test can collide with. */
function uniqueSpecId(label: string): string {
  testSequence += 1;
  return `${PLUGIN_ID}.${label}.${testSequence}`;
}

/** One full turn: session start, prompt, assistant reply, settle. */
async function runTurn(
  runner: TrustedExtensionRunner,
  prompt = "summarise the readme",
): Promise<void> {
  await runner.emit("session_start", { type: "session_start", reason: "startup" });
  await runner.emit("before_agent_start", {
    type: "before_agent_start",
    messageType: "user",
    prompt,
    systemPrompt: "",
    systemPromptOptions: {},
  });
  await runner.emit("message_end", {
    type: "message_end",
    message: {
      role: "assistant",
      content: [{ type: "text", text: "the readme describes an opt-in tracer" }],
      model: "stub-model",
      provider: "stub-provider",
      stopReason: "stop",
      usage: { input: 12, output: 8, totalTokens: 20 },
    },
  });
  await runner.emit("agent_settled", { type: "agent_settled" });
}

function writeConfig(config: Record<string, unknown>): void {
  writeFileSync(join(agentDir, "langfuse.json"), `${JSON.stringify(config, null, 2)}\n`);
}

/**
 * Write what the host's settings sheet would have written.
 *
 * The layout is the host's own: `<data>/plugins/data/<sanitized-id>/settings.json`
 * (spec 07-plugins/11 §4). `example-langfuse-plugin.test.mjs` pins this formula
 * against `pluginDataDir()` in Electron main, so a divergence fails a test here
 * instead of silently reading nothing.
 */
function writePluginSettings(settings: Record<string, unknown>): void {
  const dir = join(dataDir, "plugins", "data", PLUGIN_DATA_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
}

function traceExports(): Request[] {
  return sink.requests.filter((r) => r.url === "/api/public/otel/v1/traces");
}

function basicPair(request: Request): string {
  return Buffer.from(
    (request.authorization ?? "").replace(/^Basic /, ""),
    "base64",
  ).toString("utf8");
}

/** The value of the first span attribute whose key ends with `suffix`. */
function attributeValue(request: Request, suffix: string): string | undefined {
  const found = request.attributes.find((a) => a.key.endsWith(suffix));
  const value = found?.value as { stringValue?: string } | undefined;
  return value?.stringValue;
}

/** The panel's full row set, as the host would write it after any save. */
function panelSettings(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    enabled: true,
    baseUrl: sink.origin,
    userId: "",
    environment: "",
    release: "",
    maxChars: 20000,
    uploadImages: true,
    ...overrides,
  };
}

beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), "pi-langfuse-user-path-"));
  agentDir = join(work, "agent");
  dataDir = join(work, "data");
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  // The config file is the user's own; point the shim at an isolated one.
  process.env.PI_CODING_AGENT_DIR = agentDir;
  // Isolate the plugin's settings file too, so no host profile is read.
  process.env.PI_DESKTOP_DATA_DIR = dataDir;
  // No extension module from an earlier test may be reused here.
  clearTrustedExtensionCache();
  sink = await startSink();
});

afterEach(async () => {
  for (const key of ENV_KEYS) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  clearTrustedExtensionCache();
  await sink.close();
  rmSync(work, { recursive: true, force: true });
});

describe("Langfuse example plugin user path", () => {
  it("loads the committed artifact with no dependency tree beside it", async () => {
    const { runner } = newRunner(uniqueSpecId("load"));
    const [report] = await runner.load();
    expect(report.state).toBe("loaded");
    expect(runner.getDiagnostics()).toEqual([]);
    await runner.dispose();
  });

  it("registers nothing and exports nothing without credentials", async () => {
    const { runner } = newRunner(uniqueSpecId("no-keys"));
    const [report] = await runner.load();
    expect(report.state).toBe("loaded");
    // No keys: the factory returns before subscribing to any turn event.
    expect(report.eventNames).toEqual(["session_start"]);

    await runTurn(runner);
    await runner.dispose();
    expect(sink.requests).toEqual([]);
  });

  it("tells the user it is off when no credentials resolve", async () => {
    const { runner, statuses } = newRunner(uniqueSpecId("off-status"));
    await runner.load();
    await runner.emit("session_start", { type: "session_start", reason: "startup" });
    await runner.dispose();
    expect(statuses).toContainEqual({ key: "langfuse", text: "langfuse: off (no keys)" });
  });

  it("confirms the export on the status line after a configured turn", async () => {
    writeConfig({
      publicKey: "pk-lf-test-public",
      secretKey: "sk-lf-test-secret",
      baseUrl: sink.origin,
    });
    const { runner, statuses } = newRunner(uniqueSpecId("status"));
    await runner.load();
    await runTurn(runner);
    await runner.dispose();
    expect(statuses).toContainEqual({ key: "langfuse", text: "langfuse ✓" });
    expect(statuses).toContainEqual({ key: "langfuse", text: "langfuse ✓ (trace sent)" });
  });

  it("exports one OTLP request per settled turn once configured", async () => {
    writeConfig({
      publicKey: "pk-lf-test-public",
      secretKey: "sk-lf-test-secret",
      baseUrl: sink.origin,
    });
    const specId = uniqueSpecId("export");
    const { runner } = newRunner(specId);
    const [report] = await runner.load();
    expect(report.state).toBe("loaded");
    expect(report.eventNames).toContain("agent_settled");

    await runTurn(runner);
    await runner.dispose();

    const exports = traceExports();
    expect(exports.length).toBeGreaterThanOrEqual(1);
    for (const request of exports) {
      expect(request.method).toBe("POST");
      expect(request.bytes).toBeGreaterThan(0);
      // Basic auth carries the user's own ingest keys, never a shipped pair.
      expect(request.authorization).toMatch(/^Basic /);
      expect(basicPair(request)).toBe("pk-lf-test-public:sk-lf-test-secret");
    }
    // The turn is named and typed the way the spec's span model says.
    expect(attributeValue(exports[0], "langfuse.trace.name")).toBe("Pi Turn");
    expect(attributeValue(exports[0], "langfuse.observation.type")).toBe("span");
  });

  it("exports nothing when the kill switch is set, even with keys present", async () => {
    writeConfig({
      publicKey: "pk-lf-test-public",
      secretKey: "sk-lf-test-secret",
      baseUrl: sink.origin,
    });
    process.env.LANGFUSE_TRACING_ENABLED = "false";
    const { runner } = newRunner(uniqueSpecId("kill"));
    const [report] = await runner.load();
    expect(report.state).toBe("loaded");
    expect(report.eventNames).toEqual(["session_start"]);

    await runTurn(runner);
    await runner.dispose();
    expect(sink.requests).toEqual([]);
  });

  it("prefers environment credentials over the config file", async () => {
    writeConfig({
      publicKey: "pk-lf-file-public",
      secretKey: "sk-lf-file-secret",
      baseUrl: "http://127.0.0.1:9",
    });
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-env-public";
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-env-secret";
    process.env.LANGFUSE_BASE_URL = sink.origin;
    const { runner } = newRunner(uniqueSpecId("env-over-file"));
    await runner.load();
    await runTurn(runner);
    await runner.dispose();

    const exports = traceExports();
    expect(exports.length).toBeGreaterThanOrEqual(1);
    expect(basicPair(exports[0])).toBe("pk-lf-env-public:sk-lf-env-secret");
  });
});

describe("settings edited in the plugin sheet", () => {
  it("exports with the credentials the panel saved", async () => {
    writePluginSettings(panelSettings(PANEL_A));
    const { runner } = newRunner(uniqueSpecId("panel-keys"));
    await runner.load();
    await runTurn(runner);
    await runner.dispose();

    const exports = traceExports();
    expect(exports.length).toBeGreaterThanOrEqual(1);
    expect(basicPair(exports[0])).toBe(`${PANEL_A.publicKey}:${PANEL_A.secretKey}`);
  });

  it("picks up a saved change when the plugin is reloaded", async () => {
    // One spec id across both Runners: the second load re-uses the module, so
    // this is a disable/enable cycle inside a live sidecar, not a restart.
    const specId = uniqueSpecId("reload");
    writePluginSettings(panelSettings(PANEL_A));
    const first = newRunner(specId);
    await first.runner.load();
    await runTurn(first.runner);
    await first.runner.dispose();
    expect(traceExports().length).toBeGreaterThanOrEqual(1);

    // What saving in the sheet does: rewrite the file.
    writePluginSettings(panelSettings(PANEL_B));
    const second = newRunner(specId);
    await second.runner.load();
    await runTurn(second.runner);
    await second.runner.dispose();

    const pairs = traceExports().map(basicPair);
    expect(pairs.length).toBeGreaterThanOrEqual(2);
    expect(pairs[0]).toBe(`${PANEL_A.publicKey}:${PANEL_A.secretKey}`);
    expect(pairs[pairs.length - 1]).toBe(`${PANEL_B.publicKey}:${PANEL_B.secretKey}`);
  });

  it("ignores an empty field instead of overriding the file it falls back to", async () => {
    writeConfig({
      publicKey: "pk-lf-file-public",
      secretKey: "sk-lf-file-secret",
      baseUrl: sink.origin,
    });
    writePluginSettings(panelSettings({ publicKey: "", secretKey: "" }));
    const { runner } = newRunner(uniqueSpecId("empty-falls-through"));
    await runner.load();
    await runTurn(runner);
    await runner.dispose();

    const exports = traceExports();
    expect(exports.length).toBeGreaterThanOrEqual(1);
    expect(basicPair(exports[0])).toBe("pk-lf-file-public:sk-lf-file-secret");
  });

  it("stops all export when the panel disables tracing", async () => {
    writePluginSettings(panelSettings({ ...PANEL_A, enabled: false }));
    const { runner, statuses } = newRunner(uniqueSpecId("panel-off"));
    const [report] = await runner.load();
    await runTurn(runner);
    await runner.dispose();

    expect(report.eventNames).toEqual(["session_start"]);
    expect(sink.requests).toEqual([]);
    expect(statuses).toContainEqual({ key: "langfuse", text: "langfuse: off (no keys)" });
  });
});