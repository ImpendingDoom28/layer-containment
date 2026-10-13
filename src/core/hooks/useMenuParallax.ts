import { useEffect } from "react";

import { useGameStore } from "../stores/useGameStore";
import type { GameStatus } from "../types/game";

// Max value for --ui-menu-parallax-x/-y in px; the tilt utilities scale
// it down further.
const PARALLAX_MAX_OFFSET_PX = 6;
// Pointer distance (px) from the panel's canvas-side edge at which the
// proximity lift bottoms out.
const PROXIMITY_FAR_PX = 240;
// Left-anchored menu panel is w-[45%] max-w-xl; this is its canvas-side
// (right) edge in px.
const PANEL_EDGE_RATIO = 0.45;
const PANEL_EDGE_MAX_PX = 576;

// Parallax only runs in the between-HUD menus (main menu, in-game pause
// menu), never over the gameplay HUD.
const PARALLAX_STATUSES: ReadonlySet<GameStatus> = new Set([
  "menu",
  "gameMenu",
]);

// Drives the mouse parallax of the tilted menu panels. One pointermove
// listener on the document root writes three custom properties:
// --ui-menu-parallax-x/-y (cursor offset around the viewport center) and
// --ui-menu-proximity (0..1, how close the cursor is to the panel's
// canvas-side edge). The ui-menu-tilt-* utilities feed them into a small
// rotation and shift, plus a lift of the canvas-side edge, with their
// transform transition easing the panels into place. While a gameplay
// status is active or prefers-reduced-motion is on, the panels keep
// their static tilt and do not follow the cursor.
export const useMenuParallax = () => {
  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
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

      // 1 when the cursor is at/past the panel's canvas-side edge, 0
      // once PROXIMITY_FAR_PX to its left.
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
