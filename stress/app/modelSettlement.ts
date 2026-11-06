import { useGLTF } from "@react-three/drei";

import { BASE_MODEL, ENEMY_MODELS } from "../../src/constants/models";

/**
 * Classifies the load state of the given model URLs against the shared
 * `useGLTF` cache (the same entries `ModelLoader` in the scene reads):
 * a finished load returns its cached parse, a load still in flight throws its
 * in-flight promise, and a settled failure throws the error.
 */
export const classifyModelStatuses = (
  urls: string[],
): Record<string, "loaded" | "pending" | "failed"> => {
  const statuses: Record<string, "loaded" | "pending" | "failed"> = {};
  for (const url of urls) {
    try {
      useGLTF(url);
      statuses[url] = "loaded";
    } catch (error) {
      statuses[url] =
        error && typeof (error as Promise<unknown>).then === "function"
          ? "pending"
          : "failed";
    }
  }
  return statuses;
};

/**
 * All model URLs the stress scene renders: the five enemy types, the base, and
 * the six tower types from the game config.
 */
export const stressModelUrls = (towerModelUrls: string[]): string[] => [
  ...Object.values(ENEMY_MODELS).map((model) => model.url),
  BASE_MODEL.url,
  ...towerModelUrls,
];

/**
 * Polls the shared model cache until every stress model has *settled*
 * (loaded or failed) and reports whether all of them loaded. `getAreModelsLoaded`
 * resolves on a 15s cap and absorbs per-model failures, so it settling does not
 * prove every model finished; the scene is only mounted and the metrics window
 * only opened once this resolves. Returns `true` when every model is loaded,
 * `false` when at least one failed or was still pending when `maxMs` elapsed.
 */
export const settleModelStatuses = async (
  towerModelUrls: string[],
  maxMs: number,
  pollMs: number,
): Promise<boolean> => {
  const urls = stressModelUrls(towerModelUrls);
  const deadline = Date.now() + maxMs;
  for (;;) {
    const statuses = classifyModelStatuses(urls);
    const pending = urls.some((url) => statuses[url] === "pending");
    if (!pending) {
      return urls.every((url) => statuses[url] === "loaded");
    }
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
};
