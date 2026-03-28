import { FC } from "react";
import { HeartPulse, Pause, Play } from "lucide-react";

import type { GameStatus } from "../../core/types/game";
import { UITypography } from "../ui/UITypography";
import { UIButton } from "../ui/UIButton";
import { UICard, UICardContent } from "../ui/UICard";
import {
  totalWavesSelector,
  useLevelStore,
} from "../../core/stores/useLevelStore";
import { HUDWrapper } from "./HUDWrapper";
import { UIMoney } from "../ui/UIMoney";

type HUDGameStatsProps = {
  money: number;
  health: number;
  currentWave: number;
  remainingEnemies: number;
  gameStatus: GameStatus;
  timeUntilNextWave: number | null;
  onStartWaveEarly: () => void;
  onStartFirstWave: () => void;
};

export const HUDGameStats: FC<HUDGameStatsProps> = ({
  money,
  health,
  currentWave,
  remainingEnemies,
  gameStatus,
  timeUntilNextWave,
  onStartWaveEarly,
  onStartFirstWave,
}) => {
  const totalWaves = useLevelStore(totalWavesSelector);

  const getHealthColor = (): string => {
    if (health > 15) return "text-green-400";
    if (health > 8) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <HUDWrapper className="bottom-auto left-auto w-80 top-4 right-4">
      <UICard className="flex-1">
        <UICardContent className="gap-4">
          <div className="flex flex-row gap-4">
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
          <div className="flex items-center">
            <div className="flex flex-row justify-center items-center gap-1">
              <UITypography variant="body">Wave:</UITypography>
              <UITypography variant="medium">
                {`${currentWave} / ${totalWaves}`}
              </UITypography>
            </div>

            {currentWave > 0 &&
              currentWave <= totalWaves &&
              remainingEnemies > 0 && (
                <div className="flex flex-row items-center justify-center flex-1 gap-1">
                  <UITypography variant="body">Enemies:</UITypography>
                  <UITypography variant="medium">
                    {remainingEnemies}
                  </UITypography>
                </div>
              )}
          </div>

          <div>
            {currentWave === 0 && (
              <div className="flex flex-col justify-center flex-1 gap-1">
                <UIButton onClick={onStartFirstWave} variant="outline">
                  <Play /> Start next wave
                </UIButton>
              </div>
            )}
            {timeUntilNextWave !== null && timeUntilNextWave > 0 && (
              <div className="flex flex-col justify-center flex-1 gap-1">
                <UITypography variant="small">Next Wave In</UITypography>
                <UITypography variant="medium" className="text-orange-400">
                  {Math.ceil(timeUntilNextWave / 1000)}s
                </UITypography>
                <UIButton onClick={onStartWaveEarly} variant="outline">
                  <Play /> Start Wave Early
                </UIButton>
              </div>
            )}
            {gameStatus === "paused" && (
              <UIButton
                variant="default"
                size={"icon-sm"}
                className="cursor-default"
              >
                <Pause />
              </UIButton>
            )}
          </div>
        </UICardContent>
      </UICard>
    </HUDWrapper>
  );
};
