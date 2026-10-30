import { useEffect } from "react";
import { advance, useStore } from "@react-three/fiber";

import BackgroundTickerWorker from "../../core/workers/backgroundTicker.worker?worker";
import { useGameStore } from "../../core/stores/useGameStore";
import { useSettingsStore } from "../../core/stores/useSettingsStore";

/**
 * System for the game to continue running in background
 * (when page is out of focus)
 *
 * Only works, if we have a setting enabled
 */
export const BackgroundGameLoopSystem = () => {
  const rootStore = useStore();

  useEffect(() => {
    const worker = new BackgroundTickerWorker();

    const syncTicker = () => {
      const shouldRun =
        document.visibilityState === "hidden" &&
        !useSettingsStore.getState().pauseWhenTabHidden;

      worker.postMessage(shouldRun ? "start" : "stop");
    };

    worker.addEventListener("message", () => {
      const isPageVisible = useGameStore.getState().isPageVisible;
      const pauseWhenTabHidden = useSettingsStore.getState().pauseWhenTabHidden;

      if (isPageVisible || pauseWhenTabHidden) {
        return;
      }

      advance(performance.now(), false, rootStore.getState());
    });

    syncTicker();
    document.addEventListener("visibilitychange", syncTicker);
    const unsubscribeSettings = useSettingsStore.subscribe(syncTicker);

    return () => {
      document.removeEventListener("visibilitychange", syncTicker);
      unsubscribeSettings();
      worker.terminate();
    };
  }, [rootStore]);

  return null;
};
