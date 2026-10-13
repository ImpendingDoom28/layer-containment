/**
 * Peak-load FPS watcher for the stress test.
 *
 * Let the full run (all 20 waves, restarts) run for a configurable number of
 * minutes, polling the stress overlay and recording the worst per-sample FPS
 * and the wave it happened on, so the result reflects the heaviest waves
 * (e.g. wave 19 with ~183 concurrent enemies), not just the early ones.
 *
 * Usage: node stress/scripts/peak-fps.mjs [--metal] [--minutes 4]
 */
import { chromium } from "@playwright/test";

import { ensureStressServer, readDurationArg, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");
const MINUTES = readDurationArg("--minutes", 4);

const readStat = async (page, label) => {
  const text = await page.getByTestId("stress-stats-overlay").textContent();
  const line = text?.split("\n").find((l) => l.startsWith(`${label} `));
  return line ? line.split("  ").slice(1).join("  ").trim() : "";
};

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
console.log(`[peak] watching ${MINUTES} min...`);

const t0 = Date.now();
const totalMs = MINUTES * 60_000;
let worst = { fps: Infinity, frame: 0, wave: 0, enemies: 0, t: 0 };
let fpsSum = 0;
let samples = 0;
let minFpsOverall = Infinity;
let maxFrameOverall = 0;

// Per-wave worst stats, to see which waves are the heaviest.
const perWave = new Map();

while (Date.now() - t0 < totalMs) {
  await page.waitForTimeout(2000);
  const t = Math.round((Date.now() - t0) / 1000);
  const fps = parseFloat(await readStat(page, "FPS")) || 0;
  const frame = parseFloat(await readStat(page, "FRAME")) || 0;
  const waveRaw = await readStat(page, "WAVE");
  const wave = parseInt(waveRaw.split("/")[0] ?? "0", 10) || 0;
  const enemiesRaw = await readStat(page, "ENEMIES");
  const enemies = parseInt(enemiesRaw.replace(/\D/g, ""), 10) || 0;
  if (!fps) continue;

  fpsSum += fps;
  samples += 1;
  minFpsOverall = Math.min(minFpsOverall, fps);
  maxFrameOverall = Math.max(maxFrameOverall, frame);

  const w = perWave.get(wave) ?? { minFps: Infinity, maxFrame: 0, maxEnemies: 0, count: 0 };
  w.minFps = Math.min(w.minFps, fps);
  w.maxFrame = Math.max(w.maxFrame, frame);
  w.maxEnemies = Math.max(w.maxEnemies, enemies);
  w.count += 1;
  perWave.set(wave, w);

  if (enemies >= 60 && fps < worst.fps) {
    worst = { fps, frame, wave, enemies, t };
  }

  if (t % 20 < 2) {
    console.log(
      `[peak] +${t}s wave=${wave} enemies=${enemies} fps=${fps.toFixed(1)} frame=${frame.toFixed(1)}ms`
    );
  }
}

console.log("\n===== PEAK-WATCH SUMMARY =====");
console.log(
  `avg fps over ${samples} samples: ${(fpsSum / Math.max(1, samples)).toFixed(1)}`
);
console.log(`min fps overall: ${minFpsOverall.toFixed(1)}`);
console.log(`max frame overall: ${maxFrameOverall.toFixed(1)} ms`);
console.log(
  `worst sample with >=60 enemies: ${JSON.stringify(worst)} (at +${worst.t}s)`
);
console.log("\nPer-wave worst fps / max frame / max concurrent enemies:");
for (const wave of [...perWave.keys()].sort((a, b) => a - b)) {
  const w = perWave.get(wave);
  console.log(
    `  wave ${String(wave).padStart(2)}: minFps=${w.minFps.toFixed(1).padStart(6)} maxFrame=${w.maxFrame.toFixed(1).padStart(7)}ms maxEnemies=${String(w.maxEnemies).padStart(3)} samples=${w.count}`
  );
}
if (pageErrors.length) {
  console.log("\npage errors:");
  for (const e of pageErrors.slice(0, 5)) console.log("  ", e);
}
await safeClose(browser);
