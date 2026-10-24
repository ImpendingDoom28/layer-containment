import { FC } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import { PauseIcon } from "../../ui/assets/PauseIcon";
import type { HudStatsState } from "../useHudPanels";

const HEALTH_PIXELS = 10;

type StatsArcadeProps = {
  stats: HudStatsState;
};

/**
 * Arcade stats: a top-center "scoreboard" marquee — CREDITS / HULL / WAVE
 * readouts in chunky pixel cells with a blinking 1-UP-style wave readout
 * and a big arcade start button.
 */
export const StatsArcade: FC<StatsArcadeProps> = ({ stats }) => {
  const { t } = useTranslation();

  const filled = Math.max(
    0,
    Math.min(
      HEALTH_PIXELS,
      Math.round((stats.health / stats.maxHealth) * HEALTH_PIXELS)
    )
  );
  const healthTone =
    stats.health > 15
      ? "bg-lime-400"
      : stats.health > 8
        ? "bg-yellow-400"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-5 px-5 py-3">
      <div className="hud-pixel-panel flex flex-col items-center px-4 py-1.5">
        <UITypography
          variant="verySmall"
          className="hud-arcade-body tracking-[0.2em] opacity-70"
        >
          {t("gameStats.credits")}
        </UITypography>
        <span className="hud-arcade-title text-xl font-bold leading-none">
          ${stats.money}
        </span>
      </div>

      <div className="hud-pixel-panel flex flex-col items-center gap-1 px-4 py-1.5">
        <UITypography
          variant="verySmall"
          className="hud-arcade-body tracking-[0.2em] opacity-70"
        >
          {t("gameStats.hull")}
        </UITypography>
        <div className="flex gap-1">
          {Array.from({ length: HEALTH_PIXELS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-3 w-3",
                i < filled ? healthTone : "bg-white/15",
                stats.health <= 8 && i < filled && "hud-blink"
              )}
            />
          ))}
        </div>
        <UITypography
          variant="verySmall"
          className={cn("hud-arcade-body", stats.health <= 8 && "hud-blink")}
        >
          {stats.health}
        </UITypography>
      </div>

      <div className="hud-pixel-panel flex flex-col items-center px-4 py-1.5">
        <UITypography
          variant="verySmall"
          className="hud-arcade-body tracking-[0.2em] opacity-70"
        >
          {t("gameStats.wave")}
        </UITypography>
        <span
          data-testid="wave-count"
          className="hud-arcade-title text-xl font-bold leading-none"
        >
          {`${stats.currentWave} / ${stats.totalWaves}`}
        </span>
        {stats.showEnemies && (
          <UITypography variant="verySmall" className="hud-arcade-body">
            {t("gameStats.enemies")} {stats.remainingEnemies}
          </UITypography>
        )}
      </div>

      <div className="ml-2 flex items-center gap-3">
        {stats.isPaused && (
          <UIButton
            variant="default"
            size={"icon-sm"}
            className="hud-pixel-panel w-fit px-2 text-yellow-300 hud-blink"
            data-testid="paused-indicator"
          >
            <PauseIcon />
          </UIButton>
        )}
        {stats.showStartWave && (
          <UIButton
            data-testid="wave-start"
            onClick={stats.onStartWave}
            variant="outline"
            className="hud-pixel-panel px-5 py-2.5 text-xs font-bold uppercase tracking-[0.25em] text-yellow-300 hover:bg-yellow-400/15"
          >
            <Play /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
      </div>
    </div>
  );
};
