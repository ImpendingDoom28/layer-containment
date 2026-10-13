/**
 * Long CDP CPU profile (Profiler domain) over a configurable window so the
 * time-resolved analyzer can pinpoint what runs during the periodic hitches.
 *
 * Usage: node scripts/cpu-profile-long.mjs [--metal] [--seconds 25]
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const URL = "http://localhost:5174/index.stress.html";
const METAL = process.argv.includes("--metal");
const idx = process.argv.indexOf("--seconds");
// Without the flag, indexOf is -1 and argv[0] (the node path) would yield
// NaN; default to 25s.
const SECONDS = idx === -1 ? 25 : Number(process.argv[idx + 1]);

const browser = await chromium.launch(
  METAL ? { args: ["--use-angle=metal"] } : undefined
);
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
await page.goto(URL, { waitUntil: "domcontentloaded" });
await page.getByTestId("game-canvas").waitFor({ timeout: 30_000 });

const cdp = await context.newCDPSession(page);

// Let it reach steady state (past load / shader compile).
console.log("[cpu-long] waiting 35s for steady state...");
await page.waitForTimeout(35_000);

await cdp.send("Profiler.enable");
// Profiler.start takes no sampling parameter; set the interval explicitly
// (microseconds; 2000 samples/s = 500us).
await cdp.send("Profiler.setSamplingInterval", { interval: 500 });
await cdp.send("Profiler.start");
console.log(`[cpu-long] profiling ${SECONDS}s...`);
await page.waitForTimeout(SECONDS * 1000);
const { profile } = await cdp.send("Profiler.stop");
await cdp.send("Profiler.disable");

mkdirSync("profiling", { recursive: true });
const out = `profiling/cpu-long-${Date.now()}.cpuprofile`;
writeFileSync(out, JSON.stringify(profile));
console.log(`[cpu-long] wrote ${out} (${profile.samples.length} samples)`);
await browser.close();
