import { afterEach, describe, expect, it, vi } from "vitest";

import { settleModelLoads } from "./models";

// A fake for the outside-React `useGLTF(url)` lookup (each is a thunk, exactly
// as `getAreModelsLoaded` builds them): a "cached" lookup returns its value
// synchronously; a "loading" lookup throws the in-flight promise; a "failed"
// lookup throws the settled error (as a 404/parse failure would).
const cached = () => ({ ok: true });
const inFlight = (p: Promise<unknown>) => () => {
  throw p;
};
const failed = () => {
  throw new Error("load failed");
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("settleModelLoads", () => {
  it("resolves once every in-flight load settles", async () => {
    let resolveA: (v: unknown) => void;
    const a = new Promise((r) => (resolveA = r));
    const b = Promise.resolve({ ok: true });

    // Thunks are passed, not called — settleModelLoads invokes each.
    const promise = settleModelLoads([cached, inFlight(a), inFlight(b)], 1000);
    const settled = promise.then(() => "done");

    // Not settled until both in-flight loads resolve.
    expect(await Promise.race([settled, Promise.resolve("pending")])).toBe(
      "pending",
    );
    resolveA!({ ok: true });
    await expect(settled).resolves.toBe("done");
  });

  it("still resolves when a load fails (it degrades to the fallback)", async () => {
    const promise = settleModelLoads(
      [cached, failed, inFlight(Promise.resolve({}))],
      1000,
    );
    await expect(promise).resolves.toBeUndefined();
  });

  it("resolves on the timeout cap even if a load never settles", async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {}); // never resolves
    const promise = settleModelLoads([inFlight(never)], 500);
    const settled = promise.then(() => "done");
    vi.advanceTimersByTime(500);
    await expect(settled).resolves.toBe("done");
  });

  it("resolves immediately when everything is already cached", async () => {
    const promise = settleModelLoads([cached, cached], 500);
    await expect(promise).resolves.toBeUndefined();
  });
});
