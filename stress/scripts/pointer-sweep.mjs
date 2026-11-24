/**
 * Pointer-sweep performance harness for the single-plane-raycast change.
 *
 * R3F raycasts the entire handler-bearing scene on every pointermove event
 * (not every frame). The stress level has 4096 tile slabs that each carry
 * onPointerOver/Out/onClick, so a continuous pointer sweep forces R3F to
 * raycast all of them on every move — the cost this change removes. The
 *
 *   1. STATIC — no pointer movement (no raycasts; a per-frame control)
 *   2. SWEEP  — continuous no-button pointer sweep across the board (a real
 *               pointermove every ~8ms, so the locked stress camera never
 *               rotates), exercising the per-move scene raycast
 *
 * Both phases record rAF frame intervals (ground truth, like fps-trend.mjs)
 * and report steady-state percentiles, so a pre- vs post-change run is
 * apples-to-apples (same 64x64 stress level, same pinned camera, same sweep
 * rate). Ready-gates on the stats overlay (playing + AVG FPS) rather than the
 * `game-canvas` testid, mirroring moving-camera.mjs.
 *
 * Usage: node stress/scripts/pointer-sweep.mjs [--metal] [--seconds 40]
 *        (--seconds applies to each phase)
 */
import { chromium } from "@playwright/test";

import { ensureStressServer, readDurationArg, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");
const SECONDS = readDurationArg("--seconds", 40);

await ensureStressServer();

const browser = await chromium.launch(
  METAL ? { args: ["--use-angle=metal"] } : undefined
);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));

await page.goto(STRESS_URL, { waitUntil: "domcontentloaded" });
const readStat = async (label) => {
  const text = await page.getByTestId("stress-stats-overlay").textContent().catch(() => "");
  const line = (text || "").split("\n").find((l) => l.startsWith(`${label} `));
  return line ? line.split("  ").slice(1).join("  ").trim() : "";
};

console.log("[sweep] waiting for the stress run to reach 'playing'...");
let ready = false;
const t0 = Date.now();
while (Date.now() - t0 < 120_000) {
  await page.waitForTimeout(2500);
  if ((await readStat("STATUS")).includes("playing")) {
    ready = true;
    break;
  }
  console.log(`[sweep] +${((Date.now() - t0) / 1000 | 0)}s status=${await readStat("STATUS") || "?"}`);
}
if (!ready) {
  console.error("[sweep] stress run never reached 'playing'; run invalid");
  await safeClose(browser);
  process.exitCode = 1;
  process.exit(1);
}
console.log(`[sweep] playing after ${((Date.now() - t0) / 1000 | 0)}s`);

// rAF instrument, resettable per phase.
const armRAF = () =>
  page.evaluate(() => {
    window.__frames = [];
    let prev = performance.now();
    let c = 0;
    const tick = () => {
      const now = performance.now();
      window.__frames.push(Math.round((now - prev) * 100) / 100);
      prev = now;
      if (c++ < 40000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

const collectRAF = () => page.evaluate(() => window.__frames);

const summarize = (label, dtsRaw) => {
  const dts = dtsRaw.filter((v) => v > 0.05).sort((a, b) => a - b);
  const q = (p) => dts[Math.min(dts.length - 1, Math.floor(p * dts.length))];
  const avg = dts.reduce((s, v) => s + v, 0) / Math.max(1, dts.length);
  const below60 = dts.filter((v) => v > 16.7).length;
  console.log(`\n===== ${label} (steady) =====`);
  console.log(`frames: ${dts.length}`);
  console.log(`avg  : ${avg.toFixed(2)} ms  (${(1000 / avg).toFixed(1)} fps)`);
  console.log(`p50  : ${q(0.5).toFixed(1)} ms  (${(1000 / q(0.5)).toFixed(1)} fps)`);
  console.log(`p90  : ${q(0.9).toFixed(1)} ms  (${(1000 / q(0.9)).toFixed(1)} fps)`);
  console.log(`p95  : ${q(0.95).toFixed(1)} ms  (${(1000 / q(0.95)).toFixed(1)} fps)`);
  console.log(`p99  : ${q(0.99).toFixed(1)} ms  (${(1000 / q(0.99)).toFixed(1)} fps)`);
  console.log(`max  : ${q(1).toFixed(1)} ms  (${(1000 / q(1)).toFixed(1)} fps)`);
  console.log(`frames >16.7ms (<60fps): ${below60} (${(100 * below60 / Math.max(1, dts.length)).toFixed(1)}%)`);
  return { label, avg, p90: q(0.9), p99: q(0.99), below60pct: 100 * below60 / Math.max(1, dts.length) };
};

const runPhase = async (label, durationMs, sweep) => {
  await armRAF();
  const start = Date.now();
  if (sweep) {
    // Continuous no-button pointer sweep across the board: same rate as
    // moving-camera.mjs (3px per 8ms, 100..1180) but without the button held,
    // so the locked stress camera never rotates. Each step is a real
    // pointermove and forces a full scene raycast.
    const SWEEP_MIN_X = 100;
    const SWEEP_MAX_X = 1180;
    const SWEEP_Y = 360;
    let x = 640;
    let dir = 1;
    await page.mouse.move(x, SWEEP_Y);
    while (Date.now() - start < durationMs) {
      x += dir * 3;
      if (x > SWEEP_MAX_X) { x = SWEEP_MAX_X; dir = -1; }
      if (x < SWEEP_MIN_X) { x = SWEEP_MIN_X; dir = 1; }
      await page.mouse.move(x, SWEEP_Y);
      await page.waitForTimeout(8);
    }
  } else {
    await page.waitForTimeout(durationMs);
  }
  const dts = await collectRAF();
  return summarize(label, dts);
};

console.log(`\n[sweep] STATIC phase ${SECONDS}s (no pointer moves)...`);
const staticRes = await runPhase("STATIC (no raycast)", SECONDS * 1000, false);

console.log(`\n[sweep] SWEEP phase ${SECONDS}s (pointermove every ~8ms)...`);
const sweepRes = await runPhase("SWEEP (full-scene raycast per move)", SECONDS * 1000, true);

console.log("\n===== POINTER-SWEEP SUMMARY =====");
console.log(
  `STATIC avg=${staticRes.avg.toFixed(2)}ms p90=${staticRes.p90.toFixed(1)}ms p99=${staticRes.p99.toFixed(1)}ms >16.7=${staticRes.below60pct.toFixed(1)}%`
);
console.log(
  `SWEEP  avg=${sweepRes.avg.toFixed(2)}ms p90=${sweepRes.p90.toFixed(1)}ms p99=${sweepRes.p99.toFixed(1)}ms >16.7=${sweepRes.below60pct.toFixed(1)}%`
);
const delta = sweepRes.avg - staticRes.avg;
console.log(
  `SWEEP-STATIC avg delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(2)}ms (the per-move raycast cost; the change removes it)`
);

const uniqueErrors = [...new Set(pageErrors)];
if (uniqueErrors.length) {
  console.log("\npage errors (unique):");
  for (const e of uniqueErrors.slice(0, 5)) console.log("  ", e.slice(0, 120));
}
await safeClose(browser);
