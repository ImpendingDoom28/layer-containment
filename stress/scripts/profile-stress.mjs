/**
 * Manual profiling harness for the stress test.
 *
 * Usage:
 *   node stress/scripts/profile-stress.mjs            # metrics only
 *   node stress/scripts/profile-stress.mjs --trace    # + CDP performance trace (4s, steady state)
 *
 * Waits until the 30s average window has frozen, prints the overlay metrics,
 * then samples a few live frames for steady-state numbers. With --trace it
 * captures a Chromium performance trace (CPU + GPU slices) through the CDP
 * `Tracing` domain (NOT Playwright's `context.tracing`, which records browser
 * operations, not performance data) and writes it as Chrome-trace JSON to
 * profiling/stress-trace-*.trace (open in chrome://tracing or Perfetto).
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const TRACE = process.argv.includes("--trace");
const TRACE_SECONDS = Number(process.env.TRACE_SECONDS ?? 4);

const readStat = async (page, label) => {
  const text = await page.getByTestId("stress-stats-overlay").textContent();
  const line = text?.split("\n").find((l) => l.startsWith(`${label} `));
  return line ? line.split("  ").slice(1).join("  ").trim() : "";
};

const METAL = process.argv.includes("--metal");
await ensureStressServer();

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

await page.goto(STRESS_URL, { waitUntil: "domcontentloaded" });
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
  // CDP `Tracing` domain: real Chromium performance trace (CPU + GPU slices),
  // unlike Playwright's `context.tracing` which records browser operations.
  // Events stream back as `Tracing.dataCollected` payloads; we collect them
  // and reassemble the Chrome-trace JSON at the end.
  const cdp = await context.newCDPSession(page);
  const events = [];
  cdp.on("Tracing.dataCollected", (payload) => {
    for (const e of payload.value ?? []) events.push(e);
  });
  await cdp.send("Tracing.start", {
    categories: "devtools.timeline",
    options: "runAsSoonAsPossible,sampling",
  });
  console.log(`[profile] capturing CDP trace ${TRACE_SECONDS}s of steady state...`);
  await page.waitForTimeout(TRACE_SECONDS * 1000);
  // Tracing.end stops collection, but CDP streams the remaining
  // Tracing.dataCollected payloads before a separate Tracing.tracingComplete
  // event; await that event so the file contains the full trace.
  const tracingComplete = new Promise((resolve) =>
    cdp.on("Tracing.tracingComplete", resolve)
  );
  const final = await cdp.send("Tracing.end");
  // Tracing.end may return the last batch in `value` or nothing (all events
  // already streamed via dataCollected); handle both.
  if (final.value) for (const e of final.value) events.push(e);
  await tracingComplete;
  // Tracing.dataCollected delivers trace events as objects (this Playwright
  // version), not pre-serialized text, so serialize them into a Chrome-trace
  // JSON array; a pre-serialized fragment is kept verbatim.
  const traceJson =
    "[" +
    events.map((e) => (typeof e === "string" ? e : JSON.stringify(e))).join(",") +
    "]";
  const traceOutDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "profiling");
  mkdirSync(traceOutDir, { recursive: true });
  const traceFile = path.join(traceOutDir, `stress-trace-${Date.now()}.trace`);
  writeFileSync(traceFile, traceJson);
  console.log(
    `[profile] trace written to ${traceFile} (${events.length} events, ${(Buffer.byteLength(traceJson) / 1024 / 1024).toFixed(1)} MB)`
  );
  await cdp.detach();
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

await safeClose(browser);
