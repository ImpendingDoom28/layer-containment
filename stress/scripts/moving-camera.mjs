/**
 * Moving-camera performance A/B harness.
 *
 * The static stress benchmarks (profile-stress / culling-probe) never move the
 * camera, so they are blind to the per-frame culling work that only runs while
 * the camera changes (a mouse drag changes it every frame). This harness
 * measures FPS / frame / draw calls / triangles in two phases:
 *
 *   1. IDLE  — camera static (baseline per-frame cost)
 *   2. MOVE  — continuous mouse drag (rotation) + WASD (translation), i.e.
 *              the "moving the camera with the mouse" case
 *
 * It also samples the live culled-group fraction so the A/B shows whether
 * culling is actually engaged during motion.
 *
 * Usage: node stress/scripts/moving-camera.mjs [--metal]
 */
import { chromium } from "@playwright/test";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");

const readStat = async (page, label) => {
  const text = await page.getByTestId("stress-stats-overlay").textContent();
  const line = text?.split("\n").find((l) => l.startsWith(`${label} `));
  return line ? line.split("  ").slice(1).join("  ").trim() : "";
};

const countGroups = (page) =>
  page.evaluate(() => {
    const scene = window.__stressScene;
    let total = 0;
    let visible = 0;
    // In the culling build, count exactly the culled entity roots (marked
    // `userData.culledEntity` by Enemy/Tower), not static groups (path,
    // corners) or nested groups (health bars), which would bias the culled
    // fraction. A control build has nothing hidden, so fall back to counting
    // groups that directly own a mesh — consistent with culling-probe.mjs.
    const marked = [];
    const findMarked = (o) => {
      if (o.isGroup && o.userData?.culledEntity) marked.push(o);
      for (const c of o.children) findMarked(c);
    };
    findMarked(scene);
    if (marked.length) {
      for (const g of marked) {
        total += 1;
        if (g.visible) visible += 1;
      }
    } else {
      const walk = (o) => {
        if (o.isGroup && o.children.some((c) => c.isMesh)) {
          total += 1;
          if (o.visible) visible += 1;
        }
        for (const c of o.children) walk(c);
      };
      walk(scene);
    }
    return { total, visible };
  });

await ensureStressServer();

const browser = await chromium.launch(
  METAL ? { args: ["--use-angle=metal"] } : undefined
);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(STRESS_URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });
console.log("[move] page loaded, waiting for 30s average window...");

let ready = false;
const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  const overlay = await page.getByTestId("stress-stats-overlay").textContent();
  if (overlay.includes("AVG FPS") && (await readStat(page, "STATUS")).includes("playing")) {
    ready = true;
    break;
  }
  console.log(`[move] +${((Date.now() - t0) / 1000).toFixed(0)}s fps=${await readStat(page, "FPS") || "?"}`);
}

const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN);
const num = (s) => parseFloat(String(s).replace(/[^0-9.-]/g, ""));
const validMetric = (values) => values.length > 0 && values.every(Number.isFinite);
const validGroups = (g) =>
  Number.isInteger(g?.total) && Number.isInteger(g?.visible) && g.total > 0 && g.visible >= 0 && g.visible <= g.total;
let invalidSample = false;

const samplePhase = async (label, durationMs) => {
  const fps = [];
  const frame = [];
  const draw = [];
  const tri = [];
  const start = Date.now();
  let lastGroups = null;
  while (Date.now() - start < durationMs) {
    fps.push(num(await readStat(page, "FPS")));
    frame.push(num(await readStat(page, "FRAME")));
    draw.push(num(await readStat(page, "DRAW CALLS")));
    tri.push(num(await readStat(page, "TRIANGLES")));
    if (!lastGroups || Date.now() - lastGroups.t > 4000) {
      lastGroups = { t: Date.now(), g: await countGroups(page) };
    }
    await page.waitForTimeout(600);
  }
  const g = lastGroups.g;
  if (!validMetric(fps) || !validMetric(frame) || !validMetric(draw) || !validMetric(tri) || !validGroups(g))
    invalidSample = true;
  const pct = g.total ? ((g.visible / g.total) * 100).toFixed(1) : "n/a";
  console.log(
    `[move] ${label}: avgFps=${avg(fps).toFixed(1)} minFps=${Math.min(...fps).toFixed(1)} avgFrame=${avg(frame).toFixed(2)}ms maxFrame=${Math.max(...frame).toFixed(2)}ms avgDraw=${avg(draw).toFixed(0)} avgTri=${avg(tri).toFixed(0)} groups=${g.visible}/${g.total} visible (${pct}%)`
  );
  return { label, avgFps: avg(fps), minFps: Math.min(...fps), avgFrame: avg(frame) };
};

