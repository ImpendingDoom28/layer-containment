import type { CSSProperties } from "react";

/** Keeps drei's Html overlays below the HUD (z-50); default drei range is [16777271, 0]. */
export const DREI_HTML_Z_INDEX_RANGE: [number, number] = [49, 0];

export const GAME_CANVAS_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
};

export const GAME_CANVAS_GL = { antialias: true };
