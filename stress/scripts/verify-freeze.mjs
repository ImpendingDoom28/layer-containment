/**
 * Correctness check for the frozen-subtree optimization:
 *  1. Numerically verify every frozen node's baked `matrixWorld` is exactly
 *     equal to what a fresh full recompute (unfreeze + updateMatrixWorld)
 *     produces — i.e. no stale matrices.
 *  2. Screenshot the stress scene with the freeze active as a visual sanity
 *     check that tiles / path / ground / skybox / end-building are placed
 *     correctly.
 *
 * The check toggles only the originally-frozen nodes, so dynamic nodes
 * (enemies/towers) keep their per-frame updates throughout.
 */
import { chromium } from "@playwright/test";

import {
  ensureStressServer,
  safeClose,
  STRESS_URL,
} from "../stress-server.mjs";

await ensureStressServer();

const browser = await chromium.launch({ args: ["--use-angle=metal"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
await page.goto(STRESS_URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });

console.log("[verify] waiting 8 s for steady state...");
await page.waitForTimeout(8_000);

const result = await page.evaluate(() => {
  const scene = window.__stressScene;

  // The nodes the app froze.
  const frozen = [];
  scene.traverse((o) => {
    if (o.matrixWorldAutoUpdate === false) frozen.push(o);
  });

  // Capture each frozen node's baked world matrix (ground truth to compare).
  const baked = frozen.map((o) => ({ o, m: o.matrixWorld.clone() }));

  // Unfreeze exactly those nodes and recompute the whole scene (all the
  // ancestors/descendants that feed their world matrices get recomputed too).
  for (const o of frozen) {
    o.matrixAutoUpdate = true;
    o.matrixWorldAutoUpdate = true;
  }
  scene.updateMatrixWorld(true);

  // Compare each frozen node's baked matrix against the fresh recompute.
  let maxDiff = 0;
  let badNodes = 0;
  for (const { o, m } of baked) {
    const e = o.matrixWorld.elements;
    const r = m.elements;
    let d = 0;
    for (let i = 0; i < 16; i++) d = Math.max(d, Math.abs(e[i] - r[i]));
    if (d > 1e-6) badNodes += 1;
    if (d > maxDiff) maxDiff = d;
  }

  // Restore the app state: recompute (everything live), then re-freeze the
  // original set. `traverse` is parent-first, so re-baking each node's local
  // matrix then its world matrix from its already-re-baked parent is exact.
  scene.updateMatrixWorld(true);
  for (const o of frozen) {
    o.matrixAutoUpdate = false;
    o.matrixWorldAutoUpdate = false;
  }
  scene.traverse((o) => {
    if (o.matrixWorldAutoUpdate === false) {
      o.updateMatrix();
      if (o.parent) o.matrixWorld.multiplyMatrices(o.parent.matrixWorld, o.matrix);
      else o.matrixWorld.copy(o.matrix);
    }
  });

  return { frozen: frozen.length, maxDiff, badNodes };
});

console.log("\n===== FROZEN-MATRIX CORRECTNESS =====");
console.log(`frozen nodes checked: ${result.frozen}`);
console.log(`max |baked - recompute| across 16 elements: ${result.maxDiff.toExponential(2)}`);
console.log(`nodes with diff > 1e-6: ${result.badNodes}`);
console.log(result.badNodes === 0 ? "PASS: all baked world matrices match a fresh recompute" : "FAIL: stale matrices detected");
if (result.badNodes > 0) process.exitCode = 1;

const shot = await page.screenshot({ path: "profiling/stress-freeze-on.png" });
console.log("\n[screenshot] saved profiling/stress-freeze-on.png", shot.length, "bytes");

if (pageErrors.length) {
  console.log("\npage errors:");
  for (const e of pageErrors.slice(0, 5)) console.log("  ", e);
}
await safeClose(browser);
