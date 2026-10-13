/**
 * A/B attribution harness: measures the stress scene's frame rate with each
 * visual layer hidden, so we can attribute frame time to specific scene parts.
 *
 * Usage: node scripts/attribute-layers.mjs
 *
 * Prints a table: layer | draw calls (visible/hidden) | triangles | FPS.
 *
 * Requires the stress scene to expose `window.__stressScene` /
 * `window.__stressGl` (see SceneDebugBridge in src/stress-test).
 */
import { chromium } from "@playwright/test";

const URL = "http://localhost:5174/index.stress.html";

const LAYERS = [
  "grid",
  "path",
  "towers",
  "enemies",
  "rock-decorations",
  "ground",
  "skybox",
  "shadow-light",
];

const readOverlay = async (page) =>
  (await page.getByTestId("stress-stats-overlay").textContent()) ?? "";

// Measures rAF FPS + three.js gl.info over `seconds` of steady rendering.
const measure = async (page, seconds) => {
  return page.evaluate(async (secs) => {
    const gl = window.__stressGl;
    let frames = 0;
    let total = 0;
    const t0 = performance.now();
    let last = t0;
    await new Promise((resolve) => {
      const tick = () => {
        const now = performance.now();
        total += now - last;
        last = now;
        frames += 1;
        if (now - t0 < secs * 1000) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    const info = gl?.info?.render;
    return {
      fps: frames / (total / 1000),
      frameMs: total / frames,
      calls: info ? info.calls : -1,
      triangles: info ? info.triangles : -1,
      programs: gl?.info?.programs?.length ?? -1,
    };
  }, seconds);
};

// Collects long-task (main-thread blocking) entries over `seconds` of
// rendering: a proxy for CPU (JS) cost. If long-task time per frame is high,
// JS is the bottleneck; if it is low, the GPU/present is.
const measureLongTasks = async (page, seconds) => {
  return page.evaluate(async (secs) => {
    const entries = [];
    const po = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration > 1) entries.push(e.duration);
      }
    });
    po.observe({ entryTypes: ["longtask"] });
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, secs * 1000));
    po.disconnect();
    const totalMs = entries.reduce((a, b) => a + b, 0);
    return {
      longtaskCount: entries.length,
      longtaskTotalMs: totalMs,
      avgLongtaskMs: entries.length ? totalMs / entries.length : 0,
    };
  }, seconds);
};

const setLayerVisible = async (page, name, visible) => {
  return page.evaluate(([n, v]) => {
    const scene = window.__stressScene;
    let obj = null;
    scene.traverse((o) => {
      if (!obj && o.name === n) obj = o;
    });
    if (!obj) return false;
    obj.visible = v;
    return true;
  }, [name, visible]);
};

const METAL = process.argv.includes("--metal");
const browser = await chromium.launch(
  METAL ? { args: ["--use-angle=metal"] } : undefined
);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });
console.log("[attr] waiting for 30s metrics window...");

const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  if ((await readOverlay(page)).includes("AVG FPS")) break;
}

const bridgeReady = await page.evaluate(
  () => !!window.__stressScene && !!window.__stressGl
);
if (!bridgeReady) {
  console.error("[attr] debug bridge not ready (window.__stressScene missing)");
  process.exit(1);
}
console.log("[attr] steady state reached; measuring baseline...");

const layerExists = {};
for (const name of LAYERS) {
  layerExists[name] = await setLayerVisible(page, name, true) &&
    (await page.evaluate((n) => {
      let found = false;
      window.__stressScene.traverse((o) => {
        if (!found && o.name === n) found = true;
      });
      return found;
    }, name));
}
console.log("[attr] layers found:", JSON.stringify(layerExists));

const baseline = await measure(page, 8);
console.log("\n===== BASELINE =====");
console.log(JSON.stringify(baseline, null, 2));

const results = [];
for (const layer of LAYERS) {
  if (!layerExists[layer]) {
    console.log(`[attr] ${layer}: not found in scene, skipping`);
    continue;
  }
  await setLayerVisible(page, layer, false);
  await page.waitForTimeout(500);
  const hidden = await measure(page, 8);
  await setLayerVisible(page, layer, true);
  await page.waitForTimeout(500);
  results.push({ layer, ...hidden });
  console.log(`[attr] ${layer} hidden:`, JSON.stringify(hidden));
}

console.log("\n===== ATTRIBUTION TABLE (baseline vs hidden) =====");
const fmt = (r) =>
  `fps ${r.fps.toFixed(1)} (${r.frameMs.toFixed(0)}ms) draw ${r.calls} tri ${r.triangles}`;
console.log("baseline:", fmt(baseline));
for (const r of results) {
  const dFps = r.fps - baseline.fps;
  const dCalls = baseline.calls - r.calls;
  const dTri = baseline.triangles - r.triangles;
  console.log(
    `${r.layer.padEnd(16)} ${fmt(r)}  | dfps ${dFps >= 0 ? "+" : ""}${dFps.toFixed(1)}  ddraw ${dCalls}  dtri ${dTri.toLocaleString("en-US")}`
  );
}

await browser.close();
