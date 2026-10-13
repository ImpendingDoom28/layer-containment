/**
 * Frame-delta ground truth: records every rAF frame interval and the live
 * enemy count over a long window, so the report can state honestly whether the
 * stress test stays >=60 FPS and, if not, at what enemy count it dips.
 *
 * Usage: node stress/scripts/fps-trend.mjs [--metal] [--seconds 150]
 */
import { chromium } from "@playwright/test";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");
const idx = process.argv.indexOf("--seconds");
// Without the flag, indexOf is -1 and argv[0] (the node path) would yield
// NaN; default to 150s.
const SECONDS = idx === -1 ? 150 : Number(process.argv[idx + 1]);

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

console.log("[trend] instrumenting rAF...");
await page.evaluate(() => {
  const w = window;
  w.__frames = []; // {t, dt, enemies, wave, proj, gate}
  const store = () => w.__stressLevelStore?.getState();
  const upgradeStore = () => w.__stressUpgradeStore?.getState();
  let prev = performance.now();
  let frameCount = 0;
  // Retain the most recently sampled context between frames so every frame
  // record carries the latest known wave/enemy/proj/gate (the context is
  // sampled every 15 frames to bound per-frame cost; reading a store per
  // frame would add overhead).
  let ctxEnemies = 0, ctxWave = 0, ctxProj = 0, ctxGate = 0;
  const tick = () => {
    const now = performance.now();
    const dt = now - prev;
    prev = now;
    frameCount += 1;
    if (frameCount % 15 === 1) {
      try {
        const s = store();
        if (s) { ctxWave = s.currentWave; ctxProj = s.projectiles.length; }
        const u = upgradeStore();
        ctxGate = u && u.pendingEnemyUpgradeGate ? 1 : 0;
        if (w.__stressLivingCount) ctxEnemies = w.__stressLivingCount();
      } catch { /* stores not ready yet */ }
    }
    // Record every frame's dt (bounded: only keep last ~20000 to bound memory)
    if (w.__frames.length < 20000) {
      w.__frames.push({ t: Math.round(now), dt: Math.round(dt * 100) / 100, enemies: ctxEnemies, wave: ctxWave, proj: ctxProj, gate: ctxGate });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

console.log("[trend] collecting", SECONDS, "s...");
await page.waitForTimeout(SECONDS * 1000);

const data = await page.evaluate(() => window.__frames);

// Filter out the initial load transient (first 5s) for the steady stats.
const stable = data.filter((f) => f.t > 5000);
const dts = stable.map((f) => f.dt).sort((a, b) => a - b);
const q = (p) => dts[Math.min(dts.length - 1, Math.floor(p * dts.length))];
const avg = dts.reduce((s, v) => s + v, 0) / Math.max(1, dts.length);
const below60 = dts.filter((v) => v > 16.7).length;
const below30 = dts.filter((v) => v > 33.4).length;
const worst = dts[dts.length - 1];

console.log("\n===== FRAME INTERVAL (steady, after 5s load) =====");
console.log(`frames: ${stable.length}`);
console.log(`avg  : ${avg.toFixed(1)} ms  (${(1000 / avg).toFixed(1)} fps)`);
console.log(`p50  : ${q(0.5).toFixed(1)} ms  (${(1000 / q(0.5)).toFixed(1)} fps)`);
console.log(`p90  : ${q(0.9).toFixed(1)} ms  (${(1000 / q(0.9)).toFixed(1)} fps)`);
console.log(`p95  : ${q(0.95).toFixed(1)} ms  (${(1000 / q(0.95)).toFixed(1)} fps)`);
console.log(`p99  : ${q(0.99).toFixed(1)} ms  (${(1000 / q(0.99)).toFixed(1)} fps)`);
console.log(`max  : ${worst.toFixed(1)} ms  (${(1000 / worst).toFixed(1)} fps)`);
console.log(`frames >16.7ms (<60fps): ${below60} (${(100 * below60 / Math.max(1, stable.length)).toFixed(1)}%)`);
console.log(`frames >33.4ms (<30fps): ${below30} (${(100 * below30 / Math.max(1, stable.length)).toFixed(1)}%)`);

// Time-series summary every 10s: fps + enemy/wave/proj at that moment.
console.log("\n===== TIME SERIES (every 10s) =====");
for (let t = 5; t <= SECONDS; t += 10) {
  const inWindow = stable.filter((f) => f.t >= t * 1000 && f.t < (t + 10) * 1000);
  if (!inWindow.length) continue;
  const wdt = inWindow.map((f) => f.dt).sort((a, b) => a - b);
  const wavg = wdt.reduce((s, v) => s + v, 0) / wdt.length;
  const last = inWindow[inWindow.length - 1];
  const maxE = Math.max(...inWindow.map((f) => f.enemies || 0));
  console.log(
    `t=${String(t).padStart(3)}s avg=${(1000 / wavg).toFixed(1).padStart(5)}fps maxDt=${wdt[wdt.length - 1].toFixed(0).padStart(4)}ms wave=${last.wave ?? "?"} enemies~${maxE || "?"} proj=${last.proj ?? "?"} gate=${last.gate ?? "?"}`
  );
}
if (pageErrors.length) {
  console.log("\npage errors:");
  for (const e of pageErrors.slice(0, 5)) console.log("  ", e);
}
await safeClose(browser);
