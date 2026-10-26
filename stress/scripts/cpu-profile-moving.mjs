/**
 * CPU profiler for the stress scene while the camera is moving (mouse drag +
 * WASD), to isolate the per-frame cost that only appears during camera motion
 * (i.e. the culling work). Mirrors moving-camera.mjs's input pattern.
 *
 * Usage: node stress/scripts/cpu-profile-moving.mjs [--metal]
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");
const DURATION_S = Number(process.env.DURATION_S ?? 12);

const readOverlay = async (page) =>
  (await page.getByTestId("stress-stats-overlay").textContent()) ?? "";

await ensureStressServer();

const browser = await chromium.launch(
  METAL ? { args: ["--use-angle=metal"] } : undefined
);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const client = await context.newCDPSession(page);

await page.goto(STRESS_URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });
console.log("[cpu-mv] waiting for 30s metrics window...");

let ready = false;
const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  const overlay = await readOverlay(page);
  const fpsLine = overlay.split("\n").find((l) => l.startsWith("FPS "));
  const statusLine = overlay.split("\n").find((l) => l.startsWith("STATUS "));
  if (overlay.includes("AVG FPS") && statusLine?.includes("playing")) {
    ready = true;
    break;
  }
  console.log(`[cpu-mv] +${((Date.now() - t0) / 1000).toFixed(0)}s fps=${fpsLine || "?"}`);
}
if (!ready) {
  console.error("[cpu-mv] stress scene did not reach steady state within 200s; marking the run failed");
  process.exitCode = 1;
}

console.log(`[cpu-mv] starting camera motion + profiling ${DURATION_S}s...`);

// Start the same continuous camera motion as moving-camera.mjs: the cursor
// sweeps back and forth within the viewport so every iteration produces real
// displacement (sustained drag rotation), not repeated moves to the same spot.
await page.mouse.move(640, 360);
await page.mouse.down();
await page.keyboard.down("w");
await page.keyboard.down("d");
const SWEEP_MIN_X = 100;
const SWEEP_MAX_X = 1180;
let x = 640;
let dir = 1;
// Start the profiler before the motion timer is created, so the DURATION_S
// window is measured from the first profiled frame instead of losing its
// opening to the (unsampled) profiler setup.
await client.send("Profiler.enable");
await client.send("Profiler.setSamplingInterval", { interval: 500 });
await client.send("Profiler.start");
// Same continuous camera motion as moving-camera.mjs: the cursor sweeps back
// and forth within the viewport so every iteration produces real displacement
// (sustained drag rotation), not repeated moves to the same spot.
const motion = (async () => {
  const start = Date.now();
  while (Date.now() - start < DURATION_S * 1000) {
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
})();
// Run the full motion window before stopping the profiler.
await motion;
const { profile } = await client.send("Profiler.stop");
await page.keyboard.up("w");
await page.keyboard.up("d");
await page.mouse.up();

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "profiling");
mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `cpu-profile-moving-${Date.now()}.cpuprofile`);
writeFileSync(file, JSON.stringify(profile));
console.log(`[cpu-mv] profile written to ${file}`);

const nodes = profile.nodes;
const byId = new Map(nodes.map((n) => [n.id, n]));
// `hitCount` is optional per the CDP `ProfileNode` schema; fall back to the
// node's share of the raw sample stack so a missing count can never turn the
// totals into NaN.
const hitsById = new Map();
for (const id of profile.samples ?? []) {
  hitsById.set(id, (hitsById.get(id) ?? 0) + 1);
}
const hits = (n) => n.hitCount ?? hitsById.get(n.id) ?? 0;
const selfTime = new Map();
for (const n of nodes) selfTime.set(n.id, (selfTime.get(n.id) ?? 0) + hits(n));

const childrenMap = new Map();
for (const n of nodes) {
  for (const c of n.children ?? []) {
    if (!childrenMap.has(n.id)) childrenMap.set(n.id, []);
    childrenMap.get(n.id).push(c);
  }
}
const totalUsPerNode = new Map();
const computeTotal = (id) => {
  if (totalUsPerNode.has(id)) return totalUsPerNode.get(id);
  const n = byId.get(id);
  let t = n ? hits(n) : 0;
  for (const c of childrenMap.get(id) ?? []) t += computeTotal(c);
  totalUsPerNode.set(id, t);
  return t;
};
for (const n of nodes) computeTotal(n.id);

const topSelf = [...nodes]
  .filter((n) => hits(n) > 0)
  .map((n) => ({
    name: n.callFrame.functionName || "(anonymous)",
    url: (n.callFrame.url || "").replace(/^https?:\/\/[^/]*\//, ""),
    line: n.callFrame.lineNumber,
    selfUs: hits(n),
    totalUs: totalUsPerNode.get(n.id) ?? 0,
  }))
  .sort((a, b) => b.selfUs - a.selfUs)
  .slice(0, 40);

const totalSamples = [...selfTime.values()].reduce((a, b) => a + b, 0) || 1;
console.log(`\n[cpu-mv] ${DURATION_S}s of moving camera, ${totalSamples} samples`);
console.log("\n===== TOP 40 BY SELF TIME (camera moving) =====");
for (const f of topSelf) {
  const pct = (f.selfUs / totalSamples) * 100;
  const tPct = (f.totalUs / totalSamples) * 100;
  console.log(
    `${pct.toFixed(2).padStart(6)}%  self | ${tPct.toFixed(2).padStart(6)}% total | ${f.name}  [${f.url.split("/").slice(-2).join("/").slice(-40)}:${f.line}]`
  );
}

await browser.close();
await safeClose(browser);
