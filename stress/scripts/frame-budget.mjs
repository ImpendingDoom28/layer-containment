/**
 * Frame-budget probe: splits frame time into main-thread JS work (longtasks),
 * GL render API time, and the unattributed residual (non-longtask JS plus
 * GPU/present time, which this probe does not measure directly), comparing the
 * running vs paused simulation. The paused number is an upper bound on pure
 * GPU cost — if it's near 60 FPS, the GPU has headroom and the rest is
 * CPU/JS.
 *
 * Usage: node stress/scripts/frame-budget.mjs [--metal]
 */
import { chromium } from "@playwright/test";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");

const readOverlay = async (page) =>
  (await page.getByTestId("stress-stats-overlay").textContent()) ?? "";

await ensureStressServer();

const browser = await chromium.launch(
  METAL ? { args: ["--use-angle=metal"] } : undefined
);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
await page.goto(STRESS_URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });

console.log("[budget] waiting for 30s metrics window...");
const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  if ((await readOverlay(page)).includes("AVG FPS")) break;
}

// Instrument gl.render and collect rAF frame intervals + callback durations.
const probe = async (seconds) =>
  page.evaluate(async (secs) => {
    const gl = window.__stressGl;
    let renderTotal = 0;
    let renderMax = 0;
    let renderCount = 0;
    const orig = gl.render.bind(gl);
    gl.render = (scene, camera) => {
      const t = performance.now();
      orig(scene, camera);
      const d = performance.now() - t;
      renderTotal += d;
      renderMax = Math.max(renderMax, d);
      renderCount += 1;
    };

    // Measure rAF callback duration: instrument a probe that runs in the SAME
    // frame as R3F. We cannot wrap R3F's loop directly, so we measure the gap
    // between (a) the time the browser hands us the frame and (b) the next
    // frame, which includes everything. Separately, we count how long the
    // main thread stays busy by sampling a busy-loop-free marker: the
    // performance.now() delta across a zero-work rAF tells us only the
    // browser's own time; so instead we rely on: frame interval - (measured
    // JS via long tasks is inaccurate) -> use the longtask observer.
    const longtasks = [];
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) longtasks.push(e.duration);
    });
    po.observe({ entryTypes: ["longtask"] });

    const frames = [];
    const t0 = performance.now();
    let last = t0;
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        frames.push(now - last);
        last = now;
        if (now - t0 < secs * 1000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    po.disconnect();
    gl.render = orig;

    const intervalMs = frames.reduce((a, b) => a + b, 0) / frames.length;
    const longTotal = longtasks.reduce((a, b) => a + b, 0);
    return {
      frames: frames.length,
      fps: frames.length / (frames.reduce((a, b) => a + b, 0) / 1000),
      intervalMs,
      renderTotalMs: renderTotal,
      renderAvgMs: renderTotal / renderCount,
      renderMaxMs: renderMax,
      renderCount,
      longtaskTotalMs: longTotal,
      longtaskCount: longtasks.length,
      longtaskAvgMs: longtasks.length ? longTotal / longtasks.length : 0,
    };
  }, seconds);

console.log("\n===== RUNNING SIMULATION =====");
const running = await probe(8);
console.log(JSON.stringify(running, null, 2));

// Pause the simulation: gameStatus -> "paused" makes every system
// early-return, but the renderer keeps drawing the (frozen) scene.
console.log("\n[budget] pausing simulation via game store...");
const pausedOk = await page.evaluate(() => {
  const gs = window.__stressGameStore?.getState();
  if (!gs || gs.gameStatus !== "playing") return false;
  gs.setGameStatus("paused");
  return window.__stressGameStore.getState().gameStatus === "paused";
});
if (!pausedOk) throw new Error("could not pause the simulation");
await page.waitForTimeout(500);
const paused = await probe(8);
console.log("\n===== PAUSED SIMULATION =====");
console.log(JSON.stringify(paused, null, 2));
await page.evaluate(() => window.__stressGameStore.getState().setGameStatus("playing"));

const summary = (r) => ({
  fps: r.fps.toFixed(1),
  intervalMs: r.intervalMs.toFixed(0),
  jsLongtaskMsPerFrame: (r.longtaskTotalMs / r.frames).toFixed(1),
  glRenderMsPerFrame: r.renderAvgMs.toFixed(1),
  // Unattributed residual: the longtask counter misses JS that does not
  // qualify as a long task, so this remainder is a mix of non-longtask main
  // thread work and GPU/present time — not a GPU measurement by itself.
  unattributedMsPerFrame: (
    r.intervalMs - r.longtaskTotalMs / r.frames - r.renderAvgMs
  ).toFixed(1),
});
console.log("\n===== SUMMARY (ms per frame) =====");
console.log("running:", JSON.stringify(summary(running)));
console.log("paused: ", JSON.stringify(summary(paused)));

await safeClose(browser);
