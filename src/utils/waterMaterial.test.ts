import type { Shader, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { getWaterMaterial, type WaterTimeUniform } from "./waterMaterial";

const minimalShaderForHook: Shader = {
  uniforms: {},
  vertexShader: `#include <common>
 #include <project_vertex>`,
  fragmentShader: `#include <common>
vec3 totalEmissiveRadiance = emissive;
#include <color_fragment>`,
};

const sampleParams = {
  color: "#0e7490",
  glow: "#22d3ee",
  time: { value: 0 } as WaterTimeUniform,
};

describe("getWaterMaterial", () => {
  it("exposes onBeforeCompile and a program cache key shared by every body color", () => {
    const mat = getWaterMaterial(
      sampleParams.color,
      sampleParams.time,
      sampleParams.glow
    );

    expect(mat.onBeforeCompile).toBeDefined();
    expect(mat.customProgramCacheKey).toBeDefined();
    const key = mat.customProgramCacheKey?.();
    expect(key).toBeTruthy();
    // Color rides the standard `diffuse` uniform, time is a shared uniform:
    // one program serves the whole scene regardless of body color.
    const otherMat = getWaterMaterial(
      "#ff0000",
      sampleParams.time,
      sampleParams.glow
    );
    expect(otherMat.customProgramCacheKey?.()).toBe(key);
  });

  it("caches one material per body color and shares the time uniform", () => {
    const a = getWaterMaterial(
      sampleParams.color,
      sampleParams.time,
      sampleParams.glow
    );
    const b = getWaterMaterial(
      sampleParams.color.toUpperCase().replace("#", "#"),
      sampleParams.time,
      sampleParams.glow
    );
    expect(b).toBe(a);

    const other = getWaterMaterial(
      "#ff0000",
      sampleParams.time,
      sampleParams.glow
    );
    expect(other).not.toBe(a);
  });

  it("injects ripple code with the expected uniforms and world-space varying", () => {
    const mat = getWaterMaterial(
      sampleParams.color,
      sampleParams.time,
      sampleParams.glow
    );
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

    expect(shader.uniforms["uWaterTime"]).toBe(sampleParams.time);

    expect(shader.vertexShader).toContain("vWaterWorldPos");
    expect(shader.fragmentShader).toContain("uWaterTime");
    expect(shader.fragmentShader).toContain("uWaterGlow");
    expect(shader.fragmentShader).toContain("waterRipple");
    // The ripple is sampled in world space so adjacent bodies share one wave.
    expect(shader.fragmentShader).toContain("waterRipple( vWaterWorldPos.xz )");
    expect(shader.fragmentShader).not.toContain("vWaterLocalPos");
  });
});
