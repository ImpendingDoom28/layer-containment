// Time-resolved CPU profile analyzer: finds the "hitch" buckets (seconds with
// ~3x median CPU work) and shows which functions dominate them vs calm buckets.
import { readdirSync, readFileSync } from "node:fs";

const dir = "profiling";
const argFile = process.argv[2];
const files = readdirSync(dir).filter((f) => f.endsWith(".cpuprofile")).sort();
const f = argFile
  ? (argFile.startsWith("profiling/") ? argFile : `${dir}/${argFile}`)
  : files[files.length - 1];
const prof = JSON.parse(readFileSync(f, "utf8"));

const nodes = new Map(prof.nodes.map((n) => [n.id, n]));
const nameOf = (id) => {
  const n = nodes.get(id);
  if (!n) return "(anon)";
  return n.callFrame.functionName || "(anon)";
};

const bucketMs = 1000;
const buckets = new Map();
for (let i = 0; i < prof.samples.length; i++) {
  const tMs = prof.timeDeltas[i] - prof.timeDeltas[0];
  const b = Math.floor(tMs / bucketMs);
  if (!buckets.has(b)) buckets.set(b, new Map());
  const fn = nameOf(prof.samples[i]);
  const m = buckets.get(b);
  m.set(fn, (m.get(fn) || 0) + 1);
}

const totals = [...buckets.values()]
  .map((m) => [...m.values()].reduce((s, v) => s + v, 0))
  .sort((a, b) => a - b);
const median = totals[Math.floor(totals.length / 2)] || 1;

const topOf = (m, n) =>
  [...m.entries()]
    .sort((a, x) => x[1] - a[1])
    .slice(0, n)
    .map(([fn, c]) => `${fn}:${((100 * c) / [...m.values()].reduce((s, v) => s + v, 0)).toFixed(0)}%`)
    .join(" ");

console.log(`profile: ${f}`);
console.log(`samples: ${prof.samples.length}  span: ${Math.round((prof.timeDeltas[prof.timeDeltas.length - 1] - prof.timeDeltas[0]) / 1000)}s  median CPU/bucket: ${median} samples`);
console.log("");

const bucketsArr = [...buckets.entries()].sort((a, x) => a[0] - x[0]);
console.log("== HITCH buckets (>2.5x median CPU) ==");
let hitchCount = 0;
for (const [b, m] of bucketsArr) {
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  if (total >= median * 2.5) {
    hitchCount++;
    console.log(`  s~${b} n=${total} | ${topOf(m, 8)}`);
  }
}
if (!hitchCount) console.log("  (none — profile has no clear hitches)");

console.log("");
console.log("== CALM buckets (top 4 of all calm) ==");
const calm = bucketsArr
  .filter(([b, m]) => [...m.values()].reduce((s, v) => s + v, 0) < median * 2.5)
  .slice(0, 4);
for (const [b, m] of calm) {
  const total = [...m.values()].reduce((s, v) => s + v, 0);
  console.log(`  s~${b} n=${total} | ${topOf(m, 8)}`);
}

const all = new Map();
for (const id of prof.samples) {
  const fn = nameOf(id);
  all.set(fn, (all.get(fn) || 0) + 1);
}
console.log("");
console.log("== Overall top self-time ==");
for (const [fn, c] of [...all.entries()].sort((a, x) => x[1] - a[1]).slice(0, 14)) {
  console.log(`  ${((100 * c) / prof.samples.length).toFixed(1)}%  ${fn}`);
}
