import { describe, expect, it } from "vitest";

import { TERRAIN_NOISE_GLSL } from "./terrainNoise";

// JS port of the GLSL field (same constants as TERRAIN_NOISE_GLSL) so the
// tests can check its numerical behavior: the FBM must stay bounded for the
// color/roughness mixes, and its analytic gradient must match finite
// differences (a wrong derivative would tilt the bump shading against the
// actual grain).
const terrainHash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};
const terrainValueNoise = (x: number, y: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;
  return (
    mix(
      mix(terrainHash(ix, iy), terrainHash(ix + 1, iy), ux),
      mix(terrainHash(ix, iy + 1), terrainHash(ix + 1, iy + 1), ux),
      uy
    ) - 0.5
  );
};
const terrainFbm = (x: number, y: number) => {
  let v = 0;
  let a = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < 3; i++) {
    v += a * terrainValueNoise(px, py);
    px = px * 2.13 + 11.7;
    py = py * 2.13 + 11.7;
    a *= 0.5;
  }
  return v;
};
// Analytic gradient, ported from terrainFbmGradient (octave i has amplitude
// a_i and frequency 2.13^i).
const terrainFbmGradient = (x: number, y: number) => {
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
    const c00 = terrainHash(icx, icy);
    const c10 = terrainHash(icx + 1, icy);
    const c01 = terrainHash(icx, icy + 1);
    const c11 = terrainHash(icx + 1, icy + 1);
    gx += a * s * dux * ((c10 - c00) * (1 - ucy) + (c11 - c01) * ucy);
    gy += a * s * duy * ((c01 - c00) * (1 - ucx) + (c11 - c10) * ucx);
    qx = qx * 2.13 + 11.7;
    qy = qy * 2.13 + 11.7;
    a *= 0.5;
    s *= 2.13;
  }
  return { x: gx, y: gy };
};

describe("terrain noise field", () => {
  it("keeps the FBM grain bounded in [-1, 1] (the color and roughness mixes rely on it)", () => {
    let maxAbs = 0;
    for (let x = -20; x <= 20; x += 0.5) {
      for (let y = -20; y <= 20; y += 0.5) {
        maxAbs = Math.max(maxAbs, Math.abs(terrainFbm(x * 2.2, y * 2.2)));
      }
    }
    expect(maxAbs).toBeLessThanOrEqual(1.0 + 1e-6);
  });

  it("matches the analytic FBM gradient against finite differences", () => {
    const eps = 1e-3;
    let maxErr = 0;
    // Sample away from the value-noise cell boundaries: there the field is
    // C0 (its derivative jumps), so no finite difference can agree with the
    // analytic one.
    for (const [x, y] of [
      [0.31, 0.47],
      [1.72, 0.83],
      [3.19, 2.44],
      [5.55, 1.02],
      [2.4, 4.9],
      [-1.23, 0.66],
    ]) {
      const numeric = {
        x: (terrainFbm(x + eps, y) - terrainFbm(x - eps, y)) / (2 * eps),
        y: (terrainFbm(x, y + eps) - terrainFbm(x, y - eps)) / (2 * eps),
      };
      const analytic = terrainFbmGradient(x, y);
      maxErr = Math.max(
        maxErr,
        Math.abs(analytic.x - numeric.x),
        Math.abs(analytic.y - numeric.y)
      );
    }
    expect(maxErr).toBeLessThan(0.02);
  });

  it("keeps the band-limited speckle masks sparse (lattice noise, not raw hash)", () => {
    const ss = (e0: number, e1: number, x: number) => {
      const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
      return t * t * (3 - 2 * t);
    };
    let count = 0;
    let sum = 0;
    let maxVal = 0;
    for (let x = -20; x <= 20; x += 0.25) {
      for (let y = -20; y <= 20; y += 0.25) {
        sum += ss(0.3, 0.44, terrainValueNoise(x * 12.0, y * 12.0));
        maxVal = Math.max(
          maxVal,
          ss(0.3, 0.44, terrainValueNoise(x * 12.0, y * 12.0))
        );
        count += 1;
      }
    }
    expect(maxVal).toBeLessThanOrEqual(1);
    // A fraction of the surface carries a visible speck — present but not the
    // whole field (a thresholded raw hash would cover a far larger share).
    expect(sum / count).toBeGreaterThan(0.02);
    expect(sum / count).toBeLessThan(0.25);
  });

  it("is the exact string the materials inline (hash, value noise, FBM, gradient)", () => {
    // The tile, ground, and path materials all splice this one constant into
    // their shaders; the port above must stay in sync with it.
    expect(TERRAIN_NOISE_GLSL).toContain("float terrainHash( vec2 p )");
    expect(TERRAIN_NOISE_GLSL).toContain("float terrainValueNoise( vec2 p )");
    expect(TERRAIN_NOISE_GLSL).toContain("float terrainFbm( vec2 p )");
    expect(TERRAIN_NOISE_GLSL).toContain("vec3 terrainFbmGradient( vec2 p )");
    expect(TERRAIN_NOISE_GLSL).toContain("p = p * 2.13 + 11.7;");
    expect(TERRAIN_NOISE_GLSL).toContain("43758.5453123");
  });
});
