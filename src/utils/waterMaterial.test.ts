import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import {
  createWaterMaterial,
  getWaterMaterial,
  WATER_AMPLITUDE,
  type WaterTimeUniform,
} from "./waterMaterial";

// three r183 no longer exports the old `Shader` type; onBeforeCompile now
// receives WebGLProgramParametersWithUniforms. The tests only need the three
// mutable fields the hook patches.
type ShaderStub = Pick<
  WebGLProgramParametersWithUniforms,
  "uniforms" | "vertexShader" | "fragmentShader"
>;

const minimalShaderForHook: ShaderStub = {
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
  amplitude: WATER_AMPLITUDE,
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
    const shader: ShaderStub = {
      uniforms: { ...minimalShaderForHook.uniforms },
      vertexShader: minimalShaderForHook.vertexShader,
      fragmentShader: minimalShaderForHook.fragmentShader,
    };

    const onBeforeCompile = mat.onBeforeCompile;
    if (onBeforeCompile == null) {
      throw new Error("expected onBeforeCompile");
    }
    onBeforeCompile(
      shader as WebGLProgramParametersWithUniforms,
      {} as WebGLRenderer
    );

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
      "roughnessFactor = roughnessFactor * ( 0.7 + 0.6 * waterR );"
    );
    expect(shader.fragmentShader).toContain("waterRippleGradient( vWaterWorldPos.xz )");
    expect(shader.fragmentShader).toContain("( viewMatrix * vec4( waterWorldGrad, 0.0 ) ).xyz");
    // A height-field normal tilts against the slope (minus sign), and the
    // gradient carries the world XZ components (gz in the Z slot).
    expect(shader.fragmentShader).toContain(
      "normal = normalize( normal - 0.12 * waterViewGrad );"
    );
    expect(shader.fragmentShader).toContain("vec3( gx, 0.0, gz )");
    // Depth: the vertex shader displaces the top surface along local Y,
    // sampled in world-space XZ so adjacent tiles swell as one field.
    expect(shader.vertexShader).toContain("waterElevated( waterLocal.y )");
    expect(shader.vertexShader).toContain("waterHeight( waterWorldXZ )");
    expect(shader.vertexShader).toContain(
      "transformed.y += uWaterAmplitude * waterHeight( waterWorldXZ ) * waterElevated( waterLocal.y );"
    );
    // Organic motion: the field is sines plus drifting FBM noise, and the
    // gradient is a central difference of the full field (sines + noise share
    // one exact derivative).
    for (const fn of ["waterHash", "waterValueNoise", "waterFbm"]) {
      expect(shader.vertexShader).toContain(fn);
      expect(shader.fragmentShader).toContain(fn);
    }
    expect(shader.fragmentShader).toContain("waterHeight( p + vec2( eps, 0.0 ) )");
    expect(shader.fragmentShader).toContain("const float eps = 0.035");
  });
});

// JS port of the GLSL field (t = 0) so the tests can bound it numerically:
// the swell must stay smaller than the tile's 0.05 recess or it pokes
// through the shoreline.
const waterHash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};
const waterValueNoise = (x: number, y: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  return (
    mix(
      mix(waterHash(ix, iy), waterHash(ix + 1, iy), ux),
      mix(waterHash(ix, iy + 1), waterHash(ix + 1, iy + 1), ux),
      uy
    ) - 0.5
  );
};
const waterFbm = (x: number, y: number) => {
  let v = 0;
  let a = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < 3; i++) {
    v += a * waterValueNoise(px, py);
    px = px * 2.13 + 11.7;
    py = py * 2.13 + 11.7;
    a *= 0.5;
  }
  return v;
};
const waterHeightAt = (x: number, y: number, t: number) => {
  const waves =
    (Math.sin(x * 2.1 + t * 0.9) * 0.5 +
      Math.sin((x * 0.6 + y * 1.7) * 1.8 - t * 0.7) * 0.3 +
      Math.sin((x * 0.9 - y * 1.3) * 1.1 + t * 0.5) * 0.2 +
      Math.sin((x * 4.3 + y * 2.9) * 1.4 + t * 1.6) * 0.15) *
    0.5;
  return waves + waterFbm(x + t * 0.12, y - t * 0.7 * 0.12) * 0.55;
};

describe("wave field range", () => {
  it("keeps the swell inside the tile's 0.05 basin at the tile amplitude", () => {
    // The water top face sits mid-basin (0.025 above the ground sphere,
    // 0.025 below the shore), so the swell must stay under 0.025 both ways.
    let maxAbs = 0;
    for (let t = 0; t < 30; t += 0.5) {
      for (let x = -5; x <= 5; x += 0.25) {
        for (let y = -5; y <= 5; y += 0.25) {
          maxAbs = Math.max(maxAbs, Math.abs(waterHeightAt(x, y, t)));
        }
      }
    }
    // The field's real peak is ~0.78; cap it so the clearance below keeps
    // margin, and assert the swell (amplitude × field) fits the basin.
    expect(maxAbs).toBeLessThan(0.9);
    expect(WATER_AMPLITUDE * maxAbs).toBeLessThan(0.025);
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
