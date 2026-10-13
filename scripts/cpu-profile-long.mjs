/**
 * Long CDP CPU profile (Profiler domain) over a configurable window so the
 * time-resolved analyzer can pinpoint what runs during the periodic hitches.
 *
 * Usage: node scripts/cpu-profile-long.mjs [--metal] [--seconds 25]
 */
import { chromium } from "@playwright/test";
import { readdirSync } from "node:fs";

const URL = "http://localhost:5174/index.stress.html";
const METAL = process.argv.includes("--metal");
const SECONDS = Number(
  process.argv[process.argv.indexOf("--seconds") + 1] ?? 25
);

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
await cdp.send("Profiler.start", { samplingInterval: 2000 });
console.log(`[cpu-long] profiling ${SECONDS}s...`);
await page.waitForTimeout(SECONDS * 1000);
const { profile } = await cdp.send("Profiler.stop");
await cdp.send("Profiler.disable");

const files = readdirSync("profiling").filter((f) => f.endsWith(".cpuprofile"));
const out = `profiling/cpu-long-${Date.now()}.cpuprofile`;
const fs = await import("node:fs");
fs.writeFileSync(out, JSON.stringify(profile));
console.log(`[cpu-long] wrote ${out} (${profile.samples.length} samples)`);
await browser.close();
