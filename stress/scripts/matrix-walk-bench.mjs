/**
 * Direct microbenchmark of the per-frame scene-graph matrix walk.
 *
 * The renderer calls `scene.updateMatrixWorld()` once per frame. With
 * `matrixAutoUpdate = true`, every node re-composes its local 4x4 matrix from
 * position/quaternion/scale each frame even when the transform never changes.
 * The frozen-subtree optimization sets `matrixAutoUpdate =
 * matrixWorldAutoUpdate = false` on static subtrees so those composes are
 * skipped.
 *
 * This script loads the stress scene, then measures the average cost of
 * `scene.updateMatrixWorld()` in two states:
 *   ON  — the real app state (static subtrees frozen, dynamic nodes live)
 *   OFF — every node unfrozen (the pre-optimization behavior)
 * The difference is the per-frame CPU saving of the freeze, measured
 * directly (no display-cap quantization).
 */
import { chromium } from "@playwright/test";

import {
  ensureStressServer,
  safeClose,
  STRESS_URL,
} from "../stress-server.mjs";

const ITERATIONS = 3000;
const WARMUP = 300;

await ensureStressServer();

const browser = await chromium.launch({ args: ["--use-angle=metal"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(STRESS_URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });

console.log("[bench] waiting 8 s for steady state (shader compile, scene build)...");
await page.waitForTimeout(8_000);

const result = await page.evaluate(({ ITER, WARM }) => {
  const scene = window.__stressScene;

  let total = 0;
  let frozen = 0;
  scene.traverse((o) => {
    total += 1;
    if (o.matrixWorldAutoUpdate === false) frozen += 1;
  });

  const setFlags = (autoUpdate) => {
    scene.traverse((o) => {
      o.matrixAutoUpdate = autoUpdate;
      o.matrixWorldAutoUpdate = autoUpdate;
    });
  };

  const bench = () => {
    for (let i = 0; i < WARM; i++) scene.updateMatrixWorld();
    const t0 = performance.now();
    for (let i = 0; i < ITER; i++) scene.updateMatrixWorld();
    return (performance.now() - t0) / ITER;
  };

  // Phase ON: the real app state — static subtrees frozen, dynamic nodes live.
  const onMs = bench();

  // Phase OFF: unfreeze everything (pre-optimization behavior), re-bake, measure.
  setFlags(true);
  scene.updateMatrixWorld(true);
  const offMs = bench();

  // Restore the frozen state: re-bake with flags on, then freeze again.
  setFlags(false);
  scene.updateMatrixWorld(true);

  return { total, frozen, onMs, offMs };
}, { ITER: ITERATIONS, WARM: WARMUP });

console.log("\n===== PER-FRAME MATRIX WALK (scene.updateMatrixWorld) =====");
console.log(`scene nodes: ${result.total}  (frozen by the freeze: ${result.frozen})`);
console.log(`freeze ON  (app state): ${result.onMs.toFixed(3)} ms/call`);
console.log(`freeze OFF (no freeze): ${result.offMs.toFixed(3)} ms/call`);
const delta = result.offMs - result.onMs;
console.log(`per-frame saving:          ${delta.toFixed(3)} ms`);
console.log(`per-node cost (off):       ${(1e6 * result.offMs / result.total).toFixed(1)} ns`);
console.log(`per-node cost (on):        ${(1e6 * result.onMs / result.total).toFixed(1)} ns`);
if (result.frozen > 0) {
  console.log(`frozen-node share of walk: ${((100 * result.frozen) / result.total).toFixed(1)}% of scene nodes`);
}
if (pageErrors.length) {
  console.log("\npage errors:");
  for (const e of pageErrors.slice(0, 5)) console.log("  ", e);
}
await safeClose(browser);
