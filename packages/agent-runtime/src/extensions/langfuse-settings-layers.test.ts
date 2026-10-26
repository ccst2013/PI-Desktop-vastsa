/**
 * The second application layer of the Langfuse example plugin (ADR 0335).
 *
 * `PI_LANGFUSE_MAX_CHARS` is read when the extension module is evaluated, not
 * when its factory runs. So a saved value reaches a trace only once the module
 * is imported again — which a live app does by restarting, because the sidecar
 * keeps one process and the runner keeps one module per spec id.
 *
 * This file exists on its own because that makes the assertion honest: the
 * first load here is the first import of the module in this worker, so the
 * value it observes is the one the panel saved, and the second load with the
 * same spec id is the plugin reload that must NOT pick it up. Other tests in
 * the same file would import the module first and freeze the constant on their
 * own settings.
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
const PLUGIN_DATA_DIR = "pi.langfuse".replace(/[^a-zA-Z0-9._-]/g, "_");

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
const ENV_KEYS = ["PI_CODING_AGENT_DIR", "PI_DESKTOP_DATA_DIR", ...BRIDGE_OWNED_ENV] as const;

let work: string;
let dataDir: string;
let saved: Record<string, string | undefined>;
let sink: { origin: string; bodies: string[]; close: () => Promise<void> };

async function startSink() {
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      bodies.push(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(207, { "content-type": "application/json" });
      res.end(JSON.stringify({ partialSuccess: {} }));
    });
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("stub sink has no port");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    bodies,
    close: () => new Promise<void>((done) => server.close(() => done())),
  };
}

function newRunner(specId: string) {
  const runner = new TrustedExtensionRunner({
    specs: [
      { id: specId, entry: artifact, label: "Langfuse", source: "plugin", root: pluginRoot },
    ],
    bridge: {
      sessionId: "langfuse-layers",
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
      requestUi: async (_e: unknown, r: { kind: string }) => ({ kind: r.kind }),
      publishCommands: () => {},
      publishDiagnostics: () => {},
    } as unknown as ConstructorParameters<typeof TrustedExtensionRunner>[0]["bridge"],
  });
  return runner;
}

async function runTurn(runner: TrustedExtensionRunner, prompt: string): Promise<void> {
  await runner.emit("session_start", { type: "session_start", reason: "startup" });
  await runner.emit("before_agent_start", {
    type: "before_agent_start",
    messageType: "user",
    prompt,
    systemPrompt: "",
    systemPromptOptions: {},
  });
  await runner.emit("agent_settled", { type: "agent_settled" });
}

function writePluginSettings(settings: Record<string, unknown>): void {
  const dir = join(dataDir, "plugins", "data", PLUGIN_DATA_DIR);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "settings.json"), `${JSON.stringify(settings, null, 2)}\n`);
}

/** The prompt truncation metadata upstream wrote into the last export. */
function lastPromptMeta(): { truncated: boolean; orig_len: number; kept_len?: number } {
  const body = sink.bodies[sink.bodies.length - 1];
  if (!body) throw new Error("the extension exported nothing");
  const payload = JSON.parse(body) as {
    resourceSpans?: { scopeSpans?: { spans?: { attributes?: { key: string; value: { stringValue?: string } }[] }[] }[] }[];
  };
  for (const resource of payload.resourceSpans ?? []) {
    for (const scope of resource.scopeSpans ?? []) {
      for (const span of scope.spans ?? []) {
        const attribute = (span.attributes ?? []).find((a) =>
          a.key.endsWith("user_text_meta"),
        );
        if (attribute?.value.stringValue) return JSON.parse(attribute.value.stringValue);
      }
    }
  }
  throw new Error("no user_text_meta attribute in the export");
}

beforeEach(async () => {
  work = mkdtempSync(join(tmpdir(), "pi-langfuse-layers-"));
  dataDir = join(work, "data");
  mkdirSync(dataDir, { recursive: true });
  saved = {};
  for (const key of ENV_KEYS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  process.env.PI_CODING_AGENT_DIR = join(work, "agent");
  process.env.PI_DESKTOP_DATA_DIR = dataDir;
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

describe("the import-time layer", () => {
  it("applies a saved max length on the first load and keeps it across a reload", async () => {
    const marker = "q".repeat(400);
    const specId = "pi.langfuse.layers";
    const settings = (maxChars: number) => ({
      enabled: true,
      baseUrl: sink.origin,
      publicKey: "pk-lf-layer",
      secretKey: "sk-lf-layer",
      userId: "",
      environment: "",
      release: "",
      uploadImages: true,
      maxChars,
    });

    writePluginSettings(settings(50));
    const first = newRunner(specId);
    await first.load();
    await runTurn(first, marker);
    await first.dispose();
    // The panel value was installed before the module was evaluated, so
    // upstream truncated to it.
    expect(lastPromptMeta()).toMatchObject({ truncated: true, orig_len: 400, kept_len: 50 });

    writePluginSettings(settings(400));
    const second = newRunner(specId);
    await second.load();
    await runTurn(second, marker);
    await second.dispose();
    // The same spec id re-uses the loaded module, so the constant is frozen at
    // the value the process started with: a reload does not apply this row.
    expect(lastPromptMeta().kept_len).toBe(50);
  });
});