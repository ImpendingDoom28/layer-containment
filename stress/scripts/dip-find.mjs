/**
 * Dip finder: correlates JS longtasks / frame hitches with game context
 * (wave, enemies, projectiles, active effects, upgrade gate) so the cause of
 * periodic frame drops can be identified.
 *
 * Usage: node stress/scripts/dip-find.mjs [--metal] [--seconds 90]
 */
import { chromium } from "@playwright/test";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");
const idx = process.argv.indexOf("--seconds");
// Without the flag, indexOf is -1 and argv[0] (the node path) would yield
// NaN; default to 90s.
const SECONDS = idx === -1 ? 90 : Number(process.argv[idx + 1]);

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

console.log("[dip] instrumenting...");
await page.evaluate(() => {
  const w = window;
  w.__dipEvents = [];
  w.__dipFrames = [];

  const lastLong = { t: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      const level = w.__stressLevelStore.getState();
      const game = w.__stressGameStore.getState();
      const upgrade = w.__stressUpgradeStore?.getState();
      w.__dipEvents.push({
        t: Math.round(entry.startTime),
        dur: Math.round(entry.duration * 10) / 10,
        wave: level.currentWave,
        enemies: level.enemiesKilled,
        projectiles: level.projectiles.length,
        towers: level.towers.length,
        gate: upgrade ? (upgrade.pendingEnemyUpgradeGate ? 1 : 0) : -1,
        status: game.gameStatus,
      });
    }
  }).observe({ type: "longtask", buffered: true });

  // frame hitch tracking via rAF
  let prev = performance.now();
  let lastLog = 0;
  const tick = () => {
    const now = performance.now();
    const dt = now - prev;
    prev = now;
    if (dt > 33) {
      const level = w.__stressLevelStore.getState();
      const upgrade = w.__stressUpgradeStore?.getState();
      w.__dipFrames.push({
        t: Math.round(now),
        dt: Math.round(dt),
        wave: level.currentWave,
        proj: level.projectiles.length,
        gate: upgrade ? (upgrade.pendingEnemyUpgradeGate ? 1 : 0) : -1,
      });
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

// also expose the upgrade store on the bridge (it wasn't there)
console.log("[dip] collecting for", SECONDS, "s...");
await page.waitForTimeout(SECONDS * 1000);

const data = await page.evaluate(() => ({
  events: window.__dipEvents,
  frames: window.__dipFrames,
  hasUpgradeStore: !!window.__stressUpgradeStore,
}));

console.log(`\n===== LONGTASKS (${data.events.length}) =====`);
for (const e of data.events.slice(0, 60)) {
  console.log(
    `  t=${String(e.t).padStart(6)}ms dur=${String(e.dur).padStart(6)}ms wave=${e.wave} kills=${e.enemies} proj=${e.projectiles} towers=${e.towers} gate=${e.gate} status=${e.status}`
  );
}
console.log(`\n===== FRAME HITCHES >33ms (${data.frames.length}) =====`);
for (const f of data.frames.slice(0, 60)) {
  console.log(
    `  t=${String(f.t).padStart(6)}ms dt=${String(f.dt).padStart(4)}ms wave=${f.wave} proj=${f.proj} gate=${f.gate}`
  );
}
if (pageErrors.length) {
  console.log("\npage errors:");
  for (const e of pageErrors.slice(0, 5)) console.log("  ", e);
}
await safeClose(browser);
