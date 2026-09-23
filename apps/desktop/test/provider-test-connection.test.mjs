// Verifies the providers:test handler drives a real chat-ping request instead
// of probing a discovery endpoint, and that the response-shape contract the
// renderer depends on is preserved across apiStyle × status combinations.
import assert from "node:assert/strict";
import test from "node:test";
import { register } from "node:module";

register(new URL("./helpers/ts-import-hooks.mjs", import.meta.url));

const { IPC } = await import("@pi-desktop/shared");
const { registerProviderIpc } = await import(
  "../electron/main/ipc/provider-ipc.ts"
);

function makeHost(responses) {
  return {
    calls: [],
    async call(method, input) {
      this.calls.push({ method, input });
      const key = `${method}|${JSON.stringify(input ?? {})}`;
      if (key in responses) return responses[key];
      if (method in responses) return responses[method];
      throw new Error(`unexpected host.call: ${method}`);
    },
  };
}

function captureHandlers() {
  const map = new Map();
  const registrar = {
    handle(channel, fn) {
      map.set(channel, fn);
    },
  };
  return { registrar, map };
}

const stubDeps = (overrides = {}) => ({
  modelsDevCatalog: {
    refresh: async () => ({ refreshed: false }),
    ensureLoaded: async () => undefined,
    loadLocal: async () => undefined,
    getStatus: () => ({ source: "bundled" }),
    findModel: () => undefined,
    modelsForProvider: () => [],
  },
  vendorOAuth: {
    listVendors: async () => [],
    start: async () => ({}),
    resolveAuth: async () => ({}),
  },
  logger: { app: () => undefined },
  enrichProvider: (p) => p,
  listRuntimeProviders: async () => [],
  enrichProviderList: async (r) => r,
  bindingForModel: () => undefined,
  ...overrides,
});

function installFetch(mock) {
  const original = globalThis.fetch;
  globalThis.fetch = mock;
  return () => {
    globalThis.fetch = original;
  };
}

test("anthropic_messages sends POST /v1/messages with x-api-key + anthropic-version", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://example.com",
        authKind: "api_key",
        apiStyle: "anthropic_messages",
        defaultModelId: "claude-3-haiku",
      },
    },
    "providers.getSecret": { value: "sk-ant-test" },
  });
  let hostRef = host;
  registerProviderIpc({
    registrar,
    getHost: () => hostRef,
    ...stubDeps(),
  });

  const calls = [];
  const restore = installFetch(async (url, init) => {
    calls.push({ url, init });
    return new Response('{"id":"x"}', { status: 200, headers: { "content-type": "application/json" } });
  });

  try {
    const result = await map.get(IPC.invoke.providersTest)("provider-1");
    assert.deepEqual(result, { ok: true, network: "ok", status: 200 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://example.com/v1/messages");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["x-api-key"], "sk-ant-test");
    assert.equal(calls[0].init.headers["anthropic-version"], "2023-06-01");
    assert.equal(calls[0].init.headers["Content-Type"], "application/json");
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body, {
      model: "claude-3-haiku",
      max_tokens: 8,
      messages: [{ role: "user", content: "ping" }],
    });
  } finally {
    restore();
  }
});

test("anthropic_messages: baseUrl already ending in /v1/messages is not doubled", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://proxy.example.com/v1/messages",
        authKind: "api_key",
        apiStyle: "anthropic_messages",
        defaultModelId: "claude-3-haiku",
      },
    },
    "providers.getSecret": { value: "k" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const calls = [];
  const restore = installFetch(async (url) => {
    calls.push(url);
    return new Response("{}", { status: 200 });
  });
  try {
    await map.get(IPC.invoke.providersTest)("p");
    assert.equal(calls[0], "https://proxy.example.com/v1/messages");
  } finally {
    restore();
  }
});

test("chat_completions sends POST /chat/completions with Bearer auth", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://openai.example.com/v1",
        authKind: "api_key",
        apiStyle: "chat_completions",
        defaultModelId: "gpt-4o-mini",
      },
    },
    "providers.getSecret": { value: "sk-openai" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const calls = [];
  const restore = installFetch(async (url, init) => {
    calls.push({ url, init });
    return new Response("{}", { status: 200 });
  });
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.deepEqual(result, { ok: true, network: "ok", status: 200 });
    assert.equal(calls[0].url, "https://openai.example.com/v1/chat/completions");
    assert.equal(calls[0].init.headers.Authorization, "Bearer sk-openai");
    assert.equal(calls[0].init.headers["Content-Type"], "application/json");
  } finally {
    restore();
  }
});

