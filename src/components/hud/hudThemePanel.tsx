import type { FC, ReactNode } from "react";

import { cn } from "../ui/lib/twUtils";
import type { HudThemeId } from "../../core/stores/useHudThemeStore";

type HudThemePanelProps = {
  theme: HudThemeId;
  className?: string;
  children: ReactNode;
};

/**
 * Per-theme outer chrome (backdrop blur, corner cuts, borders, scanlines,
 * hazard strips) around the two gameplay panels. The panels inside stay
 * neutral so each theme reads as one coherent surface.
 */
export const HudThemePanel: FC<HudThemePanelProps> = ({
  theme,
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        "relative flex flex-col",
        theme === "hologram" &&
          "hud-holo-cut hud-holo-panel hud-scanlines hud-holo-glow",
        theme === "tactical" &&
          "hud-tactical-panel hud-scanlines-soft hud-hazard-top hud-hazard-bottom",
        theme === "arcade" && "hud-arcade-panel",
        theme === "glass" && "hud-glass-panel hud-aurora hud-glass-blur",
        className
      )}
    >
      {children}
    </div>
  );
};

/**
 * The HUD shell: keeps the existing tilt + shadow behavior for the command
 * theme (default) and adds per-theme wrapper classes for the others.
 */
export const HudThemeShell: FC<HudThemePanelProps> = ({
  theme,
  side,
  className,
  children,
}) => {
  return (
    <div
      className={cn(
        "flex h-full flex-col",
        // Only the original command theme keeps the legacy tilt + shadow
        // chrome; the themed panels bring their own frame.
        theme === "command" &&
          (side === "left"
            ? "ui-menu-tilt ui-menu-tilt-left ui-menu-tilt-shadow-left"
            : side === "right"
              ? "ui-menu-tilt ui-menu-tilt-right ui-menu-tilt-shadow-right"
              : ""),
        className
      )}
    >
      {children}
    </div>
  );
};
