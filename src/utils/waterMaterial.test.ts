import type { Shader, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import {
  createWaterMaterial,
  getWaterMaterial,
  type WaterTimeUniform,
} from "./waterMaterial";

const minimalShaderForHook: Shader = {
  uniforms: {},
  vertexShader: `#include <common>
 #include <begin_vertex>
 #include <project_vertex>`,
  fragmentShader: `#include <common>
vec3 totalEmissiveRadiance = emissive;
#include <color_fragment>
#include <roughnessmap_fragment>
#include <normal_fragment_maps>`,
};

const sampleParams = {
  color: "#0e7490",
  glow: "#22d3ee",
  time: { value: 0 } as WaterTimeUniform,
  amplitude: 0.05,
  topY: 0.025,
};

describe("getWaterMaterial", () => {
  it("exposes onBeforeCompile and a program cache key shared by every body", () => {
    const mat = getWaterMaterial(
      sampleParams.color,
      sampleParams.time,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
    );

    expect(mat.onBeforeCompile).toBeDefined();
    expect(mat.customProgramCacheKey).toBeDefined();
    const key = mat.customProgramCacheKey?.();
    expect(key).toBeTruthy();
    // Color/amplitude ride uniforms, not program variants: one program serves
    // the whole scene regardless of body color or size.
    const otherMat = getWaterMaterial(
      "#ff0000",
      sampleParams.time,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
    );
    expect(otherMat.customProgramCacheKey?.()).toBe(key);
  });

  it("caches one material per color+size and shares the time uniform", () => {
    const a = getWaterMaterial(
      sampleParams.color,
      sampleParams.time,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
    );
    const b = getWaterMaterial(
      sampleParams.color.toUpperCase().replace("#", "#"),
      sampleParams.time,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
    );
    expect(b).toBe(a);

    const other = getWaterMaterial(
      "#ff0000",
      sampleParams.time,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
    );
    expect(other).not.toBe(a);

    // Same color, different swell: distinct materials (different uniforms).
    const deeper = getWaterMaterial(
      sampleParams.color,
      sampleParams.time,
      sampleParams.glow,
      0.1,
      0.025
    );
    expect(deeper).not.toBe(a);
  });

  it("scopes the cache by clock so a body of the same color on another clock gets its own material", () => {
    const clockA = { value: 0 } as WaterTimeUniform;
    const clockB = { value: 0 } as WaterTimeUniform;

    const onA = getWaterMaterial(
      sampleParams.color,
      clockA,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
    );
    const onB = getWaterMaterial(
      sampleParams.color,
      clockB,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
    );

    // Same color, different clocks: distinct materials, each bound to its clock.
    expect(onB).not.toBe(onA);
  });

  it("injects ripple code with the expected uniforms and world-space varying", () => {
    const mat = getWaterMaterial(
      sampleParams.color,
      sampleParams.time,
      sampleParams.glow,
      sampleParams.amplitude,
      sampleParams.topY
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
    expect(shader.uniforms["uWaterAmplitude"]?.value).toBe(
      sampleParams.amplitude
    );
    expect(shader.uniforms["uWaterTopY"]?.value).toBe(sampleParams.topY);

    expect(shader.vertexShader).toContain("vWaterWorldPos");
    expect(shader.fragmentShader).toContain("uWaterTime");
    expect(shader.fragmentShader).toContain("uWaterGlow");
    expect(shader.fragmentShader).toContain("waterRipple");
    // The ripple is sampled in world space so adjacent bodies share one wave.
    expect(shader.fragmentShader).toContain("waterRipple( vWaterWorldPos.xz )");
    expect(shader.fragmentShader).not.toContain("vWaterLocalPos");
    // Reflections must visibly move: roughness shimmers and the normal is
    // perturbed along the wave field's gradient (view space via viewMatrix).
    expect(shader.fragmentShader).toContain(
      "roughnessFactor = roughnessFactor * ( 0.6 + 0.7 * waterR );"
    );
    expect(shader.fragmentShader).toContain("waterRippleGradient( vWaterWorldPos.xz )");
    expect(shader.fragmentShader).toContain("( viewMatrix * vec4( waterWorldGrad, 0.0 ) ).xyz");
    expect(shader.fragmentShader).toContain(
      "normal = normalize( normal + 0.4 * waterViewGrad );"
    );
    // Depth: the vertex shader displaces the top surface along local Y,
    // sampled in world-space XZ so adjacent tiles swell as one field.
    expect(shader.vertexShader).toContain("waterElevated( waterLocal.y )");
    expect(shader.vertexShader).toContain("waterHeight( waterWorldXZ )");
    expect(shader.vertexShader).toContain(
      "transformed.y += uWaterAmplitude * waterHeight( waterWorldXZ ) * waterElevated( waterLocal.y );"
    );
  });
});

describe("createWaterMaterial", () => {
  it("builds a fresh material each call (per-tile use is disposed by the caller)", () => {
    const a = createWaterMaterial({ ...sampleParams });
    const b = createWaterMaterial({ ...sampleParams });
    expect(a).not.toBe(b);
    expect(a.customProgramCacheKey?.()).toBe("water_ripple");
  });
});
