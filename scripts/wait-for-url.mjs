// Waits until a URL answers HTTP 200, so `dev:electron` only starts Electron
// after the Vite dev server is up. Usage: node scripts/wait-for-url.mjs <url>
const target = new URL(process.argv[2] ?? "http://localhost:5173");
const timeoutMs = 60_000;
const intervalMs = 500;

const started = Date.now();

const tryOnce = async () => {
  try {
    const res = await fetch(target.href, { method: "GET" });
    if (res.ok) {
      process.exit(0);
    }
  } catch {
    // Not up yet; retry.
  }
  if (Date.now() - started > timeoutMs) {
    console.error(`timed out waiting for ${target.href}`);
    process.exit(1);
  }
  setTimeout(tryOnce, intervalMs);
};

tryOnce();
