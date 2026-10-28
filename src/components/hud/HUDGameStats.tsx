import { FC } from "react";
import { HeartPulse, Menu, Play } from "lucide-react";
import { useTranslation } from "react-i18next";

import { UIButton } from "@/components/ui/buttons/UIButton";
import { useIsMobile } from "../../core/hooks/useIsMobile";

import type { GameStatus } from "../../core/types/game";
import { UITypography } from "../ui/UITypography";
import { UICard, UICardContent } from "../ui/UICard";
import {
  totalWavesSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import {
  nextWaveReadySelector,
  useWaveStore,
} from "../../core/stores/useWaveStore";
import { HUDWrapper } from "./HUDWrapper";
import { HUDEnemyUpgrades } from "./HUDEnemyUpgrades";
import { UIMoney } from "../ui/UIMoney";
import { PauseIcon } from "../ui/assets/PauseIcon";

type HUDGameStatsProps = {
  money: number;
  health: number;
  currentWave: number;
  remainingEnemies: number;
  gameStatus: GameStatus;
  onStartWave: () => void;
  onOpenGameMenu: () => void;
};

export const HUDGameStats: FC<HUDGameStatsProps> = ({
  money,
  health,
  currentWave,
  remainingEnemies,
  gameStatus,
  onStartWave,
  onOpenGameMenu,
}) => {
  const { t } = useTranslation();
  const totalWaves = useLevelStore(totalWavesSelector);
  const nextWaveReady = useWaveStore(nextWaveReadySelector);

  const isMobile = useIsMobile();

  const getHealthColor = (): string => {
    if (health > 15) return "text-green-400";
    if (health > 8) return "text-yellow-400";
    return "text-red-400";
  };

  const waveLabel = `${currentWave} / ${totalWaves}`;
  const showEnemies =
    currentWave > 0 && currentWave <= totalWaves && remainingEnemies > 0;
  const showStartWave = currentWave < totalWaves && nextWaveReady;
  const paused = gameStatus === "paused";

  if (isMobile) {
    return (
      <HUDWrapper
        data-testid="game-stats-header"
        className="inset-x-0 top-0 bottom-auto flex border-b border-white/10 bg-card backdrop-blur-sm"
      >
        <div
          data-testid="game-stats"
          className="ui-menu-tilt ui-menu-tilt-left flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2 px-3 py-1.5"
        >
          <UIMoney money={money} variant="medium" iconSize={14} />
          <div className="flex items-center gap-1.5">
            <HeartPulse size={14} className={getHealthColor()} />
            <UITypography variant="medium" className={getHealthColor()}>
              {health}
            </UITypography>
          </div>
          <div className="flex items-center gap-1">
            <UITypography variant="small" className="text-gray-300">
              {t("gameStats.wave")}:
            </UITypography>
            <UITypography variant="medium" whiteSpace="nowrap" data-testid="wave-count">
              {waveLabel}
            </UITypography>
          </div>
          {showEnemies && (
            <UITypography variant="medium" whiteSpace="nowrap">
              {remainingEnemies}
            </UITypography>
          )}
        </div>
        {showStartWave && (
          <UIButton
            data-testid="wave-start"
            onClick={onStartWave}
            variant="default"
            size="sm"
            className="shrink-0"
          >
            <Play size={14} /> {t("gameStats.startNextWave")}
          </UIButton>
        )}
        {showStartWave && (
          <div className="shrink-0">
            <HUDEnemyUpgrades isMobile />
          </div>
        )}
        {paused && (
          <UIButton
            variant="default"
            size="icon-sm"
            className="px-1 shrink-0"
            data-testid="paused-indicator"
          >
            <PauseIcon />
          </UIButton>
        )}
        <UIButton
          data-testid="mobile-menu-button"
          onClick={onOpenGameMenu}
          variant="secondary"
          size="icon"
          aria-label={t("gameMenu.title")}
          className="shrink-0"
        >
          <Menu />
        </UIButton>
      </HUDWrapper>
    );
  }

  return (
    <HUDWrapper className="bottom-auto left-auto w-80 top-4 right-4">
      <div className="flex flex-col w-full h-full ui-menu-tilt ui-menu-tilt-right">
        <UICard className="flex-1">
          <UICardContent className="gap-4">
            <div className="flex flex-row items-center justify-between gap-4">
              <div className="flex items-center">
                <UIMoney money={money} variant="h4" iconSize={20} />
              </div>
              <div className="flex items-center gap-2">
                <HeartPulse size={20} className={getHealthColor()} />
                <UITypography variant="h4" className={getHealthColor()}>
                  {health}
                </UITypography>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex flex-row items-center gap-1">
                <UITypography variant="body">
                  {t("gameStats.wave")}:
                </UITypography>
                <UITypography variant="medium" whiteSpace="nowrap" data-testid="wave-count">
                  {`${currentWave} / ${totalWaves}`}
                </UITypography>
              </div>

              {currentWave > 0 &&
                currentWave <= totalWaves &&
                remainingEnemies > 0 && (
                  <div className="flex flex-row items-center gap-1">
                    <UITypography variant="body">
                      {t("gameStats.enemies")}:
                    </UITypography>
                    <UITypography variant="medium" whiteSpace="nowrap">
                      {remainingEnemies}
                    </UITypography>
                  </div>
                )}
            </div>

            <div className="flex flex-col gap-2">
              {showStartWave && <HUDEnemyUpgrades />}
              {showStartWave && (
                <div className="flex flex-col justify-center flex-1 gap-1">
                  <UIButton data-testid="wave-start" onClick={onStartWave} variant="outline">
                    <Play /> {t("gameStats.startNextWave")}
                  </UIButton>
                </div>
              )}
              {gameStatus === "paused" && (
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
      </div>
    </HUDWrapper>
  );
};
