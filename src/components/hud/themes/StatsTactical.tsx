import { FC } from "react";
import { Play, Target } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import { PauseIcon } from "../../ui/assets/PauseIcon";
import type { HudStatsState } from "../useHudPanels";

type StatsTacticalProps = {
  stats: HudStatsState;
};

export const StatsTactical: FC<StatsTacticalProps> = ({ stats }) => {
  const { t } = useTranslation();

  const healthTone =
    stats.health > 15
      ? "bg-lime-400"
      : stats.health > 8
        ? "bg-amber-400"
        : "bg-red-500";

  const healthPercent = Math.max(
    0,
    Math.min(100, (stats.health / stats.maxHealth) * 100)
  );

  return (
    <div className="relative flex flex-col gap-4 bg-[#141a14] p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <UITypography
            variant="verySmall"
            className="hud-stencil mb-1 text-lime-600/80"
          >
            {t("gameStats.credits")}
          </UITypography>
          <UITypography variant="h4" className="hud-stencil text-amber-300">
            ${stats.money}
          </UITypography>
        </div>
        <div>
          <UITypography
            variant="verySmall"
            className="hud-stencil mb-1.5 flex items-center gap-1.5 text-lime-600/80"
          >
            <Target size={10} />
            {t("gameStats.hull")}
          </UITypography>
          <div className="flex items-center gap-2">
            <div className="h-2 w-24 border border-lime-500/40 bg-black/40">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  healthTone,
                  stats.health <= 8 && "hud-blink"
                )}
                style={{ width: `${healthPercent}%` }}
              />
            </div>
            <UITypography
              variant="medium"
              className={cn(
                "hud-stencil",
                stats.health > 15
                  ? "text-lime-300"
                  : stats.health > 8
                    ? "text-amber-300"
                    : "text-red-400"
              )}
            >
              {stats.health}
            </UITypography>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-lime-500/20 pt-3">
        <div className="flex items-center gap-2">
          <UITypography
            variant="verySmall"
            className="hud-stencil text-lime-600/80"
          >
            {t("gameStats.wave")}
          </UITypography>
          <UITypography
            variant="medium"
            data-testid="wave-count"
            className="hud-stencil text-lime-200"
          >
            {`${stats.currentWave} / ${stats.totalWaves}`}
          </UITypography>
        </div>
        {stats.showEnemies && (
          <div className="flex items-center gap-1.5">
            <UITypography
              variant="verySmall"
              className="hud-stencil text-lime-600/80"
            >
              {t("gameStats.enemies")}
            </UITypography>
            <UITypography
              variant="medium"
              className="hud-stencil text-lime-200"
            >
              {stats.remainingEnemies}
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
            className="rounded-none border-2 border-amber-400/60 bg-amber-400/10 py-2.5 text-[11px] font-bold tracking-[0.35em] text-amber-300 hover:bg-amber-400/25 hud-led-pulse"
          >
            <Play /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
        {stats.isPaused && (
          <UIButton
            variant="default"
            size={"icon-sm"}
            className="px-1 w-fit rounded-none border-2 border-lime-400/60 bg-lime-400/15 text-lime-300"
            data-testid="paused-indicator"
          >
            <PauseIcon />
          </UIButton>
        )}
      </div>
    </div>
  );
};
