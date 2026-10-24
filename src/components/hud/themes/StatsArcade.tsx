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

export const StatsArcade: FC<StatsArcadeProps> = ({ stats }) => {
  const { t } = useTranslation();

  const filledPixels = Math.max(
    0,
    Math.min(
      HEALTH_PIXELS,
      Math.round((stats.health / stats.maxHealth) * HEALTH_PIXELS)
    )
  );
  const healthColor =
    stats.health > 15
      ? "bg-green-400"
      : stats.health > 8
        ? "bg-yellow-400"
        : "bg-red-500";

  return (
    <div className="hud-arcade-checker relative flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="hud-pixel-panel flex items-center gap-1.5 px-3 py-1.5">
          <span className="hud-arcade-body animate-pulse text-yellow-300">
            ◆
          </span>
          <UITypography
            variant="medium"
            className="hud-arcade-body text-yellow-300"
          >
            {stats.money}
          </UITypography>
        </div>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: HEALTH_PIXELS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "size-3",
                i < filledPixels
                  ? cn(healthColor, stats.health <= 8 && "hud-blink")
                  : "bg-black/60 outline outline-1 outline-white/20"
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="hud-pixel-panel px-3 py-1.5">
          <UITypography
            variant="medium"
            data-testid="wave-count"
            className="hud-arcade-body text-white"
          >
            {t("gameStats.wave")}
            <span className="ml-1.5 text-yellow-300">
              {`${stats.currentWave} / ${stats.totalWaves}`}
            </span>
          </UITypography>
        </div>
        {stats.showEnemies && (
          <div className="hud-pixel-panel px-3 py-1.5">
            <UITypography
              variant="medium"
              className="hud-arcade-body text-white"
            >
              {t("gameStats.enemies")}
              <span className="ml-1.5 text-red-400">
                {stats.remainingEnemies}
              </span>
            </UITypography>
          </div>
        )}
      </div>

      <div>
        {stats.showStartWave && (
          <UIButton
            data-testid="wave-start"
            onClick={stats.onStartWave}
            variant="outline"
            className="hud-pixel-panel hud-blink py-3 text-[12px] font-bold tracking-[0.3em] text-yellow-300"
          >
            <Play /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
        {stats.isPaused && (
          <UIButton
            variant="default"
            size={"icon-sm"}
            className="px-1 w-fit hud-pixel-panel text-white"
            data-testid="paused-indicator"
          >
            <PauseIcon />
          </UIButton>
        )}
      </div>
    </div>
  );
};
