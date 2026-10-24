import { FC } from "react";
import { Crosshair, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import { PauseIcon } from "../../ui/assets/PauseIcon";
import type { HudStatsState } from "../useHudPanels";

const HEALTH_SEGMENTS = 20;

type StatsHologramProps = {
  stats: HudStatsState;
};

export const StatsHologram: FC<StatsHologramProps> = ({ stats }) => {
  const { t } = useTranslation();

  const filledSegments = Math.max(
    0,
    Math.min(
      HEALTH_SEGMENTS,
      Math.round((stats.health / stats.maxHealth) * HEALTH_SEGMENTS)
    )
  );
  const healthTone =
    stats.health > 15
      ? "bg-green-400"
      : stats.health > 8
        ? "bg-amber-400"
        : "bg-red-500";

  return (
    <div className="hud-holo-scan relative flex flex-col gap-4 p-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <UITypography
            variant="verySmall"
            className="hud-holo-text-dim mb-1 tracking-[0.3em]"
          >
            {t("gameStats.credits")}
          </UITypography>
          <UITypography variant="h4" className="hud-holo-text">
            {stats.money}
          </UITypography>
        </div>
        <div>
          <UITypography
            variant="verySmall"
            className="hud-holo-text-dim mb-1 tracking-[0.3em]"
          >
            {t("gameStats.integrity")}
          </UITypography>
          <div className="flex items-center gap-2">
            <div className="flex gap-[3px]">
              {Array.from({ length: HEALTH_SEGMENTS }).map((_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3 w-[5px] skew-x-[-12deg]",
                    i < filledSegments ? healthTone : "bg-white/10"
                  )}
                />
              ))}
            </div>
            <UITypography
              variant="medium"
              className={cn(
                "hud-holo-text",
                stats.health <= 8 && "hud-holo-blink"
              )}
            >
              {stats.health}
            </UITypography>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UITypography
            variant="verySmall"
            className="hud-holo-text-dim tracking-[0.3em]"
          >
            {t("gameStats.wave")}
          </UITypography>
          <UITypography
            variant="medium"
            data-testid="wave-count"
            className="hud-holo-text tracking-widest"
          >
            {`${stats.currentWave} / ${stats.totalWaves}`}
          </UITypography>
        </div>
        {stats.showEnemies && (
          <div className="flex items-center gap-1.5">
            <Crosshair size={12} className="text-cyan-300" />
            <UITypography
              variant="verySmall"
              className="hud-holo-text-dim tracking-[0.3em]"
            >
              {t("gameStats.enemies")}
            </UITypography>
            <UITypography variant="medium" className="hud-holo-text">
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
            className="hud-holo-scanline-btn rounded-none border border-cyan-300/60 bg-cyan-300/10 py-2.5 text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-200 hover:bg-cyan-300/20"
          >
            <Play /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
        {stats.isPaused && (
          <UIButton
            variant="default"
            size={"icon-sm"}
            className="px-1 w-fit rounded-none border border-cyan-300/50 bg-cyan-300/15 text-cyan-200"
            data-testid="paused-indicator"
          >
            <PauseIcon />
          </UIButton>
        )}
      </div>
    </div>
  );
};
