import { FC } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UITypography } from "../../ui/UITypography";
import { PauseIcon } from "../../ui/assets/PauseIcon";
import type { HudStatsState } from "../useHudPanels";

type StatsGlassProps = {
  stats: HudStatsState;
};

export const StatsGlass: FC<StatsGlassProps> = ({ stats }) => {
  const { t } = useTranslation();

  const healthPercent = Math.max(
    0,
    Math.min(100, (stats.health / stats.maxHealth) * 100)
  );
  const healthGradient =
    stats.health > 15
      ? "linear-gradient(90deg, #34d399, #a7f3d0)"
      : stats.health > 8
        ? "linear-gradient(90deg, #f59e0b, #fcd34d)"
        : "linear-gradient(90deg, #ef4444, #fca5a5)";

  return (
    <div className="relative flex flex-col gap-4 p-4">
      <div className="flex items-end justify-between gap-4">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
          <UITypography
            variant="verySmall"
            className="mb-0.5 text-white/50 tracking-[0.25em]"
          >
            {t("gameStats.credits")}
          </UITypography>
          <UITypography variant="h4" className="font-light text-emerald-200">
            {stats.money}
          </UITypography>
        </div>
        <div className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
          <UITypography
            variant="verySmall"
            className="mb-1.5 text-white/50 tracking-[0.25em]"
          >
            {t("gameStats.integrity")} · {stats.health}
          </UITypography>
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${healthPercent}%`,
                background: healthGradient,
                boxShadow: `0 0 12px ${
                  stats.health > 8 ? "#34d39966" : "#ef444466"
                }`,
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
          <UITypography variant="medium" data-testid="wave-count">
            <span className="text-white/50">{t("gameStats.wave")}</span>
            <span className="ml-1.5 font-light text-white">
              {`${stats.currentWave} / ${stats.totalWaves}`}
            </span>
          </UITypography>
        </div>
        {stats.showEnemies && (
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 backdrop-blur-md">
            <UITypography variant="medium">
              <span className="text-white/50">{t("gameStats.enemies")}</span>
              <span className="ml-1.5 font-light text-white">
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
            className="rounded-2xl border border-white/20 bg-white/10 py-3 text-[12px] font-medium tracking-[0.25em] text-white backdrop-blur-md hover:bg-white/20 shadow-[0_8px_30px_-8px_var(--color-primary-hex)]"
          >
            <Play /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
        {stats.isPaused && (
          <UIButton
            variant="default"
            size={"icon-sm"}
            className="px-1 w-fit rounded-2xl border border-white/20 bg-white/10 text-white backdrop-blur-md"
            data-testid="paused-indicator"
          >
            <PauseIcon />
          </UIButton>
        )}
      </div>
    </div>
  );
};
