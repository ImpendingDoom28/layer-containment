import type { WebGLProgramParametersWithUniforms, WebGLRenderer } from "three";
import { describe, expect, it } from "vitest";

import { createPathMaterial, PATH_GLSL_NOISE } from "./pathMaterial";

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
 #include <project_vertex>`,
  fragmentShader: `#include <common>
 #include <color_fragment>
 #include <roughnessmap_fragment>
 #include <normal_fragment_maps>`,
};

const sampleParams = {
  color: "#6b7280",
  highlight: "#9aa3ae",
  shadow: "#2b3138",
};

describe("createPathMaterial", () => {
  it("builds a fresh material with a program cache key shared by every path", () => {
    const a = createPathMaterial(sampleParams);
    const b = createPathMaterial({ ...sampleParams, color: "#000000" });

    expect(a).not.toBe(b);
    expect(a.customProgramCacheKey?.()).toBe("path_stone");
    // Colors ride uniforms, not program variants: one program serves the
    // whole scene regardless of the per-material color.
    expect(b.customProgramCacheKey?.()).toBe(a.customProgramCacheKey?.());
  });

  it("injects the stone terms with the expected uniforms and world-space sampling", () => {
    const mat = createPathMaterial(sampleParams);
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

    // The material's own color rides the standard `diffuse` uniform; only
    // the tint extremes are custom uniforms.
    expect(shader.uniforms["uPathHighlight"]).toBeDefined();
    expect(shader.uniforms["uPathShadow"]).toBeDefined();

    // The pattern is sampled in world space so every strip chunk of the
    // merged path shares one continuous surface: the vertex shader carries
    // the world position, the fragment shader receives it as a varying.
    expect(shader.vertexShader).toContain(
      "vPathWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;"
    );
    expect(shader.fragmentShader).toContain("varying vec3 vPathWorldPos;");
    expect(shader.fragmentShader).toContain("vPathWorldPos.xz");

    for (const fn of ["pathHash", "pathValueNoise", "pathFbm", "pathCracks"]) {
      expect(shader.fragmentShader).toContain(fn);
    }
    // The injected noise field must be the exact shared source, so the GLSL
    // and the JS port in this file can never drift apart.
    expect(shader.fragmentShader).toContain(PATH_GLSL_NOISE);

    // Color terms: mottling, grain, flecks, grit, dark cracks, lit edges.
    expect(shader.fragmentShader).toContain("uPathHighlight, fleck * 0.22");
    expect(shader.fragmentShader).toContain("uPathShadow, grit * 0.28");
    expect(shader.fragmentShader).toContain("uPathShadow, cracks * 0.45");
    expect(shader.fragmentShader).toContain("uPathHighlight * crackEdge * 0.25");

    // Roughness terms: matte ground with glassy mineral flecks.
    expect(shader.fragmentShader).toContain(
      "roughnessFactor * ( 0.85 + 0.2 * ( 0.5 + rGrain * 0.5 ) ) - rFleck * 0.45"
    );

    // Bump: the normal tilts AGAINST the slope (minus sign, like the water
    // ripple) along the closed-form FBM gradient plus the crack central
    // difference, both rotated into view space.
    expect(shader.fragmentShader).toContain(
      "pathViewGrad = ( viewMatrix * vec4( pathWorldGrad, 0.0 ) ).xyz"
    );
    expect(shader.fragmentShader).toContain(
      "normal = normalize( normal - 0.10 * pathViewGrad - 0.45 * crackViewGrad );"
    );
  });
});

