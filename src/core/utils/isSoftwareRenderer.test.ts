/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";

const importFresh = async () => {
  vi.resetModules();
  return import("./isSoftwareRenderer");
};

// Makes document.createElement("canvas") return a fake canvas whose
// getContext emulates a given renderer (or no WebGL at all). Only the canvas
// tag is used by the code under test, so other tags may return null.
const stubCanvas = (
  renderer: string | null,
  opts: { webgl2First?: boolean } = {}
) => {
  const fakeGL = {
    getExtension: () =>
      renderer === null ? null : { UNMASKED_RENDERER_WEBGL: 0x9246 },
    getParameter: () => renderer,
  };
  const getContext = (type: string) => {
    if (type === "webgl2" && opts.webgl2First) return fakeGL;
    if (type === "webgl") return fakeGL;
    return null;
  };
  vi.spyOn(document, "createElement").mockImplementation(
    (tag: string): HTMLElement =>
      tag === "canvas"
        ? ({ getContext } as unknown as HTMLCanvasElement)
        : (null as unknown as HTMLElement)
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isSoftwareRenderer", () => {
  it("detects SwiftShader (headless CI)", async () => {
    stubCanvas(
      "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (LLVM 10.0.0) (0x0000C0DE)), SwiftShader driver)"
    );
    const { isSoftwareRenderer } = await importFresh();
    expect(isSoftwareRenderer()).toBe(true);
  });

  it("detects llvmpipe (mesa software rasterizer)", async () => {
    stubCanvas("llvmpipe (LLVM 15.0.7 256 bits)");
    const { isSoftwareRenderer } = await importFresh();
    expect(isSoftwareRenderer()).toBe(true);
  });

  it("detects via the webgl2 context path too", async () => {
    stubCanvas("SwiftShader", { webgl2First: true });
    const { isSoftwareRenderer } = await importFresh();
    expect(isSoftwareRenderer()).toBe(true);
  });

  it("is false for a hardware GPU", async () => {
    stubCanvas(
      "ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)"
    );
    const { isSoftwareRenderer } = await importFresh();
    expect(isSoftwareRenderer()).toBe(false);
  });

  it("is false when no WebGL context is available", async () => {
    vi.spyOn(document, "createElement").mockImplementation(
      () => ({ getContext: () => null } as unknown as HTMLCanvasElement)
    );
    const { isSoftwareRenderer } = await importFresh();
    expect(isSoftwareRenderer()).toBe(false);
  });

  it("is false when the debug renderer extension is unavailable", async () => {
    stubCanvas(null);
    const { isSoftwareRenderer } = await importFresh();
    expect(isSoftwareRenderer()).toBe(false);
  });
});
