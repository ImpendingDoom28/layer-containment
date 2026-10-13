/**
 * Manual profiling harness for the stress test.
 *
 * Usage:
 *   node scripts/profile-stress.mjs            # metrics only
 *   node scripts/profile-stress.mjs --trace    # + CDP performance trace (4s, steady state)
 *
 * Waits until the 30s average window has frozen, prints the overlay metrics,
 * then samples a few live frames for steady-state numbers. With --trace it
 * also captures a CDP trace (CPU + GPU slices) to profiling/stress-trace-*.
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const URL = "http://localhost:5174/index.stress.html";
const TRACE = process.argv.includes("--trace");
const TRACE_SECONDS = Number(process.env.TRACE_SECONDS ?? 4);

const readStat = async (page, label) => {
  const text = await page.getByTestId("stress-stats-overlay").textContent();
  const line = text?.split("\n").find((l) => l.startsWith(`${label} `));
  return line ? line.split("  ").slice(1).join("  ").trim() : "";
};

const METAL = process.argv.includes("--metal");
const browser = await chromium.launch(
  METAL ? { args: ["--use-angle=metal"] } : undefined
);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (msg) => {
  if (msg.type() === "error") pageErrors.push(msg.text());
});

await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });
console.log("[profile] page loaded, waiting for 30s average window...");

const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  const text = (await page.getByTestId("stress-stats-overlay").textContent()) ?? "";
  if (text.includes("AVG FPS")) break;
  const status = (await readStat(page, "STATUS")) || "?";
  const fps = (await readStat(page, "FPS")) || "?";
  const frame = (await readStat(page, "FRAME")) || "?";
  const draw = (await readStat(page, "DRAW CALLS")) || "?";
  const tri = (await readStat(page, "TRIANGLES")) || "?";
  console.log(`[profile] +${((Date.now() - t0) / 1000).toFixed(0)}s status=${status} fps=${fps} frame=${frame}ms draw=${draw} tri=${tri}`);
}

const glInfo = await page.evaluate(() => {
  const gl = window.__stressGl;
  if (!gl) return { renderer: "n/a" };
  const ext = gl.getContext().getExtension("WEBGL_debug_renderer_info");
  return {
    renderer: ext ? gl.getContext().getParameter(ext.UNMASKED_RENDERER_WEBGL) : "n/a",
  };
});
console.log("[profile] GL renderer:", glInfo.renderer);

const overlayText = (await page.getByTestId("stress-stats-overlay").textContent()) ?? "";
console.log("\n===== OVERLAY (30s averages frozen) =====");
console.log(overlayText);
console.log("=========================================\n");

if (TRACE) {
  const traceOutDir = path.resolve("profiling");
  mkdirSync(traceOutDir, { recursive: true });
  const traceFile = path.join(traceOutDir, `stress-trace-${Date.now()}.trace.zip`);
  await context.tracing.start({ screenshots: false, snapshots: false });
  console.log(`[profile] tracing ${TRACE_SECONDS}s of steady state...`);
  await page.waitForTimeout(TRACE_SECONDS * 1000);
  await context.tracing.stop({ path: traceFile });
  console.log(`[profile] trace written to ${traceFile}`);
}

if (pageErrors.length) {
  console.log("[profile] page errors:");
  for (const e of pageErrors.slice(0, 10)) console.log("  ", e);
}

const samples = [];
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(400);
  samples.push({
    fps: await readStat(page, "FPS"),
    frame: await readStat(page, "FRAME"),
    draw: await readStat(page, "DRAW CALLS"),
    tri: await readStat(page, "TRIANGLES"),
    progs: await readStat(page, "PROGRAMS"),
    enemies: await readStat(page, "ENEMIES"),
    projectiles: await readStat(page, "PROJECTILES"),
  });
}
console.log("[profile] steady-state samples:");
for (const s of samples) console.log("  ", JSON.stringify(s));

await browser.close();