console.log("[move] phase 1: IDLE (static camera) 15s...");
const idle = await samplePhase("IDLE", 15_000);

console.log("[move] phase 2: MOVE (mouse drag + WASD) 25s...");
// Start dragging: hold button and stream mouse moves (rotation) while moving
// with WASD (translation), mirroring real camera control.
await page.mouse.move(640, 360);
await page.mouse.down();
await page.keyboard.down("w");
await page.keyboard.down("d");

const moveStart = Date.now();
// Sample during the move in parallel with generating input.
const samplePromise = (async () => {
  const fps = [];
  const frame = [];
  const draw = [];
  const tri = [];
  const start = Date.now();
  let lastGroups = null;
  while (Date.now() - start < 25_000) {
    fps.push(num(await readStat(page, "FPS")));
    frame.push(num(await readStat(page, "FRAME")));
    draw.push(num(await readStat(page, "DRAW CALLS")));
    tri.push(num(await readStat(page, "TRIANGLES")));
    if (!lastGroups || Date.now() - lastGroups.t > 4000) {
      lastGroups = { t: Date.now(), g: await countGroups(page) };
    }
    await page.waitForTimeout(600);
  }
  const g = lastGroups.g;
  if (!validMetric(fps) || !validMetric(frame) || !validMetric(draw) || !validMetric(tri) || !validGroups(g))
    invalidSample = true;
  const pct = g.total ? ((g.visible / g.total) * 100).toFixed(1) : "n/a";
  console.log(
    `[move] MOVE: avgFps=${avg(fps).toFixed(1)} minFps=${Math.min(...fps).toFixed(1)} avgFrame=${avg(frame).toFixed(2)}ms maxFrame=${Math.max(...frame).toFixed(2)}ms avgDraw=${avg(draw).toFixed(0)} avgTri=${avg(tri).toFixed(0)} groups=${g.visible}/${g.total} visible (${pct}%)`
  );
  return { label: "MOVE", avgFps: avg(fps), minFps: Math.min(...fps), avgFrame: avg(frame) };
})();

// Stream camera input until the sampling window closes. The cursor sweeps
// back and forth within the viewport, so every iteration produces real
// displacement and the MOVE phase measures sustained drag rotation.
const SWEEP_MIN_X = 100;
const SWEEP_MAX_X = 1180;
let x = 640;
let dir = 1;
while (Date.now() - moveStart < 25_000) {
  x += dir * 3;
  if (x > SWEEP_MAX_X) {
    x = SWEEP_MAX_X;
    dir = -1;
  }
  if (x < SWEEP_MIN_X) {
    x = SWEEP_MIN_X;
    dir = 1;
  }
  await page.mouse.move(x, 360);
  await page.waitForTimeout(8);
}
await page.keyboard.up("w");
await page.keyboard.up("d");
await page.mouse.up();
const move = await samplePromise;

if (!ready || invalidSample) {
  console.error(
    `[move] run invalid (ready=${ready}, invalidSample=${invalidSample}); marking the run failed`
  );
  process.exitCode = 1;
}

console.log("\n===== MOVING-CAMERA SUMMARY =====");
console.log(`IDLE  avgFps=${idle.avgFps.toFixed(1)} minFps=${idle.minFps.toFixed(1)} avgFrame=${idle.avgFrame.toFixed(2)}ms`);
console.log(`MOVE  avgFps=${move.avgFps.toFixed(1)} minFps=${move.minFps.toFixed(1)} avgFrame=${move.avgFrame.toFixed(2)}ms`);
if (idle.avgFps && move.avgFps) {
  console.log(`IDLE->MOVE fps delta: ${(move.avgFps - idle.avgFps).toFixed(1)} (${(((move.avgFps - idle.avgFps) / idle.avgFps) * 100).toFixed(1)}%)`);
}
if (pageErrors.length) console.log("page errors:", pageErrors.slice(0, 5));

await browser.close();
await safeClose(browser);
