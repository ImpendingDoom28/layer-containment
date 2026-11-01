import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// The module keeps a shared in-flight/cached config promise, so each test
// gets a fresh module instance (reset the registry, then import again).
const freshLoadGameConfig = async () => {
  vi.resetModules();
  const { loadGameConfig } = await import("./gameConfig");
  return loadGameConfig;
};

// Serves the real config file, like the app serves /configs/game.json.
const rawConfig = readFileSync("public/configs/game.json");

const fetchSpy = vi.fn(async (url: string): Promise<Response> => {
  expect(String(url)).toBe("/configs/game.json");
  return {
    ok: true,
    statusText: "OK",
    json: async () => JSON.parse(rawConfig.toString()),
  } as Response;
});

vi.stubGlobal("fetch", fetchSpy);

describe("loadGameConfig", () => {
  beforeEach(() => {
    fetchSpy.mockClear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("dedupes concurrent calls to a single fetch", async () => {
    const loadGameConfig = await freshLoadGameConfig();

    // The page and the main-menu scene both load the config on the first
    // frame; the file must be fetched once, not once per caller.
    const [first, second, third] = await Promise.all([
      loadGameConfig(),
      loadGameConfig(),
      loadGameConfig(),
    ]);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it("serves later calls from the cached config without re-fetching", async () => {
    const loadGameConfig = await freshLoadGameConfig();

    const first = await loadGameConfig();
    const second = await loadGameConfig();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(second.towerTypes.basic.id).toBe("basic");
  });

  it("allows a retry after a failed load", async () => {
    const loadGameConfig = await freshLoadGameConfig();
    fetchSpy.mockRejectedValueOnce(new Error("network down"));

    // loadFile swallows the fetch error and returns null, so the failure
    // surfaces as the "failed to load" error.
    await expect(loadGameConfig()).rejects.toThrow(
      "Failed to load game configuration file"
    );

    const retried = await loadGameConfig();

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(retried.pathWidth).toBeGreaterThan(0);
  });
});
