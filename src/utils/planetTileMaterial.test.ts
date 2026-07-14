import type { Shader, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { createPlanetTileMaterial } from "./planetTileMaterial";

const minimalShaderForHook: Shader = {
  uniforms: {},
  vertexShader: `#include <common>
#include <project_vertex>`,
  fragmentShader: `#include <common>
#include <color_fragment>`,
};

const sampleParams = {
  baseColor: "#888888",
  emissive: "#000000",
  emissiveIntensity: 0,
  metalness: 0.2,
  roughness: 0.9,
  tileSeed: 42,
  tileHalfHeight: 0.25,
  regolithHighlight: "#ffffff",
  regolithShadow: "#333333",
  transparent: false as const,
  opacity: 1,
};

describe("createPlanetTileMaterial", () => {
  it("exposes onBeforeCompile and a stable customProgramCacheKey for the same params", () => {
    const mat = createPlanetTileMaterial(sampleParams);

    expect(mat.onBeforeCompile).toBeDefined();
    expect(mat.customProgramCacheKey).toBeDefined();
    const cacheKey = mat.customProgramCacheKey?.();
    expect(cacheKey).toBe(
      `planet_${sampleParams.tileSeed}_${sampleParams.tileHalfHeight}_${sampleParams.transparent}_${sampleParams.opacity}`
    );
    expect(mat.customProgramCacheKey?.()).toBe(cacheKey);
  });

  it("injects fragment code without reserved GLSL identifier patch and with expected uniforms", () => {
    const mat = createPlanetTileMaterial(sampleParams);
    const shader: Shader = {
      uniforms: { ...minimalShaderForHook.uniforms },
      vertexShader: minimalShaderForHook.vertexShader,
      fragmentShader: minimalShaderForHook.fragmentShader,
    };

    const onBeforeCompile = mat.onBeforeCompile;
    if (onBeforeCompile == null) {
      throw new Error("expected onBeforeCompile");
    }
    onBeforeCompile(shader, {} as WebGLRenderer);

    expect(shader.fragmentShader).not.toMatch(/\bfloat patch\b/);
    expect(shader.fragmentShader).toContain("surfacePatch");
    expect(shader.fragmentShader).toContain("uTileSeed");
    expect(shader.fragmentShader).toContain("vPlanetTop");
    expect(shader.fragmentShader).toContain("uRegolithHighlight");

    expect(shader.vertexShader).toContain("uTileHalfHeight");
    expect(shader.vertexShader).toContain("vPlanetWorldPos");
  });
});
