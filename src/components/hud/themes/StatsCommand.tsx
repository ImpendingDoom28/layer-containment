import { FC } from "react";
import { HeartPulse, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { UICard, UICardContent } from "../../ui/UICard";
import { UITypography } from "../../ui/UITypography";
import { UIMoney } from "../../ui/UIMoney";
import { PauseIcon } from "../../ui/assets/PauseIcon";
import type { HudStatsState } from "../useHudPanels";

type StatsCommandProps = {
  stats: HudStatsState;
};

export const StatsCommand: FC<StatsCommandProps> = ({ stats }) => {
  const { t } = useTranslation();

  const getHealthColor = (): string => {
    if (stats.health > 15) return "text-green-400";
    if (stats.health > 8) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <UICard className="flex-1">
      <UICardContent className="gap-4">
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center">
            <UIMoney money={stats.money} variant="h4" iconSize={20} />
          </div>
          <div className="flex items-center gap-2">
            <HeartPulse size={20} className={getHealthColor()} />
            <UITypography variant="h4" className={getHealthColor()}>
              {stats.health}
            </UITypography>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-row items-center gap-1">
            <UITypography variant="body">{t("gameStats.wave")}:</UITypography>
            <UITypography
              variant="medium"
              whiteSpace="nowrap"
              data-testid="wave-count"
            >
              {`${stats.currentWave} / ${stats.totalWaves}`}
            </UITypography>
          </div>

          {stats.showEnemies && (
            <div className="flex flex-row items-center gap-1">
              <UITypography variant="body">
                {t("gameStats.enemies")}:
              </UITypography>
              <UITypography variant="medium" whiteSpace="nowrap">
                {stats.remainingEnemies}
              </UITypography>
            </div>
          )}
        </div>

        <div>
          {stats.showStartWave && (
            <div className="flex flex-col justify-center flex-1 gap-1">
              <UIButton
                data-testid="wave-start"
                onClick={stats.onStartWave}
                variant="outline"
              >
                <Play /> {t("gameStats.startNextWave")}
              </UIButton>
            </div>
          )}
          {stats.isPaused && (
            <UIButton
              variant="default"
              size={"icon-sm"}
              className="px-1 w-fit"
              data-testid="paused-indicator"
            >
              <PauseIcon />
            </UIButton>
          )}
        </div>
      </UICardContent>
    </UICard>
  );
};
