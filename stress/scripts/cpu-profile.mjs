/**
 * CPU profiler for the stress scene: captures a V8 CPU profile over a steady
 * window and prints the hottest JS functions (self time) plus the heaviest
 * call stacks. Answers "what eats CPU process time the most".
 *
 * Usage: node stress/scripts/cpu-profile.mjs [--metal]
 */
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ensureStressServer, safeClose, STRESS_URL } from "../stress-server.mjs";

const METAL = process.argv.includes("--metal");
const DURATION_S = Number(process.env.DURATION_S ?? 10);

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
console.log(`[cpu] waiting for 30s metrics window...`);

const t0 = Date.now();
while (Date.now() - t0 < 200_000) {
  await page.waitForTimeout(2500);
  if ((await readOverlay(page)).includes("AVG FPS")) break;
}

console.log(`[cpu] profiling ${DURATION_S}s of steady state...`);
await client.send("Profiler.enable");
// Profiler.start takes no sampling parameter; set the interval explicitly
// (microseconds; 2000 samples/s = 500us).
await client.send("Profiler.setSamplingInterval", { interval: 500 });
await client.send("Profiler.start");
await page.waitForTimeout(DURATION_S * 1000);
const { profile } = await client.send("Profiler.stop");

const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "profiling");
mkdirSync(outDir, { recursive: true });
const file = path.join(outDir, `cpu-profile-${Date.now()}.cpuprofile`);
writeFileSync(file, JSON.stringify(profile));
console.log(`[cpu] profile written to ${file}`);

// Aggregate self time per function (node = call node, with children).
const nodes = profile.nodes;
const byId = new Map(nodes.map((n) => [n.id, n]));

// Build self-time per node id.
const selfTime = new Map();
for (const n of nodes) {
  selfTime.set(n.id, (selfTime.get(n.id) ?? 0) + n.hitCount);
}
// hitCount in CpuProfile is a sample count; total time = samples / rate * 1000.
const rate = profile.endTime - profile.startTime; // duration in us
const totalUs = rate;

// Aggregate "total time" per function = own hitCount + sum of descendants.
// CDP profile nodes expose child ids (node.children), not a parent reference.
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
  let t = (n?.hitCount ?? 0);
  for (const c of childrenMap.get(id) ?? []) t += computeTotal(c);
  totalUsPerNode.set(id, t);
  return t;
};
for (const n of nodes) computeTotal(n.id);

// Top functions by self time.
const topSelf = [...nodes]
  .filter((n) => n.hitCount > 0)
  .map((n) => ({
    name: n.callFrame.functionName || "(anonymous)",
    url: (n.callFrame.url || "").replace(/^https?:\/\/[^/]*\/node_modules\//, "nm/"),
    line: n.callFrame.lineNumber,
    selfUs: n.hitCount,
    totalUs: totalUsPerNode.get(n.id) ?? 0,
  }))
  .sort((a, b) => b.selfUs - a.selfUs)
  .slice(0, 30);

const totalSamples = [...selfTime.values()].reduce((a, b) => a + b, 0) || 1;
console.log(`\n[cpu] total ${DURATION_S}s, ${totalSamples} samples`);
console.log(`\n===== TOP 30 BY SELF TIME (CPU) =====`);
for (const f of topSelf) {
  const pct = (f.selfUs / totalSamples) * 100;
  const tPct = (f.totalUs / totalSamples) * 100;
  console.log(
    `${pct.toFixed(2).padStart(6)}%  self | ${tPct.toFixed(2).padStart(6)}% total | ${f.name}  [${f.url.split("/").slice(-2).join("/")}:${f.line}]`
  );
}

await safeClose(browser);
