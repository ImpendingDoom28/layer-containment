/**
 * Culling fraction probe: loads the stress entry, lets it run to steady state,
 * then counts the culled entity roots (towers/enemies, marked with
 * `userData.culledEntity`; an unmarked control build falls back to counting
 * groups that directly own a mesh) that are `visible` vs hidden, and samples
 * live FPS + frame time. Run with and without the culling wired for an honest
 * A/B (in the "clean" build every root stays visible by definition). Exits
 * nonzero when it never reaches steady state or samples invalid data, so a
 * failed run cannot masquerade as a clean result.
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

let ready = false;
const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  if ((await readStat(page, "STATUS")).includes("playing") &&
      (await page.getByTestId("stress-stats-overlay").textContent()).includes("AVG FPS")) {
    ready = true;
    break;
  }
  const fps = await readStat(page, "FPS");
  console.log(`[culling] +${((Date.now() - t0) / 1000).toFixed(0)}s fps=${fps || "?"}`);
}
if (!ready) {
  console.error("[culling] page never reached steady state within 200s; marking the run failed");
  process.exitCode = 1;
}

const sampleGroups = () =>
  page.evaluate(() => {
    const scene = window.__stressScene;
    const groups = { total: 0, visible: 0 };
    // In the culling build, Enemy/Tower mark their root group with
    // `userData.culledEntity`, so count exactly those: static groups (path
    // strips, corners) and nested health-bar groups would bias the visible
    // percentage toward 100%. A control build (no culling, no markers) has
    // nothing hidden, so any reasonable denominator reports 100% by
    // definition — there, fall back to counting groups that directly own a
    // mesh.
    const marked = [];
    const findMarked = (o) => {
      if (o.isGroup && o.userData?.culledEntity) marked.push(o);
      for (const c of o.children) findMarked(c);
    };
    findMarked(scene);
    if (marked.length) {
      for (const g of marked) {
        groups.total += 1;
        if (g.visible) groups.visible += 1;
      }
    } else {
      const count = (o) => {
        if (o.isGroup && o.children.some((c) => c.isMesh)) {
          groups.total += 1;
          if (o.visible) groups.visible += 1;
        }
        for (const c of o.children) count(c);
      };
      count(scene);
    }
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
// Zero marked groups means the probe saw nothing to measure (e.g. a stale
// non-stress page or a scene without enemies yet) — report it as invalid, not
// as 100% visible, so a failed run cannot masquerade as a clean A/B result.
const visiblePct = (s) =>
  s.groups.total ? Math.round((s.groups.visible / s.groups.total) * 100) : -1;
const invalidSample = samples.some((s) =>
  !Number.isFinite(parseFloat(s.fps)) ||
  !Number.isFinite(parseFloat(s.frame)) ||
  !Number.isFinite(parseInt(s.draw, 10)) ||
  !Number.isFinite(parseInt(s.enemies, 10)) ||
  s.groups.total === 0
);
if (!ready || !samples.length || invalidSample) {
  console.error(
    `[culling] invalid measurement (ready=${ready}, samples=${samples.length}, invalidSample=${invalidSample}); marking the run failed`
  );
  process.exitCode = 1;
}
console.log("\n[culling] per-sample:");
for (const s of samples) {
  const pct = visiblePct(s);
  console.log(
    `  wave=${s.wave} enemies=${s.enemies} fps=${s.fps} frame=${s.frame} draw=${s.draw} groups=${s.groups.visible}/${s.groups.total} visible (${pct < 0 ? "no groups" : pct + "%"})`
  );
}
const fpsArr = samples.map((s) => parseFloat(s.fps)).filter((n) => Number.isFinite(n));
const frameArr = samples.map((s) => parseFloat(s.frame)).filter((n) => Number.isFinite(n));
const drawArr = samples.map((s) => parseInt(s.draw, 10)).filter((n) => Number.isFinite(n));
const enemyArr = samples.map((s) => parseInt(s.enemies, 10)).filter((n) => Number.isFinite(n));
console.log("\n===== CULLING PROBE SUMMARY =====");
console.log("samples", samples.length, "max enemies seen", enemyArr.length ? Math.max(...enemyArr) : "n/a");
console.log("AVG FPS", fpsArr.length ? avg(fpsArr).toFixed(1) : "n/a");
console.log("AVG FRAME ms", frameArr.length ? avg(frameArr).toFixed(2) : "n/a");
console.log("AVG DRAW CALLS", drawArr.length ? avg(drawArr).toFixed(0) : "n/a");
const validPcts = samples.map(visiblePct).filter((p) => p >= 0);
console.log("AVG visible groups pct", validPcts.length ? avg(validPcts).toFixed(1) : "n/a (no marked groups)");
if (pageErrors.length) {
  console.log("page errors:", pageErrors.slice(0, 5));
}
await browser.close();
await safeClose(browser);
