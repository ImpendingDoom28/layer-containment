import { FC } from "react";

import { cn } from "../ui/lib/twUtils";

type HUDPauseOverlayProps = {
  active: boolean;
};

/**
 * "Held photograph" treatment for a paused game: the world behind the HUD
 * darkens and desaturates under a vignette so the frozen scene reads as a
 * held frame rather than a live (frozen) simulation. Sits above the canvas
 * and below the HUD, and never intercepts input.
 */
const PAUSE_BACKDROP_FILTER = "brightness(0.82) saturate(0.7)";

export const HUDPauseOverlay: FC<HUDPauseOverlayProps> = ({ active }) => (
  <div
    className={cn(
      "pointer-events-none absolute inset-0 z-40 overflow-hidden transition-opacity duration-300",
      active ? "opacity-100" : "opacity-0"
    )}
    style={{
      backdropFilter: PAUSE_BACKDROP_FILTER,
      WebkitBackdropFilter: PAUSE_BACKDROP_FILTER,
    }}
  >
    <div className="h-full w-full bg-slate-950/25" />
    <div
      className="h-full w-full"
      style={{
        background:
          "radial-gradient(ellipse at center, transparent 35%, rgb(2 6 17 / 0.55) 100%)",
      }}
    />
  </div>
);
