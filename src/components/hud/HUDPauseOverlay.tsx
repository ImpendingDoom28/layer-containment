import { FC } from "react";

import { useReducedMotion } from "../../core/hooks/useReducedMotion";
import { cn } from "../ui/lib/twUtils";

type HUDPauseOverlayProps = {
  active: boolean;
};

/**
 * "Held photograph" treatment for a paused game: the world behind the HUD
 * gently dims and desaturates under a soft vignette so the frozen scene
 * reads as a held frame rather than a live (frozen) simulation. Sits above
 * the canvas and below the HUD, and never intercepts input.
 */
const PAUSE_BACKDROP_FILTER = "brightness(0.9) saturate(0.72)";
const PAUSE_VIGNETTE =
  "radial-gradient(ellipse at center, transparent 45%, rgb(2 6 17 / 0.45) 100%)";

export const HUDPauseOverlay: FC<HUDPauseOverlayProps> = ({ active }) => {
  const reducedMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 z-40 overflow-hidden",
        !reducedMotion && "transition-opacity duration-300",
        active ? "opacity-100" : "opacity-0"
      )}
      style={{
        backdropFilter: PAUSE_BACKDROP_FILTER,
        WebkitBackdropFilter: PAUSE_BACKDROP_FILTER,
        background: PAUSE_VIGNETTE,
      }}
    />
  );
};