test("401 maps to PROVIDER_UNAUTHORIZED", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://example.com",
        authKind: "api_key",
        apiStyle: "chat_completions",
        defaultModelId: "m",
      },
    },
    "providers.getSecret": { value: "bad-key" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const { ErrorCodes } = await import("@pi-desktop/shared");
  const restore = installFetch(async () => new Response("{}", { status: 401 }));
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.equal(result.ok, false);
    assert.equal(result.network, "failed");
    assert.equal(result.status, 401);
    assert.equal(result.errorCode, ErrorCodes.PROVIDER_UNAUTHORIZED);
  } finally {
    restore();
  }
});

test("404 surfaces 'endpoint or model not found' message", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://example.com",
        authKind: "api_key",
        apiStyle: "anthropic_messages",
        defaultModelId: "missing-model",
      },
    },
    "providers.getSecret": { value: "k" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const restore = installFetch(async () => new Response("{}", { status: 404 }));
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.match(result.message, /不存在/);
  } finally {
    restore();
  }
});

test("non-2xx with JSON error body lifts error.message", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://example.com",
        authKind: "api_key",
        apiStyle: "chat_completions",
        defaultModelId: "m",
      },
    },
    "providers.getSecret": { value: "k" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const restore = installFetch(
    async () =>
      new Response(JSON.stringify({ error: { message: "quota exceeded" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
  );
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.equal(result.message, "quota exceeded");
  } finally {
    restore();
  }
});

test("fetch abort maps to TIMEOUT", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://example.com",
        authKind: "api_key",
        apiStyle: "chat_completions",
        defaultModelId: "m",
      },
    },
    "providers.getSecret": { value: "k" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const { ErrorCodes } = await import("@pi-desktop/shared");
  const restore = installFetch(async (_url, init) => {
    // Wait for the AbortSignal to fire from the 8s timer; speed it up by
    // aborting immediately.
    await new Promise((resolve) => {
      if (init.signal.aborted) resolve();
      init.signal.addEventListener("abort", resolve, { once: true });
      // Simulate fetch throwing on abort without waiting 8s.
      setTimeout(() => init.signal.dispatchEvent(new Event("abort")), 0);
    });
    const err = new Error("aborted");
    err.name = "AbortError";
    throw err;
  });
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.equal(result.ok, false);
    assert.equal(result.errorCode, ErrorCodes.TIMEOUT);
    assert.ok(result.message.length > 0);
  } finally {
    restore();
  }
});

test("missing defaultModelId surfaces a helpful message and skips the network call", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://example.com",
        authKind: "api_key",
        apiStyle: "chat_completions",
        defaultModelId: undefined,
      },
    },
    "providers.getSecret": { value: "k" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const calls = [];
  const restore = installFetch(async (url) => {
    calls.push(url);
    return new Response("{}", { status: 200 });
  });
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.equal(result.ok, false);
    assert.equal(result.network, "skipped");
    assert.match(result.message, /默认模型/);
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test("unsupported apiStyle skips network probe and reports success", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: true },
    "providers.get": {
      provider: {
        baseUrl: "https://example.com",
        authKind: "api_key",
        apiStyle: "google_generative_ai",
        defaultModelId: "gemini-2.0-flash",
      },
    },
    "providers.getSecret": { value: "k" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const calls = [];
  const restore = installFetch(async (url) => {
    calls.push(url);
    return new Response("{}", { status: 200 });
  });
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.deepEqual(result, { ok: true, network: "skipped" });
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});

test("local validation failure skips the network probe", async () => {
  const { registrar, map } = captureHandlers();
  const host = makeHost({
    "providers.testConnection": { ok: false, message: "secret missing" },
  });
  let hostRef = host;
  registerProviderIpc({ registrar, getHost: () => hostRef, ...stubDeps() });
  const calls = [];
  const restore = installFetch(async (url) => {
    calls.push(url);
    return new Response("{}", { status: 200 });
  });
  try {
    const result = await map.get(IPC.invoke.providersTest)("p");
    assert.equal(result.ok, false);
    assert.equal(result.network, "skipped");
    assert.equal(result.message, "secret missing");
    assert.equal(calls.length, 0);
  } finally {
    restore();
  }
});
