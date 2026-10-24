import { FC } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { cn } from "@/components/ui/lib/twUtils";
import { PauseIcon } from "../../ui/assets/PauseIcon";
import type { HudStatsState } from "../useHudPanels";

type StatsGlassProps = {
  stats: HudStatsState;
};

/**
 * Glass stats: a frosted sheet floating over the field — large credits
 * figure, a soft glowing gradient integrity bar, wave/enemies and the
 * wave control in big, airy type.
 */
export const StatsGlass: FC<StatsGlassProps> = ({ stats }) => {
  const { t } = useTranslation();

  const healthPercent = Math.max(
    0,
    Math.min(100, (stats.health / stats.maxHealth) * 100)
  );
  const healthTone =
    stats.health > 15
      ? "hud-glass-health"
      : stats.health > 8
        ? "hud-glass-health-warn"
        : "hud-glass-health-low";

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-end justify-between">
        <div className="flex flex-col">
          <UITypography
            variant="verySmall"
            className="tracking-[0.35em] uppercase text-white/50"
          >
            {t("gameStats.credits")}
          </UITypography>
          <span className="text-4xl font-light leading-none text-white">
            {stats.money}
          </span>
        </div>
        <UITypography
          variant="verySmall"
          data-testid="wave-count"
          className="tracking-[0.3em] uppercase text-white/60"
        >
          {t("gameStats.wave")} {stats.currentWave} / {stats.totalWaves}
        </UITypography>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <UITypography
            variant="verySmall"
            className="tracking-[0.35em] uppercase text-white/50"
          >
            {t("gameStats.integrity")}
          </UITypography>
          <UITypography
            variant="small"
            className={cn(
              "font-semibold",
              stats.health <= 8 ? "text-red-300 hud-blink" : "text-white/90"
            )}
          >
            {stats.health}
          </UITypography>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              healthTone
            )}
            style={{ width: `${healthPercent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        {stats.showEnemies ? (
          <UITypography
            variant="verySmall"
            className="tracking-[0.3em] uppercase text-white/50"
          >
            {t("gameStats.enemies")} {stats.remainingEnemies}
          </UITypography>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          {stats.isPaused && (
            <UIButton
              variant="default"
              size={"icon-sm"}
              className="w-fit rounded-full bg-white/10 px-2 text-white/80"
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
              className="rounded-full border border-white/30 bg-white/10 px-6 py-2.5 text-xs font-semibold tracking-[0.25em] uppercase text-white hover:bg-white/20"
            >
              <Play /> {t("gameStats.startNextWave")}
            </UIButton>
          )}
        </div>
      </div>
    </div>
  );
};
