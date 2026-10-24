/**
 * Culling fraction probe: loads the stress entry, lets it run to steady state,
 * then counts the culled entity groups (towers/enemies) that are `visible`
 * vs hidden, and samples live FPS + frame time. Run with and without the
 * culling wired for an honest A/B (in the "clean" build every group stays
 * visible by definition).
 *
 * Usage: node stress/scripts/culling-probe.mjs [--metal]
 */
import { chromium } from "@playwright/test";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");

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
console.log("[culling] page loaded, waiting for 30s average window...");

const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  if ((await readStat(page, "STATUS")).includes("playing") &&
      (await page.getByTestId("stress-stats-overlay").textContent()).includes("AVG FPS"))
    break;
  const fps = await readStat(page, "FPS");
  console.log(`[culling] +${((Date.now() - t0) / 1000).toFixed(0)}s fps=${fps || "?"}`);
}

const sampleGroups = () =>
  page.evaluate(() => {
    const scene = window.__stressScene;
    const groups = { total: 0, visible: 0 };
    // The scene root is a Scene, not a Group, so walk every node and only
    // count Group nodes that own at least one mesh (enemy/tower groups).
    const walk = (o) => {
      if (o.isGroup) {
        const hasMesh = o.children.some((c) => c.isMesh);
        if (hasMesh) {
          groups.total += 1;
          if (o.visible) groups.visible += 1;
        }
      }
      for (const c of o.children) walk(c);
    };
    walk(scene);
    return groups;
  });

console.log("[culling] sampling ~20s of steady state (groups + fps)...");
const samples = [];
const s0 = Date.now();
while (Date.now() - s0 < 20_000) {
  const g = await sampleGroups();
  samples.push({
    wave: (await readStat(page, "WAVE")).split("/")[0],
    enemies: (await readStat(page, "ENEMIES")).replace(/\D/g, ""),
    fps: await readStat(page, "FPS"),
    frame: await readStat(page, "FRAME"),
    draw: await readStat(page, "DRAW CALLS"),
    groups: g,
  });
  await page.waitForTimeout(2000);
}

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
const visiblePct = (s) =>
  s.groups.total ? Math.round((s.groups.visible / s.groups.total) * 100) : 100;
console.log("\n[culling] per-sample:");
for (const s of samples) {
  console.log(
    `  wave=${s.wave} enemies=${s.enemies} fps=${s.fps} frame=${s.frame} draw=${s.draw} groups=${s.groups.visible}/${s.groups.total} visible (${visiblePct(s)}%)`
  );
}
const fpsArr = samples.map((s) => parseFloat(s.fps)).filter((n) => !Number.isNaN(n));
const frameArr = samples.map((s) => parseFloat(s.frame)).filter((n) => !Number.isNaN(n));
const drawArr = samples.map((s) => parseInt(s.draw)).filter((n) => !Number.isNaN(n));
const maxEnemies = Math.max(...samples.map((s) => parseInt(s.enemies)));
console.log("\n===== CULLING PROBE SUMMARY =====");
console.log("samples", samples.length, "max enemies seen", maxEnemies);
console.log("AVG FPS", fpsArr.length ? avg(fpsArr).toFixed(1) : "n/a");
console.log("AVG FRAME ms", frameArr.length ? avg(frameArr).toFixed(2) : "n/a");
console.log("AVG DRAW CALLS", drawArr.length ? avg(drawArr).toFixed(0) : "n/a");
console.log("AVG visible groups pct", samples.length ? avg(samples.map(visiblePct)).toFixed(1) : "n/a");
if (pageErrors.length) {
  console.log("page errors:", pageErrors.slice(0, 5));
}
await browser.close();
await safeClose(browser);
