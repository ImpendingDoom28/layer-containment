import { FC } from "react";
import { useTranslation } from "react-i18next";
import { Palette } from "lucide-react";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { cn } from "@/components/ui/lib/twUtils";
import {
  HUD_THEME_IDS,
  cycleHudThemeSelector,
  hudThemeSelector,
  useHudThemeStore,
} from "../../core/stores/useHudThemeStore";

/**
 * In-game HUD theme switcher (1..5). Floating pill at the bottom center of
 * the screen so it clears both gameplay panels and the canvas placement
 * fixtures; clicking cycles to the next theme.
 */
export const HUDThemeSwitcher: FC = () => {
  const { t } = useTranslation();
  const theme = useHudThemeStore(hudThemeSelector);
  const cycleTheme = useHudThemeStore(cycleHudThemeSelector);
  const themeNumber = HUD_THEME_IDS.indexOf(theme) + 1;

  return (
    <div
      className={cn(
        "absolute left-1/2 z-(--z-overlay) flex -translate-x-1/2 justify-center",
        // In arcade the bottom dock occupies the bottom edge, so the pill
        // floats above it.
        theme === "arcade" ? "bottom-32" : "bottom-4"
      )}
    >
      <UIButton
        data-testid="hud-theme-switcher"
        onClick={cycleTheme}
        variant="outline"
        aria-label={`${t("hudTheme.switchToNext")}: ${t(`hudTheme.${theme}`)} (${themeNumber}/5)`}
        className={cn(
          "h-9 gap-2 border-white/20 bg-black/60 px-3 text-white/90 backdrop-blur-md hover:bg-black/80",
          theme === "command" && "rounded-none",
          theme === "hologram" &&
            "rounded-none border-cyan-300/50 text-cyan-200",
          theme === "tactical" &&
            "rounded-none border-lime-500/50 text-lime-200",
          theme === "arcade" &&
            "rounded-none border-yellow-300/60 text-yellow-200",
          theme === "glass" && "rounded-full border-white/25"
        )}
      >
        <Palette size={14} className="shrink-0" />
        <span className="text-[11px] font-semibold tracking-[0.2em] uppercase">
          {t(`hudTheme.${theme}`)}
        </span>
        <span className="text-[11px] font-bold text-white/50">
          {themeNumber}/5
        </span>
      </UIButton>
    </div>
  );
};
