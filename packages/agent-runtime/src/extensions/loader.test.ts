import { homedir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createCodingAgentShim, createVirtualModules } from "./loader.js";

/**
 * The coding-agent compatibility shim (spec 07-plugins/16 §4.2).
 *
 * `getAgentDir` is what lets an extension that persists settings beside pi's
 * resolve its config file. The Langfuse example extension imports it as its
 * only runtime value from the kernel and calls it during `loadConfig()`, so a
 * missing export is a load failure rather than a degraded feature.
 */
type AgentDirShim = { getAgentDir: () => string };

function shim(onMissingApi?: (symbol: string) => void): AgentDirShim {
  return createCodingAgentShim(onMissingApi) as AgentDirShim;
}

describe("coding-agent shim", () => {
  const original = process.env.PI_CODING_AGENT_DIR;

  beforeEach(() => {
    delete process.env.PI_CODING_AGENT_DIR;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = original;
  });

  it("resolves pi's default agent directory", () => {
    expect(shim().getAgentDir()).toBe(join(homedir(), ".pi", "agent"));
  });

  it("honours PI_CODING_AGENT_DIR and trims it", () => {
    process.env.PI_CODING_AGENT_DIR = "  /tmp/custom-agent  ";
    expect(shim().getAgentDir()).toBe("/tmp/custom-agent");
  });

  it("falls back to the default for an empty or blank override", () => {
    const expected = join(homedir(), ".pi", "agent");
    for (const value of ["", "   "]) {
      process.env.PI_CODING_AGENT_DIR = value;
      expect(shim().getAgentDir()).toBe(expected);
    }
  });

  it("reads the override at call time, not at shim construction", () => {
    const resolved = shim();
    process.env.PI_CODING_AGENT_DIR = "/tmp/late-agent";
    expect(resolved.getAgentDir()).toBe("/tmp/late-agent");
  });

  it("does not report getAgentDir as a missing API", () => {
    const missing: string[] = [];
    const resolved = shim((symbol) => missing.push(symbol));
    // Both access paths jiti uses: `in` for a named import, then the read.
    expect("getAgentDir" in resolved).toBe(true);
    expect(resolved.getAgentDir()).toBe(join(homedir(), ".pi", "agent"));
    expect(missing).toEqual([]);
  });

  it("still reports an export the shim does not implement", () => {
    const missing: string[] = [];
    const resolved = shim((symbol) => missing.push(symbol));
    expect("somethingUnsupported" in resolved).toBe(false);
    expect(missing).toContain("somethingUnsupported");
  });

  it("exposes getAgentDir through the virtual kernel module", () => {
    const modules = createVirtualModules({ extensionId: "pi.langfuse" });
    const kernel = modules["@earendil-works/pi-coding-agent"] as AgentDirShim;
    expect(kernel.getAgentDir()).toBe(join(homedir(), ".pi", "agent"));
  });
});