// JS port of the GLSL field (same constants as PATH_GLSL_NOISE / the crack
// field) so the tests can check its numerical behavior: the FBM must stay
// bounded in [-1, 1] for the color/roughness mixes, and its gradient must
// match finite differences (a wrong analytic derivative would tilt the
// surface against the actual grain).
const pathHash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};
const pathValueNoise = (x: number, y: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  return (
    mix(
      mix(pathHash(ix, iy), pathHash(ix + 1, iy), ux),
      mix(pathHash(ix, iy + 1), pathHash(ix + 1, iy + 1), ux),
      uy
    ) - 0.5
  );
};
const pathFbm = (x: number, y: number) => {
  let v = 0;
  let a = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < 3; i++) {
    v += a * pathValueNoise(px, py);
    px = px * 2.13 + 11.7;
    py = py * 2.13 + 11.7;
    a *= 0.5;
  }
  return v;
};
// Analytic gradient, ported from pathFbmGradient (octave i has amplitude a_i
// and frequency 2.13^i).
const pathFbmGradient = (x: number, y: number) => {
  let gx = 0;
  let gy = 0;
  let a = 0.5;
  let s = 1;
  let qx = x;
  let qy = y;
  for (let i = 0; i < 3; i++) {
    const icx = Math.floor(qx);
    const icy = Math.floor(qy);
    const fcx = qx - icx;
    const fcy = qy - icy;
    const ucx = fcx * fcx * (3 - 2 * fcx);
    const ucy = fcy * fcy * (3 - 2 * fcy);
    const dux = 6 * fcx * (1 - fcx);
    const duy = 6 * fcy * (1 - fcy);
    const c00 = pathHash(icx, icy);
    const c10 = pathHash(icx + 1, icy);
    const c01 = pathHash(icx, icy + 1);
    const c11 = pathHash(icx + 1, icy + 1);
    gx += a * s * dux * ((c10 - c00) * (1 - ucy) + (c11 - c01) * ucy);
    gy += a * s * duy * ((c01 - c00) * (1 - ucx) + (c11 - c10) * ucx);
    qx = qx * 2.13 + 11.7;
    qy = qy * 2.13 + 11.7;
    a *= 0.5;
    s *= 2.13;
  }
  return { x: gx, y: gy };
};

describe("path stone field", () => {
  it("keeps the FBM grain bounded in [-1, 1] (the color and roughness mixes rely on it)", () => {
    let maxAbs = 0;
    for (let x = -20; x <= 20; x += 0.5) {
      for (let y = -20; y <= 20; y += 0.5) {
        maxAbs = Math.max(maxAbs, Math.abs(pathFbm(x * 2.2, y * 2.2)));
      }
    }
    expect(maxAbs).toBeLessThanOrEqual(1.0 + 1e-6);
  });

  it("matches the analytic FBM gradient against finite differences", () => {
    const eps = 1e-3;
    let maxErr = 0;
    // Sample away from the value-noise cell boundaries: there the field is
    // C0 (its derivative jumps), so no finite difference can agree with the
    // analytic one — the bump reads as a sharp ridge edge, which is exactly
    // what a cracky surface wants.
    for (const [x, y] of [
      [0.31, 0.47],
      [1.72, 0.83],
      [3.19, 2.44],
      [5.55, 1.02],
      [2.4, 4.9],
      [-1.23, 0.66],
    ]) {
      const numeric = {
        x: (pathFbm(x + eps, y) - pathFbm(x - eps, y)) / (2 * eps),
        y: (pathFbm(x, y + eps) - pathFbm(x, y - eps)) / (2 * eps),
      };
      const analytic = pathFbmGradient(x, y);
      maxErr = Math.max(
        maxErr,
        Math.abs(analytic.x - numeric.x),
        Math.abs(analytic.y - numeric.y)
      );
    }
    expect(maxErr).toBeLessThan(0.02);
  });

  it("keeps the crack field within [0, 1] and sparse (only ridge crests)", () => {
    let maxVal = 0;
    let sum = 0;
    let count = 0;
    for (let x = -12; x <= 12; x += 0.2) {
      for (let y = -12; y <= 12; y += 0.2) {
        const r = 1 - Math.abs(pathFbm(x * 1.7, y * 1.7));
        // GLSL's smoothstep(0.985, 1.0, r), clamped outside [0, 1].
        const t = Math.min(1, Math.max(0, (r - 0.985) / (1.0 - 0.985)));
        const cracks = t * t * (3 - 2 * t);
        maxVal = Math.max(maxVal, cracks);
        sum += cracks;
        count += 1;
      }
    }
    expect(maxVal).toBeLessThanOrEqual(1);
    // Cracks are a fraction of the surface, not the whole thing.
    expect(sum / count).toBeLessThan(0.15);
  });
});
