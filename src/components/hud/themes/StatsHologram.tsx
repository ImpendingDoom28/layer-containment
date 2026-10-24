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

/**
 * Hologram stats: a full-width bottom "console" — credits, a segmented
 * integrity readout, wave/enemies telemetry and the launch control laid
 * out left to right in one scanline bar.
 */
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
    <div className="hud-holo-scan relative flex items-center gap-6 px-6 py-3">
      <div className="flex min-w-0 flex-col">
        <UITypography
          variant="verySmall"
          className="hud-holo-text-dim tracking-[0.3em]"
        >
          {t("gameStats.credits")}
        </UITypography>
        <UITypography variant="h4" className="hud-holo-text leading-none">
          {stats.money}
        </UITypography>
      </div>

      <span className="hud-holo-vline h-9 shrink-0" />

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-center justify-between">
          <UITypography
            variant="verySmall"
            className="hud-holo-text-dim tracking-[0.3em]"
          >
            {t("gameStats.integrity")}
          </UITypography>
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
        <div className="flex gap-[3px]">
          {Array.from({ length: HEALTH_SEGMENTS }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-[7px] skew-x-[-12deg]",
                i < filledSegments ? healthTone : "bg-white/10"
              )}
            />
          ))}
        </div>
      </div>

      <span className="hud-holo-vline h-9 shrink-0" />

      <div className="flex items-center gap-6">
        <div className="flex flex-col">
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

      <div className="ml-auto flex items-center gap-3">
        {stats.isPaused && (
          <span
            role="status"
            aria-live="polite"
            data-testid="paused-indicator"
            className="flex items-center gap-1.5 rounded-none border border-cyan-300/50 bg-cyan-300/15 px-2 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-cyan-200"
          >
            <PauseIcon size={12} className="size-3" /> {t("gameStats.paused")}
          </span>
        )}
        {stats.showStartWave && (
          <UIButton
            data-testid="wave-start"
            onClick={stats.onStartWave}
            variant="outline"
            className="rounded-none border border-cyan-300/60 bg-cyan-300/10 px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.35em] text-cyan-200 hover:bg-cyan-300/20"
          >
            <Play /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
      </div>
    </div>
  );
};
