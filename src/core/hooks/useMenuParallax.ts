import { useEffect } from "react";

import { useGameStore } from "../stores/useGameStore";
import type { GameStatus } from "../types/game";

const PARALLAX_MAX_OFFSET_PX = 6;
const PROXIMITY_FAR_PX = 240;
// Left-anchored menu panel is w-[45%] max-w-xl, so its canvas-side edge
// is min(45% of the viewport, 576px).
const PANEL_EDGE_RATIO = 0.45;
const PANEL_EDGE_MAX_PX = 576;

const PARALLAX_STATUSES: ReadonlySet<GameStatus> = new Set([
  "menu",
  "gameMenu",
]);

export const useMenuParallax = () => {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = globalThis.matchMedia(
      "(prefers-reduced-motion: reduce)"
    );
    let enabled = false;

    const clearVariables = () => {
      root.style.removeProperty("--ui-menu-parallax-x");
      root.style.removeProperty("--ui-menu-parallax-y");
      root.style.removeProperty("--ui-menu-proximity");
    };

    const syncEnabled = () => {
      const next =
        !reducedMotion.matches &&
        PARALLAX_STATUSES.has(useGameStore.getState().gameStatus);
      if (next === enabled) return;
      enabled = next;
      // The CSS gates the parallax transforms on this root class.
      root.classList.toggle("ui-menu-parallax-on", next);
      if (!next) clearVariables();
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!enabled) return;

      const nx = Math.min(1, Math.max(0, event.clientX / window.innerWidth));
      const ny = Math.min(1, Math.max(0, event.clientY / window.innerHeight));
      const x = PARALLAX_MAX_OFFSET_PX * (nx * 2 - 1);
      const y = PARALLAX_MAX_OFFSET_PX * (ny * 2 - 1) * 0.6;
      root.style.setProperty("--ui-menu-parallax-x", `${x}`);
      root.style.setProperty("--ui-menu-parallax-y", `${y}`);

      const panelEdgeX = Math.min(
        window.innerWidth * PANEL_EDGE_RATIO,
        PANEL_EDGE_MAX_PX
      );
      const distance = Math.max(0, panelEdgeX - event.clientX);
      const proximity =
        distance >= PROXIMITY_FAR_PX ? 0 : 1 - distance / PROXIMITY_FAR_PX;
      root.style.setProperty("--ui-menu-proximity", proximity.toFixed(3));
    };

    root.addEventListener("pointermove", onPointerMove);
    reducedMotion.addEventListener("change", syncEnabled);
    const unsubscribe = useGameStore.subscribe(syncEnabled);
    syncEnabled();

    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      reducedMotion.removeEventListener("change", syncEnabled);
      unsubscribe();
      root.classList.remove("ui-menu-parallax-on");
      clearVariables();
    };
  }, []);
};
