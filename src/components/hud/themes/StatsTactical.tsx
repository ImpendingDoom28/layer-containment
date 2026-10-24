import { FC } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import { PauseIcon } from "../../ui/assets/PauseIcon";
import type { HudStatsState } from "../useHudPanels";

type StatsTacticalProps = {
  stats: HudStatsState;
};

/**
 * Tactical stats: a top-center command bar — status LED, credits, a ticked
 * hull bar, wave/enemies telemetry and the wave control separated by
 * hairlines, like a military console strip.
 */
export const StatsTactical: FC<StatsTacticalProps> = ({ stats }) => {
  const { t } = useTranslation();

  const hullPercent = Math.max(
    0,
    Math.min(100, (stats.health / stats.maxHealth) * 100)
  );
  const hullTone =
    stats.health > 15
      ? "bg-lime-400"
      : stats.health > 8
        ? "bg-amber-400"
        : "bg-red-500";

  return (
    <div className="flex h-full items-center gap-5 px-6">
      <div className="flex shrink-0 items-center gap-2">
        <span
          className={cn(
            "hud-led-pulse size-2 rounded-full bg-lime-400",
            stats.health <= 8 && "bg-red-500"
          )}
        />
        <UITypography variant="small" className="hud-stencil text-lime-200">
          {t("hudTheme.online")}
        </UITypography>
      </div>

      <span className="hud-tactical-vline h-8 shrink-0" />

      <div className="flex shrink-0 flex-col leading-none">
        <UITypography
          variant="verySmall"
          className="hud-stencil text-lime-500/80"
        >
          {t("gameStats.credits")}
        </UITypography>
        <span className="hud-stencil text-lg text-amber-300">
          ${stats.money}
        </span>
      </div>

      <span className="hud-tactical-vline h-8 shrink-0" />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <UITypography
            variant="verySmall"
            className="hud-stencil text-lime-500/80"
          >
            {t("gameStats.hull")}
          </UITypography>
          <UITypography
            variant="medium"
            className={cn(
              "hud-stencil text-lime-100",
              stats.health <= 8 && "hud-blink"
            )}
          >
            {stats.health}
          </UITypography>
        </div>
        <div className="relative h-2.5 w-full overflow-hidden bg-black/50 outline outline-1 outline-lime-500/30">
          <div
            className={cn("h-full", hullTone)}
            style={{ width: `${hullPercent}%` }}
          />
          <span className="hud-tactical-ticks pointer-events-none absolute inset-0" />
        </div>
      </div>

      <span className="hud-tactical-vline h-8 shrink-0" />

      <div className="flex shrink-0 items-center gap-6">
        <div className="flex flex-col leading-none">
          <UITypography
            variant="verySmall"
            className="hud-stencil text-lime-500/80"
          >
            {t("gameStats.wave")}
          </UITypography>
          <UITypography
            variant="medium"
            data-testid="wave-count"
            className="hud-stencil text-lime-100"
          >
            {`${stats.currentWave} / ${stats.totalWaves}`}
          </UITypography>
        </div>
        {stats.showEnemies && (
          <div className="flex flex-col leading-none">
            <UITypography
              variant="verySmall"
              className="hud-stencil text-lime-500/80"
            >
              {t("gameStats.enemies")}
            </UITypography>
            <UITypography
              variant="medium"
              className="hud-stencil text-lime-100"
            >
              {stats.remainingEnemies}
            </UITypography>
          </div>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        {stats.isPaused && (
          <UIButton
            variant="default"
            size={"icon-sm"}
            className="w-fit rounded-none border border-lime-400/60 bg-lime-400/15 px-1 text-lime-300"
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
            className="rounded-none border-2 border-amber-400/60 bg-amber-400/10 px-5 py-2 text-[11px] font-bold uppercase tracking-[0.3em] text-amber-300 hover:bg-amber-400/25"
          >
            <Play /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
      </div>
    </div>
  );
};
